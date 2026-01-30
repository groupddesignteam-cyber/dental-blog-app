import { NextRequest, NextResponse } from 'next/server'
import { getPosts, addPost } from '@/lib/sheets'

export async function GET() {
  try {
    const posts = await getPosts()
    return NextResponse.json(posts)
  } catch (error) {
    console.error('GET /api/posts error:', error)
    return NextResponse.json(
      { error: '글 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const post = await addPost({
      clinicId: data.clinicId || '',
      topic: data.topic,
      patientInfo: data.patientInfo,
      treatment: data.treatment,
      title: data.title,
      content: data.content,
      metadata: data.metadata || {},
    })

    if (!post) {
      return NextResponse.json(
        { error: '글 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json(post)
  } catch (error) {
    console.error('POST /api/posts error:', error)
    return NextResponse.json(
      { error: '글 저장에 실패했습니다.' },
      { status: 500 }
    )
  }
}
