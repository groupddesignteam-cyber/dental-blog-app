import { NextRequest, NextResponse } from 'next/server'
import { getClinicTopics } from '@/lib/sheets-data'

export async function GET(request: NextRequest) {
  try {
    const clinicName = request.nextUrl.searchParams.get('clinicName')

    if (!clinicName) {
      return NextResponse.json(
        { error: '치과명이 필요합니다.', topics: [] },
        { status: 400 }
      )
    }

    const topics = await getClinicTopics(clinicName)
    return NextResponse.json({ topics })
  } catch (error) {
    console.error('Clinic topics API error:', error)
    return NextResponse.json(
      { error: '치과별 주제를 가져오는데 실패했습니다.', topics: [] },
      { status: 500 }
    )
  }
}
