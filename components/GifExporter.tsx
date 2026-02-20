'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { encode } from 'modern-gif'

interface GifExporterProps {
  stageRef: React.RefObject<Konva.Stage | null>
  canvasSize: { w: number; h: number }
  bgDataUrl: string
  onClose: () => void
}

type GifMode = 'beforeAfter' | 'annotationBlink' | 'annotationMotion'

interface CapturedFrame {
  data: CanvasImageSource
  delay: number
}

type LayerDragTarget = 'before' | 'after'
type LayerDragMode = 'move' | 'resize'
type LayerResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

interface LayerDragState {
  target: LayerDragTarget
  mode: LayerDragMode
  handle?: LayerResizeHandle
  startClientX: number
  startClientY: number
  startLayer: BeforeAfterLayerConfig
}

interface BeforeAfterLayerConfig {
  url: string
  x: number
  y: number
  width: number
  height: number
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  naturalWidth: number
  naturalHeight: number
  framePreset?: FramePreset
}

interface MotionNodeState {
  node: Konva.Node
  x: number
  y: number
  opacity: number
  scaleX?: number
  scaleY?: number
  dashOffset?: number
  points?: number[]
}

const MOTION_FRAME_COUNT = 10

type FramePreset = 'free' | '1:1' | '4:3' | '16:9' | '3:4' | '9:16'

const FRAME_PRESET_OPTIONS: Array<{ value: FramePreset; label: string; ratio: number | null }> = [
  { value: 'free', label: '자유 비율', ratio: null },
  { value: '1:1', label: '정사각형 (1:1)', ratio: 1 },
  { value: '4:3', label: '가로형 (4:3)', ratio: 4 / 3 },
  { value: '16:9', label: '와이드 (16:9)', ratio: 16 / 9 },
  { value: '3:4', label: '세로형 (3:4)', ratio: 3 / 4 },
  { value: '9:16', label: '세로형 (9/16)', ratio: 9 / 16 },
]

function isArrowNode(node: Konva.Node): node is Konva.Arrow {
  return node.getClassName() === 'Arrow'
}

function getLineDashValues(node: Konva.Node): number[] {
  if (node.getClassName() !== 'Line') return []

  const target = node as Konva.Line
  if (typeof target.dash !== 'function') return []

  const values = target.dash()
  return Array.isArray(values) ? values : []
}

function isDashedLineNode(node: Konva.Node): node is Konva.Line {
  const values = getLineDashValues(node)
  return values.length > 0
}

function isLineNode(node: Konva.Node): node is Konva.Line {
  return node.getClassName() === 'Line'
}

function isFreeLineNode(node: Konva.Node): node is Konva.Line {
  if (!isLineNode(node)) return false
  return getLineDashValues(node).length === 0
}

function isTextNode(node: Konva.Node): node is Konva.Text {
  return node.getClassName() === 'Text'
}

function isEllipseNode(node: Konva.Node): node is Konva.Ellipse {
  return node.getClassName() === 'Ellipse'
}

function isLogoNode(node: Konva.Node): node is Konva.Image {
  return node.getClassName() === 'Image'
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function captureStageFrame(stage: Konva.Stage, delay: number): CapturedFrame {
  const canvas = stage.toCanvas({ pixelRatio: 1 })
  return {
    data: canvas,
    delay,
  }
}

export default function GifExporter({ stageRef, canvasSize, bgDataUrl, onClose }: GifExporterProps) {
  const [mode, setMode] = useState<GifMode>('annotationBlink')
  const [delay, setDelay] = useState(1000)
  const [dissolveSeconds, setDissolveSeconds] = useState(1.0)
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState('')
  const [beforeAfterOpacity, setBeforeAfterOpacity] = useState(65)
  const previewAreaRef = useRef<HTMLDivElement | null>(null)
  const previewCanvasRef = useRef<HTMLDivElement | null>(null)
  const previewScaleRef = useRef(1)
  const [beforeAfterCanvasSize, setBeforeAfterCanvasSize] = useState({ width: 320, height: 180 })
  const [activeDragTarget, setActiveDragTarget] = useState<LayerDragTarget | null>(null)
  const dragStateRef = useRef<LayerDragState | null>(null)
  const beforeLayerRef = useRef<BeforeAfterLayerConfig | null>(null)
  const afterLayerRef = useRef<BeforeAfterLayerConfig | null>(null)

  const [beforeLayer, setBeforeLayer] = useState<BeforeAfterLayerConfig | null>(null)
  const [afterLayer, setAfterLayer] = useState<BeforeAfterLayerConfig | null>(null)

  const [animateArrows, setAnimateArrows] = useState(true)
  const [animateDottedLines, setAnimateDottedLines] = useState(true)
  const [animateTexts, setAnimateTexts] = useState(true)
  const [animateLogos, setAnimateLogos] = useState(true)
  const [animateFreeLines, setAnimateFreeLines] = useState(true)
  const [animateEllipses, setAnimateEllipses] = useState(true)
  const [motionStrength, setMotionStrength] = useState(100)

  const beforeInputRef = useRef<HTMLInputElement>(null)
  const afterInputRef = useRef<HTMLInputElement>(null)
  const beforeImageRef = useRef<HTMLImageElement | null>(null)
  const afterImageRef = useRef<HTMLImageElement | null>(null)
  const hasInitializedFromBg = useRef(false)
  const lastBgDataUrl = useRef('')

  const dissolveFrames = useMemo(() => Math.max(2, Math.round(dissolveSeconds * 10)), [dissolveSeconds])

  const loadImage = useCallback((url: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  }, [])

  const getFramePresetRatio = useCallback((preset?: FramePreset) => {
    const selected = preset ?? 'free'
    const option = FRAME_PRESET_OPTIONS.find((item) => item.value === selected)
    return option?.ratio
  }, [])

  const clampLayerGeometry = useCallback((next: BeforeAfterLayerConfig): BeforeAfterLayerConfig => {
    const maxCanvasW = Math.max(1, Math.round(canvasSize.w * 2))
    const maxCanvasH = Math.max(1, Math.round(canvasSize.h * 2))
    const width = clamp(Math.round(next.width), 20, maxCanvasW)
    const height = clamp(Math.round(next.height), 20, maxCanvasH)
    const x = clamp(Math.round(next.x), -canvasSize.w, canvasSize.w)
    const y = clamp(Math.round(next.y), -canvasSize.h, canvasSize.h)

    return {
      ...next,
      x,
      y,
      width,
      height,
      cropX: clamp(Math.round(next.cropX), 0, Math.max(0, next.naturalWidth - 1)),
      cropY: clamp(Math.round(next.cropY), 0, Math.max(0, next.naturalHeight - 1)),
      cropWidth: clamp(Math.round(next.cropWidth), 1, Math.max(1, next.naturalWidth)),
      cropHeight: clamp(Math.round(next.cropHeight), 1, Math.max(1, next.naturalHeight)),
    }
  }, [canvasSize])

  const enforcePresetDimensions = useCallback((next: BeforeAfterLayerConfig): BeforeAfterLayerConfig => {
    const ratio = getFramePresetRatio(next.framePreset)
    if (!ratio || !Number.isFinite(ratio)) {
      return next
    }

    const maxCanvasW = Math.max(1, Math.round(canvasSize.w * 2))
    const maxCanvasH = Math.max(1, Math.round(canvasSize.h * 2))

    let width = clamp(Math.round(next.width), 20, maxCanvasW)
    let height = clamp(Math.round(width / ratio), 20, maxCanvasH)

    if (height > maxCanvasH) {
      height = maxCanvasH
      width = clamp(Math.round(height * ratio), 20, maxCanvasW)
    }

    return {
      ...next,
      width,
      height,
    }
  }, [canvasSize, getFramePresetRatio])

  const applyAutoCrop = useCallback(
    (next: BeforeAfterLayerConfig, image: HTMLImageElement): BeforeAfterLayerConfig => {
      if (!image.naturalWidth || !image.naturalHeight || !next.width || !next.height) {
        return next
      }

      const ratio = getFramePresetRatio(next.framePreset) ?? (next.width / next.height)
      if (!ratio || !Number.isFinite(ratio)) return next

      let cropX = 0
      let cropY = 0
      let cropWidth = image.naturalWidth
      let cropHeight = image.naturalHeight

      const sourceRatio = image.naturalWidth / image.naturalHeight

      if (sourceRatio > ratio) {
        cropHeight = image.naturalHeight
        cropWidth = Math.max(1, Math.round(image.naturalHeight * ratio))
        cropX = Math.max(0, Math.round((image.naturalWidth - cropWidth) / 2))
      } else {
        cropWidth = image.naturalWidth
        cropHeight = Math.max(1, Math.round(image.naturalWidth / ratio))
        cropY = Math.max(0, Math.round((image.naturalHeight - cropHeight) / 2))
      }

      cropWidth = clamp(cropWidth, 1, image.naturalWidth)
      cropHeight = clamp(cropHeight, 1, image.naturalHeight)
      cropX = clamp(cropX, 0, Math.max(0, image.naturalWidth - cropWidth))
      cropY = clamp(cropY, 0, Math.max(0, image.naturalHeight - cropHeight))

      return {
        ...next,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
      }
    },
    [getFramePresetRatio],
  )

  const normalizeLayer = useCallback(
    (next: BeforeAfterLayerConfig, image: HTMLImageElement | null): BeforeAfterLayerConfig => {
      const resolved = enforcePresetDimensions(clampLayerGeometry({
        ...next,
        framePreset: next.framePreset ?? 'free',
      }))
      if (!image) return resolved
      return applyAutoCrop(resolved, image)
    },
    [applyAutoCrop, clampLayerGeometry, enforcePresetDimensions],
  )

  const normalizeAfterUpload = useCallback(
    (url: string, image: HTMLImageElement): BeforeAfterLayerConfig => {
      const fitScale = Math.min(
        1,
        canvasSize.w > 0 ? canvasSize.w / image.naturalWidth : 1,
        canvasSize.h > 0 ? canvasSize.h / image.naturalHeight : 1,
      )

      const width = Math.max(20, Math.round(image.naturalWidth * fitScale))
      const height = Math.max(20, Math.round(image.naturalHeight * fitScale))

      return normalizeLayer(
        {
          url,
          x: Math.round((canvasSize.w - width) / 2),
          y: Math.round((canvasSize.h - height) / 2),
          width,
          height,
          cropX: 0,
          cropY: 0,
          cropWidth: image.naturalWidth,
          cropHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          framePreset: 'free',
        },
        image,
      )
    },
    [canvasSize, normalizeLayer],
  )

  const updateLayer = useCallback(
    (
      target: 'before' | 'after',
      patch: Partial<Omit<BeforeAfterLayerConfig, 'naturalWidth' | 'naturalHeight' | 'url'>>,
    ) => {
      const currentImageRef = target === 'before' ? beforeImageRef.current : afterImageRef.current

      if (target === 'before') {
        setBeforeLayer((prev) => {
          if (!prev) return prev
          const nextFramePreset = patch.framePreset ?? prev.framePreset ?? 'free'
          return normalizeLayer(
            {
              ...prev,
              ...patch,
              framePreset: nextFramePreset,
            } as BeforeAfterLayerConfig,
            currentImageRef,
          )
        })
        return
      }

      setAfterLayer((prev) => {
        if (!prev) return prev
          const nextFramePreset = patch.framePreset ?? prev.framePreset ?? 'free'
          return normalizeLayer(
            {
              ...prev,
              ...patch,
              framePreset: nextFramePreset,
            } as BeforeAfterLayerConfig,
            currentImageRef,
          )
      })
    },
    [normalizeLayer],
  )

  const updateFramePreset = useCallback(
    (target: 'before' | 'after', framePreset: FramePreset) => {
      updateLayer(target, { framePreset })
    },
    [updateLayer],
  )

  const initializeBeforeFromBg = useCallback(async () => {
    if (lastBgDataUrl.current !== bgDataUrl) {
      lastBgDataUrl.current = bgDataUrl
      hasInitializedFromBg.current = false
      setBeforeLayer(null)
      setAfterLayer(null)
      setProgress('')
      beforeLayerRef.current = null
      afterLayerRef.current = null
      beforeImageRef.current = null
      afterImageRef.current = null
    }

    if (hasInitializedFromBg.current || !bgDataUrl) return
    hasInitializedFromBg.current = true

    try {
      const image = await loadImage(bgDataUrl)
      beforeImageRef.current = image
      setBeforeLayer(normalizeAfterUpload(bgDataUrl, image))
      setProgress('')
    } catch {
      setProgress('기본 이미지 로딩에 실패했습니다.')
    }
  }, [bgDataUrl, loadImage, normalizeAfterUpload])

  useEffect(() => {
    initializeBeforeFromBg()
  }, [initializeBeforeFromBg])

  useEffect(() => {
    beforeLayerRef.current = beforeLayer
  }, [beforeLayer])

  useEffect(() => {
    afterLayerRef.current = afterLayer
  }, [afterLayer])

  useEffect(() => {
    if (!previewAreaRef.current || typeof ResizeObserver === 'undefined') {
      return
    }

    const update = () => {
      const rect = previewAreaRef.current?.getBoundingClientRect()
      if (!rect) return
      setBeforeAfterCanvasSize({
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(previewAreaRef.current)
    return () => observer.disconnect()
  }, [])

  const previewScale = useMemo(() => {
    const maxW = Math.max(1, beforeAfterCanvasSize.width)
    const maxH = Math.max(1, beforeAfterCanvasSize.height)
    const ratioX = maxW / Math.max(1, canvasSize.w)
    const ratioY = maxH / Math.max(1, canvasSize.h)
    return Math.min(ratioX, ratioY)
  }, [beforeAfterCanvasSize.height, beforeAfterCanvasSize.width, canvasSize.h, canvasSize.w])

  const previewRenderSize = useMemo(() => ({
    width: Math.max(1, Math.round(canvasSize.w * previewScale)),
    height: Math.max(1, Math.round(canvasSize.h * previewScale)),
  }), [canvasSize.h, canvasSize.w, previewScale])

  useEffect(() => {
    previewScaleRef.current = previewScale
  }, [previewScale])

  const handleLayerPointerDown = useCallback(
    (
      target: LayerDragTarget,
      mode: LayerDragMode,
      e: React.PointerEvent<HTMLElement>,
      handle?: LayerResizeHandle,
    ) => {
      const layer = target === 'before' ? beforeLayerRef.current : afterLayerRef.current
      if (!layer) return

      if (!previewCanvasRef.current) return

      e.preventDefault()
      e.stopPropagation()
      setActiveDragTarget(target)
      dragStateRef.current = {
        target,
        mode,
        handle,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startLayer: { ...layer },
      }

      try {
        previewCanvasRef.current?.setPointerCapture(e.pointerId)
      } catch {
        // no-op
      }
    },
    [],
  )

  const handleLayerPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const state = dragStateRef.current
    if (!state) return

    const scale = previewScaleRef.current || 1
    const dx = (e.clientX - state.startClientX) / scale
    const dy = (e.clientY - state.startClientY) / scale
    const base = state.startLayer

    if (state.mode === 'move') {
      updateLayer(state.target, {
        x: Math.round(base.x + dx),
        y: Math.round(base.y + dy),
      })
      return
    }

    if (!state.handle) return

    const minDimension = 20
    const maxDimensionW = Math.max(minDimension, Math.round(canvasSize.w * 2))
    const maxDimensionH = Math.max(minDimension, Math.round(canvasSize.h * 2))
    const right = base.x + base.width
    const bottom = base.y + base.height
    let x = base.x
    let y = base.y
    let width = clamp(Math.round(base.width - 0), minDimension, maxDimensionW)
    let height = clamp(Math.round(base.height - 0), minDimension, maxDimensionH)

    if (state.handle === 'nw') {
      width = clamp(Math.round(base.width - dx), minDimension, maxDimensionW)
      height = clamp(Math.round(base.height - dy), minDimension, maxDimensionH)
      x = right - width
      y = bottom - height
    } else if (state.handle === 'ne') {
      width = clamp(Math.round(base.width + dx), minDimension, maxDimensionW)
      height = clamp(Math.round(base.height - dy), minDimension, maxDimensionH)
      x = base.x
      y = bottom - height
    } else if (state.handle === 'sw') {
      width = clamp(Math.round(base.width - dx), minDimension, maxDimensionW)
      height = clamp(Math.round(base.height + dy), minDimension, maxDimensionH)
      x = right - width
      y = base.y
    } else if (state.handle === 'se') {
      width = clamp(Math.round(base.width + dx), minDimension, maxDimensionW)
      height = clamp(Math.round(base.height + dy), minDimension, maxDimensionH)
      x = base.x
      y = base.y
    }

    updateLayer(state.target, {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
      })
  }, [canvasSize.h, canvasSize.w, updateLayer])

  const handleLayerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current) {
      dragStateRef.current = null
      setActiveDragTarget(null)
    }

    try {
      if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
        previewCanvasRef.current.releasePointerCapture(e.pointerId)
      }
    } catch {
      // no-op
    }
  }, [])

  const handleFileUpload = useCallback(
    (target: 'before' | 'after') => {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (ev) => {
          const url = ev.target?.result as string
          if (!url) return
          try {
            const image = await loadImage(url)
            const next = normalizeAfterUpload(url, image)
            if (target === 'before') {
              beforeImageRef.current = image
              setBeforeLayer(next)
              setProgress('')
            } else {
              afterImageRef.current = image
              setAfterLayer(next)
              setProgress('')
            }
          } catch {
            setProgress('이미지 업로드에 실패했습니다.')
          } finally {
            e.target.value = ''
          }
        }

        reader.readAsDataURL(file)
      }
    },
    [loadImage, normalizeAfterUpload],
  )

  const drawConfiguredImage = useCallback((ctx: CanvasRenderingContext2D, layer: BeforeAfterLayerConfig, image: HTMLImageElement, opacity: number) => {
    const srcW = image.naturalWidth
    const srcH = image.naturalHeight
    const sx = clamp(Math.round(layer.cropX), 0, Math.max(0, srcW - 1))
    const sy = clamp(Math.round(layer.cropY), 0, Math.max(0, srcH - 1))
    const sw = clamp(Math.round(layer.cropWidth), 1, Math.max(1, srcW - sx))
    const sh = clamp(Math.round(layer.cropHeight), 1, Math.max(1, srcH - sy))

    ctx.globalAlpha = clamp(opacity, 0, 1)
    ctx.drawImage(
      image,
      sx,
      sy,
      sw,
      sh,
      Math.round(layer.x),
      Math.round(layer.y),
      Math.round(layer.width),
      Math.round(layer.height),
    )
    ctx.globalAlpha = 1
  }, [])

  const renderBeforeAfterFrame = useCallback(
    (beforeAlpha: number, afterAlpha: number): CanvasImageSource => {
      const canvas = document.createElement('canvas')
      canvas.width = canvasSize.w
      canvas.height = canvasSize.h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Canvas context is not available')
      }

      if (beforeLayer && beforeImageRef.current) {
        drawConfiguredImage(ctx, beforeLayer, beforeImageRef.current, beforeAlpha)
      }

      if (afterLayer && afterImageRef.current) {
        drawConfiguredImage(ctx, afterLayer, afterImageRef.current, afterAlpha)
      }

      return canvas
    },
    [afterLayer, beforeLayer, canvasSize.h, canvasSize.w, drawConfiguredImage],
  )

  const generateAnnotationBlink = useCallback(async () => {
    const stage = stageRef.current
    if (!stage) return

    const annotationLayer = stage.findOne('#annotations') as Konva.Layer | undefined
    if (!annotationLayer) {
      throw new Error('주석 레이어를 찾을 수 없습니다.')
    }

    setProgress('GIF를 생성하고 있습니다...')

    annotationLayer.show()
    stage.draw()
    const frameWithAnnotations = captureStageFrame(stage, delay)

    annotationLayer.hide()
    stage.draw()
    const frameWithoutAnnotations = captureStageFrame(stage, delay)

    annotationLayer.show()
    stage.draw()

    setProgress('GIF 파일을 인코딩 중...')

    const blob = await encode({
      width: stage.width(),
      height: stage.height(),
      looped: true,
      loopCount: 0,
      format: 'blob',
      frames: [frameWithAnnotations, frameWithoutAnnotations],
    })

    return blob
  }, [stageRef, delay])

  const generateAnnotationMotion = useCallback(async () => {
    const stage = stageRef.current
    if (!stage) return

    const annotationLayer = stage.findOne('#annotations') as Konva.Layer | undefined
    if (!annotationLayer) {
      throw new Error('주석 레이어를 찾을 수 없습니다.')
    }

    const motionDelay = Math.max(50, Math.round(delay / MOTION_FRAME_COUNT))
    const motionScale = Math.max(0.4, motionStrength / 100)
  const candidateNodes = (annotationLayer.getChildren() as Konva.Node[])
      .filter((node) => (
        (animateArrows && isArrowNode(node))
        || (animateDottedLines && isDashedLineNode(node))
        || (animateFreeLines && isFreeLineNode(node))
        || (animateTexts && isTextNode(node))
        || (animateLogos && isLogoNode(node))
        || (animateEllipses && isEllipseNode(node))
      ))

    if (!candidateNodes.length) {
      throw new Error('움직임 대상이 없습니다. 항목을 하나 이상 선택해 주세요.')
    }

    setProgress('움직임 프레임을 준비합니다...')

    const states: MotionNodeState[] = candidateNodes.map((node: Konva.Node) => {
      const state: MotionNodeState = {
        node,
        x: node.x(),
        y: node.y(),
        opacity: node.opacity(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      }

      if (isDashedLineNode(node)) {
        state.dashOffset = node.dashOffset()
      }

      if (isArrowNode(node)) {
        state.points = node.points()
      }

      if (isFreeLineNode(node)) {
        state.points = node.points()
      }

      return state
    })

    const frames: CapturedFrame[] = []

    for (let index = 0; index < MOTION_FRAME_COUNT; index += 1) {
      const phase = (index / MOTION_FRAME_COUNT) * Math.PI * 2
      states.forEach((state) => {
        if (isArrowNode(state.node)) {
          const points = state.points ?? state.node.points()
          const dx = (points[2] ?? 0) - (points[0] ?? 0)
          const dy = (points[3] ?? 0) - (points[1] ?? 0)
          const length = Math.hypot(dx, dy) || 1
          const ux = dx / length
          const uy = dy / length
          const shift = Math.sin(phase) * (4 * motionScale)
          state.node.x(state.x + ux * shift)
          state.node.y(state.y + uy * shift)
          state.node.opacity(Math.max(0.45, state.opacity * (0.75 + 0.25 * Math.cos(phase))))
          return
        }

        if (isDashedLineNode(state.node)) {
          const cycle = getLineDashValues(state.node).reduce((acc, value) => acc + value, 0) || 16
          state.node.dashOffset((state.dashOffset ?? 0) + (index / MOTION_FRAME_COUNT) * cycle * (2 * motionScale))
          state.node.opacity(Math.max(0.5, state.opacity * (0.8 + 0.2 * Math.sin(phase + Math.PI / 3))))
          return
        }

        if (isFreeLineNode(state.node)) {
          state.node.x(state.x + Math.sin(phase) * (2 * motionScale))
          state.node.y(state.y + Math.cos(phase) * (1.5 * motionScale))
          state.node.opacity(Math.max(0.35, state.opacity * (0.65 + 0.35 * Math.sin(phase + Math.PI / 2))))
          return
        }

        if (isTextNode(state.node)) {
          state.node.opacity(Math.max(0.35, state.opacity * (0.65 + 0.35 * Math.sin(phase + Math.PI / 2))))
          state.node.y(state.y + Math.sin(phase) * (1.6 * motionScale))
          return
        }

        if (isEllipseNode(state.node)) {
          const pulseX = 1 + Math.sin(phase) * (0.08 * motionScale)
          const pulseY = 1 + Math.cos(phase) * (0.08 * motionScale)
          state.node.scaleX((state.scaleX ?? 1) * pulseX)
          state.node.scaleY((state.scaleY ?? 1) * pulseY)
          state.node.opacity(Math.max(0.5, state.opacity * (0.8 + 0.2 * Math.sin(phase + Math.PI / 3))))
          return
        }

        if (isLogoNode(state.node)) {
          const pulse = 1 + Math.sin(phase) * (0.08 * motionScale)
          state.node.scaleX((state.scaleX ?? 1) * pulse)
          state.node.scaleY((state.scaleY ?? 1) * pulse)
          state.node.opacity(Math.max(0.5, state.opacity * (0.8 + 0.2 * Math.cos(phase))))
        }
      })

      stage.draw()
      frames.push(captureStageFrame(stage, motionDelay))
    }

    states.forEach((state) => {
      state.node.x(state.x)
      state.node.y(state.y)
      state.node.opacity(state.opacity)
      if (typeof state.scaleX === 'number') {
        state.node.scaleX(state.scaleX)
      }
      if (typeof state.scaleY === 'number') {
        state.node.scaleY(state.scaleY)
      }
      if (typeof state.dashOffset === 'number' && isDashedLineNode(state.node)) {
        state.node.dashOffset(state.dashOffset)
      }
    })
    stage.draw()

      setProgress('GIF 파일을 인코딩 중...')

    const blob = await encode({
      width: stage.width(),
      height: stage.height(),
      looped: true,
      loopCount: 0,
      format: 'blob',
      frames,
    })

    return blob
  }, [
    stageRef,
    animateArrows,
    animateDottedLines,
    animateFreeLines,
    animateEllipses,
    animateTexts,
    animateLogos,
    delay,
    motionStrength,
  ])

  const generateBeforeAfter = useCallback(async () => {
    if (!beforeLayer || !afterLayer) return
    if (!beforeImageRef.current || !afterImageRef.current) return

    setProgress('Before/After 프레임을 준비하고 있습니다...')

    const transitionDelay = 100
    const holdDelay = delay
    const frames: CapturedFrame[] = []

    const fade = [] as Array<{ before: number; after: number }>
    for (let idx = 0; idx < dissolveFrames; idx += 1) {
      const ratio = (idx + 1) / (dissolveFrames + 1)
      const crossRatio = (1 - Math.cos(Math.PI * ratio)) / 2
      fade.push({ before: 1 - crossRatio, after: crossRatio })
    }

    frames.push({ data: renderBeforeAfterFrame(1, 0), delay: holdDelay })
    fade.forEach((item) => {
      frames.push({ data: renderBeforeAfterFrame(item.before, item.after), delay: transitionDelay })
    })
    frames.push({ data: renderBeforeAfterFrame(0, 1), delay: holdDelay })
    fade.forEach((item) => {
      frames.push({ data: renderBeforeAfterFrame(item.after, item.before), delay: transitionDelay })
    })
    frames.push({ data: renderBeforeAfterFrame(1, 0), delay: holdDelay })

    setProgress('GIF 파일을 인코딩 중...')

    const blob = await encode({
      width: canvasSize.w,
      height: canvasSize.h,
      looped: true,
      loopCount: 0,
      format: 'blob',
      frames,
    })

    return blob
  }, [afterLayer, beforeLayer, canvasSize, dissolveFrames, delay, renderBeforeAfterFrame])

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setProgress('작업 중...')

    try {
      let blob: Blob | undefined
      if (mode === 'annotationBlink') {
        blob = await generateAnnotationBlink()
      } else if (mode === 'annotationMotion') {
        blob = await generateAnnotationMotion()
      } else {
        blob = await generateBeforeAfter()
      }

      if (!blob) {
        setProgress('출력 파일이 생성되지 않았습니다.')
        return
      }

      setProgress('다운로드 준비 중...')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.download = `gif_${Date.now()}.gif`
      link.href = url
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setProgress('완료')
      setTimeout(() => onClose(), 800)
    } catch (err) {
      console.error('GIF generation failed:', err)
      setProgress('오류: ' + (err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'))
    } finally {
      setIsGenerating(false)
    }
  }, [mode, generateAnnotationBlink, generateAnnotationMotion, generateBeforeAfter, onClose])

  const hasMotionTargets = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return false

    const annotationLayer = stage.findOne('#annotations') as Konva.Layer | undefined
    if (!annotationLayer) return false

    const candidateNodes = (annotationLayer.getChildren() as Konva.Node[])
      .filter((node) => (
        (animateArrows && isArrowNode(node))
        || (animateDottedLines && isDashedLineNode(node))
        || (animateFreeLines && isFreeLineNode(node))
        || (animateTexts && isTextNode(node))
        || (animateLogos && isLogoNode(node))
        || (animateEllipses && isEllipseNode(node))
      ))

    return candidateNodes.length > 0
  }, [animateArrows, animateDottedLines, animateEllipses, animateFreeLines, animateTexts, animateLogos, stageRef])

  const canGenerate = mode === 'beforeAfter'
    ? !!beforeLayer && !!afterLayer
    : mode === 'annotationMotion'
      ? !!stageRef.current && hasMotionTargets()
      : !!stageRef.current

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[96vw] max-w-[1200px] max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-900 mb-4">GIF 내보내기</h2>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode('annotationBlink')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              mode === 'annotationBlink'
                ? 'bg-purple-50 border-purple-300 text-purple-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            주석 깜빡임
            <p className="text-xs mt-0.5 opacity-70">표시/비표시 토글</p>
          </button>
          <button
            type="button"
            onClick={() => setMode('annotationMotion')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              mode === 'annotationMotion'
                ? 'bg-purple-50 border-purple-300 text-purple-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            주석 애니메이션
            <p className="text-xs mt-0.5 opacity-70">선택한 항목만 움직임</p>
          </button>
          <button
            type="button"
            onClick={() => setMode('beforeAfter')}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
              mode === 'beforeAfter'
                ? 'bg-purple-50 border-purple-300 text-purple-700'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Before / After
            <p className="text-xs mt-0.5 opacity-70">강제 크로스 디졸브 전환</p>
          </button>
        </div>

        {mode === 'beforeAfter' && (
          <div className="mb-4 space-y-4 xl:grid xl:grid-cols-[1.1fr_1fr] xl:gap-4 xl:space-y-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Before 이미지</label>
                <input
                  ref={beforeInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload('before')}
                />
                <div
                  onClick={() => beforeInputRef.current?.click()}
                  className="h-28 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-50 overflow-hidden"
                >
                  {beforeLayer ? (
                    <img src={beforeLayer.url} alt="Before" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm text-gray-400">Before 이미지를 업로드하세요</span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">After 이미지</label>
                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload('after')}
                />
                <div
                  onClick={() => afterInputRef.current?.click()}
                  className="h-28 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-50 overflow-hidden"
                >
                  {afterLayer ? (
                    <img src={afterLayer.url} alt="After" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm text-gray-400">After 이미지를 업로드하세요</span>
                  )}
                </div>
                {!afterLayer ? (
                  <p className="text-xs text-amber-600 mt-1">After 이미지를 업로드하면 생성이 가능합니다.</p>
                ) : null}
              </div>
            </div>

            <div className="p-3 border rounded-lg bg-slate-100 xl:col-span-2">
              <div className="text-xs font-semibold text-slate-900 mb-2">겹쳐보기 미리보기</div>
              <p className="text-[11px] text-gray-500 mb-2">
                이미지 위를 클릭해 드래그로 이동, 모서리 핸들로 크기를 조정할 수 있습니다.
              </p>
              <div ref={previewAreaRef} className="mb-2 bg-black/10 border-2 border-black/70 rounded-lg h-56 overflow-hidden">
                <div
                  ref={previewCanvasRef}
                  className="relative h-full mx-auto touch-none overflow-hidden"
                  style={{
                    width: `${previewRenderSize.width}px`,
                    height: `${previewRenderSize.height}px`,
                  }}
                  onPointerMove={handleLayerPointerMove}
                  onPointerUp={handleLayerPointerUp}
                  onPointerCancel={handleLayerPointerUp}
                  onPointerLeave={handleLayerPointerUp}
                >
                  <div
                    className="pointer-events-none absolute inset-1 border-2 border-black rounded-sm bg-black/[0.03]"
                    aria-hidden="true"
                  />
                  {beforeLayer ? (
                    <div
                      className={`absolute select-none border border-emerald-400/60 bg-white/20 cursor-move overflow-hidden ${activeDragTarget === 'before' ? 'ring-2 ring-emerald-400' : ''}`}
                      style={{
                        left: `${beforeLayer.x * previewScale}px`,
                        top: `${beforeLayer.y * previewScale}px`,
                        width: `${Math.max(20, beforeLayer.width) * previewScale}px`,
                        height: `${Math.max(20, beforeLayer.height) * previewScale}px`,
                      }}
                      onPointerDown={(e) => handleLayerPointerDown('before', 'move', e)}
                    >
                        <img
                          src={beforeLayer.url}
                          alt="Before"
                          className="absolute pointer-events-none"
                          style={{
                            width: `${beforeLayer.naturalWidth * (previewScale * (beforeLayer.width / beforeLayer.cropWidth))}px`,
                            height: `${beforeLayer.naturalHeight * (previewScale * (beforeLayer.height / beforeLayer.cropHeight))}px`,
                            left: `${-beforeLayer.cropX * (previewScale * (beforeLayer.width / beforeLayer.cropWidth))}px`,
                            top: `${-beforeLayer.cropY * (previewScale * (beforeLayer.height / beforeLayer.cropHeight))}px`,
                          }}
                        />
                      <span
                        className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-emerald-700 rounded-full cursor-nw-resize"
                        onPointerDown={(e) => handleLayerPointerDown('before', 'resize', e, 'nw')}
                        style={{ touchAction: 'none' }}
                      />
                      <span
                        className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-emerald-700 rounded-full cursor-ne-resize"
                        onPointerDown={(e) => handleLayerPointerDown('before', 'resize', e, 'ne')}
                        style={{ touchAction: 'none' }}
                      />
                      <span
                        className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-emerald-700 rounded-full cursor-sw-resize"
                        onPointerDown={(e) => handleLayerPointerDown('before', 'resize', e, 'sw')}
                        style={{ touchAction: 'none' }}
                      />
                      <span
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-emerald-700 rounded-full cursor-se-resize"
                        onPointerDown={(e) => handleLayerPointerDown('before', 'resize', e, 'se')}
                        style={{ touchAction: 'none' }}
                      />
                    </div>
                  ) : null}

                  {afterLayer ? (
                    <div
                      className={`absolute select-none border border-blue-400/60 bg-white/10 cursor-move overflow-hidden ${activeDragTarget === 'after' ? 'ring-2 ring-blue-400' : ''}`}
                      style={{
                        left: `${afterLayer.x * previewScale}px`,
                        top: `${afterLayer.y * previewScale}px`,
                        width: `${Math.max(20, afterLayer.width) * previewScale}px`,
                        height: `${Math.max(20, afterLayer.height) * previewScale}px`,
                        opacity: beforeAfterOpacity / 100,
                      }}
                      onPointerDown={(e) => handleLayerPointerDown('after', 'move', e)}
                    >
                        <img
                          src={afterLayer.url}
                          alt="After"
                          className="absolute pointer-events-none"
                          style={{
                            width: `${afterLayer.naturalWidth * (previewScale * (afterLayer.width / afterLayer.cropWidth))}px`,
                            height: `${afterLayer.naturalHeight * (previewScale * (afterLayer.height / afterLayer.cropHeight))}px`,
                            left: `${-afterLayer.cropX * (previewScale * (afterLayer.width / afterLayer.cropWidth))}px`,
                            top: `${-afterLayer.cropY * (previewScale * (afterLayer.height / afterLayer.cropHeight))}px`,
                          }}
                        />
                      <span
                        className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-700 rounded-full cursor-nw-resize"
                        onPointerDown={(e) => handleLayerPointerDown('after', 'resize', e, 'nw')}
                        style={{ touchAction: 'none' }}
                      />
                      <span
                        className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-700 rounded-full cursor-ne-resize"
                        onPointerDown={(e) => handleLayerPointerDown('after', 'resize', e, 'ne')}
                        style={{ touchAction: 'none' }}
                      />
                      <span
                        className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-700 rounded-full cursor-sw-resize"
                        onPointerDown={(e) => handleLayerPointerDown('after', 'resize', e, 'sw')}
                        style={{ touchAction: 'none' }}
                      />
                      <span
                        className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-700 rounded-full cursor-se-resize"
                        onPointerDown={(e) => handleLayerPointerDown('after', 'resize', e, 'se')}
                        style={{ touchAction: 'none' }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="text-xs text-gray-600 block mt-2">
                After 불투명도: {beforeAfterOpacity}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={beforeAfterOpacity}
                  onChange={(e) => setBeforeAfterOpacity(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </label>
              <p className="text-[11px] text-gray-500 mt-1">드래그/조절한 값은 프레임 생성 시 즉시 적용됩니다.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {beforeLayer && (
                <div className="p-3 border rounded-lg space-y-2 bg-slate-50">
                  <div className="text-xs font-semibold">Before 설정</div>
                  <label className="text-xs text-gray-500 block">
                    X 위치: {beforeLayer.x}px
                    <input
                      type="range"
                      min={-canvasSize.w}
                      max={canvasSize.w}
                      value={beforeLayer.x}
                      onChange={(e) => updateLayer('before', { x: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </label>
                  <label className="text-xs text-gray-500 block">
                    Y 위치: {beforeLayer.y}px
                    <input
                      type="range"
                      min={-canvasSize.h}
                      max={canvasSize.h}
                      value={beforeLayer.y}
                      onChange={(e) => updateLayer('before', { y: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </label>
                  <label className="text-xs text-gray-500 block">
                    너비: {beforeLayer.width}px
                    <input
                      type="range"
                      min={20}
                      max={Math.max(20, Math.round(canvasSize.w * 2))}
                      value={beforeLayer.width}
                      onChange={(e) => updateLayer('before', { width: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </label>
                   <label className="text-xs text-gray-500 block">
                     높이: {beforeLayer.height}px
                     <input
                       type="range"
                       min={20}
                       max={Math.max(20, Math.round(canvasSize.h * 2))}
                       value={beforeLayer.height}
                       onChange={(e) => updateLayer('before', { height: Number(e.target.value) })}
                       disabled={beforeLayer.framePreset !== 'free'}
                       className={`w-full accent-purple-500 ${beforeLayer.framePreset !== 'free' ? 'opacity-50' : ''}`}
                     />
                     {beforeLayer.framePreset !== 'free' ? (
                       <span className="text-[11px] text-gray-500"> (프레임 비율 기준 자동 계산)</span>
                     ) : null}
                   </label>
  <div className="border-t pt-2 space-y-2">
    <div className="text-xs font-semibold text-gray-600">프레임 비율</div>
    <label className="text-xs text-gray-500 block">
      <select
        value={beforeLayer.framePreset ?? 'free'}
        onChange={(e) => updateFramePreset('before', e.target.value as FramePreset)}
        className="w-full px-2 py-1 border border-gray-300 rounded bg-white"
      >
        {FRAME_PRESET_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
    <p className="text-[11px] text-emerald-700">
      프레임 비율을 선택하면 이미지가 넘어가지 않도록 중앙에서 자동 크롭됩니다.
    </p>
    <p className="text-[11px] text-gray-500">
      높이는 선택한 비율 기준으로 자동 계산됩니다.
    </p>
    <button
      type="button"
      onClick={() => updateFramePreset('before', beforeLayer.framePreset ?? 'free')}
      className="text-xs px-2 py-1 rounded bg-white border border-gray-200"
    >
      크롭 재적용
    </button>
  </div>
                </div>
              )}

              {afterLayer && (
                <div className="p-3 border rounded-lg space-y-2 bg-slate-50">
                  <div className="text-xs font-semibold">After 설정</div>
                  <label className="text-xs text-gray-500 block">
                    X 위치: {afterLayer.x}px
                    <input
                      type="range"
                      min={-canvasSize.w}
                      max={canvasSize.w}
                      value={afterLayer.x}
                      onChange={(e) => updateLayer('after', { x: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </label>
                  <label className="text-xs text-gray-500 block">
                    Y 위치: {afterLayer.y}px
                    <input
                      type="range"
                      min={-canvasSize.h}
                      max={canvasSize.h}
                      value={afterLayer.y}
                      onChange={(e) => updateLayer('after', { y: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </label>
                  <label className="text-xs text-gray-500 block">
                    너비: {afterLayer.width}px
                    <input
                      type="range"
                      min={20}
                      max={Math.max(20, Math.round(canvasSize.w * 2))}
                      value={afterLayer.width}
                      onChange={(e) => updateLayer('after', { width: Number(e.target.value) })}
                      className="w-full accent-purple-500"
                    />
                  </label>
                   <label className="text-xs text-gray-500 block">
                     높이: {afterLayer.height}px
                     <input
                       type="range"
                       min={20}
                       max={Math.max(20, Math.round(canvasSize.h * 2))}
                       value={afterLayer.height}
                       onChange={(e) => updateLayer('after', { height: Number(e.target.value) })}
                       disabled={afterLayer.framePreset !== 'free'}
                       className={`w-full accent-purple-500 ${afterLayer.framePreset !== 'free' ? 'opacity-50' : ''}`}
                     />
                     {afterLayer.framePreset !== 'free' ? (
                       <span className="text-[11px] text-gray-500"> (프레임 비율 기준 자동 계산)</span>
                     ) : null}
                   </label>
  <div className="border-t pt-2 space-y-2">
    <div className="text-xs font-semibold text-gray-600">프레임 비율</div>
    <label className="text-xs text-gray-500 block">
      <select
        value={afterLayer.framePreset ?? 'free'}
        onChange={(e) => updateFramePreset('after', e.target.value as FramePreset)}
        className="w-full px-2 py-1 border border-gray-300 rounded bg-white"
      >
        {FRAME_PRESET_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
          ))}
      </select>
    </label>
    <p className="text-[11px] text-emerald-700">
      프레임 비율을 선택하면 이미지가 넘어가지 않도록 중앙에서 자동 크롭됩니다.
    </p>
    <p className="text-[11px] text-gray-500">
      높이는 선택한 비율 기준으로 자동 계산됩니다.
    </p>
    <button
      type="button"
      onClick={() => updateFramePreset('after', afterLayer.framePreset ?? 'free')}
      className="text-xs px-2 py-1 rounded bg-white border border-gray-200"
    >
      크롭 재적용
    </button>
  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-emerald-50 rounded-lg">
              <label className="text-xs font-medium text-emerald-900 block">
                크로스 디졸브 지속시간: {dissolveSeconds.toFixed(1)}초
              </label>
              <input
                type="range"
                min={0.3}
                max={5}
                step={0.1}
                value={dissolveSeconds}
                onChange={(e) => setDissolveSeconds(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
              <div className="text-xs text-emerald-700 mt-1">
                Before/After 전환 시 항상 크로스 디졸브 애니메이션이 적용됩니다.
              </div>
            </div>
          </div>
        )}

        {mode === 'annotationBlink' && (
          <div className="mb-4 p-3 bg-purple-50 rounded-lg">
            <p className="text-sm text-purple-700">
              주석 레이어를 켰다 껐다 하는 프레임으로 GIF를 만들어요.
            </p>
          </div>
        )}

        {mode === 'annotationMotion' && (
          <div className="mb-4 p-3 bg-emerald-50 rounded-lg">
            <p className="text-sm text-emerald-700">움직일 요소를 선택하고 애니메이션 대상을 켜 주세요.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-emerald-900">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={animateArrows} onChange={(e) => setAnimateArrows(e.target.checked)} />
                화살표
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={animateDottedLines} onChange={(e) => setAnimateDottedLines(e.target.checked)} />
                점선
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={animateFreeLines} onChange={(e) => setAnimateFreeLines(e.target.checked)} />
                펜
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={animateEllipses} onChange={(e) => setAnimateEllipses(e.target.checked)} />
                타원
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={animateTexts} onChange={(e) => setAnimateTexts(e.target.checked)} />
                텍스트
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={animateLogos} onChange={(e) => setAnimateLogos(e.target.checked)} />
                로고
              </label>
            </div>
            <div className="mt-3">
              <label className="text-xs font-medium text-emerald-900 block mb-1">
                모션 강도: {motionStrength}%
              </label>
              <input
                type="range"
                min={60}
                max={180}
                step={5}
                value={motionStrength}
                onChange={(e) => setMotionStrength(Number(e.target.value))}
                className="w-full accent-emerald-600"
              />
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="text-xs font-medium text-gray-500 mb-1 block">
            프레임 간격 (ms): {delay}ms
          </label>
          <input
            type="range"
            min={300}
            max={3000}
            step={100}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            className="w-full accent-purple-500"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>최소</span>
            <span>최대</span>
          </div>
        </div>

        {progress && (
          <div className="mb-4 p-2 bg-gray-50 rounded-lg text-center">
            <span className="text-sm text-gray-600">
              {isGenerating && <span className="inline-block animate-spin mr-1">◦</span>}
              {progress}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium ${
              canGenerate && !isGenerating
                ? 'bg-purple-500 text-white hover:bg-purple-600'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isGenerating ? '생성 중...' : 'GIF 다운로드'}
          </button>
        </div>
      </div>
    </div>
  )
}
