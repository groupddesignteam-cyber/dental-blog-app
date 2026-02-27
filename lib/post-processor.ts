/**
 * LLM 출력 후처리 모듈
 * - 금칙어 자동 치환
 * - 의료법 위반 표현 자동 치환
 * - Q&A/FAQ 위치 강제 (본문 중간 제거)
 * - 상투적 공감 멘트 반복 제거
 * - 비유 표현 과다 제한
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
  '고통': '통증',
  '고생': '수고',
  '공유': '안내',
  '너무': '매우',
  '무척': '상당히',
  '해결': '개선',
  '해소': '완화',
  '해주': '도와드리',
  '해보': '살펴보',
  '해본': '겪어본',
  '과다': '과잉',
  '평생': '오랫동안',
  '정말': '실제로',
  '꼭': '반드시',
  // '고민', '힘들', '불편', '불안', '경험': CONTEXT_REPLACEMENTS로 이동
}

// 활용형별 정밀 치환 (단순 대체 시 문법 오류 발생하는 단어)
const CONTEXT_REPLACEMENTS: [RegExp, string][] = [
  // 힘들- 활용형
  [/힘들고/g, '어렵고'],
  [/힘들어/g, '어려워'],
  [/힘들게/g, '어렵게'],
  [/힘들다/g, '어렵다'],
  [/힘든/g, '어려운'],
  [/힘들(?=[,.\s!?\n]|$)/g, '어려운'],
  // 고민- 활용형 ("고충이 되다"는 비문 → "염려"로 통일)
  [/고민거리/g, '궁금증'],
  [/고민이/g, '염려가'],
  [/고민을/g, '염려를'],
  [/고민하/g, '숙고하'],
  [/고민(?=[,.\s!?\n]|$)/g, '염려'],
  // 감사합니다 제거 (마무리 인사 뒤)
  [/이었습니다\.\s*감사합니다\.?/g, '이었습니다.'],
  [/였습니다\.\s*감사합니다\.?/g, '였습니다.'],
  [/\s*감사합니다\.?\s*$/gm, ''],
  // 경험 - 문맥별 치환
  [/임상\s*경험/g, '임상 노하우'],
  [/풍부한\s*경험/g, '풍부한 노하우'],
  [/많은\s*경험/g, '다양한 사례'],
  [/소중한\s*경험/g, '소중한 기억'],
  [/특별한\s*경험/g, '특별한 기억'],
  [/경험이\s*있/g, '적이 있'],
  [/경험이\s*없/g, '적이 없'],
  [/경험을/g, '과정을'], // 약물치료 경험을 -> 과정을
  [/경험하/g, '체감하'], // 경험하다 -> 체감하다
  [/경험해/g, '체감해'],
  [/경험한/g, '겪은'],
  [/경험(?=[,.\s!?\n]|$)/g, '체험'], // Fallback noun
  // 불편- 활용형
  [/불편감함/g, '부담감'],        // LLM이 만드는 이중 접미사 오류 방지
  [/불편감/g, '부담감'],
  [/불편함/g, '부담감'],
  [/불편한/g, '부담되는'],
  [/불편했/g, '부담됐'],
  [/불편하/g, '부담되'],
  [/불편해/g, '부담돼'],
  [/불편을/g, '부담을'],
  [/불편이/g, '부담이'],
  [/불편(?=[,.\s!?\n]|$)/g, '부담'],
  // 불안- 활용형 (복합어 "불안정" 보호를 위해 CONTEXT에서 처리)
  [/불안감/g, '우려감'],
  [/불안하/g, '우려되'],
  [/불안해/g, '우려돼'],
  [/불안을/g, '우려를'],
  [/불안이/g, '우려가'],
  [/불안(?=[,.\s!?\n]|$)/g, '우려'],
  // LLM이 생성하는 부자연스러운 임플란트 동의어 정규화
  [/인공자연치/g, '임플란트'],
  [/인공영구치/g, '임플란트'],
]

/** 금칙어를 안전한 대체어로 치환 (독립 단어 기준, 한글 조사 보정 포함) */
export function sanitizeForbiddenWords(content: string): string {
  let result = content

  // Step A: 활용형별 정밀 치환 (문법 오류 방지)
  for (const [pattern, replacement] of CONTEXT_REPLACEMENTS) {
    result = result.replace(pattern, replacement as string)
  }

  // Step B: 단순 1:1 치환 (독립 단어 + 조사 보정)
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
  [/환자분들이/g, '분들이'],
  [/환자분들의/g, '분들의'],
  [/환자분들/g, '분들'],
  [/환자분/g, '해당되시는 분'],
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
  // 불편: CONTEXT_REPLACEMENTS에서 활용형별 처리하므로 여기서는 제거
  [/과도한/g, '지나친'],
  [/과도하게/g, '지나치게'],
  [/과함/g, '지나침'],
  // 복합어 보호: "불필요" → 대체 (아래 "필요→권장" 치환에서 오치환 방지)
  [/불필요한/g, '쓸데없는'],
  [/불필요할/g, '쓸데없을'],
  [/불필요/g, '쓸데없는'],
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
    // 거든요: stem+거든요 → stem+기 때문이죠 (동일 어간 호환)
    [/거든요(?=[.!?\s\n]|$)/g, '기 때문이죠'],
    // 거예요 → 겁니다 ("~할 거예요" → "~할 겁니다")
    [/거예요(?=[.!?\s\n]|$)/g, '겁니다'],
    // 이에요 → 입니다 ("~이에요" → "~입니다")
    [/이에요(?=[.!?\s\n]|$)/g, '입니다'],
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
// 2.5. 정보성 모드: ~입니다 3연속 자동 교정
// ============================================================

/**
 * 정보성 모드에서 ~입니다/됩니다/있습니다가 3문장 이상 연속되면
 * 3번째부터 ~이죠/~인데요로 자동 교체하여 어미 다양성 확보
 */
function breakConsecutiveImnida(content: string, writingMode?: string): string {
  if (writingMode !== 'informative') return content

  const lines = content.split('\n')
  let consecutive = 0

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || /^(#|📷|\[|※|-)/.test(trimmed)) {
      // 헤더, 이미지, 리스트 등은 카운트 리셋하지 않고 스킵
      continue
    }

    if (/(?:입니다|됩니다|있습니다)[.!]?\s*$/.test(trimmed)) {
      consecutive++
      if (consecutive >= 3) {
        // 3번째부터 ~이죠/~인데요로 교체 (교대)
        if (consecutive % 2 === 1) {
          lines[i] = lines[i]
            .replace(/입니다([.!]?\s*)$/, '이죠$1')
            .replace(/됩니다([.!]?\s*)$/, '되죠$1')
            .replace(/있습니다([.!]?\s*)$/, '있죠$1')
        } else {
          lines[i] = lines[i]
            .replace(/입니다([.!]?\s*)$/, '인데요$1')
            .replace(/됩니다([.!]?\s*)$/, '되는데요$1')
            .replace(/있습니다([.!]?\s*)$/, '있는데요$1')
        }
        consecutive = 0 // 리셋
      }
    } else {
      consecutive = 0
    }
  }

  return lines.join('\n')
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
  '보철물', '수복물', '골이식재', '상악동막', '발치와',
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

/**
 * 동의어 회전 강제 적용 (전체 단어 대상)
 * - Region, Clinic, MainKeyword를 제외한 모든 단어는 전체 6회 초과 시 교체
 * - MainKeyword와 겹치는 구간은 보호
 */
export function rotateSynonyms(content: string, options: PostProcessOptions): string {
  const { region, mainKeyword, clinicName } = options

  // 0. 해시태그 영역 분리 (동의어 회전 제외)
  // 해시태그 줄: #키워드 #키워드 형태 (## 마크다운 헤딩과 구분)
  const hashtagMatch = content.match(/(\n#(?!#)[^\n]+)\s*$/)
  const hashtagSection = hashtagMatch ? hashtagMatch[1] : ''
  let result = hashtagSection ? content.slice(0, content.length - hashtagSection.length) : content

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

  // 2. 예외 단어 설정 (메인키워드 개별 단어도 보호)
  const mainKeywordParts = mainKeyword ? mainKeyword.split(/\s+/) : []
  const exceptions = new Set([
    region,
    clinicName,
    '치과', // 명시적 제외
    '원장', // 필요 시 추가
    ...inputKeywords,
    ...mainKeywordParts, // "강남 임플란트" → "강남", "임플란트" 각각 보호
  ].filter(Boolean))

  // 3. 사전 순회 및 교체
  for (const [word, synonyms] of Object.entries(SYNONYM_DICTIONARY)) {
    if (exceptions.has(word)) continue
    if (!synonyms || synonyms.length === 0) continue

    const regex = new RegExp(escapeRegex(word), 'g')
    // 현재 결과에서 매치 찾기
    const allMatches = [...result.matchAll(regex)]

    // 보호 구간과 겹치지 않는 유효 매치 필터링
    // + 복합어 내부 매칭 방지: "보철"이 "보철물" 내부에서 매칭되면 스킵
    const COMPOUND_SUFFIXES = /^[물술치재법학과막]/  // 복합어 결합 접미사
    const validMatches = allMatches.filter(m => {
      if (m.index === undefined) return false
      if (isProtected(m.index, m.index + word.length)) return false
      // 뒤에 복합어 접미사가 바로 이어지면 복합어 내부 → 스킵
      const nextChar = result[m.index + word.length]
      if (nextChar && COMPOUND_SUFFIXES.test(nextChar)) return false
      return true
    })

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

        // 조사 보정: 뒤에 조사가 붙어있으면 받침에 맞게 교체
        const particleMatch = after.match(PARTICLE_PATTERN)
        if (particleMatch) {
          const oldParticle = particleMatch[1]
          const newParticle = adjustParticle(synonym, oldParticle)
          result = before + synonym + newParticle + after.substring(oldParticle.length)
        } else {
          result = before + synonym + after
        }
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

  // 해시태그 영역 복원 (동의어 회전 미적용)
  return result + hashtagSection
}

// ============================================================
// 5. 형태소(지역명) 빈도 및 분포 보장 (7회 고정: 제목1+서론1+본론4+결론1)
// ============================================================

/** 본론용 브릿지 문장 (다양성 확보) */
function getBridgeSentences(region: string, writingMode?: string): string[] {
  // 임상 모드: 전문의 톤에 맞는 브릿지 문장
  if (writingMode === 'expert') {
    return [
      `${region}에서도 이와 유사한 증례가 보고되고 있습니다.`,
      `${region}에서도 이러한 소견으로 내원하시는 분들이 적지 않습니다.`,
      `${region} 전문의와 정밀 검사를 통해 확인하시는 것이 권장됩니다.`,
      `${region}에서도 유사한 임상 양상이 관찰됩니다.`,
      `${region} 치과에서 정기적인 경과 관찰이 권장됩니다.`,
      `${region}에서도 이러한 증상에 대한 진료 사례가 증가하고 있습니다.`,
    ]
  }
  // 정보성 모드: 일반 안내 톤
  return [
    `${region} 방문 시 이 점을 확인해보시는 것이 좋습니다.`,
    `${region}에서 꾸준한 검진을 받으시길 권장합니다.`,
    `가까운 ${region} 치과에서 현재 상태를 확인해보는 것이 바람직합니다.`,
    `${region}에서 정밀 검사를 통해 확인하실 수 있습니다.`,
    `${region} 방문을 통해 정확한 진단을 받아보시길 권장합니다.`,
    `${region}에서 체계적인 관리를 시작하시는 것이 바람직합니다.`,
    `${region} 전문의와 상담하여 계획을 수립하시길 권장합니다.`,
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
export function enforceRegionFrequency(content: string, region: string, writingMode?: string): string {
  if (!region) return content

  // 1. 섹션 분리
  // Intro(제목포함) | Body(## ...) | Conclusion(마지막 ## ...)
  const sections = content.split(/^(##\s.*$)/m)

  // 헤더 개수 파악
  let headerCount = 0
  for (const s of sections) {
    if (/^##\s/.test(s)) headerCount++
  }

  // 구조가 예상과 다르면(헤더가 너무 적으면) 단순 전체 카운트 기반 fallback
  if (headerCount < 2) {
    const currentCount = (content.match(new RegExp(escapeRegex(region), 'g')) || []).length
    if (currentCount >= 5) return content // 이미 충분
    // 부족 시 글 끝에 브릿지 문장 삽입
    let result = content
    const bridges = getBridgeSentences(region, writingMode)
    let bridgeIdx = 0
    let needed = Math.max(0, 5 - currentCount)
    while (needed > 0) {
      result = result.trimEnd() + '\n\n' + bridges[bridgeIdx % bridges.length]
      bridgeIdx++
      needed--
    }
    return result
  }

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

  // [서론] 제목+서론 전체, 또는 첫 번째 ## 섹션 본문에 지역명이 있으면 스킵
  // 블로그 구조상 인사말이 첫 ## 섹션 안에 오는 경우가 많음
  const firstBodySection = sections.length > 2 ? sections[2] : ''
  const introHasRegion = introPart.includes(region) || firstBodySection.includes(region)

  if (!introHasRegion) {
    introPart = introPart.trim() + `\n\n${region}에서 알려드렸습니다.`
  }

  // [본론] (총 4회 맞추기)
  let currentBodyCount = 0
  for (const idx of bodyIndices) {
    currentBodyCount += (sections[idx].match(new RegExp(escapeRegex(region), 'g')) || []).length
  }

  if (currentBodyCount < 4) {
    let deficiency = 4 - currentBodyCount
    const bridges = getBridgeSentences(region, writingMode)
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

  // 3. Cap 로직: 총 region 수가 8회 초과 시 본론 뒤쪽부터 제거
  let assembled = sections.join('')
  const totalRegionCount = (assembled.match(new RegExp(escapeRegex(region), 'g')) || []).length

  if (totalRegionCount > 8) {
    // 뒤에서부터 본론 영역의 region 멘션을 포함한 문장을 제거
    const regionRegex = new RegExp(escapeRegex(region), 'g')
    const allPositions: number[] = []
    let m: RegExpExecArray | null
    while ((m = regionRegex.exec(assembled)) !== null) {
      allPositions.push(m.index)
    }

    // 앞 3개(제목+서론+본론초반)와 뒤 1개(결론)는 보호, 나머지 뒤에서부터 제거
    const excess = totalRegionCount - 7
    // 제거 대상: 보호 3개 이후 ~ 결론 1개 이전
    const removable = allPositions.slice(3, -1)
    const toRemovePositions = removable.slice(-excess) // 뒤쪽 excess개

    // 해당 위치의 region을 포함한 문장(줄) 전체 제거 (뒤에서부터)
    for (let i = toRemovePositions.length - 1; i >= 0; i--) {
      const pos = toRemovePositions[i]
      const before = assembled.slice(0, pos)
      const lineStart = before.lastIndexOf('\n') + 1
      const afterPos = assembled.slice(pos)
      const lineEndRel = afterPos.indexOf('\n')
      const lineEnd = lineEndRel === -1 ? assembled.length : pos + lineEndRel

      // 해당 줄이 헤더(##)가 아닌 경우에만 제거
      const line = assembled.slice(lineStart, lineEnd)
      if (/^##\s/.test(line.trim())) continue
      assembled = assembled.slice(0, lineStart) + assembled.slice(lineEnd + 1)
    }

    // 빈 줄 정리
    assembled = assembled.replace(/\n{3,}/g, '\n\n')
  }

  return assembled
}

// ============================================================
// 6. Q&A/FAQ 블록 위치 강제 (본문 중간 Q&A 제거)
// ============================================================

/**
 * Q&A/FAQ 블록이 본문 중간에 등장하면 제거.
 * - 임상 모드: Q&A 블록 전부 제거
 * - 정보성 모드: 마지막 ## 섹션(결론)에만 1개 허용, 나머지 제거
 *
 * Q&A 블록 판별: "Q." 또는 "Q:" 으로 시작하는 줄 + 뒤따르는 "A." 또는 "A:" 줄
 * 또는 "**Q.**" / "**Q:**" 마크다운 볼드 패턴
 */
function enforceQnaPosition(content: string, writingMode?: string): string {
  // 2차 패스: 줄 내부 인라인 Q&A 패턴 ("Q. ~? A. ~") 을 줄 분리로 정규화
  let normalized = content.replace(
    /([^\n])((?:\*{0,2})Q[.:])\s*/gi,
    (match, before, qMark) => {
      // Q가 줄 시작이 아니면 앞에 줄바꿈 삽입
      if (before.trim()) return before + '\n' + qMark + ' '
      return match
    }
  )
  normalized = normalized.replace(
    /([^\n])((?:\*{0,2})A[.:])\s*/gi,
    (match, before, aMark) => {
      if (before.trim()) return before + '\n' + aMark + ' '
      return match
    }
  )

  const lines = normalized.split('\n')

  // ## 헤더 위치 찾기
  const headerIndices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i].trim())) {
      headerIndices.push(i)
    }
  }

  // 마지막 ## 섹션 시작 인덱스 (결론 영역)
  const lastHeaderIdx = headerIndices.length > 0 ? headerIndices[headerIndices.length - 1] : lines.length

  // Q&A 블록 감지 패턴
  const QNA_START = /^\s*(?:\*{0,2}Q[.:\s])/i
  const QNA_ANSWER = /^\s*(?:\*{0,2}A[.:\s])/i
  // FAQ 헤더 패턴
  const FAQ_HEADER = /^\s*(?:#{1,3}\s*)?(?:\*{1,2})?(?:FAQ|Q\s*&\s*A|자주\s*묻는\s*질문|궁금하신)(?:\*{1,2})?/i

  // 임상 모드: 모든 Q&A 제거
  if (writingMode === 'expert') {
    const result: string[] = []
    let skipQna = false

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()

      if (FAQ_HEADER.test(trimmed)) {
        skipQna = true
        continue
      }
      if (QNA_START.test(trimmed)) {
        skipQna = true
        continue
      }
      if (skipQna && QNA_ANSWER.test(trimmed)) {
        continue
      }
      if (skipQna && trimmed === '') {
        skipQna = false
        continue
      }
      // Q&A 답변이 여러 줄일 수 있음 — 빈 줄 or 새 헤더/Q가 올 때까지 스킵
      if (skipQna && !QNA_START.test(trimmed) && !/^##\s/.test(trimmed)) {
        continue
      }

      skipQna = false
      result.push(lines[i])
    }
    return result.join('\n')
  }

  // 정보성 모드: 결론(마지막 ## 이후) 영역만 Q&A 1개 허용
  const result: string[] = []
  let qnaCountInConclusion = 0
  let skipQna = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    const isInConclusion = i >= lastHeaderIdx

    if (FAQ_HEADER.test(trimmed) || QNA_START.test(trimmed)) {
      if (!isInConclusion) {
        // 본문 중간 Q&A → 제거
        skipQna = true
        continue
      }
      if (isInConclusion && qnaCountInConclusion >= 1) {
        // 결론에서 2번째 이상 Q&A → 제거
        skipQna = true
        continue
      }
      // 결론 첫 번째 Q&A → 허용
      if (QNA_START.test(trimmed)) {
        qnaCountInConclusion++
      }
      skipQna = false
      result.push(lines[i])
      continue
    }

    if (skipQna) {
      if (QNA_ANSWER.test(trimmed)) continue
      if (trimmed === '') { skipQna = false; continue }
      if (!/^##\s/.test(trimmed)) continue
      skipQna = false
    }

    result.push(lines[i])
  }

  return result.join('\n')
}

// ============================================================
// 7. 상투적 공감 멘트 반복 제거
// ============================================================

/** 기계적으로 반복되는 상투적 공감/전환 멘트 패턴 */
const BOILERPLATE_PATTERNS: RegExp[] = [
  /충분히\s*(?:그러실|이해하실|공감하실|그렇게\s*느끼실)\s*수\s*있습니다/g,
  /충분히\s*(?:관리하실|회복하실|극복하실|나아지실|좋아지실|개선되실)\s*수\s*있습니다/g,
  /자주\s*(?:나오는|받는|듣는|묻는)\s*질문입니다/g,
  /많이들?\s*(?:궁금해\s*하시는|여쭤보시는|문의하시는)\s*(?:부분|내용)인데요/g,
  /알아보기\s*쉽습니다/g,
  /쉽게\s*(?:말씀드리|설명드리|풀어보)면/g,
]

/**
 * 상투적 멘트가 글 전체에서 2회 이상 등장하면 2번째부터 해당 문장 제거.
 * 문장 단위로 제거하되, 빈 줄이 연속되지 않도록 정리.
 */
function removeBoilerplatePhrases(content: string): string {
  let result = content

  for (const pattern of BOILERPLATE_PATTERNS) {
    // 전역 플래그 재설정
    const globalPattern = new RegExp(pattern.source, 'g')
    const matches = [...result.matchAll(globalPattern)]

    if (matches.length < 2) continue

    // 2번째부터 해당 문장을 포함한 줄 제거 (뒤에서부터)
    const toRemove = matches.slice(1)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const match = toRemove[i]
      if (match.index === undefined) continue

      // 해당 매치가 포함된 문장(줄) 찾기
      const beforeMatch = result.slice(0, match.index)
      const lastNewline = beforeMatch.lastIndexOf('\n')
      const lineStart = lastNewline + 1
      const afterMatch = result.slice(match.index)
      const nextNewline = afterMatch.indexOf('\n')
      const lineEnd = nextNewline === -1 ? result.length : match.index + nextNewline

      // 줄 전체 제거
      result = result.slice(0, lineStart) + result.slice(lineEnd + 1)
    }
  }

  // 빈 줄 3개 이상 연속 → 2개로 정리
  result = result.replace(/\n{3,}/g, '\n\n')

  return result
}

// ============================================================
// 8. 비유 표현 과다 사용 제한 (정보성 모드)
// ============================================================

/** 비유 표현 감지 패턴 */
const METAPHOR_PATTERNS: RegExp[] = [
  /마치\s+[가-힣]+(?:처럼|과\s*같|와\s*같|듯이|듯\s)/g,
  /비유하자면/g,
  /비유하면/g,
  /비유해\s*보면/g,
  /쉽게\s*비유하자면/g,
  /와\s*같은\s*원리/g,
  /과\s*같은\s*원리/g,
  /에\s*비유하면/g,
  /라고\s*생각하시면\s*(?:이해하기\s*)?쉽/g,
  /으로\s*비유하면/g,
]

/**
 * 정보성 모드에서 비유 표현이 2회를 초과하면 3번째부터 제거.
 * 비유 표현이 포함된 문장에서 비유 부분만 삭제하되, 문장이 비유 중심이면 줄 전체 삭제.
 */
function limitMetaphors(content: string, writingMode?: string): string {
  // 임상 모드에서는 비유 자체가 금지이므로 모든 비유 제거
  // 정보성 모드에서는 2회까지 허용
  const maxAllowed = writingMode === 'expert' ? 0 : 2

  // 모든 비유 매치를 수집하고 위치순 정렬
  const allMatches: { index: number; length: number; text: string }[] = []

  for (const pattern of METAPHOR_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, 'g')
    for (const match of content.matchAll(globalPattern)) {
      if (match.index !== undefined) {
        allMatches.push({ index: match.index, length: match[0].length, text: match[0] })
      }
    }
  }

  // 위치순 정렬 (앞→뒤)
  allMatches.sort((a, b) => a.index - b.index)

  // 중복 제거 (겹치는 매치)
  const dedupedMatches: typeof allMatches = []
  for (const m of allMatches) {
    const last = dedupedMatches[dedupedMatches.length - 1]
    if (last && m.index < last.index + last.length) continue
    dedupedMatches.push(m)
  }

  if (dedupedMatches.length <= maxAllowed) return content

  // maxAllowed+1번째부터 해당 비유 부분 삭제 (뒤에서부터)
  let result = content
  const toRemove = dedupedMatches.slice(maxAllowed)

  for (let i = toRemove.length - 1; i >= 0; i--) {
    const match = toRemove[i]
    // 비유 표현만 삭제 (문장은 유지, 인덱스 안전을 위해 trim 없이 직접 치환)
    result = result.slice(0, match.index) + result.slice(match.index + match.length)
  }

  // 삭제 후 정리 (한꺼번에 처리하여 인덱스 밀림 방지)
  result = result.replace(/\n{3,}/g, '\n\n')
  result = result.replace(/  +/g, ' ')
  result = result.replace(/\s+([.!?,])/g, '$1') // 구두점 앞 불필요 공백

  return result
}

// ============================================================
// 강조부사 빈도 제한
// ============================================================

const EMPHASIS_ADVERB_MAP: Record<string, string[]> = {
  '가장': ['더욱', '한층', '매우'],
  '특히': ['그중에서도', '주목할 점은', '이 가운데'],
  '무엇보다': ['중요한 것은', '핵심은', '우선적으로'],
}

/** 강조부사를 글 전체에서 각 2회 이하로 제한 (3번째부터 대체어로 치환) */
function limitEmphasisAdverbs(content: string): string {
  let result = content

  for (const [adverb, replacements] of Object.entries(EMPHASIS_ADVERB_MAP)) {
    const regex = new RegExp(adverb, 'g')
    const matches = [...result.matchAll(regex)]

    if (matches.length <= 2) continue

    // 3번째부터 뒤에서 교체 (인덱스 밀림 방지)
    const toReplace = matches.slice(2)
    for (let i = toReplace.length - 1; i >= 0; i--) {
      const match = toReplace[i]
      if (match.index === undefined) continue
      const replacement = replacements[i % replacements.length]
      result = result.slice(0, match.index) + replacement + result.slice(match.index + adverb.length)
    }
  }

  return result
}

// ============================================================
// 섹션 제목(##) 줄바꿈 보장
// ============================================================

/** ## 제목 앞뒤에 빈 줄이 있는지 확인하고, 없으면 추가 */
function ensureHeadingLineBreaks(content: string): string {
  // ## 가 줄 중간에 등장하면 (예: "좋습니다.## 제목") 줄바꿈 삽입
  let result = content.replace(/([^\n#])(##\s)/g, '$1\n\n$2')
  // ## 앞에 줄바꿈 1개만 있으면 빈 줄 추가
  result = result.replace(/([^\n])\n(##\s)/g, '$1\n\n$2')
  // ## 줄 뒤에 빈 줄 없으면 추가
  result = result.replace(/(##[^\n]+)\n([^\n#])/g, '$1\n\n$2')
  return result
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

  // Step 1.6: 💡 핵심 문장에서 치과명/지역+치과 + 효과 연결 제거 (의료법)
  if (options.region || options.clinicName) {
    result = result.replace(/💡\s*핵심:.*$/gm, (line) => {
      let cleaned = line
      if (options.clinicName) {
        cleaned = cleaned.replace(new RegExp(escapeRegex(options.clinicName) + '\\s*(?:에서|의)\\s*', 'g'), '')
      }
      if (options.region) {
        cleaned = cleaned.replace(new RegExp(escapeRegex(options.region) + '\\s*(?:치과에서|에서)\\s*(?:진행하는|시행하는|실시하는)\\s*', 'g'), '')
      }
      return cleaned
    })
  }

  // Step 1.7: Q&A/FAQ 위치 강제 (본문 중간 제거)
  result = enforceQnaPosition(result, options.writingMode)

  // Step 1.8: 상투적 공감 멘트 반복 제거
  result = removeBoilerplatePhrases(result)

  // Step 1.9: 비유 표현 과다 제한
  result = limitMetaphors(result, options.writingMode)

  // Step 2: ~요 금지 어미 치환 (안전 패턴만)
  result = sanitizeForbiddenEndings(result, options.writingMode)

  // Step 2.5: 정보성 모드 ~입니다 3연속 자동 교정
  result = breakConsecutiveImnida(result, options.writingMode)

  // Step 3: 형태소 기반 키워드 빈도 제한
  if (options.region && options.mainKeyword) {
    result = enforceMorphemeLimit(result, options)
  }

  // Step 4: 동의어 회전 (전체 6회 제한)
  result = rotateSynonyms(result, options)

  // Step 4.5: 강조부사 빈도 제한 (각 2회 이하)
  result = limitEmphasisAdverbs(result)

  // Step 5: 형태소(지역명) 빈도 및 분포 보장 (7회 고정)
  if (options.region) {
    result = enforceRegionFrequency(result, options.region, options.writingMode)
  }

  // Step 6: 문장 종결 후 줄바꿈 보장 ('~다.' 뒤 다음 문장은 새 줄)
  result = ensureSentenceLineBreaks(result)

  // Step 7: 섹션 제목(##) 앞뒤 줄바꿈 보장
  result = ensureHeadingLineBreaks(result)

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


