'use client'

import { FormEvent, PointerEvent, useEffect, useRef, useState } from 'react'

type SquareSize = 512 | 768 | 1024

interface SizeOption {
  value: SquareSize
  label: string
}

const SIZE_OPTIONS: SizeOption[] = [
  { value: 512, label: '512 x 512' },
  { value: 768, label: '768 x 768' },
  { value: 1024, label: '1024 x 1024' },
]

const BRUSH_PRESETS = ['#111111', '#ffffff', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b']

interface GenerateResponse {
  success: boolean
  imageUrl?: string
  error?: string
}

interface SketchImageGeneratorProps {
  onGenerated?: (imageUrl: string) => void
}

interface SketchEnhanceConfig {
  enabled: boolean
  lineContrast: number
  backgroundThreshold: number
  noiseSuppression: number
}

function pointerToCanvas(event: PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function to0To1(value: number): number {
  return clamp(value, 0, 1)
}

function estimateBackgroundLuma(imageData: ImageData, width: number, height: number): number {
  const { data } = imageData
  let sum = 0
  let count = 0
  const sampleStep = Math.max(8, Math.floor(Math.max(width, height) / 32))
  const addSample = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    sum += luma
    count += 1
  }

  for (let x = 0; x < width; x += sampleStep) {
    addSample(x, 0)
    addSample(x, height - 1)
  }
  for (let y = sampleStep; y < height - 1; y += sampleStep) {
    addSample(0, y)
    addSample(width - 1, y)
  }

  if (count === 0) return 255
  return sum / count
}

function buildSketchImage(canvas: HTMLCanvasElement, config: SketchEnhanceConfig) {
  const work = document.createElement('canvas')
  work.width = canvas.width
  work.height = canvas.height
  const ctx = work.getContext('2d')
  if (!ctx) {
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
      inkSamples: 0,
    }
  }

  ctx.drawImage(canvas, 0, 0, work.width, work.height)

  if (!config.enabled) {
    const data = ctx.getImageData(0, 0, work.width, work.height)
    let inkSamples = 0
    const { data: raw } = data
    for (let i = 0; i < raw.length; i += 20) {
      const r = raw[i]
      const g = raw[i + 1]
      const b = raw[i + 2]
      if (r < 240 || g < 240 || b < 240) inkSamples += 1
    }
    return {
      dataUrl: work.toDataURL('image/jpeg', 0.92),
      inkSamples,
    }
  }

  const source = ctx.getImageData(0, 0, work.width, work.height)
  const sourceData = source.data
  const target = ctx.createImageData(work.width, work.height)
  const targetData = target.data
  const total = work.width * work.height
  const darkMask = new Uint8Array(total)
  const bgLuma = estimateBackgroundLuma(source, work.width, work.height)

  const lineContrast = clamp(config.lineContrast, 1.1, 3.5)
  const backgroundThreshold = clamp(config.backgroundThreshold, 220, 255)
  const noiseSuppression = Math.round(clamp(config.noiseSuppression, 0, 8))
  const epsilon = 1e-6

  for (let y = 0; y < work.height; y += 1) {
    for (let x = 0; x < work.width; x += 1) {
      const i = (y * work.width + x) * 4
      const idx = y * work.width + x
      const r = sourceData[i]
      const g = sourceData[i + 1]
      const b = sourceData[i + 2]

      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      let v = 255

      if (luma < backgroundThreshold) {
        const normalizedDiff = to0To1((bgLuma - luma) / (bgLuma + epsilon))
        const darkStrength = Math.pow(normalizedDiff, 1 / lineContrast)
        v = Math.round(255 * (1 - darkStrength))
        v = clamp(v, 0, 255)
      }

      targetData[i] = v
      targetData[i + 1] = v
      targetData[i + 2] = v
      targetData[i + 3] = 255
      darkMask[idx] = v < 220 ? 1 : 0
    }
  }

  if (noiseSuppression > 0) {
    const cleaned = targetData.slice()
    for (let y = 0; y < work.height; y += 1) {
      for (let x = 0; x < work.width; x += 1) {
        const idx = y * work.width + x
        if (!darkMask[idx]) continue

        let neighbors = 0
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue
            const nx = x + ox
            const ny = y + oy
            if (nx < 0 || ny < 0 || nx >= work.width || ny >= work.height) continue
            const ni = ny * work.width + nx
            if (darkMask[ni]) neighbors += 1
          }
        }

        if (neighbors < noiseSuppression - 1) {
          const di = idx * 4
          cleaned[di] = 255
          cleaned[di + 1] = 255
          cleaned[di + 2] = 255
          darkMask[idx] = 0
        }
      }
    }
    for (let i = 0; i < targetData.length; i += 1) {
      targetData[i] = cleaned[i]
    }
  }

  let inkSamples = 0
  for (let i = 0; i < targetData.length; i += 20) {
    if (targetData[i] < 220) inkSamples += 1
  }

  ctx.putImageData(target, 0, 0)
  return {
    dataUrl: work.toDataURL('image/png'),
    inkSamples,
  }
}

export default function SketchImageGenerator({ onGenerated }: SketchImageGeneratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)

  const [isDrawing, setIsDrawing] = useState(false)
  const [brushSize, setBrushSize] = useState(8)
  const [brushColor, setBrushColor] = useState('#111111')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('cartoon, illustration, blurry, text, watermark')
  const [size, setSize] = useState<SquareSize>(768)
  const [controlScale, setControlScale] = useState(0.8)
  const [guidanceScale, setGuidanceScale] = useState(7.5)
  const [numSteps, setNumSteps] = useState(30)
  const [seed, setSeed] = useState('')
  const [enableSafetyChecker, setEnableSafetyChecker] = useState(true)
  const [generatedImage, setGeneratedImage] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')
  const [hasDrawing, setHasDrawing] = useState(false)
  const [undoStack, setUndoStack] = useState<string[]>([])
  const [enableSketchEnhance, setEnableSketchEnhance] = useState(true)
  const [sketchContrast, setSketchContrast] = useState(2.2)
  const [backgroundThreshold, setBackgroundThreshold] = useState(240)
  const [noiseSuppression, setNoiseSuppression] = useState(2)

  const initializeCanvas = (targetSize: SquareSize) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const snapshot = hasDrawing ? canvas.toDataURL('image/png') : ''

    canvas.width = targetSize
    canvas.height = targetSize
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = brushColor
    context.lineWidth = brushSize

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    contextRef.current = context

    if (!snapshot) {
      setHasDrawing(false)
      return
    }

    const image = new Image()
    image.onload = () => {
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      setHasDrawing(true)
    }
    image.src = snapshot
  }

  useEffect(() => {
    initializeCanvas(size)
  }, [size])

  useEffect(() => {
    const context = contextRef.current
    if (!context) return
    context.strokeStyle = brushColor
    context.lineWidth = brushSize
  }, [brushColor, brushSize])

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    const canvas = canvasRef.current
    const context = contextRef.current
    if (!canvas || !context) return

    const snapshot = canvas.toDataURL('image/png')
    setUndoStack((prev) => [...prev, snapshot].slice(-10))

    const point = pointerToCanvas(event, canvas)
    context.beginPath()
    context.moveTo(point.x, point.y)
    setIsDrawing(true)
    canvas.setPointerCapture(event.pointerId)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (!isDrawing) return

    const canvas = canvasRef.current
    const context = contextRef.current
    if (!canvas || !context) return

    const point = pointerToCanvas(event, canvas)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  const endDrawing = () => {
    const context = contextRef.current
    if (!context) return

    context.closePath()
    setIsDrawing(false)
    setHasDrawing(true)
  }

  const undo = () => {
    const canvas = canvasRef.current
    const context = contextRef.current
    const previous = undoStack.at(-1)
    if (!canvas || !context || !previous) return

    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      setHasDrawing(true)
    }
    image.src = previous
    setUndoStack((prev) => prev.slice(0, -1))
    if (undoStack.length <= 1) {
      setHasDrawing(false)
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const context = contextRef.current
    if (!canvas || !context) return

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    setUndoStack([])
    setHasDrawing(false)
    setGeneratedImage('')
    setError('')
  }

  const generateImage = async (event: FormEvent) => {
    event.preventDefault()

    const canvas = canvasRef.current
    if (!canvas) return

    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      setError('프롬프트를 입력해 주세요.')
      return
    }

    if (!hasDrawing) {
      setError('스케치를 먼저 그려주세요.')
      return
    }

    const normalizedCanvas = document.createElement('canvas')
    normalizedCanvas.width = Math.max(512, canvas.width)
    normalizedCanvas.height = Math.max(512, canvas.height)
    const normalizedCtx = normalizedCanvas.getContext('2d')
    if (!normalizedCtx) {
      setError('캔버스 컨텍스트를 초기화하지 못했습니다.')
      return
    }

    normalizedCtx.fillStyle = '#ffffff'
    normalizedCtx.fillRect(0, 0, normalizedCanvas.width, normalizedCanvas.height)
    normalizedCtx.drawImage(canvas, 0, 0, normalizedCanvas.width, normalizedCanvas.height)

    const prepared = buildSketchImage(normalizedCanvas, {
      enabled: enableSketchEnhance,
      lineContrast: sketchContrast,
      backgroundThreshold,
      noiseSuppression,
    })

    if (prepared.inkSamples < 30) {
      setError('스케치가 너무 연하거나 흐릿합니다. 선을 더 두껍고 진하게 다시 그려주세요.')
      return
    }

    const sketchDataUrl = prepared.dataUrl
    const parsedSeed = seed.trim() === '' ? undefined : Number(seed)

    setError('')
    setIsGenerating(true)
    setGeneratedImage('')

    try {
      const response = await fetch('/api/image-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: trimmedPrompt,
          sketchDataUrl,
          width: size,
          height: size,
          negativePrompt,
          controlScale,
          guidanceScale,
          numSteps,
          ...(typeof parsedSeed === 'number' && Number.isFinite(parsedSeed) ? { seed: Math.round(parsedSeed) } : {}),
          enableSafetyChecker,
        }),
      })

      const result = (await response.json()) as GenerateResponse
      if (!response.ok || !result.success || !result.imageUrl) {
        throw new Error(result.error || 'AI 이미지 생성에 실패했습니다.')
      }

      setGeneratedImage(result.imageUrl)
    } catch (genError) {
      setError(genError instanceof Error ? genError.message : 'AI 이미지 생성에 실패했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const download = () => {
    if (!generatedImage) return

    const link = document.createElement('a')
    link.href = generatedImage
    link.download = `ai-image-${Date.now()}.png`
    link.click()
  }

  const sendToEditor = () => {
    if (!generatedImage) return
    onGenerated?.(generatedImage)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">
          AI 이미지 생성은 스케치와 프롬프트를 함께 사용해 진료/교육용 이미지를 빠르게 만들어줍니다.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-700">도구 설정</h3>
              <div className="inline-flex gap-2">
                <button
                  type="button"
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  되돌리기
                </button>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  전체 지우기
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">브러시 굵기: {brushSize}px</span>
                <input
                  type="range"
                  min={2}
                  max={24}
                  value={brushSize}
                  onChange={(event) => setBrushSize(Number(event.target.value))}
                  className="w-full"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">색상</span>
                <input
                  type="color"
                  value={brushColor}
                  onChange={(event) => setBrushColor(event.target.value)}
                  className="h-10 w-12 rounded border border-gray-300 p-0"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">캔버스 크기</span>
                <select
                  value={size}
                  onChange={(event) => setSize(Number(event.target.value) as SquareSize)}
                  className="w-full rounded-lg border border-gray-300 px-2 py-2"
                >
                  {SIZE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mb-4">
              <span className="mb-2 block text-sm text-gray-700">빠른 색상 선택</span>
              <div className="grid grid-cols-6 gap-2">
                {BRUSH_PRESETS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    aria-label={`색상 ${color}`}
                    className={`h-8 rounded-md border ${brushColor === color ? 'border-2 border-blue-600 ring-2 ring-blue-200' : 'border-gray-300'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setBrushColor(color)}
                  />
                ))}
              </div>
            </div>

            <div className="mb-4 grid gap-3">
              <label className="flex items-center justify-between text-sm">
                <span className="text-gray-700">스케치 자동 보정</span>
                <input
                  type="checkbox"
                  checked={enableSketchEnhance}
                  onChange={(event) => setEnableSketchEnhance(event.target.checked)}
                />
              </label>

              {enableSketchEnhance ? (
                <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">선명도: {sketchContrast.toFixed(1)}</span>
                    <input
                      type="range"
                      min={1.1}
                      max={3.5}
                      step={0.1}
                      value={sketchContrast}
                      onChange={(event) => setSketchContrast(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">배경 제거 임계값: {backgroundThreshold}</span>
                    <input
                      type="range"
                      min={220}
                      max={255}
                      step={1}
                      value={backgroundThreshold}
                      onChange={(event) => setBackgroundThreshold(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block text-gray-700">노이즈 제거: {noiseSuppression}</span>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={1}
                      value={noiseSuppression}
                      onChange={(event) => setNoiseSuppression(Number(event.target.value))}
                      className="w-full"
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <canvas
                ref={canvasRef}
                onPointerDown={startDrawing}
                onPointerMove={draw}
                onPointerUp={endDrawing}
                onPointerLeave={endDrawing}
                onPointerCancel={endDrawing}
                className="block h-full w-full touch-none bg-white"
                style={{ aspectRatio: '1 / 1' }}
              />
            </div>

            {!hasDrawing && <p className="mt-2 text-xs text-gray-400">펜을 눌러 스케치를 시작해 주세요.</p>}
          </div>

          <form
            onSubmit={generateImage}
            className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <label className="block text-sm text-gray-700">
              프롬프트
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="임상 설명, 모양, 각도, 조명, 재질감을 구체적으로 입력해 주세요."
                rows={4}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              />
            </label>

            <label className="block text-sm text-gray-700">
              네거티브 프롬프트 (선택)
              <input
                value={negativePrompt}
                onChange={(event) => setNegativePrompt(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Control Scale</span>
                <input
                  type="range"
                  min={0.2}
                  max={1.8}
                  step={0.05}
                  value={controlScale}
                  onChange={(event) => setControlScale(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-gray-500">{controlScale.toFixed(2)}</span>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Guidance</span>
                <input
                  type="range"
                  min={1}
                  max={20}
                  step={0.5}
                  value={guidanceScale}
                  onChange={(event) => setGuidanceScale(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-gray-500">{guidanceScale.toFixed(1)}</span>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Steps</span>
                <input
                  type="range"
                  min={8}
                  max={60}
                  value={numSteps}
                  onChange={(event) => setNumSteps(Number(event.target.value))}
                  className="w-full"
                />
                <span className="text-xs text-gray-500">{numSteps} 스텝</span>
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-gray-700">Seed (선택)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  placeholder="예: 42"
                  className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
            </div>

            <label className="text-sm inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableSafetyChecker}
                onChange={(event) => setEnableSafetyChecker(event.target.checked)}
              />
              안전 검사 허용
            </label>

            <button
              type="submit"
              disabled={isGenerating || !prompt.trim() || !hasDrawing}
              className="w-full rounded-xl bg-primary-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {isGenerating ? 'AI 이미지 생성 중...' : 'AI 이미지 생성'}
            </button>
          </form>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">생성 결과</h3>
              {generatedImage && (
                <div className="inline-flex gap-2">
                  <button
                    type="button"
                    onClick={download}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    다운로드
                  </button>
                  <button
                    type="button"
                    onClick={sendToEditor}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700"
                  >
                    에디터로 전송
                  </button>
                </div>
              )}
            </div>

            <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
              {generatedImage ? (
                <img src={generatedImage} alt="AI 생성 결과" className="h-auto w-full rounded-xl" />
              ) : (
                <p className="px-4 text-center text-sm text-gray-400">
                  이미지가 생성되면 여기에 미리보기가 표시됩니다. 프롬프트를 입력하고 스케치를 그린 뒤 생성 버튼을 눌러주세요.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
            참고: Gemini 또는 Fal API로 스케치 기반 AI 이미지를 생성합니다.
          </div>
        </div>
      </div>
    </div>
  )
}
