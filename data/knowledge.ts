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

// 전문용어 + 비유 표현 (전문용어 설명 후 비유로 이해 돕기)
// 패턴: "[전문용어]란 [정확한 설명]이에요. 쉽게 말해 [비유 표현]처럼요."
export const METAPHORS: Record<string, { term: string; definition: string; metaphor: string }> = {
  신경치료: {
    term: '근관치료(신경치료)',
    definition: '치아 내부의 신경과 혈관이 있는 치수 조직이 감염되었을 때, 이를 제거하고 소독한 뒤 특수 재료로 채우는 치료',
    metaphor: '썩은 과일의 속을 깨끗이 파내고 방부 처리를 하는 것',
  },
  임플란트: {
    term: '임플란트(인공치아)',
    definition: '상실된 치아 부위에 티타늄 재질의 인공 치근을 치조골에 식립한 후, 그 위에 보철물을 연결하는 치료',
    metaphor: '땅에 말뚝을 박고 그 위에 집을 짓는 것',
  },
  크라운: {
    term: '크라운(치관 보철)',
    definition: '손상되거나 약해진 치아 전체를 감싸서 보호하고 기능을 회복시키는 보철물',
    metaphor: '약해진 치아에 단단한 헬멧을 씌워주는 것',
  },
  치조골: {
    term: '치조골(잇몸뼈)',
    definition: '치아 뿌리를 둘러싸고 지지해주는 턱뼈의 일부',
    metaphor: '치아가 단단히 서 있을 수 있게 해주는 기초 땅',
  },
  골이식: {
    term: '골이식(뼈이식)',
    definition: '치조골이 부족할 때 자가골, 동종골, 이종골 또는 합성골을 이식해 뼈의 양을 증가시키는 시술',
    metaphor: '집을 짓기 전에 땅을 보강하는 기초 공사',
  },
  발치: {
    term: '발치(치아 제거)',
    definition: '손상되거나 치료가 불가능한 치아를 치조골에서 분리하여 제거하는 시술',
    metaphor: '뿌리 깊이 박힌 나무를 조심스럽게 뽑아내는 것',
  },
  스케일링: {
    term: '스케일링(치석 제거)',
    definition: '치아와 잇몸 사이에 쌓인 치태와 치석을 초음파 기구로 제거하는 예방 치료',
    metaphor: '오랫동안 쌓인 녹과 때를 깨끗이 벗겨내는 것',
  },
}

// 비유 표현 생성 함수 (프롬프트에서 사용)
export function getMetaphorText(topic: string): string {
  const metaphor = METAPHORS[topic]
  if (!metaphor) return ''

  return `"${metaphor.term}"이란 ${metaphor.definition}이에요. 쉽게 말해 ${metaphor.metaphor}과 비슷하다고 생각하시면 돼요.`
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
