// 정보성 모드 리서치 CC 자동 생성
// Perplexity sonar(웹 검색 기반) 우선 → Gemini Flash fallback → PubMed-only fallback

import { GoogleGenerativeAI } from '@google/generative-ai'
import { searchPubMed, PaperCitation } from '@/lib/pubmed'
import { findSimilarPosts, SimilarPost } from '@/lib/sheets-rag'
import { withCache, CACHE_TTL } from '@/lib/cache'
import { ResearchResult } from '@/types'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// ── Perplexity sonar API 호출 ──
interface PerplexityResponse {
  choices: {
    message: {
      role: string
      content: string
    }
  }[]
  citations?: string[]
}

async function callPerplexitySonar(
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; citations: string[] }> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not configured')
  }

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 2000,
      search_recency_filter: 'year',
      return_citations: true,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Perplexity API error ${res.status}: ${errText}`)
  }

  const data: PerplexityResponse = await res.json()
  return {
    text: data.choices?.[0]?.message?.content || '',
    citations: data.citations || [],
  }
}

// ── 리서치 프롬프트 (Perplexity + Gemini 공용) ──
function buildResearchPrompt(
  topic: string,
  papers: PaperCitation[],
  ragPosts: SimilarPost[]
): string {
  const paperContext = papers.length > 0
    ? papers.map((p, i) =>
        `[${i + 1}] ${p.authors}. "${p.title}" (${p.journal}, ${p.year}).${p.abstract ? `\n   요약: ${p.abstract}` : ''}`
      ).join('\n')
    : '(PubMed 검색 결과 없음 — 웹 검색 기반으로 작성)'

  const ragContext = ragPosts.length > 0
    ? `기존 유사 글 ${ragPosts.length}건 발견 (주제: ${ragPosts.map(p => p.topic).join(', ')})`
    : '(기존 유사 글 없음)'

  return `당신은 의료 전문 리서치 어시스턴트입니다.
아래 주제에 대해 블로그 글 작성을 위한 리서치 브리프를 한국어로 작성해주세요.

## 주제: ${topic}

## 참고 논문 (PubMed)
${paperContext}

## 기존 글 현황
${ragContext}

## 출력 형식 (아래 섹션 마커를 정확히 사용하세요)

[KEY_FACTS]
- 구체적 수치/통계를 포함한 핵심 사실 5~7개
- 반드시 신뢰할 수 있는 출처 기반 정보만 포함
- 출처가 있으면 (출처명) 표기
- 예: "임플란트 10년 생존율은 95~98%로 보고됨 (대한치과의사협회)"

[MISCONCEPTIONS]
- 일반인이 흔히 가지는 오해 3~5개
- "오해 → 사실" 형태로 작성
- 예: "임플란트는 영구적이다 → 관리에 따라 수명이 달라짐"

[FAQS]
- 실제 환자들이 자주 묻는 질문 4~6개
- Q: 형태로 작성
- 예: "Q: 임플란트 시술 후 음식은 언제부터 먹을 수 있나요?"

[PAPER_FINDINGS]
${papers.length > 0
    ? papers.map((p, i) => `- [PMID:${p.pmid}] 이 논문의 핵심 발견을 한국어 한 줄로 요약`).join('\n')
    : '- (논문 없음 — 이 섹션 생략)'}

주의사항:
- 반드시 한국어로 작성
- 수치와 통계는 출처가 명확한 것만 포함 (불확실한 수치 절대 금지)
- 의료법 위반 표현 (효과 보장, 최고/최첨단 등) 절대 금지
- 각 섹션은 [SECTION_NAME] 마커로 시작`
}

// ── LLM 응답 파싱 ──
function parseResearchResponse(
  rawText: string,
  topic: string,
  papers: PaperCitation[],
  ragPostCount: number,
  webCitations: string[],
  source: ResearchResult['source']
): ResearchResult {
  const result: ResearchResult = {
    topic,
    keyFacts: [],
    misconceptions: [],
    faqs: [],
    paperSummaries: [],
    webCitations,
    ragPostCount,
    formattedCC: '',
    source,
  }

  // 섹션별 파싱
  const sections: Record<string, string> = {}
  const sectionPattern = /\[([A-Z_]+)\]\s*\n([\s\S]*?)(?=\n\[[A-Z_]+\]|$)/g
  let match: RegExpExecArray | null
  while ((match = sectionPattern.exec(rawText)) !== null) {
    sections[match[1]] = match[2].trim()
  }

  // KEY_FACTS
  if (sections['KEY_FACTS']) {
    result.keyFacts = extractBulletItems(sections['KEY_FACTS'])
  }

  // MISCONCEPTIONS
  if (sections['MISCONCEPTIONS']) {
    result.misconceptions = extractBulletItems(sections['MISCONCEPTIONS'])
  }

  // FAQS
  if (sections['FAQS']) {
    result.faqs = extractBulletItems(sections['FAQS']).map(q =>
      q.replace(/^Q:\s*/i, '').trim()
    )
  }

  // PAPER_FINDINGS
  if (sections['PAPER_FINDINGS'] && papers.length > 0) {
    const findings = extractBulletItems(sections['PAPER_FINDINGS'])
    for (const finding of findings) {
      const pmidMatch = finding.match(/\[PMID:(\d+)\]\s*(.+)/)
      if (pmidMatch) {
        const paper = papers.find(p => p.pmid === pmidMatch[1])
        if (paper) {
          result.paperSummaries.push({
            citation: `${paper.authors} (${paper.year})`,
            keyFinding: pmidMatch[2].trim(),
            pmid: paper.pmid,
          })
        }
      }
    }
    // PMID 매칭 안 된 논문도 추가
    for (const paper of papers) {
      if (!result.paperSummaries.find(ps => ps.pmid === paper.pmid)) {
        result.paperSummaries.push({
          citation: `${paper.authors} (${paper.year})`,
          keyFinding: paper.title,
          pmid: paper.pmid,
        })
      }
    }
  }

  // 파싱 실패 시 fallback: rawText에서 bullet 추출
  if (result.keyFacts.length === 0 && result.faqs.length === 0) {
    const lines = rawText.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('Q:'))
    result.keyFacts = lines.slice(0, 5).map(l => l.replace(/^[-*]\s*/, '').trim())
    result.faqs = lines.slice(5, 10).map(l => l.replace(/^[-*Q:]\s*/i, '').trim()).filter(Boolean)
  }

  return result
}

// ── 불릿 아이템 추출 ──
function extractBulletItems(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^[-*•]\s*/, '').trim())
    .filter(line => line.length > 0)
}

// ── CC 텍스트 포맷 ──
function formatResearchCC(result: ResearchResult): string {
  const parts: string[] = []

  const sourceLabel = result.source === 'perplexity' ? '🌐 Perplexity'
    : result.source === 'gemini' ? '🤖 Gemini' : '📄 PubMed'
  parts.push(`📚 리서치: ${result.topic} (${sourceLabel})`)
  parts.push('')

  if (result.keyFacts.length > 0) {
    parts.push('🔬 핵심 팩트:')
    for (const fact of result.keyFacts) {
      parts.push(`- ${fact}`)
    }
    parts.push('')
  }

  if (result.misconceptions.length > 0) {
    parts.push('🤔 흔한 오해:')
    for (const m of result.misconceptions) {
      parts.push(`- ${m}`)
    }
    parts.push('')
  }

  if (result.faqs.length > 0) {
    parts.push('❓ 자주 묻는 질문:')
    for (const q of result.faqs) {
      parts.push(`- ${q}`)
    }
    parts.push('')
  }

  if (result.paperSummaries.length > 0) {
    parts.push('📎 논문:')
    for (let i = 0; i < result.paperSummaries.length; i++) {
      const ps = result.paperSummaries[i]
      parts.push(`[${i + 1}] ${ps.citation} - ${ps.keyFinding}`)
    }
    parts.push('')
  }

  if (result.webCitations.length > 0) {
    parts.push('🔗 웹 출처:')
    for (let i = 0; i < Math.min(result.webCitations.length, 5); i++) {
      parts.push(`[${i + 1}] ${result.webCitations[i]}`)
    }
    parts.push('')
  }

  if (result.ragPostCount > 0) {
    parts.push(`📝 기존 유사글 ${result.ragPostCount}건 참조 가능`)
  }

  return parts.join('\n')
}

// ── 메인 함수: 리서치 CC 생성 ──
export async function generateResearchCC(
  topic: string,
  clinicName?: string
): Promise<ResearchResult> {
  const cacheKey = `research:${topic}:${clinicName || 'all'}`

  return withCache(cacheKey, async () => {
    console.log(`[Research] Starting research for "${topic}"`)

    // 1. PubMed + RAG 병렬 검색
    const [papersResult, ragResult] = await Promise.allSettled([
      searchPubMed(topic, 5),
      findSimilarPosts(topic, undefined, 3),
    ])

    const papers = papersResult.status === 'fulfilled' ? papersResult.value : []
    const ragPosts = ragResult.status === 'fulfilled' ? ragResult.value : []

    console.log(`[Research] PubMed: ${papers.length} papers, RAG: ${ragPosts.length} posts`)

    // 2. LLM으로 리서치 브리프 생성 (Perplexity → Gemini → Fallback)
    const prompt = buildResearchPrompt(topic, papers, ragPosts)
    const systemPrompt = '당신은 의료 전문 리서치 전문가입니다. 한국어로 응답하세요. 지정된 섹션 형식을 정확히 따르세요. 수치/통계는 출처가 확인된 것만 사용하세요.'

    let rawText = ''
    let webCitations: string[] = []
    let source: ResearchResult['source'] = 'fallback'

    // Strategy A: Perplexity sonar (웹 검색 기반, 출처 포함)
    if (process.env.PERPLEXITY_API_KEY) {
      try {
        console.log('[Research] Trying Perplexity sonar...')
        const pplxResult = await callPerplexitySonar(systemPrompt, prompt)
        rawText = pplxResult.text
        webCitations = pplxResult.citations
        source = 'perplexity'
        console.log(`[Research] Perplexity response: ${rawText.length} chars, ${webCitations.length} citations`)
      } catch (error) {
        console.error('[Research] Perplexity call failed:', error)
      }
    }

    // Strategy B: Gemini Flash fallback (Perplexity 실패 또는 미설정 시)
    if (!rawText && process.env.GEMINI_API_KEY) {
      try {
        console.log('[Research] Falling back to Gemini Flash...')
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
        })
        const llmResult = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: {
            role: 'user',
            parts: [{ text: systemPrompt }]
          },
        })
        rawText = llmResult.response.text()
        source = 'gemini'
        console.log(`[Research] Gemini response: ${rawText.length} chars`)
      } catch (error) {
        console.error('[Research] Gemini call failed:', error)
      }
    }

    // Strategy C: PubMed-only fallback (LLM 모두 실패 시)
    if (!rawText) {
      console.log('[Research] All LLMs failed, using PubMed-only fallback')
      rawText = buildFallbackResponse(topic, papers)
      source = 'fallback'
    }

    // 3. 응답 파싱
    const result = parseResearchResponse(rawText, topic, papers, ragPosts.length, webCitations, source)

    // 4. CC 포맷 생성
    result.formattedCC = formatResearchCC(result)

    return result
  }, CACHE_TTL.KEYWORD) // 30분 캐시
}

// ── LLM 모두 실패 시 Fallback ──
function buildFallbackResponse(topic: string, papers: PaperCitation[]): string {
  const lines: string[] = []

  lines.push('[KEY_FACTS]')
  lines.push(`- "${topic}" 관련 PubMed 논문 ${papers.length}건 검색됨`)
  if (papers.length > 0) {
    for (const p of papers) {
      lines.push(`- ${p.title} (${p.journal}, ${p.year})`)
    }
  }

  lines.push('')
  lines.push('[MISCONCEPTIONS]')
  lines.push('- (LLM 응답 실패로 자동 생성 불가)')

  lines.push('')
  lines.push('[FAQS]')
  lines.push(`- Q: ${topic}에 대해 자주 묻는 질문은?`)

  if (papers.length > 0) {
    lines.push('')
    lines.push('[PAPER_FINDINGS]')
    for (const p of papers) {
      lines.push(`- [PMID:${p.pmid}] ${p.title}`)
    }
  }

  return lines.join('\n')
}
