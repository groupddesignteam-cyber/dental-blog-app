// Google Sheets 데이터 가져오기 (API 키 방식)
// F열(글 본문)에서 지역/원장명/페르소나를 자동 추출

export interface ClinicDetail {
  name: string
  region: string
  doctorName: string
}

export interface SheetData {
  clinics: string[]
  clinicDetails: ClinicDetail[]
  treatments: string[]
}

// 시트 탭 이름 후보 (sheets-rag.ts와 동기화)
const SHEET_TAB_CANDIDATES = ['Rawdata', '블로그 포스팅', '블로그포스팅', 'Sheet1', '시트1']
let _cachedTabName: string | null = null

// 탭 이름 자동 탐색 후 데이터 가져오기
async function fetchWithTabFallback(sheetId: string, apiKey: string, columns: string): Promise<string[][]> {
  // 1. 캐시된 탭 이름이 있으면 바로 사용
  if (_cachedTabName !== null) {
    const range = _cachedTabName ? `${_cachedTabName}!${columns}` : columns
    const rows = await fetchRange(sheetId, apiKey, range)
    if (rows && rows.length > 0) return rows
    _cachedTabName = null
  }

  // 2. 후보 탭 이름들을 순서대로 시도
  for (const tabName of SHEET_TAB_CANDIDATES) {
    const rows = await fetchRange(sheetId, apiKey, `${tabName}!${columns}`)
    if (rows && rows.length > 0) {
      console.log(`[SheetData] ✅ 탭 "${tabName}"에서 ${rows.length}개 행 발견`)
      _cachedTabName = tabName
      return rows
    }
  }

  // 3. 탭 이름 없이 기본 시트 시도
  const rows = await fetchRange(sheetId, apiKey, columns)
  if (rows && rows.length > 0) {
    console.log(`[SheetData] ✅ 기본 시트에서 ${rows.length}개 행 발견`)
    _cachedTabName = ''
    return rows
  }

  return []
}

// 단일 range 가져오기
async function fetchRange(sheetId: string, apiKey: string, range: string): Promise<string[][] | null> {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 60 },
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.values || []
  } catch {
    return null
  }
}

// ============================================================
// F열(글 본문)에서 지역명 추출
// ============================================================
function extractRegionFromContent(content: string, clinicName: string): string {
  if (!content) return ''

  // 본문 앞부분만 사용 (서문 + 제목)
  const head = content.substring(0, 500)

  // 패턴 우선순위대로 시도
  const patterns: RegExp[] = [
    // "안녕하세요, [지역] 치과" / "[지역] 치과 입니다"
    /([가-힣]{2,6}(?:동|역|시))\s*(?:인근\s*)?치과/,
    // "부평 치과", "원주 치과" 등 광역 지역명
    /([가-힣]{2,4})\s+치과\s+(?:의사|입니다|원장)/,
    // 제목에서: "[지역] 치과 [주제]"
    /^([가-힣]{2,6}(?:동|역|시|구))\s*(?:인근\s*)?치과/m,
    // "[지역]에서 진료 중인"
    /([가-힣]{2,6}(?:동|역|시))\s*에서\s*진료/,
  ]

  for (const pattern of patterns) {
    const match = head.match(pattern)
    if (match && match[1]) {
      const region = match[1].trim()
      // 치과명이나 치료 용어가 지역으로 잡히지 않도록 필터
      if (!clinicName.includes(region) && region.length >= 2 && !isTreatmentWord(region)) {
        return region
      }
    }
  }

  // 추가 폴백: "원주", "부평" 등 주요 지역명 직접 매칭
  const knownRegions = [
    '원주', '부평', '간석동', '십정동', '명륜동', '일산동', '단구동', '개운동',
    '무실동', '동암', '백운', '주안동', '간석오거리', '압구정', '목동', '창동',
    '이수', '제물포', '성북', '신대방', '평택', '하남미사', '연신내', '주안',
    '봉담', '죽전', '지축', '신림', '검단', '둔촌', '수원', '잠실', '강남',
    '송파', '일산', '탑석',
  ]
  for (const region of knownRegions) {
    if (head.includes(region)) {
      return region
    }
  }

  return ''
}

// 치료 용어가 지역으로 잡히지 않도록 필터
function isTreatmentWord(word: string): boolean {
  const treatments = [
    '교정', '임플란트', '보철', '신경', '충치', '스케일링',
    '미백', '발치', '수술', '치료', '진료', '마취',
  ]
  return treatments.some(t => word.includes(t) || t.includes(word))
}

// ============================================================
// F열(글 본문)에서 원장님 이름 추출
// ============================================================
function extractDoctorFromContent(content: string, clinicName: string): string {
  if (!content) return ''

  // 본문 앞부분 + 마지막 부분에서 탐색
  const head = content.substring(0, 600)
  const tail = content.substring(Math.max(0, content.length - 400))
  const searchArea = head + '\n' + tail

  const patterns: { regex: RegExp; group: number }[] = [
    // "윤홍기 원장" / "김정애 원장" (가장 신뢰도 높음)
    { regex: /([가-힣]{2,4})\s*원장/, group: 1 },
    // "치과 의사 윤홍기"
    { regex: /치과\s*의사\s*([가-힣]{2,4})/, group: 1 },
    // "[이름]이었습니다" (마무리 인사)
    { regex: /([가-힣]{2,3})\s*이었습니다/, group: 1 },
  ]

  for (const { regex, group } of patterns) {
    const match = searchArea.match(regex)
    if (match && match[group]) {
      const name = match[group].trim()
      if (isValidDoctorName(name, clinicName)) {
        return name
      }
    }
  }

  return ''
}

// 유효한 원장 이름인지 검증
function isValidDoctorName(name: string, clinicName: string): boolean {
  if (name.length < 2 || name.length > 4) return false

  // 치과명에 포함된 단어는 제외 (명작, 하이탑, 믿음준 등)
  if (clinicName.includes(name)) return false

  // 일반 명사/직함/시설명 제외
  const excludeWords = [
    '대표', '치과', '의원', '교정', '임상', '정보',
    '상황', '방법', '라이프', '위드미', '세프라임',
    '부전', '주안점', '연신내', '치과명',
    '안녕하', '감사합', '반갑습', '알려드', '소개합',
    '입니다', '였습니', '합니다', '됩니다',
  ]
  if (excludeWords.some(w => name.includes(w) || w.includes(name))) return false

  // "입"으로 끝나는 이름 제외 (김민수입, 허혜윤입 → "~입니다" 오파싱)
  if (name.endsWith('입')) return false

  // 지역명이 이름으로 잡히지 않도록 (동/역/시/구로 끝나는 단어)
  if (/[동역시구읍면]$/.test(name)) return false

  return true
}

// Google Sheets에서 치과명, 치료 목록 가져오기
export async function getSheetData(): Promise<SheetData> {
  const sheetId = process.env.GOOGLE_SHEETS_ID
  const apiKey = process.env.GOOGLE_API_KEY

  if (!sheetId || !apiKey) {
    console.log('Google Sheets 설정이 없습니다.')
    return { clinics: [], clinicDetails: [], treatments: [] }
  }

  try {
    // Google Sheets API v4 - 탭 자동 탐색
    // A:날짜, B:치과명, C:주제, D:파일위치, E:기존링크, F:글본문
    // → D/E는 사용하지 않고, F(글 본문)에서 지역/원장명 추출
    const rows = await fetchWithTabFallback(sheetId, apiKey, 'A2:F')

    // 치과 상세정보 맵 (중복 제거용)
    const clinicMap = new Map<string, ClinicDetail>()
    // 치과별 지역/원장 후보 집계 (가장 많이 나온 값 사용)
    const regionCounts = new Map<string, Map<string, number>>()
    const doctorCounts = new Map<string, Map<string, number>>()
    const treatmentsSet = new Set<string>()

    for (const row of rows) {
      const clinic = row[1]?.trim() // B열: 치과명
      const treatment = row[2]?.trim() // C열: 주제
      const content = row[5] || '' // F열: 글 본문

      if (treatment) treatmentsSet.add(treatment)
      if (!clinic) continue

      // F열에서 지역/원장 추출
      const region = extractRegionFromContent(content, clinic)
      const doctor = extractDoctorFromContent(content, clinic)

      // 빈도 집계 (가장 많이 나오는 지역/원장이 대표값)
      if (region) {
        if (!regionCounts.has(clinic)) regionCounts.set(clinic, new Map())
        const counts = regionCounts.get(clinic)!
        counts.set(region, (counts.get(region) || 0) + 1)
      }
      if (doctor) {
        if (!doctorCounts.has(clinic)) doctorCounts.set(clinic, new Map())
        const counts = doctorCounts.get(clinic)!
        counts.set(doctor, (counts.get(doctor) || 0) + 1)
      }
    }

    // 가장 빈번한 지역/원장을 대표값으로 선정
    const getMostFrequent = (counts: Map<string, number>): string => {
      let maxCount = 0
      let result = ''
      for (const [value, count] of counts) {
        if (count > maxCount) {
          maxCount = count
          result = value
        }
      }
      return result
    }

    // clinicMap 구성
    const allClinics = new Set<string>()
    for (const row of rows) {
      const clinic = row[1]?.trim()
      if (clinic) allClinics.add(clinic)
    }

    for (const clinic of allClinics) {
      const region = regionCounts.has(clinic)
        ? getMostFrequent(regionCounts.get(clinic)!)
        : ''
      const doctorName = doctorCounts.has(clinic)
        ? getMostFrequent(doctorCounts.get(clinic)!)
        : ''

      clinicMap.set(clinic, { name: clinic, region, doctorName })

      if (region || doctorName) {
        console.log(`[SheetData] 📍 ${clinic}: 지역="${region}", 원장="${doctorName}"`)
      }
    }

    const clinicDetails = Array.from(clinicMap.values()).sort((a, b) => a.name.localeCompare(b.name))

    return {
      clinics: clinicDetails.map(c => c.name),
      clinicDetails,
      treatments: Array.from(treatmentsSet).sort(),
    }
  } catch (error) {
    console.error('Failed to fetch sheet data:', error)
    return { clinics: [], clinicDetails: [], treatments: [] }
  }
}
