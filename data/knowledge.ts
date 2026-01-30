// 치과 용어 및 규칙 (knowledge_db.md 기반)

// 용어 치환 규칙
export const TERM_REPLACEMENTS: Record<string, string> = {
  // 보철 관련
  '크라운': '지르코니아 보철',
  '금니': '금 보철',
  '이빨': '치아',
  '때운다': '수복한다',
  '때움': '수복',
  '씌운다': '보철을 장착한다',
  '빼다': '발치하다',
  // 임플란트 관련
  '심는다': '식립한다',
  '뼈이식': '골이식',
  '잇몸뼈': '치조골',
  '평생 사용': '장기간 사용 가능',
  '반영구적': '오래 사용 가능',
  // 교정 관련
  '철사': '교정용 와이어',
  '고무줄': '교정용 엘라스틱',
  '덧니': '총생',
  '뻐드렁니': '돌출입',
  // 일반 치료
  '썩은 이': '충치',
  '신경 죽이기': '신경치료',
}

// 절대 금지어 (의료광고법 위반)
export const FORBIDDEN_WORDS = [
  '최고', '최첨단', '최신', '유일', '독보적',
  '완치', '100%', '무통', '무조건',
  '전문화', '특화', '명의', '실력파',
  '저렴한', '싼', '할인', '이벤트',
  '후기', '체험담', '환자 인터뷰',
  '평생', '반영구',
]

// 치료별 의학적 팩트
export const MEDICAL_FACTS = {
  임플란트: {
    duration: '일반적으로 3~6개월 (골이식 시 추가 소요)',
    lifespan: '관리에 따라 다름 (10년 이상 가능하나 보장 불가)',
    caution: '정기 검진 필수, 흡연 시 실패율 증가',
  },
  지르코니아보철: {
    material: '심미성 우수, 자연치와 유사한 색상 구현',
    strength: '금속 보철 대비 심미성 우수, 강도 충분',
    lifespan: '관리에 따라 상이',
  },
  신경치료: {
    purpose: '치아 내부 감염 조직 제거 후 보존',
    visits: '일반적으로 2~3회 내원',
    aftercare: '보철(크라운) 씌워 보호 권장',
  },
  교정치료: {
    duration: '케이스에 따라 1년~3년',
    retainer: '교정 후 착용 필수',
    types: '메탈, 세라믹, 투명교정 등',
  },
  충치치료: {
    stages: '레진 수복 → 인레이 → 크라운 → 신경치료 순',
    importance: '조기 발견 중요성 강조',
  },
}

// 비유 표현 (어려운 개념 설명용)
export const METAPHORS = {
  신경치료: '치아 안쪽의 염증을 깨끗이 치료하는 거예요. 마치 썩은 과일의 속을 파내고 깨끗이 만드는 것처럼요.',
  임플란트: '빠진 치아 자리에 인공 뿌리를 심고, 그 위에 치아 모양의 보철을 올리는 거예요.',
  크라운: '손상된 치아 위에 모자처럼 씌워서 보호하는 거예요.',
  치조골: '치아를 지탱하는 턱뼈예요. 집의 기초 공사 같은 역할을 해요.',
}

// 용어 치환 함수
export function replaceTerms(text: string): string {
  let result = text
  for (const [wrong, correct] of Object.entries(TERM_REPLACEMENTS)) {
    result = result.replace(new RegExp(wrong, 'g'), correct)
  }
  return result
}

// 금지어 검사 함수
export function checkForbiddenWords(text: string): string[] {
  return FORBIDDEN_WORDS.filter(word => text.includes(word))
}
