import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { SYSTEM_PROMPT, getSeasonHook } from '@/lib/prompts'
import { GenerateFormData } from '@/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: NextRequest) {
  try {
    const data: GenerateFormData = await request.json()

    const seasonHook = getSeasonHook()

    const userPrompt = `다음 정보를 바탕으로 치과 블로그 글을 작성해주세요.

## 입력 정보
- 치과명: ${data.clinicName}
- 지역: ${data.region}
- 원장님 이름: ${data.doctorName}
- 주제/치료: ${data.topic}
- 환자 정보: ${data.patientInfo}
- 치료 내용: ${data.treatment}
${data.photoDescription ? `- 사진 설명: ${data.photoDescription}` : ''}

## 시즌 훅 (서문에 자연스럽게 활용)
"${seasonHook}"

## 요청사항
1. 1,800~2,200자 분량으로 작성
2. 메인 키워드: "${data.region} ${data.topic}" (5~7회 배치)
3. 구어체 어미 사용 (~인데요, ~거든요, ~하죠)
4. 스마트블록용 Q&A 포함
5. 해당 시술의 부작용 고지문 반드시 포함
6. 해시태그 10개 생성

글 작성을 시작해주세요.`

    // 스트리밍 응답 생성
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullContent = ''

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            stream: true,
          })

          for await (const event of response) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const text = event.delta.text
              fullContent += text

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: 'content', text })}\n\n`)
              )
            }
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
            mainKeyword: `${data.region} ${data.topic}`,
            subKeywords: [] as string[],
            hashtags: [] as string[],
            charCount: 0,
          }

          if (metadataMatch) {
            try {
              metadata = JSON.parse(metadataMatch[1])
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
                },
              })}\n\n`
            )
          )

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
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
