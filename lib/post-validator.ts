// 생성된 블로그 글 검증 모듈 (형태소 기반 키워드 시스템 v3.0)

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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 해시태그·이미지·논문·부작용 고지 제외한 본문 텍스트 */
function getCleanContent(content: string): string {
  let text = content
  // 해시태그 제거
  text = text.replace(/#[^\s#]+/g, '')
  // 이미지 플레이스홀더 제거
  text = text.replace(/📷\s*\[이미지[^\]]*\]/g, '')
  text = text.replace(/\[IMAGE_\d+\]/g, '')
  // 논문 인용 블록 제거
  text = text.replace(/📎\s*References[\s\S]*$/m, '')
  text = text.replace(/\[References\][\s\S]*$/m, '')
  // 부작용 고지문 제거
  text = text.replace(/※[\s\S]*?부작용[\s\S]*?$/m, '')
  // 출처 제거
  text = text.replace(/\(출처:.*?\)/g, '')
  return text
}

// ── 글자수 계산 (이미지/논문/부작용 고지 제외) ──
function countContentChars(content: string): number {
  let text = getCleanContent(content)
  // 마크다운 문법 제거
  text = text.replace(/^#{1,3}\s*/gm, '')
  text = text.replace(/\*\*(.*?)\*\*/g, '$1')
  text = text.replace(/\*(.*?)\*/g, '$1')
  text = text.replace(/---+/g, '')
  return text.trim().length
}

// ── 1. 글자수 검사 ──
function checkCharCount(content: string): ValidationCheck {
  const count = countContentChars(content)
  const passed = count >= 2500 && count <= 3000
  let message: string
  let severity: 'error' | 'warning' | 'info'

  if (count < 2000) {
    message = `글자수 심각 부족: ${count.toLocaleString()}자 (최소 2,500자)`
    severity = 'error'
  } else if (count < 2500) {
    message = `글자수 부족: ${count.toLocaleString()}자 (최소 2,500자)`
    severity = 'warning'
  } else if (count > 3500) {
    message = `글자수 심각 초과: ${count.toLocaleString()}자 (최대 3,000자)`
    severity = 'error'
  } else if (count > 3000) {
    message = `글자수 초과: ${count.toLocaleString()}자 (최대 3,000자)`
    severity = 'warning'
  } else {
    message = `글자수 적정: ${count.toLocaleString()}자`
    severity = 'info'
  }

  return { name: '글자수 (2,500~3,000)', passed, severity, message }
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

// ── 4. 형태소 기반 키워드 빈도 검사 ──
function checkKeywordFrequency(
  content: string,
  clinicName: string,
  topic: string,
  mainKeyword?: string,
  region?: string
): ValidationCheck {
  const issues: string[] = []
  const info: string[] = []
  const cleanContent = getCleanContent(content)

  // morphemeB 추출
  const morphemeB = (mainKeyword && region)
    ? mainKeyword.replace(region, '').trim() || ''
    : ''

  // 형태소A (region) 카운트: 목표 7, 허용 6~8
  if (region) {
    const regionCount = (cleanContent.match(new RegExp(escapeRegex(region), 'g')) || []).length
    if (regionCount > 8) {
      issues.push(`"${region}" ${regionCount}회 (형태소A 목표 7, 최대 8 초과)`)
    } else if (regionCount < 6) {
      issues.push(`"${region}" ${regionCount}회 (형태소A 목표 7, 최소 6 미달)`)
    } else {
      info.push(`"${region}" ${regionCount}회 (형태소A)`)
    }
  }

  // 형태소B 카운트: 목표 7, 허용 5~8
  if (morphemeB) {
    const morphBTotal = (cleanContent.match(new RegExp(escapeRegex(morphemeB), 'g')) || []).length
    // 치과명 내부에 포함된 morphemeB 횟수 차감 (예: "부평치과" 안의 "치과")
    let clinicOverlap = 0
    if (clinicName && clinicName.includes(morphemeB) && clinicName !== morphemeB) {
      clinicOverlap = (cleanContent.match(new RegExp(escapeRegex(clinicName), 'g')) || []).length
    }
    const morphBCount = morphBTotal - clinicOverlap

    if (morphBCount > 8) {
      issues.push(`"${morphemeB}" ${morphBCount}회 (형태소B 목표 7, 최대 8 초과)${clinicOverlap ? ` [치과명 내 ${clinicOverlap}회 제외]` : ''}`)
    } else if (morphBCount < 5) {
      issues.push(`"${morphemeB}" ${morphBCount}회 (형태소B 목표 7, 최소 5 미달)${clinicOverlap ? ` [치과명 내 ${clinicOverlap}회 제외]` : ''}`)
    } else {
      info.push(`"${morphemeB}" ${morphBCount}회 (형태소B)${clinicOverlap ? ` [치과명 내 ${clinicOverlap}회 제외]` : ''}`)
    }
  }

  // topic이 morphemeB와 다른 경우 = 서브키워드 (max 5)
  if (topic && topic !== morphemeB) {
    const escaped = escapeRegex(topic)
    const topicCount = (cleanContent.match(new RegExp(escaped, 'g')) || []).length
    if (topicCount > 5) {
      issues.push(`"${topic}" ${topicCount}회 (서브키워드 최대 5 초과)`)
    } else {
      info.push(`"${topic}" ${topicCount}회 (서브키워드)`)
    }
  }

  // 치과명 빈도 체크 (최대 3회: 서론1 + 결론1~2)
  if (clinicName) {
    const escaped = escapeRegex(clinicName)
    const clinicCount = (cleanContent.match(new RegExp(escaped, 'g')) || []).length
    if (clinicCount > 3) {
      issues.push(`"${clinicName}" ${clinicCount}회 (최대 3회 초과)`)
    } else {
      info.push(`"${clinicName}" ${clinicCount}회`)
    }
  }

  const passed = issues.length === 0
  return {
    name: '키워드 빈도 (형태소)',
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed ? `키워드 빈도 적정` : `키워드 빈도 이슈 ${issues.length}건`,
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
    [/제일|No\.?\s*1|기적의|획기적/, '과장 표현'],
    [/무통(?!증)/, '부작용 단정'],
    [/부작용\s*(?:0%|없|zero)/, '부작용 단정'],
    [/아프지\s*않/, '부작용 단정'],
    [/통증\s*없는/, '부작용 단정'],
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
    [/환자분의/, '환자 직접 언급'],
    [/환자\s*입장/, '환자 직접 언급'],
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

  // 지역 + 치료효과 연결 패턴
  const regionEffect = content.match(/[가-힣]+구에서는?\s*.{0,20}(?:가능합니다|해결|개선|치료)/)
  if (regionEffect) {
    violations.push(`[지역+효과 연결] "${regionEffect[0].substring(0, 40)}"`)
  }

  // 효과 보장/추천 표현
  const recommendPatterns: [RegExp, string][] = [
    [/현명한\s*선택/, '효과 보장/추천'],
  ]
  for (const [pattern, category] of recommendPatterns) {
    const match = content.match(pattern)
    if (match) {
      violations.push(`[${category}] "${match[0]}"`)
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
    const regex = new RegExp(`(?:^|[\\s,.'"\u201C\u201D\u00B7(])${escapeRegex(word)}(?=[\\s,.'"\u201C\u201D\u00B7)!?]|$)`, 'gm')
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
  const hasSideEffect =
    /※.*부작용/.test(content) ||
    /부작용이?\s*발생/.test(content) ||
    /부작용이?\s*나타날/.test(content) ||
    /개인에\s*따라\s*결과가?\s*다를/.test(content) ||
    /출혈.*부종.*감염/.test(content) ||
    /시린\s*증상이?\s*나타날/.test(content)
  return {
    name: '부작용 고지',
    passed: hasSideEffect,
    severity: hasSideEffect ? 'info' : 'warning',
    message: hasSideEffect ? '부작용 고지 포함' : '부작용 고지 누락 (시술 글 필수)',
  }
}

// ── 8. 동의어 회전 검사 (같은 단어 과다 반복) ──
function checkSynonymRotation(content: string, mainKeyword?: string, region?: string): ValidationCheck {
  const cleanContent = getCleanContent(content)

  // morphemeB 추출 (복합어이면 내부 단어를 보호)
  const morphemeB = (mainKeyword && region)
    ? mainKeyword.replace(region, '').trim() || ''
    : ''

  // 주요 단어 반복 체크 (한 섹션 내 4회 이상이면 경고)
  const watchWords = ['치료', '수술', '시술', '진행', '확인', '상태', '경우', '필요']
  const issues: string[] = []

  // 복합어 보호 목록
  const protectedCompounds = [
    '근관치료', '신경치료', '교정치료', '치주치료', '보존치료',
    '보철치료', '레이저치료', '불소치료', '잇몸치료', '예방치료',
  ]

  // 섹션 단위 분리 (##로 나뉘는 블록)
  const sections = cleanContent.split(/^##\s/m)

  for (const word of watchWords) {
    // 복합어 내부의 카운트를 제외한 독립 카운트
    let totalCount = 0
    const wordRegex = new RegExp(escapeRegex(word), 'g')
    let wm: RegExpExecArray | null
    while ((wm = wordRegex.exec(cleanContent)) !== null) {
      const idx = wm.index
      const isInCompound = protectedCompounds.some(compound => {
        if (!compound.includes(word) || compound === word) return false
        const posInCompound = compound.indexOf(word)
        const compoundStart = idx - posInCompound
        if (compoundStart < 0 || compoundStart + compound.length > cleanContent.length) return false
        return cleanContent.substring(compoundStart, compoundStart + compound.length) === compound
      })
      if (!isInCompound) totalCount++
    }

    // 섹션 내 집중 반복 체크 (복합어 제외 카운트)
    for (let i = 0; i < sections.length; i++) {
      let sectionCount = 0
      const sectionRegex = new RegExp(escapeRegex(word), 'g')
      let sm: RegExpExecArray | null
      while ((sm = sectionRegex.exec(sections[i])) !== null) {
        const idx = sm.index
        const isInCompound = protectedCompounds.some(compound => {
          if (!compound.includes(word) || compound === word) return false
          const posInCompound = compound.indexOf(word)
          const compoundStart = idx - posInCompound
          if (compoundStart < 0 || compoundStart + compound.length > sections[i].length) return false
          return sections[i].substring(compoundStart, compoundStart + compound.length) === compound
        })
        if (!isInCompound) sectionCount++
      }

      if (sectionCount >= 4) {
        issues.push(`"${word}" 섹션${i + 1}에서 ${sectionCount}회 집중 사용`)
      }
    }

    // 전체 글에서 7회 이상이면 경고
    if (totalCount >= 6) {
      issues.push(`"${word}" 전체 ${totalCount}회 (동의어 교체 필수! 최대 5회 이하 권장)`)
    }
  }

  const passed = issues.length === 0
  return {
    name: '동의어 회전',
    passed,
    severity: passed ? 'info' : 'warning',
    message: passed ? '단어 반복 적정' : `단어 집중 반복 ${issues.length}건`,
    details: issues.length > 0 ? issues.slice(0, 8) : undefined,
  }
}

// ── 전체 검증 실행 ──
export function validatePost(
  content: string,
  options: {
    clinicName?: string
    topic?: string
    writingMode?: string
    mainKeyword?: string
    region?: string
  } = {}
): ValidationResult {
  const checks: ValidationCheck[] = [
    checkCharCount(content),
    checkClinicNamePosition(content, options.clinicName || ''),
    checkForbiddenEndings(content, options.writingMode || 'expert'),
    checkKeywordFrequency(content, options.clinicName || '', options.topic || '', options.mainKeyword, options.region),
    checkMedicalLaw(content),
    checkForbiddenWords(content),
    checkSideEffectNotice(content),
    checkSynonymRotation(content, options.mainKeyword, options.region),
  ]

  // 항목별 가중치 차등 적용
  const weights: Record<string, { error: number; warning: number }> = {
    '의료법 준수': { error: 25, warning: 12 },
    '치과명 위치': { error: 20, warning: 10 },
    '금지 어미': { error: 15, warning: 8 },
    '키워드 빈도 (형태소)': { error: 10, warning: 6 },
    '동의어 회전': { error: 8, warning: 5 },
    '글자수 (2,500~3,000)': { error: 10, warning: 5 },
    '금칙어': { error: 8, warning: 5 },
    '부작용 고지': { error: 5, warning: 4 },
  }

  let deduction = 0
  for (const check of checks) {
    if (check.passed) continue
    const w = weights[check.name] || { error: 15, warning: 8 }
    deduction += check.severity === 'error' ? w.error : w.warning
  }

  const score = Math.max(0, Math.min(100, 100 - deduction))
  const passed = checks.filter(c => !c.passed && c.severity === 'error').length === 0

  return { passed, checks, score }
}
