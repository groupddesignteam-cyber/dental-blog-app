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
  '고민': '고려',
  '고통': '통증',
  '고생': '수고',
  '공유': '안내',
  '너무': '매우',
  '무척': '상당히',
  '불안': '우려',
  // '불편': '불편감',  <-- Regex로 이동
  '힘들': '어려운',
  '해결': '개선',
  '해소': '완화',
  '해주': '도와드리',
  '해보': '살펴보',
  '해본': '겪어본',
  // '과도': '지나친', <-- Regex로 이동
  '과다': '과잉',
  // '과함': '지나침',
  // '필요/만족/경험': 문맥 타는 단어는 단순 치환 제외
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
  [/치아\s*사이가/g, '치간이'],
  [/치아\s*사이는/g, '치간은'],
  [/치아\s*사이를/g, '치간을'],
  [/치아\s*사이/g, '치간'], // 기본형
  // 문맥 고려 치환 (불편한 -> 불편감한 방지)
  [/불편(?![하한해])/g, '불편감'],
  [/과도한/g, '지나친'],
  [/과도하게/g, '지나치게'],
  [/과함/g, '지나침'],
  // 문법 맞춤 치환 (필요 -> 권장되는한/요구되는합니다 방지)
  [/필요합니다/g, '권장됩니다'],
  [/필요한/g, '권장되는'],
  [/필요할\s*수/g, '권장될 수'],
  [/필요시/g, '필요 시'],
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
/**
 * 동의어 회전 강제 적용 (전체 단어 대상)
 * - Region, Clinic, MainKeyword를 제외한 모든 단어는 전체 6회 초과 시 교체
 * - MainKeyword와 겹치는 구간은 보호
 */
export function rotateSynonyms(content: string, options: PostProcessOptions): string {
  let result = content
  const { region, mainKeyword, clinicName } = options

  // 1. 보호 구간 식별 (Main Keyword, Clinic Name)
  const protectedRanges: [number, number][] = []
  const inputKeywords = [mainKeyword, clinicName].filter(Boolean) as string[]

  for (const kw of inputKeywords) {
    const kwRegex = new RegExp(escapeRegex(kw), 'g')
    for (const match of result.matchAll(kwRegex)) {
      if (match.index !== undefined) {
        protectedRanges.push([match.index, match.index + kw.length])
      }
    }
  }

  // 겹침 확인 헬퍼
  const isProtected = (start: number, end: number) => {
    return protectedRanges.some(([pStart, pEnd]) =>
      (start < pEnd && end > pStart)
    )
  }

  // 2. 예외 단어 설정
  const exceptions = new Set([
    region,
    clinicName,
    '치과', // 명시적 제외
    '원장', // 필요 시 추가
    ...inputKeywords
  ].filter(Boolean))

  // 3. 사전 순회 및 교체
  for (const [word, synonyms] of Object.entries(SYNONYM_DICTIONARY)) {
    if (exceptions.has(word)) continue
    if (!synonyms || synonyms.length === 0) continue

    const regex = new RegExp(escapeRegex(word), 'g')
    // 현재 결과에서 매치 찾기
    const allMatches = [...result.matchAll(regex)]

    // 보호 구간과 겹치지 않는 유효 매치 필터링
    const validMatches = allMatches.filter(m =>
      m.index !== undefined && !isProtected(m.index, m.index + word.length)
    )

    // 6회 초과 시 교체
    if (validMatches.length > 6) {
      // 7번째(인덱스 6)부터 교체 대상
      const matchesToReplace = validMatches.slice(6)
      const safeSynonyms = synonyms.filter(s => !s.includes(' ')) // 공백 없는 단어 우선

      if (safeSynonyms.length === 0) continue

      // 뒤에서부터 교체 (인덱스 밀림 방지)
      // 주의: matchesToReplace는 앞에서부터 정렬되어 있음. 역순 순회 필요.
      for (let i = matchesToReplace.length - 1; i >= 0; i--) {
        const match = matchesToReplace[i]
        if (match.index === undefined) continue

        const synonym = safeSynonyms[i % safeSynonyms.length] // 순환 선택

        const before = result.slice(0, match.index)
        const after = result.slice(match.index + word.length)
        result = before + synonym + after
      }

      // 주의: result가 변경되었으므로 다음 루프의 protectedRanges는 오차 발생 가능?
      // 아니오, protectedRanges는 Main Keyword 위치임.
      // 우리가 교체한 것은 Main Keyword가 "아닌" 단어들임.
      // 단, 교체로 인해 전체 길이 바뀌면 Main Keyword 위치도 바뀜.
      // 따라서, 정확성을 위해 protectedRanges를 매번 갱신하거나,
      // **가장 안전한 방법**: 변경된 텍스트에서 다시 검색? 성능 저하.
      // **절충**: 역순으로 처리했으므로, 이 단어(word)에 대한 처리는 안전함.
      // 다른 단어(next word) 처리 시 protectedRanges가 안 맞을 수 있음.
      // 해결책: 텍스트 변경 시 protectedRanges도 시프트? 복잡함.
      // **실용적 해결책**: 루프마다 protectedRanges 재계산? (단어 50개 * 매치. 좀 무거움)
      // 하지만 블로그 글은 3000자. 빠름. 재계산하자.

      // 재계산 로직 삽입 (성능보다 정확성)
      protectedRanges.length = 0
      for (const kw of inputKeywords) {
        const kwRegex = new RegExp(escapeRegex(kw), 'g')
        for (const match of result.matchAll(kwRegex)) {
          if (match.index !== undefined) {
            protectedRanges.push([match.index, match.index + kw.length])
          }
        }
      }
    }
  }

  return result
}

// ============================================================
// 5. 형태소(지역명) 빈도 및 분포 보장 (7회 고정: 제목1+서론1+본론4+결론1)
// ============================================================

/** 본론용 브릿지 문장 (다양성 확보) */
function getBridgeSentences(region: string): string[] {
  return [
    `${region} 방문 시 이 점을 체크해보시는 것이 좋습니다.`,
    `${region}에서 꾸준한 검진을 받으시길 권장합니다.`,
    `가까운 ${region} 치과에서 현재 상태를 확인해보는 것이 바람직합니다.`,
    `${region}에서 정밀 검사를 통해 알 수 있습니다.`,
    `${region} 방문을 통해 정확한 진단을 받아보세요.`,
    `${region}에서 체계적인 관리를 시작해보세요.`,
    `${region} 전문의와 상담하여 계획을 세워보세요.`,
    `${region}에서도 이와 유사한 사례가 적지 않습니다.`,
    `${region} 지역에서도 이에 대한 관심이 높아지고 있습니다.`,
    `${region}에서도 이러한 증상으로 내원하시는 분들이 많습니다.`,
    `${region} 지역에서 정기적인 관리가 권장됩니다.`,
    `${region}에서도 유사한 증례가 보고되고 있습니다.`,
  ]
}

/**
 * 지역명 빈도 및 분포 강제 (총 7회)
 * - 제목(1), 서론(1), 본론(4), 결론(1)
 * - 부족 시 브릿지 문장 삽입
 */
export function enforceRegionFrequency(content: string, region: string): string {
  if (!region) return content

  // 1. 섹션 분리
  // Intro(제목포함) | Body(## ...) | Conclusion(마지막 ## ...)
  const sections = content.split(/^(##\s.*$)/m)

  // 헤더 개수 파악
  let headerCount = 0
  for (const s of sections) {
    if (/^##\s/.test(s)) headerCount++
  }

  // 구조가 예상과 다르면(헤더가 너무 적으면) 단순 전체 삽입으로 fallback
  if (headerCount < 2) return content

  // Conclusion은 마지막 헤더 + 내용
  const conclusionHeaderIdx = sections.length - 2
  const conclusionContentIdx = sections.length - 1

  // Intro는 첫 번째 섹션 (제목 포함)
  let introPart = sections[0]

  // Body는 그 사이
  const bodyIndices: number[] = []
  for (let i = 1; i < conclusionHeaderIdx; i += 2) {
    // i: header, i+1: content
    bodyIndices.push(i + 1)
  }

  // 2. 검사 및 보정

  // [서론] (제목 제외 서론 본문에 1회 있는지 확인)
  // 제목은 첫 줄이라고 가정. 서론 본문에서 체크.
  const introLines = introPart.split('\n')
  const titleLine = introLines[0]
  const introBody = introLines.slice(1).join('\n')

  if (!introBody.includes(region)) {
    // 서론 마지막에 자연스럽게 추가 (이미 있으면 패스)
    // 인사가 보통 맨 앞이므로, 맨 뒤에 붙이는게 안전
    introPart = introPart.trim() + `\n\n${region}에서 알려드렸습니다.`
  }

  // [본론] (총 4회 맞추기)
  let currentBodyCount = 0
  for (const idx of bodyIndices) {
    currentBodyCount += (sections[idx].match(new RegExp(escapeRegex(region), 'g')) || []).length
  }

  if (currentBodyCount < 4) {
    let deficiency = 4 - currentBodyCount
    const bridges = getBridgeSentences(region)
    let bridgeIdx = 0

    // 본론 섹션 순회하며 삽입
    for (const idx of bodyIndices) {
      if (deficiency <= 0) break
      if (sections[idx].includes(region)) continue // 이미 있으면 건너뛰기 (분산 유도)

      // 적절한 위치(문장 끝)에 삽입
      const bridge = bridges[bridgeIdx % bridges.length]
      bridgeIdx++

      // 첫 번째 마침표 뒤에 삽입 시도
      const dotMatch = sections[idx].match(/\.\s/)
      if (dotMatch && dotMatch.index !== undefined) {
        const insertPos = dotMatch.index + 2
        sections[idx] = sections[idx].slice(0, insertPos) + bridge + ' ' + sections[idx].slice(insertPos)
        deficiency--
      } else {
        // 마침표 없으면 문단 끝에 추가
        sections[idx] = sections[idx].trim() + `\n\n${bridge}`
        deficiency--
      }
    }

    // 한 바퀴 돌았는데도 부족하면(섹션 수 < 부족분), 있는 섹션에도 추가
    if (deficiency > 0) {
      for (const idx of bodyIndices) {
        if (deficiency <= 0) break
        const bridge = bridges[bridgeIdx % bridges.length]
        bridgeIdx++
        sections[idx] = sections[idx].trim() + `\n\n${bridge}`
        deficiency--
      }
    }
  }

  // [결론] (1회 확인)
  const conclusionText = sections[conclusionHeaderIdx] + sections[conclusionContentIdx]
  if (!conclusionText.includes(region)) {
    // 결론 마지막 인사에 추가되어 있을 확률 높지만, 없으면 추가
    sections[conclusionContentIdx] = sections[conclusionContentIdx].trim() + `\n\n${region}에서 전해드렸습니다.`
  }

  // 재조립시 introPart 업데이트
  sections[0] = introPart

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
  // Step 4: 동의어 회전 (고빈도 일반 단어 - 전체 6회 제한)
  result = rotateSynonyms(result, options)

  // Step 5: 형태소(지역명) 빈도 및 분포 보장 (7회 고정)
  if (options.region) {
    result = enforceRegionFrequency(result, options.region)
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


