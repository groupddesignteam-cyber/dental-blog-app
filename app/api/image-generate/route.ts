import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const GEMINI_PRIMARY_MODEL = (process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image').trim()
const GEMINI_FALLBACK_MODELS = (process.env.GEMINI_IMAGE_FALLBACK_MODELS || '')
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean)

const OPENAI_IMAGE_EDIT_ENDPOINT = 'https://api.openai.com/v1/images/edits'
const OPENAI_EDIT_MODEL = 'dall-e-2'

const FAL_MODEL = 'fal-ai/fast-sdxl-controlnet-canny'
const FAL_API_ENDPOINT = `https://queue.fal.run/${FAL_MODEL}`
const FAL_STATUS_BASE = `https://queue.fal.run/${FAL_MODEL}`

const GEMINI_KEY = process.env.GEMINI_API_KEY
const OPENAI_KEY = process.env.OPENAI_API_KEY
const FAL_KEY = process.env.FAL_KEY
const MIN_SKETCH_BASE64_LENGTH = 2500

interface ImageRequest {
  prompt: string
  sketchDataUrl?: string
  width?: number
  height?: number
  negativePrompt?: string
  controlScale?: number
  guidanceScale?: number
  numSteps?: number
  seed?: number
  enableSafetyChecker?: boolean
}

interface ImageGenerateResponse {
  success: boolean
  imageUrl?: string
  error?: string
}

interface QueueSubmitResponse {
  request_id?: string
  status_url?: string
}

interface FalImage {
  url?: string
}

interface QueueStatusResponse {
  status?: string
  images?: FalImage[]
  response?: {
    images?: FalImage[]
    [key: string]: unknown
  }
  output?: {
    images?: FalImage[]
  }
}

interface OpenAIImage {
  url?: string
}

interface OpenAIImageResponse {
  data?: OpenAIImage[]
}

interface GeminiInlineData {
  mimeType?: string
  mime_type?: string
  data?: string
}

interface GeminiPart {
  text?: string
  inlineData?: GeminiInlineData
  inline_data?: GeminiInlineData
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[]
    }
  }>
}

const DEFAULT_SIZE = { width: 768, height: 768 }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function toSafeDimension(value?: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const aligned = Math.round(value / 8) * 8
  if (aligned < 256) return 256
  if (aligned > 2048) return 2048
  return aligned
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, value))
}

function toSafeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function cleanPrompt(prompt: string): string {
  const p = prompt.trim()
  return p.length > 0 ? p : 'A detailed medical and clinical illustration'
}

function hasDataUrl(dataUrl?: string): boolean {
  return !!(dataUrl && dataUrl.startsWith('data:image/') && dataUrl.includes('base64,'))
}

function isSketchPayloadTooSmall(dataUrl: string): boolean {
  try {
    const { base64 } = splitDataUrl(dataUrl)
    return base64.length < MIN_SKETCH_BASE64_LENGTH
  } catch {
    return true
  }
}

function composePrompt(prompt: string, negativePrompt?: string): string {
  const base = cleanPrompt(prompt)
  const negative = negativePrompt?.trim()
  if (!negative) return base
  return `${base}\n\nNegative prompt: ${negative}`
}

function toOpenAISize(width: number, height: number): '512x512' | '1024x1024' {
  const maxDim = Math.max(width, height)
  if (maxDim <= 512) return '512x512'
  return '1024x1024'
}

function extractDataUrl(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    throw new Error('Invalid sketch data URL.')
  }

  const header = dataUrl.substring(0, commaIndex)
  const base64 = dataUrl.substring(commaIndex + 1)
  const typeMatch = /data:([^;]+);base64/.exec(header)
  const type = typeMatch?.[1] || 'image/png'
  const buffer = Buffer.from(base64, 'base64')
  return new Blob([buffer], { type })
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) throw new Error('Invalid sketch data URL.')
  const header = dataUrl.substring(0, commaIndex)
  const base64 = dataUrl.substring(commaIndex + 1)
  const typeMatch = /data:([^;]+);base64/.exec(header)
  return {
    mimeType: typeMatch?.[1] || 'image/png',
    base64,
  }
}

function extractImageUrl(result: QueueStatusResponse): string | null {
  const images = result.response?.images || result.images || result.output?.images
  const first = images?.[0]
  return first?.url ?? null
}

function extractOpenAIImageUrl(result: OpenAIImageResponse): string | null {
  return result.data?.[0]?.url ?? null
}

function extractGeminiImageDataUrl(result: GeminiResponse): string | null {
  const parts =
    result.candidates
      ?.flatMap((candidate) => candidate.content?.parts || [])
      .filter(Boolean) || []

  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data
    const base64 = inlineData?.data
    if (!base64) continue
    const mimeType = inlineData?.mimeType || inlineData?.mime_type || 'image/png'
    return `data:${mimeType};base64,${base64}`
  }

  return null
}

function isCompleted(statusPayload: QueueStatusResponse): boolean {
  const status = (statusPayload.status || '').toUpperCase()
  return status === 'COMPLETED' || status === 'SUCCEEDED' || status === 'DONE' || status === 'FINISHED'
}

function isFailed(statusPayload: QueueStatusResponse): boolean {
  const status = (statusPayload.status || '').toUpperCase()
  return status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED' || status === 'TIMED_OUT'
}

function isOpenAIBillingHardLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('billing_hard_limit_reached') || msg.includes('billing hard limit has been reached')
}

function isGeminiInvalidSketchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message.toLowerCase()
  return msg.includes('unable to process input image') || msg.includes('invalid_argument')
}

async function generateWithGemini(finalPrompt: string, width: number, height: number, sketchDataUrl: string): Promise<string> {
  const maxDimension = Math.max(width, height)
  const sizeHint = `Render as a square image around ${maxDimension}x${maxDimension}px.`

  const parts: Array<Record<string, unknown>> = [{ text: `${finalPrompt}\n\n${sizeHint}` }]
  const sketch = splitDataUrl(sketchDataUrl)
  parts.push({
    inlineData: {
      mimeType: sketch.mimeType,
      data: sketch.base64,
    },
  })

  const models = [GEMINI_PRIMARY_MODEL, ...GEMINI_FALLBACK_MODELS]
    .filter((m, index, arr) => arr.indexOf(m) === index)

  const errors: string[] = []

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    const response = await fetch(`${endpoint}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts }],
      }),
    })

    const responseText = await response.text()
    if (!response.ok) {
      let reason = responseText
      try {
        const parsed = JSON.parse(responseText) as { error?: { message?: string } }
        reason = parsed.error?.message || reason
      } catch {
        // keep raw text
      }
      errors.push(`${model} (${response.status}): ${reason}`)
      continue
    }

    const result = JSON.parse(responseText) as GeminiResponse
    const imageDataUrl = extractGeminiImageDataUrl(result)
    if (!imageDataUrl) {
      errors.push(`${model}: response did not include an image`)
      continue
    }

    return imageDataUrl
  }

  const modelNotFound = errors.length > 0 && errors.every((err) => err.includes('(404):'))
  if (modelNotFound) {
    throw new Error('Gemini 모델 호출 실패: 기본 모델 또는 fallback 모델이 유효하지 않거나 응답 형식이 다릅니다. 모델 설정값: ' + models.join(', '))
  }

  throw new Error(`gemini generation failed: ${errors.join(' | ')}`)
}

async function submitToFalQueue(payload: Record<string, unknown>): Promise<QueueSubmitResponse> {
  const response = await fetch(FAL_API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`fal queue submit failed (${response.status}): ${text}`)
  }

  return (await response.json()) as QueueSubmitResponse
}

async function waitForFalResult(requestId: string, statusUrl?: string): Promise<QueueStatusResponse> {
  const statusEndpoint = statusUrl ?? `${FAL_STATUS_BASE}/requests/${requestId}/status`
  const completedEndpoint = statusUrl ?? `${FAL_STATUS_BASE}/requests/${requestId}`
  let lastStatus = ''

  for (let i = 0; i < 180; i += 1) {
    await sleep(1000)

    const statusResponse = await fetch(statusEndpoint, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    })
    if (!statusResponse.ok) {
      throw new Error(`fal status check failed (${statusResponse.status})`)
    }

    const statusPayload = (await statusResponse.json()) as QueueStatusResponse
    if (statusPayload.status) lastStatus = statusPayload.status

    if (isCompleted(statusPayload)) {
      if (
        statusPayload.images?.length ||
        statusPayload.response?.images?.length ||
        statusPayload.output?.images?.length
      ) {
        return statusPayload
      }

      const completedResponse = await fetch(completedEndpoint, {
        headers: { Authorization: `Key ${FAL_KEY}` },
      })
      if (!completedResponse.ok) {
        throw new Error(`fal result request failed (${completedResponse.status})`)
      }
      const completedPayload = (await completedResponse.json()) as QueueStatusResponse
      if (
        completedPayload.images?.length ||
        completedPayload.response?.images?.length ||
        completedPayload.output?.images?.length
      ) {
        return completedPayload
      }
    }

    if (isFailed(statusPayload)) {
      throw new Error(`fal job failed (status: ${lastStatus || statusPayload.status})`)
    }
  }

  throw new Error(`fal timeout: last status ${lastStatus}`)
}

async function generateWithFal(
  prompt: string,
  negativePrompt: string,
  width: number,
  height: number,
  sketchDataUrl: string,
  controlScale: number,
  guidanceScale: number,
  numSteps: number,
  seed: number,
  enableSafetyChecker: boolean,
): Promise<string> {
  const queued = await submitToFalQueue({
    prompt,
    negative_prompt: negativePrompt,
    control_image_url: sketchDataUrl,
    controlnet_conditioning_scale: controlScale,
    image_size: { width, height },
    guidance_scale: guidanceScale,
    num_inference_steps: numSteps,
    num_images: 1,
    enable_safety_checker: enableSafetyChecker,
    ...(Number.isFinite(seed) ? { seed: Math.round(seed) } : {}),
  } satisfies Record<string, unknown>)

  if (!queued.request_id && !queued.status_url) {
    throw new Error('fal response missing request id and status url.')
  }

  const result = await waitForFalResult(queued.request_id ?? '', queued.status_url)
  const imageUrl = extractImageUrl(result)
  if (!imageUrl) {
    throw new Error('fal result did not include an image URL.')
  }
  return imageUrl
}

async function generateWithOpenAIByEdit(
  finalPrompt: string,
  width: number,
  height: number,
  sketchDataUrl: string,
): Promise<string> {
  const sketchBlob = extractDataUrl(sketchDataUrl)
  const formData = new FormData()
  formData.append('image', sketchBlob, 'sketch.png')
  formData.append('model', OPENAI_EDIT_MODEL)
  formData.append('prompt', finalPrompt)
  formData.append('n', '1')
  formData.append('size', toOpenAISize(width, height))
  formData.append('response_format', 'url')

  const response = await fetch(OPENAI_IMAGE_EDIT_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`openai edit failed (${response.status}): ${errorText}`)
  }

  const result = (await response.json()) as OpenAIImageResponse
  const imageUrl = extractOpenAIImageUrl(result)
  if (!imageUrl) {
    throw new Error('OpenAI edit response did not include an image URL.')
  }
  return imageUrl
}

async function generateImageWithOpenAI(
  finalPrompt: string,
  width: number,
  height: number,
  sketchDataUrl: string,
): Promise<string> {
  return generateWithOpenAIByEdit(finalPrompt, width, height, sketchDataUrl)
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_KEY && !OPENAI_KEY && !FAL_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            '환경변수에 GEMINI_API_KEY, OPENAI_API_KEY, FAL_KEY 중 하나 이상 등록해 주세요.',
        } satisfies ImageGenerateResponse,
        { status: 500 },
      )
    }

    const body = (await request.json().catch(() => null)) as ImageRequest | null
    if (!body) {
      return NextResponse.json(
        {
          success: false,
          error: '요청 본문이 유효하지 않습니다.',
        } satisfies ImageGenerateResponse,
        { status: 400 },
      )
    }

    const trimmedPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!trimmedPrompt) {
      return NextResponse.json(
        {
          success: false,
          error: '프롬프트를 입력해 주세요.',
        } satisfies ImageGenerateResponse,
        { status: 400 },
      )
    }

    const width = toSafeDimension(body.width) || DEFAULT_SIZE.width
    const height = toSafeDimension(body.height) || DEFAULT_SIZE.height
    const finalPrompt = composePrompt(trimmedPrompt, body.negativePrompt?.trim())
    const prompt = cleanPrompt(trimmedPrompt)
    const sketchDataUrl = typeof body.sketchDataUrl === 'string' ? body.sketchDataUrl.trim() : ''
    const hasSketch = hasDataUrl(sketchDataUrl)
    if (!hasSketch) {
      return NextResponse.json(
        {
          success: false,
          error: '입력한 스케치가 유효하지 않습니다. 스케치 이미지가 다시 로드되지 않았거나 손상됐을 수 있습니다.',
        } satisfies ImageGenerateResponse,
        { status: 400 },
      )
    }
    if (isSketchPayloadTooSmall(sketchDataUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: '스케치 데이터가 너무 작습니다. 더 굵고 넓은 라인으로 다시 스케치한 뒤 시도해주세요.'
        } satisfies ImageGenerateResponse,
        { status: 400 },
      )
    }

    const controlScale = clamp(toSafeNumber(body.controlScale, 0.8), 0.1, 2)
    const guidanceScale = clamp(toSafeNumber(body.guidanceScale, 7.5), 1, 20)
    const numInferenceSteps = Math.min(60, Math.max(8, Math.round(toSafeNumber(body.numSteps, 25))))
    const seed = toSafeNumber(body.seed, Number.NaN)
    const enableSafetyChecker = body.enableSafetyChecker !== false

    let imageUrl: string | null = null
    let lastError: unknown = null
    let geminiInvalidSketch = false

    if (GEMINI_KEY) {
      try {
        imageUrl = await generateWithGemini(finalPrompt, width, height, sketchDataUrl)
      } catch (geminiError) {
        lastError = geminiError
        geminiInvalidSketch = isGeminiInvalidSketchError(geminiError)
        console.warn('Gemini generation failed.', geminiError)
      }
    }

    if (!imageUrl && OPENAI_KEY) {
      try {
        imageUrl = await generateImageWithOpenAI(finalPrompt, width, height, sketchDataUrl)
      } catch (openAIError) {
        lastError = openAIError
        if (isOpenAIBillingHardLimitError(openAIError)) {
          console.warn('OpenAI billing limit reached, trying fal if available.', openAIError)
        } else {
          console.warn('OpenAI generation failed, trying fal if available.', openAIError)
        }
      }
    }

    if (!imageUrl && FAL_KEY) {
      try {
        imageUrl = await generateWithFal(
          prompt,
          body.negativePrompt?.trim() || 'cartoon, illustration, blurry, text',
          width,
          height,
          sketchDataUrl,
          controlScale,
          guidanceScale,
          numInferenceSteps,
          seed,
          enableSafetyChecker,
        )
      } catch (falError) {
        lastError = falError
        console.warn('fal generation failed.', falError)
      }
    }

    if (!imageUrl) {
      if (geminiInvalidSketch) {
        return NextResponse.json(
          {
            success: false,
            error: '입력한 스케치가 유효하지 않습니다. 스케치 파일을 다시 업로드해 주세요.',
          } satisfies ImageGenerateResponse,
          { status: 400 },
        )
      }

      if (isOpenAIBillingHardLimitError(lastError)) {
        return NextResponse.json(
          {
            success: false,
            error: 'OpenAI billing hard limit has been reached. Please update your OpenAI quota.',
          },
          { status: 402 },
        )
      }

      if (lastError instanceof Error) {
        throw lastError
      }
      throw new Error('No image provider succeeded.')
    }

    return NextResponse.json({ success: true, imageUrl } satisfies ImageGenerateResponse)
  } catch (error) {
    console.error('Image generation failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Image generation failed.',
      } satisfies ImageGenerateResponse,
      { status: 500 },
    )
  }
}
