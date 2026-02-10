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
// 특정 치과의 주제/치료 목록 가져오기 (RAG Rawdata 시트에서)
export async function getClinicTopics(clinicName: string): Promise<string[]> {
  const sheetId = process.env.GOOGLE_SHEETS_ID
  const apiKey = process.env.GOOGLE_API_KEY

  if (!sheetId || !apiKey) {
    console.log('[getClinicTopics] Google Sheets 설정이 없습니다.')
    return []
  }

  try {
    // Rawdata 시트에서 B(치과명), C(주제) 열 가져오기
    const range = 'Rawdata!B2:C'
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`

    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 60 },
    })

    if (!response.ok) {
      throw new Error(`Sheets API error: ${response.status}`)
    }

    const data = await response.json()
    const rows = data.values || []

    const topicsSet = new Set<string>()
    const clinicNameTrimmed = clinicName.trim()

    for (const row of rows) {
      const rowClinic = (row[0] || '').trim() // B열: 치과명
      const rowTopic = (row[1] || '').trim()  // C열: 주제

      if (!rowTopic) continue

      // 치과명 매칭 (부분 일치 허용)
      if (rowClinic.includes(clinicNameTrimmed) || clinicNameTrimmed.includes(rowClinic)) {
        topicsSet.add(rowTopic)
      }
    }

    return Array.from(topicsSet).sort()
  } catch (error) {
    console.error('[getClinicTopics] Failed:', error)
    return []
  }
}

// F열 본문에서 지역/원장님 추출
function extractClinicInfo(content: string, clinicName: string): { region: string; doctorName: string } {
  let region = ''
  let doctorName = ''

  if (!content) return { region, doctorName }

  // 서문에서 추출 (첫 500자)
  const intro = content.substring(0, 500)

  // 원장님 이름 추출: "안녕하세요, ... [이름]입니다" 또는 "[이름] 원장입니다"
  const doctorPatterns = [
    /([가-힣]{2,4})\s*원장/,
    /([가-힣]{2,4})\s*대표원장/,
    /([가-힣]{2,4})\s*원장님/,
    /([가-힣]{2,4})입니다\.\s*$/m,
  ]
  for (const pattern of doctorPatterns) {
    const match = intro.match(pattern)
    if (match && match[1] && match[1].length >= 2 && match[1].length <= 4) {
      // 치과명이 아닌지 확인
      if (!clinicName.includes(match[1])) {
        doctorName = match[1]
        break
      }
    }
  }

  // 지역 추출: "안녕하세요, [지역] [치과명]" 패턴
  const regionPatterns = [
    new RegExp(`([가-힣]{1,10})\\s+${clinicName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    /안녕하세요[,.]?\s*([가-힣]{1,10})\s+/,
  ]
  for (const pattern of regionPatterns) {
    const match = intro.match(pattern)
    if (match && match[1]) {
      const candidate = match[1].trim()
      // 일반적인 지역명 키워드 확인
      const regionKeywords = ['동', '구', '시', '읍', '면', '로', '길', '역', '평', '산', '포', '천', '주', '원', '양', '성', '당', '남', '북', '서', '인']
      if (candidate.length <= 6 && regionKeywords.some(k => candidate.endsWith(k) || candidate.length <= 3)) {
        region = candidate
        break
      }
      // 짧은 이름이면 그냥 지역으로 사용
      if (candidate.length <= 4) {
        region = candidate
        break
      }
    }
  }

  return { region, doctorName }
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
    // Google Sheets API v4 - Rawdata 시트
    // A:날짜, B:치과명, C:주제, D:파일위치(URL), E:기존링크, F:글본문
    // region/doctorName은 F열(본문)의 인사말에서 추출
    const range = 'Rawdata!A2:F'
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`

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
      const treatment = row[2]?.trim() // C열: 주제/치료
      const content = row[5] || '' // F열: 글본문

      if (treatment) treatmentsSet.add(treatment)

      if (clinic && !clinicMap.has(clinic)) {
        // F열 본문에서 지역/원장님 추출
        const { region, doctorName } = extractClinicInfo(content, clinic)
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
