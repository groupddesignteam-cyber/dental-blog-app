// 의료광고법 규칙 (medical_law.md 기반)

// 시술별 필수 고지 문구
export const REQUIRED_DISCLAIMERS: Record<string, string> = {
  임플란트: `※ 임플란트 시술 후 출혈, 부종, 감염 등의 부작용이 발생할 수 있으며,
개인에 따라 결과가 다를 수 있습니다.
정기적인 검진과 관리가 필요합니다.`,

  보톡스: `※ 시술 후 멍, 부종, 감염 등의 부작용이 발생할 수 있습니다.
개인에 따라 효과와 유지 기간이 다를 수 있습니다.`,

  미백: `※ 미백 시술 후 일시적인 시린 증상이 나타날 수 있으며,
개인에 따라 미백 효과가 다를 수 있습니다.`,

  라미네이트: `※ 치아 삭제가 필요할 수 있으며, 시술 후 시린 증상이
일시적으로 나타날 수 있습니다.`,

  올세라믹: `※ 치아 삭제가 필요할 수 있으며, 시술 후 시린 증상이
일시적으로 나타날 수 있습니다.`,

  발치: `※ 발치 후 출혈, 부종, 감염, 일시적 감각 이상 등이
발생할 수 있습니다.`,

  사랑니: `※ 발치 후 출혈, 부종, 감염, 일시적 감각 이상 등이
발생할 수 있습니다.`,

  교정: `※ 교정치료 중 치아 우식, 잇몸 질환, 치근 흡수 등이
발생할 수 있으며, 유지장치 미착용 시 재발 가능성이 있습니다.`,

  신경치료: `※ 신경치료 후 일시적인 불편감이 있을 수 있으며,
개인에 따라 치료 결과가 다를 수 있습니다.`,

  충치: `※ 치료 후 일시적인 시린 증상이 나타날 수 있으며,
개인에 따라 결과가 다를 수 있습니다.`,

  스케일링: `※ 스케일링 후 일시적인 시린 증상이 나타날 수 있습니다.`,

  보철: `※ 보철 치료 후 적응 기간이 필요할 수 있으며,
개인에 따라 결과가 다를 수 있습니다.`,
}

// 금지되는 표현 패턴
export const FORBIDDEN_PATTERNS = [
  // 과장 광고 — 최상급 표현
  { pattern: /최고|최첨단|최신|유일|독보적/g, reason: '과장 광고' },
  { pattern: /제일|No\.?\s*1|특화|기적의|획기적|최상/g, reason: '과장 광고' },
  { pattern: /완치|100%\s*성공|무통증/g, reason: '과장 광고' },
  { pattern: /\d+위|국내\s*최초/g, reason: '비교 광고' },
  // 통증/부작용 단정 금지
  { pattern: /무통(?!증)|부작용\s*(?:0%|없|zero)|완벽한\s*(?:치료|시술|결과)/g, reason: '부작용 단정 금지' },
  { pattern: /아프지\s*않|통증\s*없는|부작용이?\s*없/g, reason: '부작용 단정 금지' },
  // 환자 유인/알선 금지
  { pattern: /할인|이벤트|무료|저렴|싼|가성비/g, reason: '환자 유인' },
  { pattern: /사은품|경품|상품권|기프티콘/g, reason: '환자 유인' },
  { pattern: /소개\s*시.*할인|지인\s*소개/g, reason: '환자 유인' },
  // 후기 형식 금지
  { pattern: /저는.*치과에서|치료\s*후기|체험담/g, reason: '후기 형식 금지' },
  { pattern: /환자\s*후기|수술\s*후기|리뷰|솔직\s*후기|치료\s*경험담/g, reason: '후기 형식 금지' },
  // 내원 유도 (치과명 + 내원 권유)
  { pattern: /[가-힣]+치과(에서|로|에)\s*(상담|내원|방문).*(오세요|와주세요|찾아주세요|받아보세요)/g, reason: '내원 유도 광고' },
  { pattern: /(저희|우리)\s*(치과|병원)(에서|로|에)\s*(상담|내원|방문)/g, reason: '내원 유도 광고' },
  { pattern: /(내원해\s*주세요|방문해\s*주세요|찾아와\s*주세요|찾아오세요)/g, reason: '직접 내원 유도' },
  // 치과명 + 치료 효과 보장
  { pattern: /(저희|우리)\s*(치과|병원).{0,10}(해결|치료해|개선해)/g, reason: '치료 효과 보장' },
  { pattern: /(해결해\s*드|완벽하게\s*치료|확실하게\s*개선)/g, reason: '치료 효과 보장' },
]

// 허용되는 표현
export const ALLOWED_EXPRESSIONS = [
  '○○ 치료를 진행했습니다',
  '이런 경우 ○○ 방법을 고려할 수 있습니다',
  '개인에 따라 결과가 다를 수 있습니다',
  '정기적인 관리가 필요합니다',
  '자세한 내용은 상담을 통해 안내드립니다',
]

// 고지문 가져오기 함수
export function getDisclaimer(topic: string): string {
  // 주제에서 키워드 매칭
  const topicLower = topic.toLowerCase()

  for (const [key, disclaimer] of Object.entries(REQUIRED_DISCLAIMERS)) {
    if (topicLower.includes(key.toLowerCase()) ||
        topicLower.includes(key)) {
      return disclaimer
    }
  }

  // 기본 고지문
  return `※ 시술 후 부작용이 발생할 수 있으며,
개인에 따라 결과가 다를 수 있습니다.`
}

// 금지 표현 검사 함수
export function checkForbiddenPatterns(text: string): Array<{ match: string; reason: string }> {
  const violations: Array<{ match: string; reason: string }> = []

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      matches.forEach(match => {
        violations.push({ match, reason })
      })
    }
  }

  return violations
}
