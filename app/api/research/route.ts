import { NextRequest } from 'next/server'
import { generateResearchCC } from '@/lib/research'

export async function POST(request: NextRequest) {
  try {
    const { topic, clinicName } = await request.json()

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return Response.json(
        { error: '리서치할 주제를 입력해주세요.' },
        { status: 400 }
      )
    }

    if (!process.env.PERPLEXITY_API_KEY && !process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: 'Perplexity 또는 Gemini API 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const result = await generateResearchCC(
      topic.trim(),
      clinicName?.trim() || undefined
    )

    return Response.json({
      success: true,
      research: result,
    })
  } catch (error) {
    console.error('[Research API] Error:', error)
    return Response.json(
      { error: '리서치 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}
