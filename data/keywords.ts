// 키워드 선정 전략 (keyword_strategy.md 기반)

// 치료 키워드 분류
export const TREATMENT_KEYWORDS = {
  임플란트: {
    main: ['임플란트', '임플란트 가격', '임플란트 비용'],
    longTail: [
      '앞니 임플란트', '어금니 임플란트', '임플란트 수명',
      '임플란트 관리', '임플란트 시술 기간', '임플란트 통증',
      '뼈이식 임플란트', '골이식 임플란트',
    ],
  },
  교정: {
    main: ['치아교정', '투명교정', '인비절라인'],
    longTail: [
      '성인 치아교정', '부분교정', '앞니 교정',
      '교정 기간', '교정 비용', '교정 전후',
    ],
  },
  보철: {
    main: ['크라운', '치아 보철', '지르코니아'],
    longTail: [
      '앞니 크라운', '지르코니아 크라운 비용',
      '크라운 수명', '올세라믹', '라미네이트',
    ],
  },
  충치: {
    main: ['충치 치료', '신경치료'],
    longTail: [
      '충치 치료 비용', '신경치료 후 크라운',
      '신경치료 통증', '충치 초기 증상', '이가 시려요',
    ],
  },
  사랑니: {
    main: ['사랑니', '사랑니 발치'],
    longTail: [
      '매복 사랑니', '수평 사랑니', '사랑니 통증',
      '사랑니 발치 비용', '사랑니 발치 후',
    ],
  },
}

// 증상 키워드
export const SYMPTOM_KEYWORDS = {
  pain: ['이가 아파요', '치통 원인', '잇몸이 부었어요', '이가 시려요', '치아가 흔들려요'],
  aesthetic: ['치아 변색', '누런 이빨', '앞니가 깨졌어요', '치아 벌어짐'],
  function: ['씹을 때 아파요', '이가 빠졌어요', '사랑니 통증'],
}

// 지역 키워드 조합 패턴
export const REGION_KEYWORD_PATTERNS = [
  '{지역명} + {치료명}',
  '{지역명} + 치과 추천',
  '{지역명} + 치과 잘하는곳',
]

// 계절별 키워드 트렌드
export const SEASONAL_KEYWORDS: Record<string, { keywords: string[]; reason: string }> = {
  '1~2월': { keywords: ['치아교정', '라미네이트'], reason: '새해 다짐, 졸업/입학 시즌' },
  '5월': { keywords: ['임플란트', '틀니'], reason: '어버이날 효도' },
  '7~8월': { keywords: ['사랑니 발치', '교정'], reason: '방학 시즌' },
  '11월': { keywords: ['치아교정', '임플란트'], reason: '수능 후 수요 급증' },
  '12월': { keywords: ['치아미백', '스케일링'], reason: '연말 관리, 연말정산' },
}

// 키워드 조합 패턴
export const KEYWORD_COMBINATION_PATTERNS = {
  symptomLocation: '[증상] + [부위]', // 예: 앞니 깨졌을때, 어금니 통증
  treatmentQuestion: '[치료] + [궁금증]', // 예: 임플란트 수명, 교정 기간
  treatmentCompare: '[치료] + [비교]', // 예: 임플란트 vs 브릿지
  treatmentAfter: '[치료] + [후기성]', // 예: 신경치료 후 (주의: 직접적인 "후기" 금지)
  regionTreatment: '[지역] + [치료]', // 예: 강남 임플란트
}

// 키워드 밀도 가이드
export const KEYWORD_DENSITY_GUIDE = {
  recommended: '2~3%', // 1,800자 기준 메인 키워드 5~7회
  mainKeyword: { min: 5, max: 7 },
  subKeyword: { min: 2, max: 3 },
  warning: {
    tooMany: '과다 사용 시 네이버 스팸 필터 작동, 가독성 저하, 노출 순위 하락',
    tips: ['동의어/유의어 혼용', '대명사로 대체', '문맥에 맞게 변형'],
  },
}

// 메인 키워드 생성 함수
export function generateMainKeyword(region: string, topic: string): string {
  return `${region} ${topic}`
}

// 서브 키워드 추천 함수
export function suggestSubKeywords(topic: string): string[] {
  const topicLower = topic.toLowerCase()

  for (const [key, data] of Object.entries(TREATMENT_KEYWORDS)) {
    if (topicLower.includes(key.toLowerCase())) {
      return data.longTail.slice(0, 5)
    }
  }

  return []
}

// 관련 증상 키워드 찾기
export function findSymptomKeywords(topic: string): string[] {
  const results: string[] = []
  const topicLower = topic.toLowerCase()

  if (topicLower.includes('통증') || topicLower.includes('아프')) {
    results.push(...SYMPTOM_KEYWORDS.pain)
  }
  if (topicLower.includes('심미') || topicLower.includes('미백') || topicLower.includes('라미네이트')) {
    results.push(...SYMPTOM_KEYWORDS.aesthetic)
  }

  return results.slice(0, 5)
}
