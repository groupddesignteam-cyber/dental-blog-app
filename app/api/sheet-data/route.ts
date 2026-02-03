import { NextResponse } from 'next/server'
import { getSheetData } from '@/lib/sheets-data'

export async function GET() {
  try {
    const data = await getSheetData()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Sheet data API error:', error)
    return NextResponse.json(
      { error: '시트 데이터를 가져오는데 실패했습니다.', clinics: [], treatments: [] },
      { status: 500 }
    )
  }
}
