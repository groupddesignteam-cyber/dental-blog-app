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

// Google Sheets에서 치과명, 치료 목록 가져오기
export async function getSheetData(): Promise<SheetData> {
  const sheetId = process.env.GOOGLE_SHEETS_ID
  const apiKey = process.env.GOOGLE_API_KEY

  if (!sheetId || !apiKey) {
    console.log('Google Sheets 설정이 없습니다.')
    return { clinics: [], clinicDetails: [], treatments: [] }
  }

  try {
    // Google Sheets API v4 - 공개 시트 읽기
    // A:날짜, B:치과명, C:치료, D:지역, E:원장님
    const range = 'A2:E'
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 60 }, // 60초 캐시
    })

    if (!response.ok) {
      throw new Error(`Sheets API error: ${response.status}`)
    }

    const data = await response.json()
    const rows = data.values || []

    // 치과 상세정보 맵 (중복 제거용)
    const clinicMap = new Map<string, ClinicDetail>()
    const treatmentsSet = new Set<string>()

    for (const row of rows) {
      const clinic = row[1]?.trim() // B열: 치과명
      const treatment = row[2]?.trim() // C열: 치료
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
