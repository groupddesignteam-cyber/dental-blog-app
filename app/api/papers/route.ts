import { NextRequest } from 'next/server'
import { searchPubMed } from '@/lib/pubmed'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const topic = searchParams.get('topic')
  const limit = parseInt(searchParams.get('limit') || '5', 10)

  if (!topic) {
    return Response.json({ error: 'topic parameter required' }, { status: 400 })
  }

  try {
    const papers = await searchPubMed(topic, Math.min(limit, 10))
    return Response.json({ papers, count: papers.length })
  } catch (error) {
    console.error('[Papers API] PubMed search error:', error)
    return Response.json(
      { error: 'PubMed search failed', details: String(error) },
      { status: 500 }
    )
  }
}
