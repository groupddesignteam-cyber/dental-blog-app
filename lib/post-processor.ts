// 블로그 글 후처리 파이프라인
// 미팅 피드백 기반 코드 레벨 검증 + 자동 수정 (2026.02.06)

import { WritingMode } from '@/types'
import { SYNONYM_DICTIONARY } from '@/data/synonyms'

// ============================================================
// 1. 섹션 파싱: 서론 / 본론 / 결론 분리
// ============================================================

export interface ParsedSections {
  title: string       // 제목 (# 또는 첫 줄)
  intro: string       // 서론 (인사 ~ 첫 번째 --- 또는 ## 전까지)
  body: string        // 본론 (Q&A + 본문 섹션들)
  conclusion: string  // 결론 (## 마무리 ~ 끝)
  hashtags: string    // 해시태그 줄
  disclaimer: string  // 부작용 고지 (※ ...)
}

export function parseSections(content: string): ParsedSections {
  const lines = content.split('\n')

  let title = ''
  let introLines: string[] = []
  let bodyLines: string[] = []
  let conclusionLines: string[] = []
  let hashtagLines: string[] = []
  let disclaimerLines: string[] = []

  // 단계: title → intro → body → conclusion → hashtags/disclaimer
  type Phase = 'title' | 'intro' | 'body' | 'conclusion' | 'post'
  let phase: Phase = 'title'
  let foundFirstSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // 제목 파싱
    if (phase === 'title') {
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        title = trimmed.replace(/^#\s+/, '')
        phase = 'intro'
        continue
      }
      // 제목 없이 바로 시작하면 첫 줄을 제목으로
      if (trimmed.length > 0) {
        title = trimmed
        phase = 'intro'
        continue
      }
      continue
    }

    // 해시태그 라인 (#키워드 패턴이 3개 이상)
    if (trimmed.match(/^#[^\s#]+(\s+#[^\s#]+){2,}/)) {
      hashtagLines.push(line)
      phase = 'post'
      continue
    }

    // 부작용 고지 (※ 로 시작)
    if (trimmed.startsWith('※')) {
      disclaimerLines.push(line)
      phase = 'post'
      continue
    }

    // post 단계에서는 해시태그/고지만 수집
    if (phase === 'post') {
      if (trimmed.startsWith('#') && !trimmed.startsWith('## ')) {
        hashtagLines.push(line)
      } else if (trimmed.startsWith('※')) {
        disclaimerLines.push(line)
      }
      continue
    }

    // "## 마무리" 감지 → 결론 시작
    if (trimmed.match(/^##\s*(마무리|결론|정리)/)) {
      phase = 'conclusion'
      conclusionLines.push(line)
      continue
    }

    // 결론 단계
    if (phase === 'conclusion') {
      // 구분선(---) 이후의 해시태그/고지는 post로
      if (trimmed === '---' && conclusionLines.length > 2) {
        // 구분선 뒤를 확인
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0)
        if (nextNonEmpty && (nextNonEmpty.trim().startsWith('#') || nextNonEmpty.trim().startsWith('※'))) {
          phase = 'post'
          continue
        }
      }
      conclusionLines.push(line)
      continue
    }

    // 본론 시작 감지: 첫 번째 ## 섹션 또는 Q. 블록 또는 ---
    if (phase === 'intro') {
      if (trimmed.startsWith('## ') || trimmed.startsWith('Q.') || (trimmed === '---' && foundFirstSection === false && introLines.length > 2)) {
        phase = 'body'
        foundFirstSection = true
        bodyLines.push(line)
        continue
      }
      introLines.push(line)
      continue
    }

    // 본론 단계
    if (phase === 'body') {
      bodyLines.push(line)
      continue
    }
  }

  // 결론이 비어있으면 본론 마지막 부분에서 추출 시도
  if (conclusionLines.length === 0 && bodyLines.length > 0) {
    // 본론의 마지막 "이었습니다" 포함 문단을 결론으로 이동
    let lastClosingIdx = -1
    for (let k = bodyLines.length - 1; k >= 0; k--) {
      if (bodyLines[k].includes('이었습니다') || bodyLines[k].includes('감사합니다') || bodyLines[k].includes('권장합니다')) {
        lastClosingIdx = k
        break
      }
    }
    if (lastClosingIdx > bodyLines.length * 0.7) {
      // 해당 줄 포함 앞쪽 ## 헤더부터 결론으로
      let cutStart = lastClosingIdx
      for (let j = lastClosingIdx - 1; j >= 0; j--) {
        if (bodyLines[j].trim().startsWith('## ')) {
          cutStart = j
          break
        }
      }
      conclusionLines = bodyLines.splice(cutStart)
    }
  }

  return {
    title,
    intro: introLines.join('\n'),
    body: bodyLines.join('\n'),
    conclusion: conclusionLines.join('\n'),
    hashtags: hashtagLines.join('\n'),
    disclaimer: disclaimerLines.join('\n'),
  }
}

// 순수 텍스트 글자수 (이미지 플레이스홀더, 마크다운 제거)
function pureCharCount(text: string): number {
  return text
    .replace(/📷\s*\[이미지[^\]]*\]/g, '')    // 이미지 플레이스홀더
    .replace(/\(출처:[^)]*\)/g, '')            // 출처
    .replace(/^#{1,6}\s+/gm, '')               // 마크다운 제목
    .replace(/\*\*|__/g, '')                    // 볼드
    .replace(/\*|_/g, '')                       // 이탤릭
    .replace(/---+/g, '')                       // 구분선
    .replace(/\s/g, '')                         // 공백
    .length
}

// ============================================================
// 2. 섹션별 글자수 검증
// ============================================================

export interface SectionCharResult {
  intro: number
  body: number
  conclusion: number
  total: number
  warnings: string[]
}

export function validateSectionChars(sections: ParsedSections): SectionCharResult {
  const introChars = pureCharCount(sections.intro)
  const bodyChars = pureCharCount(sections.body)
  const conclusionChars = pureCharCount(sections.conclusion)
  const total = introChars + bodyChars + conclusionChars
  const warnings: string[] = []

  // 서론 목표: ~500자 (±150자 허용)
  if (introChars < 200) {
    warnings.push(`📏 서론 글자수 부족: ${introChars}자 (권장: 350~650자)`)
  } else if (introChars > 800) {
    warnings.push(`📏 서론 글자수 초과: ${introChars}자 (권장: 350~650자)`)
  }

  // 본론 목표: ~1500자 (±300자 허용)
  if (bodyChars < 1000) {
    warnings.push(`📏 본론 글자수 부족: ${bodyChars}자 (권장: 1200~1800자)`)
  } else if (bodyChars > 2200) {
    warnings.push(`📏 본론 글자수 초과: ${bodyChars}자 (권장: 1200~1800자)`)
  }

  // 결론 목표: ~500자 (±150자 허용)
  if (conclusionChars < 150) {
    warnings.push(`📏 결론 글자수 부족: ${conclusionChars}자 (권장: 250~650자)`)
  } else if (conclusionChars > 800) {
    warnings.push(`📏 결론 글자수 초과: ${conclusionChars}자 (권장: 250~650자)`)
  }

  return { intro: introChars, body: bodyChars, conclusion: conclusionChars, total, warnings }
}

// ============================================================
// 3. 키워드 빈도 분석 + 배치 검증
// ============================================================

export interface KeywordFreqResult {
  mainKeyword: string
  mainCount: number
  subCounts: Record<string, number>
  placement: {
    title: number
    intro: number
    body: number
    conclusion: number
  }
  warnings: string[]
}

export function analyzeKeywordFrequency(
  content: string,
  sections: ParsedSections,
  mainKeyword: string,
  subKeywords: string[]
): KeywordFreqResult {
  const warnings: string[] = []

  // 메인키워드 총 빈도
  const mainRegex = new RegExp(escapeRegex(mainKeyword), 'g')
  const mainCount = (content.match(mainRegex) || []).length

  // 섹션별 배치 확인
  const titleCount = (sections.title.match(mainRegex) || []).length
  const introCount = (sections.intro.match(mainRegex) || []).length
  const bodyCount = (sections.body.match(mainRegex) || []).length
  const conclusionCount = (sections.conclusion.match(mainRegex) || []).length

  // 메인키워드 빈도 검증 (7~8회 권장)
  if (mainCount < 5) {
    warnings.push(`🔑 메인키워드 "${mainKeyword}" 빈도 부족: ${mainCount}회 (권장: 7~8회)`)
  } else if (mainCount > 10) {
    warnings.push(`🔑 메인키워드 "${mainKeyword}" 과다 반복: ${mainCount}회 (권장: 7~8회, 최대 10회)`)
  }

  // 배치 검증: 제목1 / 서론1 / 본론4 / 결론1
  if (titleCount < 1) {
    warnings.push(`🔑 메인키워드 제목 배치 누락 (현재 ${titleCount}회, 필요 1회)`)
  }
  if (introCount < 1) {
    warnings.push(`🔑 메인키워드 서론 배치 누락 (현재 ${introCount}회, 필요 1회)`)
  }
  if (bodyCount < 3) {
    warnings.push(`🔑 메인키워드 본론 배치 부족 (현재 ${bodyCount}회, 권장 4회)`)
  }
  if (conclusionCount < 1) {
    warnings.push(`🔑 메인키워드 결론 배치 누락 (현재 ${conclusionCount}회, 필요 1회)`)
  }

  // 서브키워드 빈도 (각 5~6회 이하)
  const subCounts: Record<string, number> = {}
  for (const sub of subKeywords) {
    if (!sub) continue
    const subRegex = new RegExp(escapeRegex(sub), 'g')
    const count = (content.match(subRegex) || []).length
    subCounts[sub] = count
    if (count > 8) {
      warnings.push(`🔑 서브키워드 "${sub}" 과다 반복: ${count}회 (권장: 5~6회 이하)`)
    }
  }

  return {
    mainKeyword,
    mainCount,
    subCounts,
    placement: {
      title: titleCount,
      intro: introCount,
      body: bodyCount,
      conclusion: conclusionCount,
    },
    warnings,
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================
// 4. 동의어 자동 치환 (반복 단어 감지 → 교체)
// ============================================================

export interface SynonymResult {
  content: string
  replacements: string[]
}

export function applySynonymReplacement(content: string, clinicName: string, region: string): SynonymResult {
  const replacements: string[] = []
  let result = content

  // 치과명, 지역명은 치환 대상에서 제외
  const excludeWords = [clinicName, region].filter(Boolean)

  for (const [word, synonyms] of Object.entries(SYNONYM_DICTIONARY)) {
    // 치과명/지역명에 포함된 단어는 건너뜀
    if (excludeWords.some(ex => ex.includes(word) || word.includes(ex))) continue

    const wordRegex = new RegExp(escapeRegex(word), 'g')
    const matches = result.match(wordRegex)
    if (!matches || matches.length <= 2) continue // 2회 이하는 무시

    // 3회부터 동의어 교체 (첫 2회는 원어 유지)
    let count = 0
    let synonymIdx = 0
    result = result.replace(wordRegex, (match) => {
      count++
      if (count <= 2) return match // 처음 2회는 원어 유지

      // 3회째부터 동의어 순환 사용
      const synonym = synonyms[synonymIdx % synonyms.length]
      synonymIdx++

      // 전문용어 괄호 표기 시에는 교체하지 않음 (예: "치수(신경)")
      // 이미 괄호 안에 있는 경우도 건너뜀
      replacements.push(`"${word}"(${count}번째) → "${synonym}"`)
      return synonym
    })
  }

  return { content: result, replacements }
}

// ============================================================
// 5. 모드별 스타일 검증
// ============================================================

export interface StyleValidationResult {
  mode: WritingMode
  warnings: string[]
  stats: {
    formalEndingPct: number      // ~입니다/~됩니다 비율
    casualEndingPct: number      // ~하죠/~인데요 비율
    metaphorCount: number        // 비유 표현 수
    clinicalPhraseCount: number  // 임상 소견 표현 수
  }
}

export function validateWritingStyle(content: string, mode?: WritingMode): StyleValidationResult {
  const warnings: string[] = []

  // 문장 종결 어미 분석 (줄 단위)
  const sentences = content.split(/[.!?]\s|\n/).filter(s => s.trim().length > 5)

  // 어미 패턴 카운트
  const formalPatterns = /(?:입니다|됩니다|있습니다|바랍니다|하였습니다|습니다|겠습니다|드립니다)[\s.\n]*$/
  const casualPatterns = /(?:하죠|이죠|지죠|같죠|시죠|인데요|군요)[\s.\n]*$/
  const forbiddenPatterns = /(?:해요|거든요|있어요|드려요|할게요|볼게요|줄게요|세요(?!\.))[\s.\n]*$/

  let formalCount = 0
  let casualCount = 0
  let forbiddenCount = 0

  for (const s of sentences) {
    const trimmed = s.trim()
    if (formalPatterns.test(trimmed)) formalCount++
    if (casualPatterns.test(trimmed)) casualCount++
    if (forbiddenPatterns.test(trimmed)) forbiddenCount++
  }

  const totalEndings = formalCount + casualCount + forbiddenCount || 1
  const formalPct = Math.round((formalCount / totalEndings) * 100)
  const casualPct = Math.round((casualCount / totalEndings) * 100)

  // 비유 표현 카운트
  const metaphorPatterns = [
    /마치\s+.{2,20}처럼/g,
    /비유하자면/g,
    /유사합니다/g,
    /비슷한\s*(원리|것)/g,
    /쉽게\s*(말하면|표현하면|비유하면)/g,
    /라고\s*(?:할|생각하시면)\s*(?:수|될)\s*(?:있습니다|수 있습니다)/g,
  ]

  let metaphorCount = 0
  for (const pattern of metaphorPatterns) {
    const matches = content.match(pattern)
    if (matches) metaphorCount += matches.length
  }

  // 임상 소견 표현 카운트
  const clinicalPatterns = [
    /관찰됩니다/g,
    /확인됩니다/g,
    /시사하는/g,
    /소견/g,
    /양상/g,
    /진행된/g,
    /임상\s*사진/g,
    /방사선\s*사진/g,
  ]

  let clinicalCount = 0
  for (const pattern of clinicalPatterns) {
    const matches = content.match(pattern)
    if (matches) clinicalCount += matches.length
  }

  // 모드별 검증
  if (mode === 'expert') {
    // 임상 모드: ~입니다 95% + 소견 표현 필수
    if (formalPct < 80) {
      warnings.push(`🏥 임상 모드 문체 부족: 문어체 ${formalPct}% (권장 90%+)`)
    }
    if (casualPct > 15) {
      warnings.push(`🏥 임상 모드 구어체 과다: ~하죠 등 ${casualPct}% (권장 5% 이하)`)
    }
    if (clinicalCount < 3) {
      warnings.push(`🏥 임상 소견 표현 부족: ${clinicalCount}개 (권장: "~가 관찰됩니다" 등 3개+)`)
    }
  } else if (mode === 'informative') {
    // 정보성 모드: ~입니다 60% + ~하죠 20% + 비유 필수
    if (metaphorCount < 2) {
      warnings.push(`📚 정보성 모드 비유 부족: ${metaphorCount}개 (권장: 3개+, "마치 ~처럼" 등)`)
    }
    if (casualPct < 5 && formalPct > 95) {
      warnings.push(`📚 정보성 모드 톤 경직: ~하죠/~인데요 비율 ${casualPct}% (권장: 15~30%)`)
    }
  }

  // 공통: 금지 어미 검출
  if (forbiddenCount > 0) {
    warnings.push(`🚫 금지 어미 발견: ~해요/~거든요 등 ${forbiddenCount}건`)
  }

  return {
    mode: mode || 'expert',
    warnings,
    stats: {
      formalEndingPct: formalPct,
      casualEndingPct: casualPct,
      metaphorCount,
      clinicalPhraseCount: clinicalCount,
    },
  }
}

// ============================================================
// 6. 이미지 alt 텍스트 검증
// ============================================================

export interface ImageAltResult {
  total: number
  withAlt: number
  withoutAlt: string[]
  warnings: string[]
}

export function validateImageAlt(content: string): ImageAltResult {
  const warnings: string[] = []

  // 📷 [이미지 위치: ...] 패턴 추출
  const imagePlaceholders = content.match(/📷\s*\[이미지[^\]]*\]/g) || []
  const total = imagePlaceholders.length

  if (total === 0) {
    return { total: 0, withAlt: 0, withoutAlt: [], warnings: [] }
  }

  // alt 텍스트 포함 여부 확인 (최소 10자 이상의 설명)
  let withAlt = 0
  const withoutAlt: string[] = []

  for (const placeholder of imagePlaceholders) {
    // "[이미지 위치: " 뒤의 설명 텍스트 추출
    const descMatch = placeholder.match(/이미지\s*위치:\s*(.+?)\]/)
    if (descMatch && descMatch[1].trim().length >= 10) {
      withAlt++
    } else {
      withoutAlt.push(placeholder.substring(0, 50))
    }
  }

  if (withoutAlt.length > 0) {
    warnings.push(`🖼️ 이미지 설명 부족: ${withoutAlt.length}/${total}개에 충분한 alt 텍스트 없음`)
  }

  return { total, withAlt, withoutAlt, warnings }
}

// ============================================================
// 7. CC 콘텐츠(입력 주제) 반영 검증
// ============================================================

export function validateTopicReflection(
  content: string,
  topic: string,
  treatment: string
): string[] {
  const warnings: string[] = []

  // 주제 키워드를 분리하여 본문 포함 여부 확인
  const topicWords = topic.split(/[,\s/]+/).filter(w => w.length >= 2)

  for (const word of topicWords) {
    if (!content.includes(word)) {
      warnings.push(`📋 입력 주제 "${word}" 미반영: 본문에서 해당 키워드를 찾을 수 없음`)
    }
  }

  // 치료 방법 키워드도 확인
  if (treatment) {
    const treatmentWords = treatment.split(/[,\s/]+/).filter(w => w.length >= 2)
    const reflected = treatmentWords.some(w => content.includes(w))
    if (!reflected && treatmentWords.length > 0) {
      warnings.push(`📋 치료 방법 키워드 미반영: "${treatmentWords.join(', ')}" 중 본문에 언급 없음`)
    }
  }

  return warnings
}

// ============================================================
// 8. 통합 후처리 파이프라인
// ============================================================

export interface PostProcessResult {
  content: string               // 후처리 완료된 본문
  sections: ParsedSections      // 파싱된 섹션
  sectionChars: SectionCharResult
  keywordFreq: KeywordFreqResult | null
  synonymResult: SynonymResult
  styleValidation: StyleValidationResult
  imageAlt: ImageAltResult
  allWarnings: string[]         // 모든 경고 통합
}

export function runPostProcess(
  rawContent: string,
  options: {
    mainKeyword?: string
    subKeywords?: string[]
    clinicName: string
    region: string
    topic: string
    treatment: string
    writingMode?: WritingMode
  }
): PostProcessResult {
  // 1. 동의어 자동 치환
  const synonymResult = applySynonymReplacement(rawContent, options.clinicName, options.region)
  let content = synonymResult.content

  // 2. 섹션 파싱
  const sections = parseSections(content)

  // 3. 섹션별 글자수 검증
  const sectionChars = validateSectionChars(sections)

  // 4. 키워드 빈도 + 배치 검증
  let keywordFreq: KeywordFreqResult | null = null
  if (options.mainKeyword) {
    keywordFreq = analyzeKeywordFrequency(
      content,
      sections,
      options.mainKeyword,
      options.subKeywords || []
    )
  }

  // 5. 모드별 스타일 검증
  const styleValidation = validateWritingStyle(content, options.writingMode)

  // 6. 이미지 alt 텍스트 검증
  const imageAlt = validateImageAlt(content)

  // 7. 주제 반영 검증
  const topicWarnings = validateTopicReflection(content, options.topic, options.treatment)

  // 경고 통합
  const allWarnings: string[] = [
    ...sectionChars.warnings,
    ...(keywordFreq?.warnings || []),
    ...synonymResult.replacements.length > 0
      ? [`🔄 동의어 자동 치환 ${synonymResult.replacements.length}건 적용`]
      : [],
    ...styleValidation.warnings,
    ...imageAlt.warnings,
    ...topicWarnings,
  ]

  return {
    content,
    sections,
    sectionChars,
    keywordFreq,
    synonymResult,
    styleValidation,
    imageAlt,
    allWarnings,
  }
}
