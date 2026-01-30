// 검증된 글쓰기 패턴 (verified_patterns.md 기반)

// 서문 패턴
export const INTRO_PATTERNS = {
  greeting: [
    '안녕하세요, [지역] 치과 의사 [이름]입니다.',
    '안녕하세요, [지역] 치과 [이름] 원장입니다.',
    '안녕하십니까, [지역] 에서 진료 중인 치과 의사 [이름] 입니다.',
  ],
  empathyHooks: [
    '[증상], 괜찮을까요?',
    "많은 분들이 '[질문]' 하고 걱정하시는 경우가 많습니다.",
    "'정말 [치료]를 해야 될까?' 라는 의문이 제일 먼저 떠오르기 마련이죠.",
    '[상황]이라면 걱정이 앞서게 되죠.',
  ],
  transition: [
    '오늘은 [주제]에 대해 자세히 알아보겠습니다.',
    '그렇다면 [질문]? 지금부터 자세히 알아보겠습니다.',
    '오늘은 이와 관련하여 준비한 내용을 자세히 소개해 드리겠습니다.',
  ],
}

// 소제목 패턴
export const SUBHEADING_PATTERNS = {
  emoji: ['✅', '🔹', '💚', '🔵', '❌'],
  questionStyle: [
    '[주제], 왜 생길까?',
    '언제 치과에 가야 될까?',
    '[치료] 방법은?',
    '[주제] 예방하는 방법',
  ],
  emphasisStyle: [
    '[주제], 정말 필요할까?',
    '[주제]가 중요한 이유는 무엇일까?',
    '[상황]하면 어떻게 될까?',
    '꼭 알아야 될 주의 사항',
    '글을 마치면서',
  ],
}

// 본문 표현 패턴
export const BODY_PATTERNS = {
  explanation: [
    '이는 [정의]입니다.',
    '[용어]란 [설명]을 말합니다.',
    '결론부터 말씀드리자면, [핵심]입니다.',
  ],
  listing: [
    '특히 다음과 같은 분들에게 권장됩니다.',
    '다음과 같은 경우에는 [행동]이 필요합니다.',
    '주요 방법으로는 다음과 같습니다.',
  ],
  transition: [
    '하지만 [반전 내용]입니다.',
    '따라서 [결론]이 중요합니다.',
    '즉, [요약]이라는 점이 중요합니다.',
    '또한, [추가 정보]입니다.',
  ],
  empathy: [
    '많은 사람들이 이렇게 생각합니다.',
    '아마 [상황]하고 계신 분들도 있을 텐데요.',
    '걱정이 앞서게 되죠.',
    '당황스러울 수 있습니다.',
  ],
  recommendation: [
    '[행동]하는 것이 좋습니다.',
    '[행동]을 권장 드립니다.',
    '[행동]하는 것을 권장 드려요!',
    '[행동]해 보시는 것이 좋습니다.',
  ],
}

// 마무리 패턴
export const CLOSING_PATTERNS = {
  summary: [
    '[핵심 메시지]를 기억하시길 바랍니다.',
    '가까운 구강의료기관에 가셔서 정확한 평가와 진단을 받아보시길 권해드립니다.',
    '정기검진과 올바른 관리를 꾸준히 실천한다면, [긍정적 결과]할 수 있습니다.',
  ],
  farewell: [
    '[지역] 치과 의사 [이름]였습니다. 감사합니다.',
    '[지역] 치과 [이름]였습니다. 감사합니다.',
    '[지역] 치과 가 응원하겠습니다. 감사합니다 :)',
  ],
}

// 구어체 어미 패턴
export const COLLOQUIAL_ENDINGS = [
  '~인데요', // 설명 후 전환
  '~거든요', // 이유 설명
  '~하죠', // 공감 유도
  '~해요', // 부드러운 설명
  '~드립니다', // 정중한 권유
  '~드려요', // 친근한 권유
  '~할게요', // 약속/예고
  '~볼게요', // 함께하는 느낌
]

// 지역+치과 키워드 배치 패턴
export const REGION_KEYWORD_PLACEMENT = {
  intro: 1, // 서문 1회
  body: 4, // 본문 3~4회
  closing: 1, // 마무리 1회
  total: { min: 5, max: 8 },
  variations: [
    '[지역] 치과',
    '[지역] 에서 치과',
    '[지역] 인근 치과',
    '[지역] 주변 치과',
    '[지역] 지역 내 치과',
    '[지역]역 치과',
  ],
}

// 주제별 특화 패턴
export const TOPIC_PATTERNS: Record<string, string[]> = {
  임플란트: [
    '치조골/뼈 상태 강조',
    '전신 건강 체크 언급',
    '골이식 가능성 설명',
    '정기검진 중요성',
  ],
  신경치료: [
    '치수 설명 (신경+혈관 조직)',
    '온도 민감성 증상',
    '자연치 보존 강조',
    '크라운 후속 치료',
  ],
  사랑니: [
    '매복/수평 사랑니 설명',
    '드라이소켓 주의',
    '발치 후 관리법',
    '인접치 영향',
  ],
  충치: [
    '초기 발견 중요성',
    '단계별 진행 설명',
    '예방법 강조',
    '정기검진 권유',
  ],
  교정: [
    '교정 기간 안내',
    '유지장치 중요성',
    '구강 위생 관리',
    '정기 내원 필요성',
  ],
}

// 랜덤 패턴 선택 함수
export function getRandomPattern<T>(patterns: T[]): T {
  return patterns[Math.floor(Math.random() * patterns.length)]
}

// 인사말 생성 함수
export function generateGreeting(region: string, doctorName: string): string {
  const template = getRandomPattern(INTRO_PATTERNS.greeting)
  return template
    .replace('[지역]', region)
    .replace('[이름]', doctorName)
}

// 마무리 인사 생성 함수
export function generateFarewell(region: string, doctorName: string): string {
  const template = getRandomPattern(CLOSING_PATTERNS.farewell)
  return template
    .replace('[지역]', region)
    .replace('[이름]', doctorName)
}
