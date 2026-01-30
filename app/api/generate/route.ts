import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest } from 'next/server'
import { GenerateFormData, LLMModel } from '@/types'

// 데이터 파일들
import { TERM_REPLACEMENTS, FORBIDDEN_WORDS, MEDICAL_FACTS, METAPHORS } from '@/data/knowledge'
import { REQUIRED_DISCLAIMERS, getDisclaimer } from '@/data/medical-law'
import { CONTENT_RULES, generateHashtags } from '@/data/seo'
import { getSeasonHook } from '@/data/season'
import { INTRO_PATTERNS, BODY_PATTERNS, CLOSING_PATTERNS, TOPIC_PATTERNS } from '@/data/patterns'
import { generateMainKeyword, suggestSubKeywords } from '@/data/keywords'

// RAG
import { generateRAGContext } from '@/lib/sheets-rag'

// 네이버 DataLab API
import { analyzeDentalKeywordTrend, getMonthlyPopularKeywords } from '@/lib/naver-datalab'

// LLM 클라이언트 초기화
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// 통합 시스템 프롬프트 생성
function buildSystemPrompt(topic: string): string {
  const topicPatterns = TOPIC_PATTERNS[topic] || []
  const disclaimer = getDisclaimer(topic)

  return `당신은 치과 마케팅 전문 블로그 작성 AI입니다.
의료광고법 100% 준수 + 네이버 SEO 최적화 + 검증된 글쓰기 패턴을 적용합니다.

## 페르소나
10년 차 치과 상담 실장
- 전문 용어를 쓰되, 환자가 겁먹지 않게 다정하게 설명
- 구어체 어미 필수: ~인데요, ~거든요, ~하죠, ~해요, ~드려요
- '습니다/합니다'는 50% 이하로 최소화

## 절대 금지 표현 (의료광고법 위반)
${FORBIDDEN_WORDS.join(', ')}

## 용어 치환 규칙
${Object.entries(TERM_REPLACEMENTS).map(([k, v]) => `- ${k} → ${v}`).join('\n')}

## 글 구조 (${CONTENT_RULES.totalLength.min}~${CONTENT_RULES.totalLength.max}자)

### 1. 제목 (25~35자)
- 메인 키워드 앞쪽 배치
- 물음표(?) 사용 시 클릭률 상승

### 2. 서문 패턴
인사: ${INTRO_PATTERNS.greeting[0]}
공감 훅 예시:
${INTRO_PATTERNS.empathyHooks.map(h => `- ${h}`).join('\n')}

### 3. Q&A 블록 (스마트블록용)
Q. [검색 의도 반영 질문]?
A. [핵심 답변 2~3문장, 메인키워드 포함]

### 4. 본문 섹션 (2~3개)
- 소제목에 이모지 활용 (✅🔹💚🔵)
- 설명 3~4문단, 한 줄 40자 내외
- 구어체 어미 사용

### 5. 마무리 패턴
${CLOSING_PATTERNS.summary[0]}
${CLOSING_PATTERNS.farewell[0]}

### 6. 부작용 고지 (필수)
${disclaimer}

## ${topic} 작성 시 특화 포인트
${topicPatterns.length > 0 ? topicPatterns.map(p => `- ${p}`).join('\n') : '- 정확한 정보 전달\n- 환자 공감 유도'}

## 의학적 팩트
${MEDICAL_FACTS[topic as keyof typeof MEDICAL_FACTS]
  ? JSON.stringify(MEDICAL_FACTS[topic as keyof typeof MEDICAL_FACTS], null, 2)
  : '해당 시술에 맞는 정확한 정보 제공'}

## 비유 표현 (활용 가능)
${METAPHORS[topic as keyof typeof METAPHORS] || '환자가 이해하기 쉬운 비유 사용'}

## 출력 형식
글 작성이 완료되면 아래 형식으로 출력하세요:

---METADATA_START---
{
  "title": "제목",
  "mainKeyword": "메인 키워드",
  "subKeywords": ["서브1", "서브2"],
  "hashtags": ["#해시태그1", "#해시태그2", ...],
  "charCount": 글자수
}
---METADATA_END---

---CONTENT_START---
[마크다운 형식의 본문]
---CONTENT_END---
`
}

// 사용자 프롬프트 생성
function buildUserPrompt(
  data: GenerateFormData,
  mainKeyword: string,
  subKeywords: string[],
  hashtags: string[],
  seasonHook: string,
  ragContext: string,
  trendAnalysis: string,
  popularKeywords: string[]
): string {
  return `다음 정보를 바탕으로 치과 블로그 글을 작성해주세요.

## 입력 정보
- 치과명: ${data.clinicName}
- 지역: ${data.region}
- 원장님 이름: ${data.doctorName}
- 주제/치료: ${data.topic}
- 환자 정보: ${data.patientInfo}
- 치료 내용: ${data.treatment}
${data.photoDescription ? `- 사진 설명: ${data.photoDescription}` : ''}

## 키워드 전략
- 메인 키워드: "${mainKeyword}" (5~7회 배치)
- 서브 키워드: ${subKeywords.join(', ')}
- 이번 달 인기 키워드: ${popularKeywords.join(', ')}
- 추천 해시태그: ${hashtags.join(' ')}

## 시즌 훅 (서문에 자연스럽게 활용)
"${seasonHook}"

${ragContext !== '[기존 글 DB 참조 불가]' && ragContext !== '[참조 가능한 기존 글 없음]' ? `
## 기존 글 패턴 참조
${ragContext}
` : ''}

${trendAnalysis && trendAnalysis !== '[키워드 트렌드 분석 불가]' ? `
${trendAnalysis}
` : ''}

## 요청사항
1. 1,800~2,200자 분량으로 작성
2. 메인 키워드 5~7회, 서브 키워드 각 2~3회 자연스럽게 배치
3. 구어체 어미 사용 (~인데요, ~거든요, ~하죠)
4. 스마트블록용 Q&A 포함
5. 해당 시술의 부작용 고지문 반드시 포함
6. 위에서 제안한 해시태그 10개 사용

글 작성을 시작해주세요.`
}

// Claude API 스트리밍
async function* streamClaude(systemPrompt: string, userPrompt: string) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    stream: true,
  })

  for await (const event of response) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// OpenAI API 스트리밍
async function* streamOpenAI(systemPrompt: string, userPrompt: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: true,
  })

  for await (const chunk of response) {
    const text = chunk.choices[0]?.delta?.content
    if (text) {
      yield text
    }
  }
}

// Gemini API 스트리밍
async function* streamGemini(systemPrompt: string, userPrompt: string) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    systemInstruction: systemPrompt,
  })

  const result = await model.generateContentStream(userPrompt)

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      yield text
    }
  }
}

// 모델별 스트리밍 선택
function getStreamGenerator(model: LLMModel, systemPrompt: string, userPrompt: string) {
  switch (model) {
    case 'openai':
      return streamOpenAI(systemPrompt, userPrompt)
    case 'gemini':
      return streamGemini(systemPrompt, userPrompt)
    case 'claude':
    default:
      return streamClaude(systemPrompt, userPrompt)
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: GenerateFormData = await request.json()

    // API 키 확인
    const model = data.model || 'claude'
    if (model === 'claude' && !process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Claude API 키가 설정되지 않았습니다.' }), { status: 400 })
    }
    if (model === 'openai' && !process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API 키가 설정되지 않았습니다.' }), { status: 400 })
    }
    if (model === 'gemini' && !process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Gemini API 키가 설정되지 않았습니다.' }), { status: 400 })
    }

    // 시즌 훅 가져오기
    const seasonHook = getSeasonHook(data.topic)

    // 메인/서브 키워드 생성
    const mainKeyword = generateMainKeyword(data.region, data.topic)
    const subKeywords = suggestSubKeywords(data.topic)

    // 월별 인기 키워드
    const popularKeywords = getMonthlyPopularKeywords()

    // RAG 컨텍스트 (기존 글 참조)
    let ragContext = ''
    try {
      ragContext = await generateRAGContext(data.topic)
    } catch (e) {
      ragContext = '[기존 글 DB 참조 불가]'
    }

    // 네이버 키워드 트렌드 분석
    let trendAnalysis = ''
    try {
      const { analysis } = await analyzeDentalKeywordTrend(data.topic)
      trendAnalysis = analysis
    } catch (e) {
      trendAnalysis = '[키워드 트렌드 분석 불가]'
    }

    // 해시태그 미리 생성
    const hashtags = generateHashtags(mainKeyword, subKeywords, data.region, data.topic)

    // 프롬프트 빌드
    const systemPrompt = buildSystemPrompt(data.topic)
    const userPrompt = buildUserPrompt(data, mainKeyword, subKeywords, hashtags, seasonHook, ragContext, trendAnalysis, popularKeywords)

    // 스트리밍 응답 생성
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullContent = ''

          // 모델 정보 전송
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'model', model })}\n\n`)
          )

          const generator = getStreamGenerator(model, systemPrompt, userPrompt)

          for await (const text of generator) {
            fullContent += text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'content', text })}\n\n`)
            )
          }

          // 메타데이터 파싱
          const metadataMatch = fullContent.match(
            /---METADATA_START---\s*([\s\S]*?)\s*---METADATA_END---/
          )
          const contentMatch = fullContent.match(
            /---CONTENT_START---\s*([\s\S]*?)\s*---CONTENT_END---/
          )

          let metadata = {
            title: '',
            mainKeyword: mainKeyword,
            subKeywords: subKeywords,
            hashtags: hashtags,
            charCount: 0,
          }

          if (metadataMatch) {
            try {
              const parsed = JSON.parse(metadataMatch[1])
              metadata = { ...metadata, ...parsed }
            } catch {
              // 파싱 실패 시 기본값 사용
            }
          }

          const content = contentMatch ? contentMatch[1].trim() : fullContent
          metadata.charCount = content.length

          // 최종 결과 전송
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'result',
                data: {
                  title: metadata.title,
                  content,
                  keywords: {
                    main: metadata.mainKeyword,
                    sub: metadata.subKeywords,
                  },
                  hashtags: metadata.hashtags,
                  charCount: metadata.charCount,
                  model: model,
                },
              })}\n\n`
            )
          )

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('Stream error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Generate API error:', error)
    return new Response(
      JSON.stringify({ error: '글 생성에 실패했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
