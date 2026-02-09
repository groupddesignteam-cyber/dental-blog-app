// Google Sheets 데이터 가져오기 (API 키 방식)

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
    // A:날짜, B:치과명, C:주제, D:지역, E:원장님
    const rows = await fetchWithTabFallback(sheetId, apiKey, 'A2:E')

    // 치과 상세정보 맵 (중복 제거용)
    const clinicMap = new Map<string, ClinicDetail>()
    const treatmentsSet = new Set<string>()

    for (const row of rows) {
      const clinic = row[1]?.trim() // B열: 치과명
      const treatment = row[2]?.trim() // C열: 주제
      const region = row[3]?.trim() || '' // D열: 지역
      const doctorName = row[4]?.trim() || '' // E열: 원장님

      if (treatment) treatmentsSet.add(treatment)

      if (clinic && !clinicMap.has(clinic)) {
        clinicMap.set(clinic, {
          name: clinic,
          region,
          doctorName,
        })
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
