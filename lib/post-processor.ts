/**
 * LLM 출력 후처리 모듈
 * - 금칙어 자동 치환
 * - ~요 금지 어미 치환 (안전 패턴만)
 * - 키워드 빈도 초과 시 동의어 교체
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
  '불편': '불편감',
  '힘들': '어려운',
  '해결': '개선',
  '해소': '완화',
  '해주': '도와드리',
  '해보': '살펴보',
  '해본': '겪어본',
  '과도': '지나친',
  '과다': '과잉',
  '과함': '지나침',
}

/** 금칙어를 안전한 대체어로 치환 (독립 단어 기준) */
export function sanitizeForbiddenWords(content: string): string {
  let result = content

  for (const [word, replacement] of Object.entries(FORBIDDEN_REPLACEMENTS)) {
    // 독립 단어 매칭 (앞: 공백/문장부호/시작, 뒤: 공백/문장부호/끝)
    const regex = new RegExp(
      `(^|[\\s,.\\'"\u201C\u201D\u00B7(])${escapeRegex(word)}(?=[\\s,.\\'"\u201C\u201D\u00B7)!?\\n]|$)`,
      'gm'
    )
    result = result.replace(regex, `$1${replacement}`)
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
// 3. 키워드 빈도 초과 교정
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

/** 토픽 키워드(임플란트, 근관치료 등) 빈도 제한 */
export function enforceKeywordLimit(
  content: string,
  topic: string,
  mainKeyword: string
): string {
  const synonyms = SYNONYM_DICTIONARY[topic]
  if (!synonyms || synonyms.length === 0) return content

  const topicInMain = mainKeyword.includes(topic)
  // 검증기 임계값(10/6)보다 여유 있게 설정
  const maxCount = topicInMain ? 7 : 5

  return reduceWordCount(content, topic, maxCount, synonyms)
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
 */
export function rotateSynonyms(content: string): string {
  let result = content
  const processedWords = new Set<string>()

  for (const word of WATCH_WORDS) {
    // 연쇄 교체 방지: 이전 단어의 동의어로 이미 등장한 단어는 건너뜀
    if (processedWords.has(word)) continue

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
// 메인 후처리 파이프라인
// ============================================================

export interface PostProcessOptions {
  topic: string
  mainKeyword: string
  clinicName: string
  writingMode?: string // 'expert' | 'information'
}

export function postProcess(content: string, options: PostProcessOptions): string {
  let result = content

  // Step 1: 금칙어 치환
  result = sanitizeForbiddenWords(result)

  // Step 2: ~요 금지 어미 치환 (안전 패턴만)
  result = sanitizeForbiddenEndings(result, options.writingMode)

  // Step 3: 토픽 키워드 빈도 제한
  if (options.topic) {
    result = enforceKeywordLimit(result, options.topic, options.mainKeyword)
  }

  // Step 4: 동의어 회전 (고빈도 일반 단어)
  result = rotateSynonyms(result)

  return result
}
