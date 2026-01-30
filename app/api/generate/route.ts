import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest } from 'next/server'
import { GenerateFormData, LLMModel } from '@/types'

// 데이터 파일들
import { TERM_REPLACEMENTS, FORBIDDEN_WORDS, MEDICAL_FACTS, METAPHORS, getMetaphorText } from '@/data/knowledge'
import { REQUIRED_DISCLAIMERS, getDisclaimer } from '@/data/medical-law'
import { CONTENT_RULES, generateHashtags } from '@/data/seo'
import { getSeasonHook } from '@/data/season'
import { INTRO_PATTERNS, BODY_PATTERNS, CLOSING_PATTERNS, TOPIC_PATTERNS } from '@/data/patterns'
import { generateMainKeyword, suggestSubKeywords } from '@/data/keywords'

// RAG
import { generateRAGContext } from '@/lib/sheets-rag'

// 네이버 DataLab API (검색 트렌드 + 쇼핑 인사이트)
import {
  analyzeDentalKeywordTrend,
  getMonthlyPopularKeywords,
  analyzeKeywordsComprehensive,
  KeywordAnalysisResult
} from '@/lib/naver-datalab'

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

## 글 구조 (공백 제외 약 1,500자 = 공백 포함 약 1,700~1,900자)
⚠️ 중요: 글자수를 반드시 준수하세요. 너무 길면 안 됩니다!

### 1. 제목 (25~35자)
- 치료 키워드 앞쪽 배치 (지역 키워드 없이)
- 물음표(?) 사용 시 클릭률 상승

### 2. 서문 (간결하게)
- 인사 + 공감 훅 1~2문장
- 오늘 주제 소개

### 3. Q&A 블록 (스마트블록용)
Q. [검색 의도 반영 질문]?
A. [핵심 답변 2~3문장]

### 4. 본문 섹션 (2개)
- 소제목에 이모지 (✅🔹💚)
- 각 섹션 2~3문단, 간결하게

### 5. 마무리 + 부작용 고지
${disclaimer}

## 전문용어 설명 + 비유 패턴 (중요!)
전문용어를 사용할 때는 반드시 아래 패턴을 따르세요:
"[전문용어]란 [정확한 의학적 설명]이에요. 쉽게 말해 [일상적인 비유]와 비슷하다고 생각하시면 돼요."

예시:
- "근관치료(신경치료)란 치아 내부의 감염된 신경조직을 제거하고 소독하는 치료예요. 쉽게 말해 썩은 과일 속을 깨끗이 파내는 것과 비슷해요."
- "치조골(잇몸뼈)은 치아를 지지하는 턱뼈의 일부예요. 마치 집의 기초 공사처럼 치아가 단단히 서 있게 해줘요."

## ${topic} 관련 정보
${topicPatterns.length > 0 ? topicPatterns.map(p => `- ${p}`).join('\n') : ''}

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

// 이미지 파일명에서 배치 힌트 추출
function analyzeImageNames(imageNames: string[]): string {
  if (!imageNames || imageNames.length === 0) return ''

  const analyzed = imageNames.map((name, index) => {
    const lower = name.toLowerCase()
    let hint = ''

    if (lower.includes('before') || lower.includes('전') || lower.includes('치료전')) {
      hint = '치료 전 상태'
    } else if (lower.includes('after') || lower.includes('후') || lower.includes('치료후')) {
      hint = '치료 후 상태'
    } else if (lower.includes('xray') || lower.includes('x-ray') || lower.includes('엑스레이')) {
      hint = 'X-ray 사진'
    } else if (lower.includes('ct') || lower.includes('씨티')) {
      hint = 'CT 사진'
    } else if (lower.includes('과정') || lower.includes('진행')) {
      hint = '치료 과정'
    } else {
      hint = '참고 이미지'
    }

    return `${index + 1}. ${name} → ${hint}`
  })

  return `
## 📷 이미지 배치 안내
아래 이미지들을 글의 적절한 위치에 배치해주세요.
이미지는 \`[IMAGE_${'{숫자}'}\]\` 형식으로 표시합니다.

${analyzed.join('\n')}

**배치 규칙:**
- before/치료전 이미지: 증상 설명 섹션 근처
- after/치료후 이미지: 치료 결과 섹션 근처
- X-ray/CT 이미지: 진단 설명 부분
- 과정 이미지: 치료 과정 설명 부분
- 일반 이미지: 관련 내용 근처에 자연스럽게 배치
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
  popularKeywords: string[],
  imageNames: string[]
): string {
  const imageSection = analyzeImageNames(imageNames)

  return `다음 정보를 바탕으로 치과 블로그 글을 작성해주세요.

## 입력 정보
- 치과명: ${data.clinicName}
- 지역: ${data.region}
- 원장님 이름: ${data.doctorName}
- 주제/치료: ${data.topic}
- 환자 정보: ${data.patientInfo}
- 치료 내용: ${data.treatment}
${data.photoDescription ? `- 사진 설명: ${data.photoDescription}` : ''}

## 키워드 전략 (중요!)
### 지역 키워드: "${data.region}"
- 반드시 치과명과 함께만 사용 (예: "${data.region} ${data.clinicName}", "${data.region} 치과")
- ❌ 절대 금지: "${data.region} ${data.topic}" 처럼 지역+치료를 직접 연결하지 마세요
- ❌ 부자연스러운 예: "${data.region} 임플란트는 중요해요" (X)
- ✅ 자연스러운 예: "${data.region} ${data.clinicName}에서 임플란트 치료를 받으세요" (O)

### 치료 키워드: "${data.topic}"
- 독립적으로 자연스럽게 5~7회 배치
- 서브 키워드: ${subKeywords.join(', ')} (각 2~3회)

### SEO 키워드 조합 (제목, 서문, 마무리에만 사용)
- "${data.region} ${data.clinicName}" 형태로 3~4회 배치
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

${imageSection}

## 요청사항 (필수 준수!)
1. **공백 제외 약 1,500자** (공백 포함 1,700~1,900자) - 초과 금지!
2. 치료 키워드 4~6회, 서브 키워드 각 2회 자연스럽게 배치
3. 지역 키워드는 반드시 치과명과 함께만 사용
4. **전문용어 사용 시 반드시 "정확한 설명 + 쉬운 비유" 패턴 적용**
5. 구어체 어미 (~인데요, ~거든요, ~하죠)
6. Q&A 블록 포함 (스마트블록용)
7. 부작용 고지문 포함
8. 해시태그 10개 (중복 없이)
${imageNames.length > 0 ? '9. 이미지 플레이스홀더 배치 ([IMAGE_1], [IMAGE_2])' : ''}

글 작성을 시작해주세요.`
}

// ============================================================
// LLM 스트리밍 함수 (비용 최적화 옵션 포함)
// ============================================================

// Claude API 스트리밍 (Sonnet / Haiku 선택)
async function* streamClaude(systemPrompt: string, userPrompt: string, useHaiku: boolean = false) {
  // 💰 Haiku = 빠름 + 저비용 (~10배 저렴), Sonnet = 고품질
  const modelId = useHaiku ? 'claude-3-5-haiku-20241022' : 'claude-sonnet-4-20250514'
  console.log(`[LLM] Using Claude model: ${modelId}`)

  const response = await anthropic.messages.create({
    model: modelId,
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

// OpenAI API 스트리밍 (GPT-4o / GPT-4o-mini 선택)
async function* streamOpenAI(systemPrompt: string, userPrompt: string, useMini: boolean = false) {
  // 💰 GPT-4o-mini = 빠름 + 저비용 (~15배 저렴), GPT-4o = 고품질
  const modelId = useMini ? 'gpt-4o-mini' : 'gpt-4o'
  console.log(`[LLM] Using OpenAI model: ${modelId}`)

  const response = await openai.chat.completions.create({
    model: modelId,
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

// Gemini API 스트리밍 (무료 할당량 내 사용 가능)
async function* streamGemini(systemPrompt: string, userPrompt: string) {
  console.log(`[LLM] Using Gemini model: gemini-1.5-pro`)

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

// 모델별 스트리밍 선택 (저비용 옵션 지원)
function getStreamGenerator(model: LLMModel, systemPrompt: string, userPrompt: string) {
  switch (model) {
    case 'claude-haiku':
      return streamClaude(systemPrompt, userPrompt, true) // 💰 저비용
    case 'claude':
      return streamClaude(systemPrompt, userPrompt, false)
    case 'openai-mini':
      return streamOpenAI(systemPrompt, userPrompt, true) // 💰 저비용
    case 'openai':
      return streamOpenAI(systemPrompt, userPrompt, false)
    case 'gemini':
      return streamGemini(systemPrompt, userPrompt)
    default:
      return streamClaude(systemPrompt, userPrompt, true) // 기본값 = 저비용
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: GenerateFormData = await request.json()

    // API 키 확인 (저비용 모델 포함)
    const model = data.model || 'claude-haiku' // 기본값 = 저비용 모델
    const needsAnthropicKey = model === 'claude' || model === 'claude-haiku'
    const needsOpenAIKey = model === 'openai' || model === 'openai-mini'

    if (needsAnthropicKey && !process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Claude API 키가 설정되지 않았습니다.' }), { status: 400 })
    }
    if (needsOpenAIKey && !process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API 키가 설정되지 않았습니다.' }), { status: 400 })
    }
    if (model === 'gemini' && !process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Gemini API 키가 설정되지 않았습니다.' }), { status: 400 })
    }

    // ============================================================
    // 🚀 최적화: 동기 작업 먼저 처리 (0ms)
    // ============================================================
    const seasonHook = getSeasonHook(data.topic)
    const mainKeyword = generateMainKeyword(data.region, data.topic)
    const subKeywords = suggestSubKeywords(data.topic)
    const popularKeywords = getMonthlyPopularKeywords()

    // ============================================================
    // 🚀 최적화: 비동기 API 호출 병렬 처리 (기존 순차 3-4초 → 병렬 1-2초)
    // ============================================================
    const [ragResult, keywordResult] = await Promise.allSettled([
      generateRAGContext(data.topic),
      analyzeKeywordsComprehensive(data.topic),
    ])

    // RAG 결과 처리
    const ragContext = ragResult.status === 'fulfilled'
      ? ragResult.value
      : '[기존 글 DB 참조 불가]'

    // 키워드 분석 결과 처리
    let keywordAnalysis: KeywordAnalysisResult | null = null
    let trendAnalysis = ''

    if (keywordResult.status === 'fulfilled') {
      keywordAnalysis = keywordResult.value
      trendAnalysis = keywordAnalysis.searchTrend.analysis

      if (keywordAnalysis.searchTrend.topKeyword) {
        trendAnalysis += `\n\n### 🏆 1위 인기 키워드\n`
        trendAnalysis += `**"${keywordAnalysis.searchTrend.topKeyword}"** `
        trendAnalysis += keywordAnalysis.searchTrend.direction === 'up' ? '(📈 상승 중)' :
                         keywordAnalysis.searchTrend.direction === 'down' ? '(📉 하락 중)' : '(➡️ 안정적)'
        trendAnalysis += `\n\n**SEO 점수:** ${keywordAnalysis.seoScore}/100\n`
      }

      if (keywordAnalysis.recommendations.length > 0) {
        trendAnalysis += `\n### 💡 키워드 전략 추천\n`
        trendAnalysis += keywordAnalysis.recommendations.join('\n')
      }

      // 쇼핑 인사이트 추가 (해당되는 경우)
      if (keywordAnalysis.shoppingTrend.available) {
        trendAnalysis += `\n\n### 🛒 쇼핑 인사이트\n${keywordAnalysis.shoppingTrend.analysis}`
      }
    } else {
      // Promise.allSettled에서 rejected된 경우
      console.error('Keyword analysis error:', keywordResult.status === 'rejected' ? keywordResult.reason : 'unknown')
      trendAnalysis = '[키워드 트렌드 분석 불가]'
    }

    // 해시태그 미리 생성
    const hashtags = generateHashtags(mainKeyword, subKeywords, data.region, data.topic)

    // 이미지 파일명 추출
    const imageNames = data.images?.map(img => img.name) || []

    // 프롬프트 빌드
    const systemPrompt = buildSystemPrompt(data.topic)
    const userPrompt = buildUserPrompt(data, mainKeyword, subKeywords, hashtags, seasonHook, ragContext, trendAnalysis, popularKeywords, imageNames)

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
