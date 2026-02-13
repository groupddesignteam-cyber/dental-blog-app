/**
 * 과목별 기본 치료 목록 + 자동 감지
 * RAG에 데이터가 없는 신규 병원용 폴백
 */

export type MedicalSpecialty = 'dental' | 'urology' | 'orthopedics'

// ── 과목별 기본 치료 목록 ──

export const SPECIALTY_TREATMENTS: Record<MedicalSpecialty, string[]> = {
  dental: [
    '임플란트',
    '신경치료',
    '충치치료',
    '사랑니',
    '치아교정',
    '스케일링',
    '치주치료',
    '보철(크라운)',
    '라미네이트',
    '치아미백',
    '소아치과',
    '발치',
    '잇몸치료',
    '턱관절',
    '레진',
    '브릿지',
    '틀니',
    '골이식',
    '지르코니아',
  ],
  urology: [
    '전립선비대증',
    '전립선암',
    '전립선염',
    '요로결석',
    '신장결석',
    '방광염',
    '요로감염',
    '혈뇨',
    '과민성방광',
    '요실금',
    '발기부전',
    '남성불임',
    '정계정맥류',
    '방광암',
    '신장암',
    '포경수술',
    '야뇨증',
    '전립선 검진',
    '비뇨기과 검진',
  ],
  orthopedics: [
    '무릎관절',
    '인공관절',
    '십자인대',
    '반월상연골',
    '연골손상',
    '회전근개',
    '오십견',
    '허리디스크',
    '목디스크',
    '척추관협착증',
    '골절',
    '손목터널증후군',
    '테니스엘보',
    '골다공증',
    '관절염',
    '류마티스',
    '족저근막염',
    '아킬레스건',
    '통풍',
    '근막통증',
  ],
}

// ── 병원명 → 과목 자동 감지 ──

const SPECIALTY_KEYWORDS: { specialty: MedicalSpecialty; keywords: string[] }[] = [
  {
    specialty: 'urology',
    keywords: ['비뇨', '비뇨기', '비뇨의학', '남성의학', '남성클리닉'],
  },
  {
    specialty: 'orthopedics',
    keywords: ['정형', '정형외과', '관절', '척추', '뼈'],
  },
  // dental은 기본값 (매칭 안 되면 치과)
]

/**
 * 병원명에서 과목 자동 감지
 * @param clinicName 병원명 (예: "메인비뇨의학과의원", "서울정형외과")
 * @returns 감지된 과목 (기본값: dental)
 */
export function detectSpecialty(clinicName: string): MedicalSpecialty {
  const name = clinicName.toLowerCase()
  for (const { specialty, keywords } of SPECIALTY_KEYWORDS) {
    if (keywords.some(kw => name.includes(kw))) {
      return specialty
    }
  }
  return 'dental'
}

/**
 * 병원명 기반으로 적절한 기본 치료 목록 반환
 */
export function getDefaultTreatments(clinicName: string): string[] {
  const specialty = detectSpecialty(clinicName)
  return SPECIALTY_TREATMENTS[specialty]
}

/**
 * 과목 한글명
 */
export const SPECIALTY_LABELS: Record<MedicalSpecialty, string> = {
  dental: '치과',
  urology: '비뇨기과',
  orthopedics: '정형외과',
}
