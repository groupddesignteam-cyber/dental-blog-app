// 네이버 SEO 가이드 (naver_seo.md 기반)

// 제목 작성 규칙
export const TITLE_RULES = {
  length: { min: 25, max: 35 },
  tips: [
    '메인 키워드는 앞쪽 배치',
    '물음표(?) 사용 시 클릭률 상승',
    '숫자 사용 효과적 ("3가지", "5단계")',
  ],
  badExamples: [
    '임플란트 후기', // 너무 짧음 + 후기 금지
    '치과에서 있었던 일', // 키워드 없음
    '최고의 임플란트 전문 치과', // 광고성 + 금지어
  ],
  goodExamples: [
    '앞니가 깨졌을 때, 발치 없이 살리는 방법',
    '50대 임플란트, 뼈가 약해도 가능할까요?',
    '신경치료 후 씌우는 이유, 꼭 해야 할까요?',
  ],
}

// 본문 작성 규칙 (해시태그 제외 기준)
export const CONTENT_RULES = {
  totalLength: { min: 2300, max: 3000 }, // 해시태그 제외, 공백 제외 약 2500자 (서론500+본론1500+결론500)
  totalLengthWithSpaces: { min: 2800, max: 3500 }, // 공백 포함 시
  lineLength: 40, // 한 줄 40자 내외
  paragraphLines: { min: 3, max: 5 },
  keywordDensity: { min: 2, max: 3 }, // 퍼센트
  mainKeywordCount: { min: 5, max: 7 }, // 메인 키워드 5~7회
  subKeywordCount: { min: 2, max: 3 },
  imageCount: { min: 2, max: 4 },
}

// 해시태그 규칙
export const HASHTAG_RULES = {
  count: 10,
  structure: [
    '#메인키워드',
    '#서브키워드1',
    '#서브키워드2',
    '#지역명',
    '#지역명치과',
    '#지역명+치료명',
    '#치과',
    '#치아건강',
    '#구강건강',
    '#증상키워드',
  ],
}

// 발행 타이밍
export const PUBLISH_TIMING = {
  weekday: ['07:00-09:00', '12:00-13:00', '18:00-21:00'],
  weekend: ['09:00-11:00'],
  frequency: '주 2~3회 권장 (최소 주 1회)',
}

// 저품질 방지 체크리스트
export const QUALITY_CHECKLIST = [
  '중복 콘텐츠 아님 (복붙 금지)',
  '과도한 키워드 반복 없음',
  '외부 링크 최소화',
  '광고성 문구 없음',
  '의미 없는 해시태그 없음',
  '동일 제목 반복 사용 없음',
  '이미지 출처 문제 없음 (직접 촬영)',
]

// 키워드 배치 전략
export const KEYWORD_PLACEMENT = {
  title: '메인 키워드 포함 (앞쪽 배치)',
  intro: '서문 200자 내 메인 키워드 등장',
  body: '소제목에 서브 키워드 배치',
  conclusion: '마무리에 메인 키워드 1회',
  hashtags: '전체 키워드 활용 (10개)',
}

// 해시태그 생성 함수
export function generateHashtags(
  mainKeyword: string,
  subKeywords: string[],
  region: string,
  topic: string
): string[] {
  const rawHashtags = [
    `#${topic.replace(/\s/g, '')}`,           // 치료명 (공백 제거)
    ...subKeywords.map(kw => `#${kw.replace(/\s/g, '')}`),
    `#${region}치과`,
    `#${region.replace(/\s/g, '')}`,
    '#치과',
    '#치아건강',
    '#구강건강',
    '#치과치료',
    '#치과상담',
  ]

  // 중복 제거 후 10개로 제한
  const uniqueHashtags = [...new Set(rawHashtags)]
  return uniqueHashtags.slice(0, 10)
}

// 키워드 밀도 계산 함수
export function calculateKeywordDensity(text: string, keyword: string): number {
  const keywordCount = (text.match(new RegExp(keyword, 'g')) || []).length
  const totalChars = text.length
  return (keywordCount * keyword.length / totalChars) * 100
}
