/**
 * LLM 출력 후처리 모듈
 * - 금칙어 자동 치환
 * - 의료법 위반 표현 자동 치환
 * - ~요 금지 어미 치환 (안전 패턴만)
 * - 형태소 기반 키워드 빈도 조절
 * - 동의어 회전 강제 적용
 */

import { SYNONYM_DICTIONARY } from '@/data/synonyms'

// ============================================================
// 유틸리티
// ============================================================

/** 한글 문자의 받침(종성) 유무 판별 */
function hasBatchim(char: string): boolean {
  const code = char.charCodeAt(0)
  if (code < 0xAC00 || code > 0xD7A3) return false
  return (code - 0xAC00) % 28 !== 0
}

/** 받침에 따른 조사 보정 */
function adjustParticle(word: string, particle: string): string {
  if (!word || word.length === 0) return particle
  const lastChar = word[word.length - 1]
  const batch = hasBatchim(lastChar)

  // [받침 있을 때, 받침 없을 때]
  const map: Record<string, [string, string]> = {
    '이': ['이', '가'], '가': ['이', '가'],
    '을': ['을', '를'], '를': ['을', '를'],
    '은': ['은', '는'], '는': ['은', '는'],
    '과': ['과', '와'], '와': ['과', '와'],
    '으로': ['으로', '로'], '로': ['으로', '로'],
  }

  const pair = map[particle]
  if (!pair) return particle
  return batch ? pair[0] : pair[1]
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 조사 패턴 (긴 것 먼저 매칭)
const PARTICLE_PATTERN = /^(에서|으로|라고|라는|이나|에는|에도|까지|부터|에|의|이|가|을|를|은|는|로|와|과|도|란|라)/

// ============================================================
// 1. 금칙어 자동 치환
// ============================================================

const FORBIDDEN_REPLACEMENTS: Record<string, string> = {
  '걱정': '염려',
  '경험': '체험',
  '고민': '고려',
  '고통': '통증',
  '고생': '수고',
  '공유': '안내',
  '너무': '매우',
  '만족': '충족',
  '무척': '상당히',
  '불안': '우려',
  // '불편': '불편감',  <-- Regex로 이동 (불편한 -> 불편감한 방지)
  '힘들': '어려운',
  '해결': '개선',
  '해소': '완화',
  '해주': '도와드리',
  '해보': '살펴보',
  '해본': '겪어본',
  // '과도': '지나친', <-- Regex로 이동 (과도하게 -> 지나친하게 방지)
  '과다': '과잉',
  // '과함': '지나침',
}

/** 금칙어를 안전한 대체어로 치환 (독립 단어 기준, 한글 조사 보정 포함) */
export function sanitizeForbiddenWords(content: string): string {
  let result = content

  // 앞쪽 경계: 공백/문장부호/시작
  const BOUNDARY_BEFORE = `(^|[\\s,.\\'"\u201C\u201D\u00B7(])`

  for (const [word, replacement] of Object.entries(FORBIDDEN_REPLACEMENTS)) {
    // replacement가 word를 포함하면 무한 교체 방지 (예: 불편→불편감)
    let negLookahead = ''
    if (replacement.startsWith(word) && replacement.length > word.length) {
      const suffix = replacement.slice(word.length)
      negLookahead = `(?!${escapeRegex(suffix)})`
    }

    // 1단계: 단어 + 조사 → 조사 보정 포함 치환
    const withParticle = new RegExp(
      `${BOUNDARY_BEFORE}${escapeRegex(word)}${negLookahead}(에서|으로|라고|라는|이나|에는|에도|까지|부터|에|의|이|가|을|를|은|는|로|와|과|도|란|라)(?=[\\s,.\\'"\u201C\u201D\u00B7)!?\\n\uAC00-\uD7A3]|$)`,
      'gm'
    )
    result = result.replace(withParticle, (_match, prefix, particle) => {
      const adjusted = adjustParticle(replacement, particle)
      return prefix + replacement + adjusted
    })

    // 2단계: 단어 단독 (뒤: 공백/구두점/한글/끝)
    const alone = new RegExp(
      `${BOUNDARY_BEFORE}${escapeRegex(word)}${negLookahead}(?=[\\s,.\\'"\u201C\u201D\u00B7)!?\\n\uAC00-\uD7A3]|$)`,
      'gm'
    )
    result = result.replace(alone, `$1${replacement}`)
  }

  return result
}

// ============================================================
// 1.5. 의료법 위반 표현 자동 치환
// ============================================================

const MEDICAL_REPLACEMENTS: [RegExp, string][] = [
  [/무통(?!증)/g, '저통증'],
  [/통증\s*없는/g, '통증을 줄이는'],
  [/아프지\s*않/g, '통증이 적'],
  [/완벽한\s*치료/g, '정밀한 치료'],
  [/완벽한\s*시술/g, '정밀한 시술'],
  [/완벽한\s*결과/g, '양호한 결과'],
  [/이빨/g, '치아'],
  [/때우기/g, '수복 치료'],
  [/씌우기/g, '보철 치료'],
  // 환자 직접 언급 → 일반화 표현으로 치환
  [/환자분의\s*구강/g, '개인별 구강'],
  [/환자분께서/g, '이런 경우'],
  [/환자\s*입장에서/g, '시술을 받으시는 분 입장에서'],
  [/환자분이/g, '해당되시는 분이'],
  // 효과 보장/추천 표현
  [/현명한\s*선택/g, '적합한 방법'],
  // 비표준 용어 치환
  [/크라운/g, '보철'],
  [/도금속/g, '도재-금속'],
  [/심는다/g, '식립한다'],
  [/심을\s*수/g, '식립할 수'],
  [/심어/g, '식립하여'],
  // 전문 용어 정규화 (실무자 피드백)
  [/픽스쳐/g, '픽스처'],
  [/임플란트\s*식립/g, '픽스처 식립'],
  [/주변\s*치아/g, '인접치'],
  [/옆\s*치아/g, '인접치'],
  [/반대편\s*치아/g, '대합치'],
  [/치아\s*사이/g, '치간'],
  // 문맥 고려 치환 (불편한 -> 불편감한 방지)
  [/불편(?![하한해])/g, '불편감'],
  [/과도한/g, '지나친'],
  [/과도하게/g, '지나치게'],
  [/과함/g, '지나침'],
]

/** 의료법 위반 가능 표현을 안전한 표현으로 자동 치환 */
export function sanitizeMedicalExpressions(content: string): string {
  let result = content
  for (const [pattern, replacement] of MEDICAL_REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

// ============================================================
// 2. ~요 금지 어미 치환 (안전 패턴만, 문장 끝에서만)
// ============================================================

/**
 * 안전하게 치환 가능한 어미만 처리
 * - 문장 끝(. ! ? 줄바꿈 앞)에서만 매칭
 * - "세요"는 화이트리스트 → 건드리지 않음
 * - "네요", "거든요"는 형태소 의존적 → 건드리지 않음
 * - writingMode에 따라 "인데요" 처리 분기
 */
export function sanitizeForbiddenEndings(content: string, writingMode?: string): string {
  let result = content

  // 안전한 치환 목록 (문법적으로 1:1 대응 가능한 것만)
  const safePatterns: [RegExp, string][] = [
    [/해요(?=[.!?\s\n]|$)/g, '합니다'],
    [/있어요(?=[.!?\s\n]|$)/g, '있습니다'],
    [/드려요(?=[.!?\s\n]|$)/g, '드립니다'],
    [/할게요(?=[.!?\s\n]|$)/g, '하겠습니다'],
    [/볼게요(?=[.!?\s\n]|$)/g, '보겠습니다'],
    [/줄게요(?=[.!?\s\n]|$)/g, '드리겠습니다'],
  ]

  // 임상 모드에서만 "인데요" 제거 (정보성 모드에서는 10% 허용)
  if (writingMode === 'expert') {
    safePatterns.push([/인데요(?=[.!?\s\n]|$)/g, '인데'])
  }

  for (const [pattern, replacement] of safePatterns) {
    result = result.replace(pattern, replacement)
  }

  return result
}

// ============================================================
// 3. 형태소 기반 키워드 빈도 교정
// ============================================================

// 치료 관련 복합어 — 내부의 부분 단어를 교체하면 안 됨
const PROTECTED_COMPOUNDS = [
  '근관치료', '신경치료', '교정치료', '치주치료', '보존치료',
  '보철치료', '레이저치료', '불소치료', '잇몸치료', '예방치료',
  '응급치료', '보존적치료', '재신경치료',
  '인공치아', '자연치아', '임시치아', '영구치아',
]

/** 특정 단어의 출현 위치 중 복합어에 속하지 않는 안전한 위치만 반환 */
function findSafeOccurrences(content: string, word: string): number[] {
  const regex = new RegExp(escapeRegex(word), 'g')
  const safeIndices: number[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    const idx = match.index
    const isProtected = PROTECTED_COMPOUNDS.some(compound => {
      if (!compound.includes(word) || compound === word) return false
      const wordPosInCompound = compound.indexOf(word)
      const compoundStart = idx - wordPosInCompound
      if (compoundStart < 0 || compoundStart + compound.length > content.length) return false
      return content.substring(compoundStart, compoundStart + compound.length) === compound
    })
    if (!isProtected) {
      safeIndices.push(idx)
    }
  }

  return safeIndices
}

/** 단일 단어 교체 (조사 보정 포함), 인덱스 기준 */
function replaceAtIndex(
  content: string,
  index: number,
  oldWord: string,
  newWord: string
): string {
  const before = content.substring(0, index)
  const after = content.substring(index + oldWord.length)

  // 뒤에 조사가 붙어있으면 보정
  const particleMatch = after.match(PARTICLE_PATTERN)
  if (particleMatch) {
    const oldParticle = particleMatch[1]
    const newParticle = adjustParticle(newWord, oldParticle)
    return before + newWord + newParticle + after.substring(oldParticle.length)
  }

  return before + newWord + after
}

/** 단어가 maxCount를 초과하면 뒤쪽부터 동의어로 교체 */
function reduceWordCount(
  content: string,
  word: string,
  maxCount: number,
  synonyms: string[]
): string {
  if (synonyms.length === 0) return content

  // 단일 단어 동의어만 사용 (여러 단어 동의어는 조사 보정이 어려움)
  const safeSynonyms = synonyms.filter(s => !s.includes(' '))
  if (safeSynonyms.length === 0) return content

  const safeOccurrences = findSafeOccurrences(content, word)
  if (safeOccurrences.length <= maxCount) return content

  // 앞쪽 maxCount개는 보존, 나머지를 뒤에서부터 교체
  const toReplace = safeOccurrences.slice(maxCount)
  let result = content

  // 뒤에서부터 교체해야 인덱스가 밀리지 않음
  for (let i = toReplace.length - 1; i >= 0; i--) {
    const synonym = safeSynonyms[i % safeSynonyms.length]
    result = replaceAtIndex(result, toReplace[i], word, synonym)
  }

  return result
}

/**
 * 형태소 기반 키워드 빈도 제한
 *
 * 메인키워드 = 형태소A(region) + 형태소B(치과 or topic)
 * 각 형태소 목표 7회 → 8회 초과 시 축소
 *
 * - "지역+치과" 타입: morphemeB = "치과", topic은 서브키워드(별도 max 5)
 * - "지역+진료" 타입: morphemeB = topic, topic은 이미 7회에 포함
 */
export function enforceMorphemeLimit(
  content: string,
  options: PostProcessOptions
): string {
  let result = content
  const { region, mainKeyword, topic } = options

  // morphemeB 추출: mainKeyword에서 region 제거
  const morphemeB = mainKeyword.replace(region, '').trim() || '치과'

  // 형태소B 빈도 제한 (7회 초과 시 동의어 교체)
  if (morphemeB) {
    const synonymsB = SYNONYM_DICTIONARY[morphemeB]
    if (synonymsB && synonymsB.length > 0) {
      result = reduceWordCount(result, morphemeB, 7, synonymsB)
    }
  }

  // topic이 morphemeB와 다른 경우 = 서브키워드 → max 5
  if (topic && topic !== morphemeB) {
    const topicSynonyms = SYNONYM_DICTIONARY[topic]
    if (topicSynonyms && topicSynonyms.length > 0) {
      result = reduceWordCount(result, topic, 5, topicSynonyms)
    }
  }

  return result
}

// ============================================================
// 4. 동의어 회전 (고빈도 일반 단어)
// ============================================================

const WATCH_WORDS = ['치료', '시술', '수술', '진행', '확인', '상태', '경우', '필요']

/**
 * 동의어 회전 강제 적용
 * - 전체 6회 이하로 유지
 * - 섹션(##)당 3회 이하로 유지
 * - 이미 처리된 단어의 동의어는 건너뜀 (연쇄 교체 방지)
 * - morphemeB가 복합어(근관치료 등)이면 해당 단어는 동의어 회전에서 보호
 */
export function rotateSynonyms(content: string, morphemeB?: string): string {
  let result = content
  const processedWords = new Set<string>()

  // morphemeB가 복합어(예: 근관치료)이면 그 자체를 보호
  if (morphemeB && morphemeB.length > 2) {
    processedWords.add(morphemeB)
  }

  for (const word of WATCH_WORDS) {
    // 연쇄 교체 방지: 이전 단어의 동의어로 이미 등장한 단어는 건너뜀
    if (processedWords.has(word)) continue

    // morphemeB가 이 word를 포함하는 복합어이면 건너뜀
    // 예: morphemeB="근관치료" → "치료" 카운트에서 "근관치료" 내부 제외됨 (findSafeOccurrences에서 처리)
    const synonyms = SYNONYM_DICTIONARY[word]
    if (!synonyms || synonyms.length === 0) continue

    const safeSynonyms = synonyms.filter(s => !s.includes(' '))
    if (safeSynonyms.length === 0) continue

    // 이 단어의 동의어를 "처리됨"으로 마크 (이후 루프에서 건너뜀)
    for (const syn of safeSynonyms) {
      processedWords.add(syn)
    }
    processedWords.add(word)

    // 전체 빈도 체크 (6회 이하로 — 검증기 임계값 7보다 아래)
    result = reduceWordCount(result, word, 6, safeSynonyms)

    // 섹션별 체크 (## 기준으로 나누어 섹션당 3회 이하로)
    const sections = result.split(/^(##\s.*$)/m)
    let rebuilt = ''
    for (let s = 0; s < sections.length; s++) {
      const section = sections[s]
      // 헤더 라인은 그대로
      if (/^##\s/.test(section)) {
        rebuilt += section
        continue
      }

      const occurrences = findSafeOccurrences(section, word)
      if (occurrences.length <= 3) {
        rebuilt += section
        continue
      }

      // 섹션 내 3회 초과분 교체
      const toReplace = occurrences.slice(3)
      let sectionResult = section
      for (let i = toReplace.length - 1; i >= 0; i--) {
        const synonym = safeSynonyms[i % safeSynonyms.length]
        sectionResult = replaceAtIndex(sectionResult, toReplace[i], word, synonym)
      }
      rebuilt += sectionResult
    }
    result = rebuilt
  }

  return result
}

// ============================================================
// 5. 형태소 최소 빈도 보장 (부족 시 본론에 자동 삽입)
// ============================================================

/** 본문에서 형태소 순수 출현 횟수 (해시태그·치과명 내부 제외) */
function countMorphemeNet(text: string, morpheme: string, clinicName?: string): number {
  const clean = text.replace(/#[^\s#]+/g, '')
  let count = (clean.match(new RegExp(escapeRegex(morpheme), 'g')) || []).length
  if (clinicName && clinicName.includes(morpheme) && clinicName !== morpheme) {
    count -= (clean.match(new RegExp(escapeRegex(clinicName), 'g')) || []).length
  }
  return Math.max(0, count)
}

/** Phase 1용 문구 치환 패턴 */
function getInjectionPatterns(morpheme: string, isRegion: boolean): [RegExp, string][] {
  if (isRegion) {
    return [
      [/이러한 경우/, `${morpheme}에서 이러한 경우`],
      [/이런 경우/, `${morpheme}에서 이런 경우`],
      [/이러한 증상/, `${morpheme}에서도 이러한 증상`],
      [/이런 증상/, `${morpheme}에서도 이런 증상`],
      [/내원하시는 분/, `${morpheme}에 내원하시는 분`],
      [/정기 검진/, `${morpheme}에서 정기 검진`],
      [/정기적인 검진/, `${morpheme}에서 정기적인 검진`],
      [/정밀 검사/, `${morpheme}에서 정밀 검사`],
    ]
  }
  // morphemeB (치과 or 진료명)
  const particle = adjustParticle(morpheme, '를')
  return [
    [/정밀 진단/, `${morpheme}에서 정밀 진단`],
    [/정확한 진단/, `${morpheme}에서 정확한 진단`],
    [/정기적인 검진/, `${morpheme}에서 정기적인 검진`],
    [/전문적인 관리/, `${morpheme}에서 전문적인 관리`],
    [/적절한 치료/, `${morpheme}${particle} 통한 적절한 치료`],
    [/조기 발견/, `${morpheme}에서의 조기 발견`],
    [/전문의 상담/, `${morpheme} 전문의 상담`],
    [/치료 계획/, `${morpheme} 치료 계획`],
  ]
}

/** Phase 2용 브릿지 문장 */
function getBridgeSentences(morpheme: string, isRegion: boolean): string[] {
  if (isRegion) {
    return [
      `${morpheme}에서도 이와 유사한 사례가 적지 않습니다.`,
      `${morpheme} 지역에서도 이에 대한 관심이 높아지고 있습니다.`,
      `${morpheme}에서도 이러한 증상으로 내원하시는 분들이 많습니다.`,
      `${morpheme} 지역에서 정기적인 관리가 권장됩니다.`,
      `${morpheme}에서도 유사한 증례가 보고되고 있습니다.`,
    ]
  }
  return [
    `${morpheme} 방문 시 이 점을 체크해보시는 것이 좋습니다.`,
    `${morpheme}에서 꾸준한 검진을 받으시길 권장합니다.`,
    `가까운 ${morpheme}에서 현재 상태를 확인해보는 것이 바람직합니다.`,
    `${morpheme}에서 정밀 검사를 통해 알 수 있습니다.`,
    `${morpheme} 방문을 통해 정확한 진단을 받아보세요.`,
    `${morpheme}에서 체계적인 관리를 시작해보세요.`,
    `${morpheme} 전문의와 상담하여 계획을 세워보세요.`,
  ]
}

/**
 * 형태소 최소 빈도 보장
 * Phase 1: 본론의 기존 문구에 형태소를 자연스럽게 결합
 * Phase 2: 부족분은 문장 사이에 브릿지 문장 삽입
 */
export function enforceMorphemeMinimum(
  content: string,
  options: PostProcessOptions
): string {
  const { region, mainKeyword, clinicName } = options
  if (!region || !mainKeyword) return content

  const morphemeB = mainKeyword.replace(region, '').trim() || '치과'
  // 목표 빈도 하향 조정 (7 -> 5) : 억지 문장 삽입 방지
  const MIN_COUNT = 5

  let result = content

  // 형태소A (region) 보강
  const regionDef = MIN_COUNT - countMorphemeNet(result, region, clinicName)
  if (regionDef > 0) {
    result = injectInBody(result, region, regionDef, clinicName, true)
  }

  // 형태소B 보강
  const morphBDef = MIN_COUNT - countMorphemeNet(result, morphemeB, clinicName)
  if (morphBDef > 0) {
    result = injectInBody(result, morphemeB, morphBDef, clinicName, false)
  }

  return result
}

function injectInBody(
  content: string,
  morpheme: string,
  deficit: number,
  clinicName: string | undefined,
  isRegion: boolean
): string {
  // ## 섹션 기반으로 분할
  const sections = content.split(/^(##\s.*$)/m)

  // ## 헤더 인덱스 수집
  const headerIdxs: number[] = []
  for (let i = 0; i < sections.length; i++) {
    if (/^##\s/.test(sections[i])) headerIdxs.push(i)
  }
  if (headerIdxs.length < 2) return content

  // 본론 콘텐츠 인덱스 = 첫 ## 다음 ~ 마지막 ## 직전
  const bodyContentIdxs: number[] = []
  for (let h = 0; h < headerIdxs.length - 1; h++) {
    const ci = headerIdxs[h] + 1
    if (ci < sections.length) bodyContentIdxs.push(ci)
  }

  let remaining = deficit
  const patterns = getInjectionPatterns(morpheme, isRegion)

  // Phase 1: 문구 치환
  for (const ci of bodyContentIdxs) {
    if (remaining <= 0) break
    if (sections[ci].includes(morpheme)) continue

    for (const [find, replace] of patterns) {
      if (remaining <= 0) break
      if (find.test(sections[ci])) {
        sections[ci] = sections[ci].replace(find, replace)
        remaining--
        break
      }
    }
  }

  // Phase 2: 브릿지 문장 반복 삽입 (morpheme 없는 섹션 우선 → 있는 섹션도 순환)
  if (remaining > 0) {
    const bridges = getBridgeSentences(morpheme, isRegion)
    let bridgeIdx = 0
    const MAX_ROUNDS = 3 // 한 섹션당 최대 삽입 횟수 (중복 문장 다 쓰면 종료)

    for (let round = 0; round < MAX_ROUNDS && remaining > 0; round++) {
      let injectedThisRound = 0

      for (const ci of bodyContentIdxs) {
        if (remaining <= 0) break

        // round 0: morpheme 없는 섹션만, round 1+: 모든 섹션
        if (round === 0 && sections[ci].includes(morpheme)) continue

        // 중복 방지: 이 섹션에 아직 없는 브릿지 문장 찾기
        let bridge = ''
        for (let attempt = 0; attempt < bridges.length; attempt++) {
          const candidate = bridges[(bridgeIdx + attempt) % bridges.length]
          if (!sections[ci].includes(candidate)) {
            bridge = candidate
            bridgeIdx = (bridgeIdx + attempt + 1)
            break
          }
        }
        if (!bridge) continue // 이 섹션에 모든 브릿지가 이미 존재

        // n번째 마침표 뒤에 삽입 (라운드마다 다른 위치)
        const dots = [...sections[ci].matchAll(/\.\s/g)]
        const targetDot = dots.length > round ? dots[round] : dots[dots.length - 1]
        if (targetDot && targetDot.index !== undefined) {
          const pos = targetDot.index + 2
          sections[ci] = sections[ci].slice(0, pos) + bridge + ' ' + sections[ci].slice(pos)
          remaining--
          injectedThisRound++
        }
      }

      if (injectedThisRound === 0) break // 더 이상 삽입 불가
    }
  }

  return sections.join('')
}

// ============================================================
// 메인 후처리 파이프라인
// ============================================================

export interface PostProcessOptions {
  topic: string
  mainKeyword: string
  clinicName: string
  region: string
  writingMode?: string // 'expert' | 'information'
}

export function postProcess(content: string, options: PostProcessOptions): string {
  let result = content

  // Step 1: 금칙어 치환
  result = sanitizeForbiddenWords(result)

  // Step 1.5: 의료법 위반 표현 자동 치환
  result = sanitizeMedicalExpressions(result)

  // Step 2: ~요 금지 어미 치환 (안전 패턴만)
  result = sanitizeForbiddenEndings(result, options.writingMode)

  // Step 3: 형태소 기반 키워드 빈도 제한
  if (options.region && options.mainKeyword) {
    result = enforceMorphemeLimit(result, options)
  }

  // Step 4: 동의어 회전 (고빈도 일반 단어)
  const morphemeB = options.mainKeyword.replace(options.region, '').trim() || ''
  result = rotateSynonyms(result, morphemeB)

  // Step 5: 형태소 최소 빈도 보장 (부족 시 본론에 자동 삽입)
  if (options.region && options.mainKeyword) {
    result = enforceMorphemeMinimum(result, options)
  }

  // Step 6: 문장 종결 후 줄바꿈 보장 ('~다.' 뒤 다음 문장은 새 줄)
  result = ensureSentenceLineBreaks(result)

  return result
}

/**
 * 문장 종결('~다.', '~요.', '~죠.' 등) 뒤에 같은 줄에 텍스트가 이어지면 줄바꿈 삽입.
 * 마크다운 헤더, 리스트, 해시태그, 이미지, 출처 등은 건너뜀.
 */
function ensureSentenceLineBreaks(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // 줄바꿈 대상에서 제외
    if (
      trimmed === '' ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('※') ||
      trimmed.startsWith('📷') ||
      trimmed.startsWith('Q.') ||
      trimmed.startsWith('A.') ||
      trimmed.startsWith('(출처:') ||
      trimmed.startsWith('💡') ||
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      /^#[^\s#]/.test(trimmed) ||
      /^\d+\.\s/.test(trimmed)
    ) {
      result.push(line)
      continue
    }

    // 문장 종결 패턴 뒤에 같은 줄에서 새 문장이 시작되면 줄바꿈 삽입
    // 패턴: 한글+종결어미+마침표 + 공백 + 한글/이모지 시작
    const split = line.replace(
      /([다요죠까니][\.!\?])\s+(?=[가-힣A-Z✅🔹🔵💚⚠️📷"\(])/g,
      '$1\n'
    )
    result.push(split)
  }

  return result.join('\n')
}
