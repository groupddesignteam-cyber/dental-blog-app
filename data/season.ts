// 월별 시즌 인사말 (season_db.md 기반)

export interface SeasonData {
  keywords: string[]
  hooks: string[]
}

export const SEASON_DATA: Record<number, SeasonData> = {
  1: {
    keywords: ['새해', '다짐', '추위', '한파'],
    hooks: [
      '새해가 밝았는데요, 올해는 건강 관리 잘 해보자고 다짐하신 분들 많으시죠?',
      '요즘 너무 추운데, 이렇게 추운 날 치과 오시는 분들 보면 참 대단하시단 생각이 들어요.',
    ],
  },
  2: {
    keywords: ['설 연휴', '졸업', '입학 준비', '봄 기다림'],
    hooks: [
      '설 연휴 잘 보내셨나요? 명절 끝나고 치과 찾으시는 분들이 부쩍 늘었어요.',
      '졸업 앞두고 치아 관리 하러 오시는 학생분들이 많으시더라고요.',
    ],
  },
  3: {
    keywords: ['봄', '새 학기', '입학', '꽃샘추위'],
    hooks: [
      '어느덧 3월이네요. 새 학기 맞아 교정 상담 오시는 분들이 부쩍 늘었어요.',
      '봄바람이 살랑살랑 불어오는 요즘, 미소도 예쁘게 가꿔보시면 어떨까요?',
    ],
  },
  4: {
    keywords: ['벚꽃', '완연한 봄', '황사', '미세먼지'],
    hooks: [
      '벚꽃 구경 다녀오셨나요? 활짝 웃는 사진 찍으려면 치아 관리도 중요하죠.',
      '요즘 황사가 심한데, 건강 챙기시느라 바쁘시죠?',
    ],
  },
  5: {
    keywords: ['가정의 달', '어버이날', '어린이날', '근로자의 날'],
    hooks: [
      '가정의 달 맞아 부모님 치아 건강 선물하시는 분들 많으시더라고요.',
      '어린이날 지나고 아이 충치 때문에 오시는 분들이 많아요.',
    ],
  },
  6: {
    keywords: ['여름 시작', '장마 전', '현충일'],
    hooks: [
      '슬슬 더워지기 시작하는 6월이에요. 여름 전에 미뤄뒀던 치료 받으시는 분들 많죠.',
      '장마 오기 전에 치과 다녀가시려는 분들이 부쩍 늘었네요.',
    ],
  },
  7: {
    keywords: ['장마', '무더위', '여름휴가', '방학'],
    hooks: [
      '장마철이라 눅눅한 요즘인데요, 그래도 건강은 챙겨야죠.',
      '방학 맞아 교정 시작하시는 학생분들이 많으시더라고요.',
    ],
  },
  8: {
    keywords: ['폭염', '휴가', '열대야', '방학 끝'],
    hooks: [
      '폭염주의보가 계속되고 있는데요, 더운 날 치과까지 와주셔서 감사해요.',
      '여름휴가 다녀오셨나요? 방학 끝나기 전에 치료 마무리하시려는 분들이 많아요.',
    ],
  },
  9: {
    keywords: ['가을', '추석', '새 학기', '선선함'],
    hooks: [
      '아침저녁으로 선선해진 요즘이에요. 추석 전에 치아 관리 하시는 분들 계시죠.',
      '풍성한 한가위 보내셨나요? 명절 음식 드시다 불편하셨던 분들이 오시더라고요.',
    ],
  },
  10: {
    keywords: ['가을', '단풍', '천고마비', '수능 D-50'],
    hooks: [
      '단풍이 예쁜 계절이에요. 가을 나들이 사진 찍을 때 환한 미소 어떠세요?',
      '수능이 한 달여 앞으로 다가왔는데요, 수험생 자녀분 치아 걱정하시는 부모님들 계시죠.',
    ],
  },
  11: {
    keywords: ['수능', '입시', '추워지는 날씨', '김장'],
    hooks: [
      '수능 끝나고 그동안 미뤄뒀던 치료 받으시는 분들이 정말 많아요.',
      '날씨가 부쩍 추워졌는데요, 따뜻한 음식 편하게 드시려면 치아 건강이 중요하죠.',
    ],
  },
  12: {
    keywords: ['연말', '송년회', '크리스마스', '한 해 마무리'],
    hooks: [
      '벌써 12월이네요. 한 해 마무리하면서 치아 건강도 점검해보시는 건 어떨까요?',
      '연말 모임 많으시죠? 환하게 웃을 수 있는 미소 준비해보세요.',
    ],
  },
}

// 현재 월에 맞는 시즌 훅 가져오기
export function getSeasonHook(topic?: string): string {
  const month = new Date().getMonth() + 1
  const seasonData = SEASON_DATA[month] || SEASON_DATA[1]

  // 주제와 관련된 훅이 있으면 우선 선택 (나중에 로직 추가 가능)
  const hooks = seasonData.hooks
  return hooks[Math.floor(Math.random() * hooks.length)]
}

// 현재 월의 키워드 가져오기
export function getSeasonKeywords(): string[] {
  const month = new Date().getMonth() + 1
  return SEASON_DATA[month]?.keywords || []
}

// 특정 월의 데이터 가져오기
export function getSeasonDataByMonth(month: number): SeasonData | null {
  return SEASON_DATA[month] || null
}
