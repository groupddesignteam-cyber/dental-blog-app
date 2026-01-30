// Google Sheets 데이터 가져오기 (API 키 방식)

export interface SheetData {
  clinics: string[]
  treatments: string[]
}

// Google Sheets에서 치과명, 치료 목록 가져오기
export async function getSheetData(): Promise<SheetData> {
  const sheetId = process.env.GOOGLE_SHEETS_ID
  const apiKey = process.env.GOOGLE_API_KEY

  if (!sheetId || !apiKey) {
    console.log('Google Sheets 설정이 없습니다.')
    return { clinics: [], treatments: [] }
  }

  try {
    // Google Sheets API v4 - 공개 시트 읽기
    const range = 'A2:C' // A열부터 C열까지
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

    // B열: 치과명, C열: 치료
    const clinicsSet = new Set<string>()
    const treatmentsSet = new Set<string>()

    for (const row of rows) {
      const clinic = row[1]?.trim() // B열
      const treatment = row[2]?.trim() // C열

      if (clinic) clinicsSet.add(clinic)
      if (treatment) treatmentsSet.add(treatment)
    }

    return {
      clinics: Array.from(clinicsSet).sort(),
      treatments: Array.from(treatmentsSet).sort(),
    }
  } catch (error) {
    console.error('Failed to fetch sheet data:', error)
    return { clinics: [], treatments: [] }
  }
}
