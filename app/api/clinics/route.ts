import { NextRequest, NextResponse } from 'next/server'
import { getClinics, addClinic, deleteClinic } from '@/lib/sheets'

export async function GET() {
  try {
    const clinics = await getClinics()
    return NextResponse.json(clinics)
  } catch (error) {
    console.error('GET /api/clinics error:', error)
    return NextResponse.json(
      { error: '치과 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const clinic = await addClinic({
      name: data.name,
      region: data.region,
      doctorName: data.doctorName,
    })

    if (!clinic) {
      return NextResponse.json(
        { error: '치과 등록에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json(clinic)
  } catch (error) {
    console.error('POST /api/clinics error:', error)
    return NextResponse.json(
      { error: '치과 등록에 실패했습니다.' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID가 필요합니다.' },
        { status: 400 }
      )
    }

    const success = await deleteClinic(id)

    if (!success) {
      return NextResponse.json(
        { error: '치과 삭제에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/clinics error:', error)
    return NextResponse.json(
      { error: '치과 삭제에 실패했습니다.' },
      { status: 500 }
    )
  }
}
