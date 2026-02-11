// 생성된 블로그 글 검증 모듈 (CLAUDE.md 규칙 기반)

export interface ValidationCheck {
  name: string
  passed: boolean
  severity: 'error' | 'warning' | 'info'
  message: string
  details?: string[]
}

export interface ValidationResult {
  passed: boolean
  checks: ValidationCheck[]
  score: number // 0-100
}

// ── 글자수 계산 (이미지/논문/부작용 고지/해시태그 제외, 공백 제외) ──
function countContentChars(content: string): number {
  let text = content
  // 이미지 플레이스홀더 제거 (📷 [이미지...] + alt 텍스트 전체)
  text = text.replace(/📷\s*\[[^\]]*\]\s*(\([^)]*\))?/g, '')
  text = text.replace(/\[IMAGE_\d+\]/g, '')
  // 해시태그 제거 (#키워드)
  text = text.replace(/#[^\s#]+/g, '')
  // 논문 인용 블록 제거
  text = text.replace(/📎\s*References[\s\S]*$/m, '')
  text = text.replace(/\[References\][\s\S]*$/m, '')
  // 부작용 고지문 제거
  text = text.replace(/※[\s\S]*?(?:부작용|개인에 따라)[\s\S]*?$/m, '')
  // 출처 제거
  text = text.replace(/\(출처:.*?\)/g, '')
  // 마크다운 문법 제거
  text = text.replace(/^#{1,6}\s*/gm, '')
  text = text.replace(/\*\*(.*?)\*\*/g, '$1')
  text = text.replace(/\*(.*?)\*/g, '$1')
  text = text.replace(/---+/g, '')
  // 공백·줄바꿈 제거 후 순수 글자수만 카운트
  text = text.replace(/\s+/g, '')
  return text.length
}

// ── 1. 글자수 검사 ──
function checkCharCount(content: string): ValidationCheck {
  const count = countContentChars(content)
  const passed = count >= 1700
  let message: string
  let severity: 'error' | 'warning' | 'info'

  if (count < 1400) {
    message = `글자수 심각 부족: ${count.toLocaleString()}자 (최소 1,700자, 공백 제외)`
    severity = 'error'
  } else if (count < 1700) {
    message = `글자수 부족: ${count.toLocaleString()}자 (최소 1,700자, 공백 제외)`
    severity = 'warning'
  } else {
    message = `글자수: ${count.toLocaleString()}자 (공백 제외, 목표 약 2,000자)`
    severity = 'info'
  }

  return { name: '글자수 (공백 제외, 목표 ~2,000)', passed, severity, message }
}

// ── 2. 치과명 위치 검사 ──
function checkClinicNamePosition(content: string, clinicName: string): ValidationCheck {
  if (!clinicName) {
    return { name: '치과명 위치', passed: true, severity: 'info', message: '치과명 미입력 (검사 생략)' }
  }

  const lines = content.split('\n').filter(l => l.trim())
  const clinicMentions: number[] = []

  lines.forEach((line, idx) => {
    if (line.includes(clinicName)) {
      clinicMentions.push(idx)
    }
  })

  if (clinicMentions.length === 0) {
    return { name: '치과명 위치', passed: true, severity: 'info', message: '치과명 미사용' }
  }

  const totalLines = lines.length
  const introEnd = Math.max(3, Math.floor(totalLines * 0.15))
  const outroStart = Math.floor(totalLines * 0.85)

  const bodyMentions = clinicMentions.filter(idx => idx > introEnd && idx < outroStart)

  if (bodyMentions.length > 0) {
    return {
      name: '치과명 위치',
      passed: false,
      severity: 'error',
      message: `치과명이 본문 중간에 ${bodyMentions.length}회 사용됨 (서론/결론만 허용)`,
      details: bodyMentions.map(idx => `${idx + 1}번째 줄: "${lines[idx].substring(0, 50)}..."`)
    }
  }

  return {
    name: '치과명 위치',
    passed: true,
    severity: 'info',
    message: `치과명 ${clinicMentions.length}회 사용 (서론/결론 위치 적정)`
  }
}

// ── 3. 금지 어미 검사 ──
function checkForbiddenEndings(content: string, writingMode: string): ValidationCheck {
  // 임상 모드: 구어체 전면 금지 / 정보성 모드: 일부 허용
  const forbiddenEndings = writingMode === 'expert'
    ? ['해요', '거든요', '있어요', '드려요', '할게요', '볼게요', '네요', '인데요']
    : ['해요', '거든요', '있어요', '드려요', '할게요', '볼게요']

  const found: string[] = []
  // 문장 단위 분리 (마침표, 느낌표, 물음표, 줄바꿈)
  const sentences = content.split(/[.!?\n]/)

  for (const sentence of sentences) {
    const trimmed = sentence.trim()
    if (!trimmed || trimmed.length < 3) continue

    for (const ending of forbiddenEndings) {
      if (trimmed.endsWith(ending)) {
        const excerpt = trimmed.length > 20 ? '...' + trimmed.slice(-20) : trimmed
        found.push(`"${excerpt}" → ~${ending}`)
        break
      }
    }
  }

  const passed = found.length === 0
  return {
    name: '금지 어미',
    passed,
    severity: passed ? 'info' : 'error',
    message: passed
      ? `금지 어미 없음 (${writingMode === 'expert' ? '임상 모드' : '정보성 모드'})`
      : `금지 어미 ${found.length}건 발견`,
    details: found.length > 0 ? found.slice(0, 8) : undefined,
  }
}

// ── 4. 키워드 빈도 검사 ──
function checkKeywordFrequency(content: string, clinicName: string, topic: string): ValidationCheck {
  const issues: string[] = []
  const info: string[] = []

  // "치과" 빈도 체크 (최대 8회)
  const dentalCount = (content.match(/치과/g) || []).length
  if (dentalCount > 8) {
    issues.push(`"치과" ${dentalCount}회 (최대 8회 초과)`)
  } else {
    info.push(`"치과" ${dentalCount}회`)
  }

  // 치료 키워드 빈도 체크 (최대 6회)
  if (topic) {
    const escaped = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const topicCount = (content.match(new RegExp(escaped, 'g')) || []).length
    if (topicCount > 6) {
      issues.push(`"${topic}" ${topicCount}회 (최대 6회 초과)`)
    } else {
      info.push(`"${topic}" ${topicCount}회`)
    }
  }

  // 치과명 빈도 체크 (최대 3회: 서론1 + 결론1~2)
  if (clinicName) {
    const escaped = clinicName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const clinicCount = (content.match(new RegExp(escaped, 'g')) || []).length
    if (clinicCount > 3) {
      issues.push(`"${clinicName}" ${clinicCount}회 (최대 3회 초과)`)
    } else {
      info.push(`"${clinicName}" ${clinicCount}회`)
    }
  }

  const passed = issues.length === 0
  return {
    name: '키워드 빈도',
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed ? `키워드 빈도 적정` : `키워드 과다 ${issues.length}건`,
    details: [...issues, ...info],
  }
}

// ── 5. 의료법 준수 검사 ──
function checkMedicalLaw(content: string): ValidationCheck {
  const violations: string[] = []

  // 효과 보장 표현
  const guaranteePatterns: [RegExp, string][] = [
    [/해결해\s*드리/, '효과 보장'],
    [/해결됩니다/, '효과 보장'],
    [/해결할\s*수\s*있습니다/, '효과 보장'],
    [/완벽하게\s*치료/, '효과 보장'],
    [/확실하게\s*개선/, '효과 보장'],
    [/보장합니다/, '효과 보장'],
    [/완치/, '금지어'],
    [/100%/, '과장 표현'],
    [/최첨단/, '과장 표현'],
    [/명의/, '과장 표현'],
    [/가장\s*(유사|효과적|좋은|우수|중요|안전)/, '최상급 표현'],
    [/내구성을\s*제공/, '효과 보장'],
    [/심미성을\s*제공/, '효과 보장'],
    [/기능을\s*제공/, '효과 보장'],
  ]

  for (const [pattern, category] of guaranteePatterns) {
    const match = content.match(pattern)
    if (match) {
      violations.push(`[${category}] "${match[0]}"`)
    }
  }

  // 환자 정보 직접 언급
  const patientPatterns: [RegExp, string][] = [
    [/이번\s*환자/, '환자 직접 언급'],
    [/이\s*환자분/, '환자 직접 언급'],
    [/해당\s*환자/, '환자 직접 언급'],
    [/환자분께서/, '환자 직접 언급'],
    [/치료받으신\s*분/, '환자 직접 언급'],
    [/내원하신\s*분/, '환자 직접 언급'],
    [/\d{2,3}대\s*(여성|남성|남자|여자)/, '연령/성별 언급'],
    [/\d{2,3}세\s*(여성|남성|남자|여자)/, '연령/성별 언급'],
    [/실제\s*사례/, '사례 언급'],
    [/실제\s*치료\s*사례/, '사례 언급'],
    [/환자\s*후기/, '후기 언급'],
    [/치료\s*후기/, '후기 언급'],
    [/치료\s*전후\s*사진/, '전후 사진 언급'],
  ]

  for (const [pattern, category] of patientPatterns) {
    const match = content.match(pattern)
    if (match) {
      violations.push(`[${category}] "${match[0]}"`)
    }
  }

  // 치과 + 효과 연결 패턴
  const clinicEffect = content.match(/저희\s*치과에서[는]?\s*.{0,20}(?:해결|치료해|개선|드리고)/)
  if (clinicEffect) {
    violations.push(`[치과+효과 연결] "${clinicEffect[0].substring(0, 40)}"`)
  }

  // "환자" 단어 본문 사용 검사 (서론 인사/결론 인사 제외한 본문)
  const lines = content.split('\n')
  const totalLines = lines.length
  const bodyStart = Math.max(3, Math.floor(totalLines * 0.1))
  const bodyEnd = Math.floor(totalLines * 0.9)
  for (let i = bodyStart; i < bodyEnd; i++) {
    if (lines[i] && /환자/.test(lines[i]) && !/이미지/.test(lines[i]) && !/alt:/.test(lines[i])) {
      violations.push(`[환자 단어 사용] ${i + 1}번째 줄: "${lines[i].substring(0, 40)}..."`)
      break // 첫 번째만 보고
    }
  }

  const passed = violations.length === 0
  return {
    name: '의료법 준수',
    passed,
    severity: passed ? 'info' : 'error',
    message: passed ? '의료법 위반 표현 없음' : `의료법 위반 ${violations.length}건`,
    details: violations.length > 0 ? violations : undefined,
  }
}

// ── 6. 금칙어 검사 ──
function checkForbiddenWords(content: string): ValidationCheck {
  // CLAUDE.md 금칙어 중 의미 있는 2글자 이상 단어만 선별
  const forbiddenWords = [
    '걱정', '경험', '고민', '고통', '고생', '공유',
    '너무', '만족', '무척', '불안', '불편',
    '힘들', '해결', '해소', '해주', '해보', '해본',
    '과도', '과다', '과함',
  ]

  const found: string[] = []

  for (const word of forbiddenWords) {
    // 독립 단어 매칭 (앞뒤가 공백/줄바꿈/문장부호/시작/끝)
    const regex = new RegExp(`(?:^|[\\s,.'"\u201C\u201D\u00B7(])${word}(?=[\\s,.'"\u201C\u201D\u00B7)!?]|$)`, 'gm')
    const matches = content.match(regex)
    if (matches && matches.length > 0) {
      found.push(`"${word}" ${matches.length}회`)
    }
  }

  const passed = found.length === 0
  return {
    name: '금칙어',
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed ? '주요 금칙어 없음' : `금칙어 ${found.length}종 발견`,
    details: found.length > 0 ? found : undefined,
  }
}

// ── 7. 부작용 고지 검사 ──
function checkSideEffectNotice(content: string): ValidationCheck {
  const hasSideEffect = /※.*부작용/.test(content) || /부작용이?\s*발생/.test(content)
  return {
    name: '부작용 고지',
    passed: hasSideEffect,
    severity: hasSideEffect ? 'info' : 'warning',
    message: hasSideEffect ? '부작용 고지 포함' : '부작용 고지 누락 (시술 글 필수)',
  }
}

// ── 8. 동의어 회전 검사 (같은 단어 과다 반복) ──
function checkSynonymRotation(content: string): ValidationCheck {
  // 피드백: 치아/어금니 등 특정 단어 반복 심함 → 강화된 검사
  const watchWordsStrict: { word: string; maxTotal: number; maxSection: number }[] = [
    { word: '치아', maxTotal: 6, maxSection: 3 },
    { word: '어금니', maxTotal: 5, maxSection: 3 },
    { word: '치료', maxTotal: 8, maxSection: 4 },
    { word: '잇몸', maxTotal: 5, maxSection: 3 },
    { word: '수술', maxTotal: 6, maxSection: 3 },
    { word: '시술', maxTotal: 6, maxSection: 3 },
    { word: '진행', maxTotal: 7, maxSection: 3 },
    { word: '확인', maxTotal: 7, maxSection: 3 },
    { word: '상태', maxTotal: 6, maxSection: 3 },
    { word: '경우', maxTotal: 6, maxSection: 3 },
    { word: '필요', maxTotal: 6, maxSection: 3 },
    { word: '관찰', maxTotal: 5, maxSection: 3 },
  ]
  const issues: string[] = []

  // 섹션 단위 분리 (##로 나뉘는 블록)
  const sections = content.split(/^##\s/m)

  for (const { word, maxTotal, maxSection } of watchWordsStrict) {
    const totalCount = (content.match(new RegExp(word, 'g')) || []).length

    // 섹션 내 집중 반복 체크
    for (let i = 0; i < sections.length; i++) {
      const sectionCount = (sections[i].match(new RegExp(word, 'g')) || []).length
      if (sectionCount > maxSection) {
        issues.push(`"${word}" 섹션${i + 1}에서 ${sectionCount}회 집중 (최대 ${maxSection})`)
      }
    }

    // 전체 글 반복 체크
    if (totalCount > maxTotal) {
      issues.push(`"${word}" 전체 ${totalCount}회 → 동의어 교체 필요 (최대 ${maxTotal})`)
    }
  }

  const passed = issues.length === 0
  return {
    name: '동의어 회전',
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed ? '단어 반복 적정' : `단어 반복 ${issues.length}건 (동의어 교체 필요)`,
    details: issues.length > 0 ? issues.slice(0, 10) : undefined,
  }
}

// ── 9. 제목 길이 검사 ──
function checkTitleLength(content: string, clinicName: string): ValidationCheck {
  // 첫 번째 # 헤딩에서 제목 추출
  const titleMatch = content.match(/^#\s+(.+)$/m)
  if (!titleMatch) {
    return { name: '제목 길이', passed: true, severity: 'info', message: '제목 미발견 (검사 생략)' }
  }

  const title = titleMatch[1].trim()
  const titleLen = title.length
  const issues: string[] = []

  if (titleLen > 40) {
    issues.push(`제목 ${titleLen}자 (최대 35자 권장, 40자 초과!)`)
  } else if (titleLen > 35) {
    issues.push(`제목 ${titleLen}자 (35자 이내 권장)`)
  }

  if (clinicName && title.includes(clinicName)) {
    issues.push(`제목에 치과명 "${clinicName}" 포함 (의료광고법 리스크)`)
  }

  const passed = issues.length === 0
  return {
    name: '제목 길이',
    passed,
    severity: !passed && titleLen > 40 ? 'error' : (!passed ? 'warning' : 'info'),
    message: passed ? `제목 ${titleLen}자 (적정)` : issues.join(', '),
  }
}

// ── 전체 검증 실행 ──
export function validatePost(
  content: string,
  options: {
    clinicName?: string
    topic?: string
    writingMode?: string
  } = {}
): ValidationResult {
  const checks: ValidationCheck[] = [
    checkCharCount(content),
    checkTitleLength(content, options.clinicName || ''),
    checkClinicNamePosition(content, options.clinicName || ''),
    checkForbiddenEndings(content, options.writingMode || 'expert'),
    checkKeywordFrequency(content, options.clinicName || '', options.topic || ''),
    checkMedicalLaw(content),
    checkForbiddenWords(content),
    checkSideEffectNotice(content),
    checkSynonymRotation(content),
  ]

  const errorCount = checks.filter(c => !c.passed && c.severity === 'error').length
  const warningCount = checks.filter(c => !c.passed && c.severity === 'warning').length
  const totalChecks = checks.length
  const passedChecks = checks.filter(c => c.passed).length

  // 점수: error -15, warning -8
  const score = Math.max(0, Math.min(100, 100 - (errorCount * 15) - (warningCount * 8)))
  const passed = errorCount === 0

  return { passed, checks, score }
}
