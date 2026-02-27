'use client'


import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Stage, Layer, Arrow, Line, Text, Image as KonvaImage, Transformer, Ellipse, Rect, Group } from 'react-konva'
import Konva from 'konva'
import { AnnotationItem, EditorTool } from '@/types'
import ImageEditorToolbar from './ImageEditorToolbar'
import GifExporter from './GifExporter'

type CropRect = { x: number; y: number; w: number; h: number }
type AllItem = AnnotationItem
type PrivacyItemType = 'privacyBlur' | 'privacyMosaic' | 'grayscaleBrush'
type PrivacySnapshotItem = {
  index: number
  item: AllItem
}
const FILTER_DEBOUNCE_MS = 180
const MIN_CROP_SIZE = 20
const DEFAULT_PRIVACY_BRUSH_SIZE: Record<'blurBrush' | 'mosaicBrush' | 'grayscaleBrush' | 'aiEraseBrush', number> = {
  blurBrush: 48,
  mosaicBrush: 56,
  grayscaleBrush: 48,
  aiEraseBrush: 48,
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function normalizeCropRect(raw: CropRect, limitW: number, limitH: number): CropRect {
  const x1 = Math.min(Math.max(0, raw.x), limitW)
  const y1 = Math.min(Math.max(0, raw.y), limitH)
  const x2 = Math.min(Math.max(0, raw.x + raw.w), limitW)
  const y2 = Math.min(Math.max(0, raw.y + raw.h), limitH)
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.max(1, Math.round(Math.abs(x2 - x1))),
    h: Math.max(1, Math.round(Math.abs(y2 - y1))),
  }
}

function itemLabel(item: AllItem): string {
  if (item.name) return item.name
  if (item.type === 'logo') return '로고'
  if (item.type === 'text') return '텍스트'
  if (item.type === 'arrow') return '화살표'
  if (item.type === 'dottedLine') return '점선'
  if (item.type === 'ellipse') return '타원'
  if (item.type === 'freeLine') return '펜'
  if (item.type === 'privacyBlur') return '블러(개인정보)'
  if (item.type === 'privacyMosaic') return '모자이크(개인정보)'
  if (item.type === 'grayscaleBrush') return '부분 흑백'
  if (item.type === 'aiEraseBrush') return 'AI 지우개'
  if (item.type === 'magnifier') return '돋보기'
  return '항목'
}

function isPrivacyItemType(type: AllItem['type']) {
  return type === 'privacyBlur' || type === 'privacyMosaic' || type === 'grayscaleBrush' || type === 'aiEraseBrush'
}

function shiftedPoints(points: number[], dx: number, dy: number): number[] {
  const out: number[] = []
  for (let i = 0; i < points.length; i += 2) {
    out.push(points[i] + dx, points[i + 1] + dy)
  }
  return out
}

function parseHexColor(hex: string): [number, number, number] | null {
  if (!hex) return null
  const normalized = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3,6}$/.test(normalized)) return null

  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized
  if (expanded.length !== 6) return null

  const r = Number.parseInt(expanded.slice(0, 2), 16)
  const g = Number.parseInt(expanded.slice(2, 4), 16)
  const b = Number.parseInt(expanded.slice(4, 6), 16)
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  return [r, g, b]
}

function createTintedLogoImage(image: HTMLImageElement, color: string): Promise<HTMLImageElement> {
  const rgb = parseHexColor(color)
  if (!rgb) return Promise.resolve(image)

  const [r, g, b] = rgb
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(image)

  ctx.drawImage(image, 0, 0)
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]
    if (alpha === 0) continue

    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
    const strength = 0.35 + lum * 0.65

    data[i] = Math.round(r * strength)
    data[i + 1] = Math.round(g * strength)
    data[i + 2] = Math.round(b * strength)
  }

  ctx.putImageData(imageData, 0, 0)
  return loadImage(canvas.toDataURL('image/png'))
}

function absoluteStrokePoints(item: AllItem): number[] {
  if (!item.points || item.points.length < 2) return []
  return shiftedPoints(item.points, item.x ?? 0, item.y ?? 0)
}

function createBlankImage(width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
    }
    resolve(loadImage(canvas.toDataURL('image/png')))
  })
}

function drawPrivacyStrokeOnCanvas(
  ctx: CanvasRenderingContext2D,
  item: AllItem,
  sx: number,
  sy: number,
  fallbackSize: number,
) {
  if (item.type !== 'privacyBlur' && item.type !== 'privacyMosaic' && item.type !== 'grayscaleBrush') return
  if (!item.points || item.points.length < 2) return

  const strokePoints = absoluteStrokePoints(item)
  if (strokePoints.length < 2) return

  const points = strokePoints.map((value, index) => (index % 2 === 0 ? value * sx : value * sy))
  const brushSize = Math.max(4, item.strokeWidth ?? fallbackSize)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = brushSize

  ctx.beginPath()
  ctx.moveTo(points[0] ?? 0, points[1] ?? 0)
  if (points.length === 2) {
    const x = points[0] ?? 0
    const y = points[1] ?? 0
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i] ?? 0, points[i + 1] ?? 0)
  }
  ctx.stroke()
}

function mergeMaskedLayer(
  targetCtx: CanvasRenderingContext2D,
  overlayCanvas: HTMLCanvasElement,
  maskCanvas: HTMLCanvasElement,
) {
  const masked = document.createElement('canvas')
  masked.width = overlayCanvas.width
  masked.height = overlayCanvas.height
  const maskedCtx = masked.getContext('2d')
  if (!maskedCtx) return

  maskedCtx.drawImage(overlayCanvas, 0, 0)
  maskedCtx.globalCompositeOperation = 'destination-in'
  maskedCtx.drawImage(maskCanvas, 0, 0)
  maskedCtx.globalCompositeOperation = 'source-over'
  targetCtx.drawImage(masked, 0, 0)
}

interface ImageEditorProps {
  initialBgDataUrl?: string
}

export default function ImageEditor({ initialBgDataUrl }: ImageEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imagesInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [canvasSize, setCanvasSize] = useState({ w: 900, h: 600 })
  const [tool, setTool] = useState<EditorTool>('select')
  const [strokeColor, setStrokeColor] = useState('#FF0000')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [dashLength, setDashLength] = useState(10)
  const [dashGap, setDashGap] = useState(5)

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null)
  const [filteredBgImage, setFilteredBgImage] = useState<HTMLImageElement | null>(null)
  const [bgDataUrl, setBgDataUrl] = useState('')
  const [isGrayscale, setIsGrayscale] = useState(false)
  const [isBlur, setIsBlur] = useState(false)
  const [blurRadius, setBlurRadius] = useState(4)
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [mosaicSize, setMosaicSize] = useState(0)
  const [privacyBrushSize, setPrivacyBrushSize] = useState(24)
  const [privacyBrushSizeByTool, setPrivacyBrushSizeByTool] = useState({
    blurBrush: DEFAULT_PRIVACY_BRUSH_SIZE.blurBrush,
    mosaicBrush: DEFAULT_PRIVACY_BRUSH_SIZE.mosaicBrush,
    grayscaleBrush: DEFAULT_PRIVACY_BRUSH_SIZE.grayscaleBrush,
    aiEraseBrush: DEFAULT_PRIVACY_BRUSH_SIZE.aiEraseBrush,
  })
  const [bgRotation, setBgRotation] = useState(0)
  const [bgFlipX, setBgFlipX] = useState(false)
  const [bgFlipY, setBgFlipY] = useState(false)

  useEffect(() => {
    if (!initialBgDataUrl) return
    if (bgDataUrl === initialBgDataUrl) return

    let cancelled = false

    const load = async () => {
      try {
        const img = await loadImage(initialBgDataUrl)
        if (cancelled) return

        setBgDataUrl(initialBgDataUrl)
        setBgImage(img)
        setFilteredBgImage(null)
        setItems([])
        clearHistory()
        clearPrivacyHistory()
        setSelectedId(null)
        setCropRect(null)
        setTool('select')
        setIsGrayscale(false)
        setIsBlur(false)
        setBlurRadius(4)
        setBrightness(100)
        setContrast(100)
        setMosaicSize(0)
        setBgRotation(0)
        setBgFlipX(false)
        setBgFlipY(false)
        setDrawingId(null)
        setIsDrawing(false)
        setDrawStart(null)
      } catch {
        // ignore load errors from external context
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [initialBgDataUrl, bgDataUrl])

  const [items, setItems] = useState<AllItem[]>([])
  const itemsRef = useRef<AllItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [history, setHistory] = useState<AllItem[][]>([])
  const [future, setFuture] = useState<AllItem[][]>([])
  const [privacyHistory, setPrivacyHistory] = useState<PrivacySnapshotItem[][]>([])
  const [privacyFuture, setPrivacyFuture] = useState<PrivacySnapshotItem[][]>([])

  const [isDrawing, setIsDrawing] = useState(false)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [drawingId, setDrawingId] = useState<string | null>(null)
  const [isErasing, setIsErasing] = useState(false)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const [cropError, setCropError] = useState('')
  const [showGifModal, setShowGifModal] = useState(false)
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null)

  const [logoImageCache, setLogoImageCache] = useState<Record<string, HTMLImageElement>>({})
  const [logoTintImageCache, setLogoTintImageCache] = useState<Record<string, HTMLImageElement>>({})

  const selectedItem = selectedId ? items.find(item => item.id === selectedId) ?? null : null
  const previewCrop = cropRect ? normalizeCropRect(cropRect, canvasSize.w, canvasSize.h) : null
  const isCropTooSmall = !!previewCrop && (previewCrop.w < MIN_CROP_SIZE || previewCrop.h < MIN_CROP_SIZE)
  const hasAnyPrivacyBrush = useMemo(
    () => items.some(item => item.type === 'privacyBlur' || item.type === 'privacyMosaic'),
    [items],
  )
  const hasAnyFilter = isGrayscale || isBlur || brightness !== 100 || contrast !== 100 || mosaicSize > 0 || hasAnyPrivacyBrush
  const hasBackground = !!bgImage
  const usageHint = useMemo(() => {
    if (!hasBackground) {
      return '시작: 배경 이미지를 먼저 업로드한 뒤 화살표/점선/타원/펜/텍스트를 추가해 보세요.'
    }
    if (tool === 'crop') {
      return '크롭 모드: 배경 위를 드래그해 영역을 지정하고 적용 버튼을 누르세요.'
    }
    if (tool === 'text') {
      return selectedItem?.type === 'text'
        ? '텍스트를 더블클릭하면 내용을 바로 수정할 수 있습니다.'
        : '텍스트 도구: 클릭해 원하는 위치에 글자를 배치하세요.'
    }
    if (tool === 'blurBrush' || tool === 'mosaicBrush') {
      return `${tool === 'blurBrush' ? '블러' : '모자이크'} 마스킹 모드: 마우스를 눌러 부위를 드래그하세요.`
    }
    if (selectedItem?.type === 'freeLine') {
      return '자유 그리기 모드에서 그린 선은 GIF 주석 애니메이션에서 움직임 효과를 적용할 수 있습니다.'
    }
    if (selectedItem?.type === 'text') {
      return '텍스트 항목은 우측 패널에서 글자 크기와 색상을 더 정밀하게 조정할 수 있습니다.'
    }
    if (selectedItem) {
      return '항목을 선택한 뒤 우측 패널에서 색상·굵기·투명도를 조정하세요.'
    }
    return '원하는 요소를 선택하고 우측 패널 또는 하단 버튼으로 PNG/GIF로 저장하세요.'
  }, [hasBackground, selectedItem, tool])
  const displayImage = filteredBgImage || bgImage || undefined
  const lastPropertyHistoryAtRef = useRef(0)
  const lastPropertyItemRef = useRef<string | null>(null)

  const clearHistory = useCallback(() => {
    setHistory([])
    setFuture([])
  }, [])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        const width = Math.max(520, containerRef.current.clientWidth)
        setCanvasSize(prev => ({ ...prev, w: width }))
      }
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    if (!bgImage) {
      setFilteredBgImage(null)
      return
    }
    if (!hasAnyFilter) {
      setFilteredBgImage(null)
      return
    }

    let cancelled = false

    async function applyFilters() {
      const image = bgImage
      if (!image) return

      const w = image.naturalWidth
      const h = image.naturalHeight
      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = w
      sourceCanvas.height = h
      const ctx = sourceCanvas.getContext('2d')
      if (!ctx) return

      const filters: string[] = []
      if (isBlur && blurRadius > 0) filters.push('blur(' + blurRadius + 'px)')
      if (isGrayscale) filters.push('grayscale(100%)')
      if (brightness !== 100) filters.push('brightness(' + brightness + '%)')
      if (contrast !== 100) filters.push('contrast(' + contrast + '%)')

      ctx.filter = filters.length > 0 ? filters.join(' ') : 'none'
      ctx.drawImage(image, 0, 0, w, h)
      ctx.filter = 'none'

      if (mosaicSize > 0) {
        const block = Math.max(2, Math.round(mosaicSize))
        const tw = Math.max(1, Math.floor(w / block))
        const th = Math.max(1, Math.floor(h / block))
        const tiny = document.createElement('canvas')
        tiny.width = tw
        tiny.height = th
        const tctx = tiny.getContext('2d')
        if (tctx) {
          tctx.imageSmoothingEnabled = false
          tctx.drawImage(sourceCanvas, 0, 0, tw, th)
          ctx.imageSmoothingEnabled = false
          ctx.clearRect(0, 0, w, h)
          ctx.drawImage(tiny, 0, 0, w, h)
          ctx.imageSmoothingEnabled = true
        }
      }

      const privacyBlurItems = items.filter(item => item.type === 'privacyBlur')
      const privacyMosaicItems = items.filter(item => item.type === 'privacyMosaic')
      const grayscaleBrushItems = items.filter(item => item.type === 'grayscaleBrush')
      const sx = w / Math.max(1, canvasSize.w)
      const sy = h / Math.max(1, canvasSize.h)

      if (grayscaleBrushItems.length > 0) {
        const grayscaleCanvas = document.createElement('canvas')
        grayscaleCanvas.width = w
        grayscaleCanvas.height = h
        const grayscaleCtx = grayscaleCanvas.getContext('2d')

        if (grayscaleCtx) {
          grayscaleCtx.filter = 'grayscale(100%)'
          grayscaleCtx.drawImage(sourceCanvas, 0, 0, w, h)
          grayscaleCtx.filter = 'none'
        }

        const grayscaleMask = document.createElement('canvas')
        grayscaleMask.width = w
        grayscaleMask.height = h
        const grayscaleMaskCtx = grayscaleMask.getContext('2d')
        if (grayscaleMaskCtx) {
          grayscaleMaskCtx.clearRect(0, 0, w, h)
          grayscaleBrushItems.forEach((item) => {
            drawPrivacyStrokeOnCanvas(grayscaleMaskCtx, item, sx, sy, privacyBrushSize)
          })
          mergeMaskedLayer(ctx, grayscaleCanvas, grayscaleMask)
        }
      }

      if (privacyBlurItems.length > 0) {
        const blurCanvas = document.createElement('canvas')
        blurCanvas.width = w
        blurCanvas.height = h
        const blurCtx = blurCanvas.getContext('2d')
        const blurPixel = Math.max(8, Math.round((privacyBrushSize / 4) + 8))

        if (blurCtx) {
          blurCtx.filter = `blur(${blurPixel}px)`
          blurCtx.drawImage(sourceCanvas, 0, 0, w, h)
          blurCtx.filter = 'none'
        }

        const blurMask = document.createElement('canvas')
        blurMask.width = w
        blurMask.height = h
        const blurMaskCtx = blurMask.getContext('2d')
        if (blurMaskCtx) {
          blurMaskCtx.clearRect(0, 0, w, h)
          privacyBlurItems.forEach((item) => {
            drawPrivacyStrokeOnCanvas(blurMaskCtx, item, sx, sy, privacyBrushSize)
          })
          mergeMaskedLayer(ctx, blurCanvas, blurMask)
        }
      }

      if (privacyMosaicItems.length > 0) {
        const blurMaxBrush = Math.max(
          privacyBrushSize,
          ...privacyMosaicItems.map(item => item.strokeWidth ?? privacyBrushSize),
        )
        const mosaicBlock = Math.max(2, Math.round(Math.max(10, blurMaxBrush * 1.5)))
        const tw = Math.max(1, Math.floor(w / mosaicBlock))
        const th = Math.max(1, Math.floor(h / mosaicBlock))

        const tiny = document.createElement('canvas')
        tiny.width = tw
        tiny.height = th
        const tctx = tiny.getContext('2d')
        if (tctx) {
          tctx.imageSmoothingEnabled = false
          tctx.drawImage(sourceCanvas, 0, 0, tw, th)

          const mosaicCanvas = document.createElement('canvas')
          mosaicCanvas.width = w
          mosaicCanvas.height = h
          const mosaicCtx = mosaicCanvas.getContext('2d')
          if (mosaicCtx) {
            mosaicCtx.imageSmoothingEnabled = false
            mosaicCtx.drawImage(tiny, 0, 0, w, h)
            mosaicCtx.imageSmoothingEnabled = true
          }

          const mosaicMask = document.createElement('canvas')
          mosaicMask.width = w
          mosaicMask.height = h
          const mosaicMaskCtx = mosaicMask.getContext('2d')
          if (mosaicMaskCtx) {
            mosaicMaskCtx.clearRect(0, 0, w, h)
            privacyMosaicItems.forEach((item) => {
              drawPrivacyStrokeOnCanvas(mosaicMaskCtx, item, sx, sy, privacyBrushSize)
            })
            mergeMaskedLayer(ctx, mosaicCanvas, mosaicMask)
          }
        }
      }

      const next = await loadImage(sourceCanvas.toDataURL('image/png'))
      if (!cancelled) {
        setFilteredBgImage(next)
      }
    }

    const timer = window.setTimeout(() => {
      applyFilters().catch(() => {
        if (!cancelled) {
          setFilteredBgImage(bgImage)
        }
      })
    }, FILTER_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [bgImage, hasAnyFilter, isGrayscale, isBlur, blurRadius, brightness, contrast, mosaicSize, items, privacyBrushSize, canvasSize.w, canvasSize.h])

  useEffect(() => {
    if (tool !== 'crop') {
      setCropRect(null)
      setCropError('')
      setDrawStart(null)
      setDrawingId(null)
      setIsDrawing(false)
    }
  }, [tool])

  useEffect(() => {
    const neededUrls = items
      .filter(item => item.type === 'logo' && item.imageUrl)
      .map(item => item.imageUrl as string)
      .filter(url => !logoImageCache[url])

    if (!neededUrls.length) return

    neededUrls.forEach(url => {
      loadImage(url).then((img) => {
        setLogoImageCache(prev => ({ ...prev, [url]: img }))
      })
    })
  }, [items, logoImageCache])

  useEffect(() => {
    const tintTargets = items
      .filter(item => item.type === 'logo' && item.imageUrl && item.fill)
      .map((item) => {
        const color = item.fill
        return { imageUrl: item.imageUrl as string, color }
      })
      .filter(({ imageUrl, color }) => parseHexColor(color ?? '') && logoImageCache[imageUrl])

    if (!tintTargets.length) return

    tintTargets.forEach(({ imageUrl, color }) => {
      if (!color) return
      const cacheKey = `${imageUrl}|${color}`
      if (logoTintImageCache[cacheKey]) return
      const sourceImage = logoImageCache[imageUrl]
      if (!sourceImage) return

      createTintedLogoImage(sourceImage, color).then((tintedImage) => {
        setLogoTintImageCache(prev => {
          if (prev[cacheKey]) return prev
          return { ...prev, [cacheKey]: tintedImage }
        })
      })
    })
  }, [items, logoImageCache, logoTintImageCache])
  const pushHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-20), [...itemsRef.current]])
    setFuture([])
  }, [])

  const clearPrivacyHistory = useCallback(() => {
    setPrivacyHistory([])
    setPrivacyFuture([])
  }, [])

  const getPrivacySnapshot = useCallback(() => {
    return itemsRef.current
      .map((item, index) => (item.type === 'privacyBlur' || item.type === 'privacyMosaic'
        ? { index, item }
        : null))
      .filter((item): item is PrivacySnapshotItem => item !== null)
  }, [])

  const restorePrivacySnapshot = useCallback((snapshot: PrivacySnapshotItem[]) => {
    const sorted = [...snapshot].sort((a, b) => a.index - b.index)
    const snapshotIds = new Set(sorted.map(item => item.item.id))

    setItems((prev) => {
      const next = prev.filter(item => item.type !== 'privacyBlur' && item.type !== 'privacyMosaic')
      let restored = [...next]

      for (const entry of sorted) {
        const insertIndex = Math.min(entry.index, restored.length)
        restored = [...restored.slice(0, insertIndex), entry.item, ...restored.slice(insertIndex)]
      }
      return restored
    })
    setSelectedId((prevSelectedId) => {
      if (!prevSelectedId) return null
      if (snapshotIds.has(prevSelectedId)) return prevSelectedId

      const current = itemsRef.current.find(item => item.id === prevSelectedId)
      if (!current) return null
      return (current.type === 'privacyBlur' || current.type === 'privacyMosaic') ? null : prevSelectedId
    })
  }, [])

  const pushPrivacyHistory = useCallback(() => {
    setPrivacyHistory(prev => [...prev.slice(-20), getPrivacySnapshot()])
    setPrivacyFuture([])
  }, [getPrivacySnapshot])

  const handleAIErase = useCallback(async () => {
    const eraseItems = items.filter(item => item.type === 'aiEraseBrush')
    if (eraseItems.length === 0 || !bgImage) return

    setIsErasing(true)
    try {
      const w = bgImage.naturalWidth
      const h = bgImage.naturalHeight

      // 1. Get original image data URL
      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = w
      sourceCanvas.height = h
      const ctx = sourceCanvas.getContext('2d')
      if (!ctx) throw new Error('Failed to create canvas')
      ctx.drawImage(bgImage, 0, 0, w, h)
      const imageBase64 = sourceCanvas.toDataURL('image/png')

      // 2. Create mask
      const maskCanvas = document.createElement('canvas')
      maskCanvas.width = w
      maskCanvas.height = h
      const maskCtx = maskCanvas.getContext('2d')
      if (!maskCtx) throw new Error('Failed to create mask canvas')

      maskCtx.fillStyle = 'black'
      maskCtx.fillRect(0, 0, w, h)

      const sx = w / Math.max(1, canvasSize.w)
      const sy = h / Math.max(1, canvasSize.h)

      eraseItems.forEach((item) => {
        drawPrivacyStrokeOnCanvas(maskCtx, item, sx, sy, privacyBrushSize)
      })

      const maskBase64 = maskCanvas.toDataURL('image/png')

      // 3. Call API
      const res = await fetch('/api/inpaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageBase64, mask: maskBase64 })
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      const json = await res.json()
      if (json.erasedImage) {
        // Load new image
        const newImage = await loadImage(json.erasedImage)

        // Update background
        setBgImage(newImage)
        // And clear the erase brushes
        setItems(prev => prev.filter(item => item.type !== 'aiEraseBrush'))
      }

    } catch (err: any) {
      alert('AI 지우개 실행 중 오류가 발생했습니다: ' + err.message)
    } finally {
      setIsErasing(false)
    }
  }, [items, bgImage, privacyBrushSize, canvasSize.w, canvasSize.h, setBgImage])

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      if (!prev.length) return prev

      const next = prev[prev.length - 1]
      const current = itemsRef.current
      setFuture((futureState) => [current, ...futureState].slice(0, 20))
      setItems(next)
      setSelectedId(null)
      return prev.slice(0, -1)
    })
  }, [])

  const handleRedo = useCallback(() => {
    setFuture((prev) => {
      if (!prev.length) return prev

      const [next, ...rest] = prev
      const current = itemsRef.current
      setItems(next)
      setHistory((historyState) => [...historyState.slice(-20), current])
      setSelectedId(null)
      return rest
    })
  }, [])

  const rotateBg = useCallback((direction: 'left' | 'right') => {
    setBgRotation((prev) => {
      const next = direction === 'left' ? prev - 90 : prev + 90
      return ((next % 360) + 360) % 360
    })
  }, [])

  const handleUploadImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleAddImages = useCallback(() => {
    imagesInputRef.current?.click()
  }, [])

  const onImageFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const url = reader.result as string
      setBgDataUrl(url)
      setIsGrayscale(false)
      setIsBlur(false)
      setBlurRadius(4)
      setBrightness(100)
      setContrast(100)
      setMosaicSize(0)
      setBgRotation(0)
      setBgFlipX(false)
      setBgFlipY(false)
      const img = await loadImage(url)
      setBgImage(img)
      setFilteredBgImage(null)
      setItems([])
      clearHistory()
      clearPrivacyHistory()
      setSelectedId(null)
      setCropRect(null)
      setTool('select')
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [])

  const handleUploadLogo = useCallback(() => {
    logoInputRef.current?.click()
  }, [])

  const onImagesFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    let currentBg = bgImage
    if (!currentBg) {
      currentBg = await createBlankImage(canvasSize.w, canvasSize.h)
      setBgImage(currentBg)
      setBgDataUrl(currentBg.src)
      setIsGrayscale(false)
      setIsBlur(false)
      setBlurRadius(4)
      setBrightness(100)
      setContrast(100)
      setMosaicSize(0)
      setBgRotation(0)
      setBgFlipX(false)
      setBgFlipY(false)
      setFilteredBgImage(null)
    }

    pushHistory()
    const newItems: AllItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file) continue
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      const img = await loadImage(url)
      setLogoImageCache(prev => ({ ...prev, [url]: img }))

      let w = img.naturalWidth
      let h = img.naturalHeight
      const maxW = canvasSize.w * 0.4
      if (w > maxW) {
        h = (h * maxW) / w
        w = maxW
      }

      newItems.push({
        id: uid(),
        type: 'image',
        x: Math.min(50 + (i * 30), canvasSize.w - maxW),
        y: Math.min(50 + (i * 30), canvasSize.h - maxW),
        width: w,
        height: h,
        imageUrl: url,
        name: `사진 ${i + 1}`,
        opacity: 1,
      })
    }

    setItems(prev => [...prev, ...newItems])
    e.target.value = ''
  }, [bgImage, canvasSize.w, canvasSize.h, pushHistory])

  const onLogoFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const url = reader.result as string
      const img = await loadImage(url)
      const width = 140
      const height = Math.max(20, Math.round(width * (img.naturalHeight / img.naturalWidth)))

      pushHistory()
      const logo: AllItem = {
        id: uid(),
        type: 'logo',
        x: 20,
        y: 20,
        width,
        height,
        imageUrl: url,
        name: '로고',
        opacity: 1,
      }
      setItems(prev => [...prev, logo])
      setSelectedId(logo.id)
      setLogoImageCache(prev => ({ ...prev, [url]: img }))
    }

    reader.readAsDataURL(file)
    e.target.value = ''
  }, [pushHistory])

  const updateSelectedItem = useCallback((updates: Partial<AllItem>) => {
    if (!selectedId) return
    const now = Date.now()
    const target = itemsRef.current.find(item => item.id === selectedId)
    const isPrivacyTarget = target ? isPrivacyItemType(target.type) : false
    if (lastPropertyItemRef.current !== selectedId || now - lastPropertyHistoryAtRef.current > 250) {
      if (isPrivacyTarget) {
        pushPrivacyHistory()
      } else {
        pushHistory()
      }
      lastPropertyHistoryAtRef.current = now
      lastPropertyItemRef.current = selectedId
    }
    setItems(prev => prev.map(item => item.id === selectedId ? { ...item, ...updates } : item))
  }, [pushHistory, pushPrivacyHistory, selectedId])

  const canTransformNode = useCallback((type: AllItem['type']) => type === 'logo' || type === 'text', [])

  const moveItem = useCallback((id: string, direction: 'up' | 'down' | 'top' | 'bottom') => {
    const target = itemsRef.current.find(item => item.id === id)
    const isPrivacy = target ? isPrivacyItemType(target.type) : false
    if (isPrivacy) {
      pushPrivacyHistory()
    } else {
      pushHistory()
    }

    setItems((prev) => {
      const idx = prev.findIndex(i => i.id === id)
      if (idx === -1) return prev

      const next = [...prev]
      const [item] = next.splice(idx, 1)
      if (!item) return prev

      if (direction === 'top') {
        next.push(item)
      } else if (direction === 'bottom') {
        next.unshift(item)
      } else if (direction === 'up' && idx < next.length) {
        next.splice(idx + 1, 0, item)
      } else if (direction === 'down' && idx > 0) {
        next.splice(idx - 1, 0, item)
      } else {
        next.splice(idx, 0, item)
      }
      return next
    })
  }, [pushHistory, pushPrivacyHistory])

  const handleDelete = useCallback(() => {
    if (!selectedId) return

    const selectedItemForDelete = itemsRef.current.find(item => item.id === selectedId)
    const isPrivacyTarget = selectedItemForDelete ? isPrivacyItemType(selectedItemForDelete.type) : false
    if (isPrivacyTarget) {
      pushPrivacyHistory()
    } else {
      pushHistory()
    }

    setItems(prev => prev.filter(item => item.id !== selectedId))
    setSelectedId(null)
  }, [pushHistory, pushPrivacyHistory, selectedId])

  const handleDragEnd = useCallback((id: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const target = itemsRef.current.find(item => item.id === id)
    const isPrivacy = target ? isPrivacyItemType(target.type) : false
    if (isPrivacy) {
      pushPrivacyHistory()
    } else {
      pushHistory()
    }

    const node = e.target
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      return {
        ...item,
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
      }
    }))
  }, [pushHistory, pushPrivacyHistory])

  const handleTransformEnd = useCallback((id: string, e: Konva.KonvaEventObject<Event>) => {
    const node = e.target as Konva.Image
    pushHistory()

    setItems(prev => prev.map(item => {
      if (item.id !== id) return item

      if (item.type === 'logo') {
        const currentW = node.width()
        const currentH = node.height()
        const sx = Math.abs(node.scaleX?.() ?? 1)
        const sy = Math.abs(node.scaleY?.() ?? 1)
        const nextW = Math.max(10, Math.round(currentW * sx))
        const nextH = Math.max(10, Math.round(currentH * sy))

        node.scaleX(1)
        node.scaleY(1)
        node.width(nextW)
        node.height(nextH)

        return {
          ...item,
          x: node.x(),
          y: node.y(),
          width: nextW,
          height: nextH,
          scaleX: 1,
          scaleY: 1,
          rotation: node.rotation(),
        }
      }

      if (item.type === 'text') {
        const sx = typeof (node as Konva.Node).scaleX === 'function'
          ? Math.abs((node as Konva.Node as { scaleX: () => number }).scaleX())
          : 1
        const sy = typeof (node as Konva.Node).scaleY === 'function'
          ? Math.abs((node as Konva.Node as { scaleY: () => number }).scaleY())
          : 1
        const nextFontSize = Math.max(10, Math.round((item.fontSize ?? 24) * Math.max(sx, sy)))

        if (typeof (node as Konva.Node).scaleX === 'function') {
          ; (node as Konva.Node as any).scaleX(1)
            ; (node as Konva.Node as any).scaleY(1)
        }

        return {
          ...item,
          x: node.x(),
          y: node.y(),
          fontSize: nextFontSize,
          rotation: node.rotation(),
        }
      }

      return item
    }))
  }, [pushHistory])

  const applyCrop = useCallback(async () => {
    if (!previewCrop || !displayImage) return
    if (previewCrop.w < MIN_CROP_SIZE || previewCrop.h < MIN_CROP_SIZE) {
      setCropError(`크롭 영역은 최소 ${MIN_CROP_SIZE}px × ${MIN_CROP_SIZE}px 이상이어야 합니다.`)
      return
    }

    setCropError('')
    const source = document.createElement('canvas')
    source.width = canvasSize.w
    source.height = canvasSize.h
    const sourceCtx = source.getContext('2d')
    if (!sourceCtx) return

    sourceCtx.save()
    sourceCtx.translate(canvasSize.w / 2, canvasSize.h / 2)
    sourceCtx.rotate((bgRotation * Math.PI) / 180)
    sourceCtx.scale(bgFlipX ? -1 : 1, bgFlipY ? -1 : 1)
    sourceCtx.drawImage(displayImage, -canvasSize.w / 2, -canvasSize.h / 2, canvasSize.w, canvasSize.h)
    sourceCtx.restore()

    const result = document.createElement('canvas')
    result.width = previewCrop.w
    result.height = previewCrop.h
    const resultCtx = result.getContext('2d')
    if (!resultCtx) return

    resultCtx.drawImage(
      source,
      previewCrop.x,
      previewCrop.y,
      previewCrop.w,
      previewCrop.h,
      0,
      0,
      previewCrop.w,
      previewCrop.h,
    )

    const url = result.toDataURL('image/png')
    const nextImg = await loadImage(url)
    const dx = previewCrop.x
    const dy = previewCrop.y

    const nextItems = itemsRef.current.map((item) => {
      if (item.points && item.points.length >= 2) {
        return {
          ...item,
          points: shiftedPoints(item.points, -dx, -dy),
        }
      }
      return {
        ...item,
        x: item.x - dx,
        y: item.y - dy,
      }
    })

    setBgImage(nextImg)
    setFilteredBgImage(null)
    setBgDataUrl(url)
    setItems(nextItems)
    clearHistory()
    clearPrivacyHistory()
    setCropRect(null)
    setTool('select')
    setCanvasSize({ w: Math.max(480, previewCrop.w), h: Math.max(320, previewCrop.h) })
    setBgRotation(0)
    setBgFlipX(false)
    setBgFlipY(false)
    setIsGrayscale(false)
    setIsBlur(false)
    setBlurRadius(4)
    setBrightness(100)
    setContrast(100)
    setMosaicSize(0)
    setSelectedId(null)
  }, [previewCrop, displayImage, canvasSize.h, canvasSize.w, bgRotation, bgFlipX, bgFlipY, clearPrivacyHistory])

  const clearCrop = useCallback(() => {
    setCropRect(null)
    setCropError('')
  }, [])

  const exportPng = useCallback(() => {
    const stage = stageRef.current
    if (!stage || !bgImage) return
    const link = document.createElement('a')
    link.download = `image_editor_${Date.now()}.png`
    link.href = stage.toDataURL({ pixelRatio: 1 })
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [bgImage])

  const handleExportClick = useCallback(() => {
    if (!bgImage) return
    setShowGifModal(true)
  }, [bgImage])

  const clearPrivacyBrushes = useCallback(() => {
    if (!hasAnyPrivacyBrush) return
    pushPrivacyHistory()
    setItems((prev) => {
      const next = prev.filter(item => item.type !== 'privacyBlur' && item.type !== 'privacyMosaic')
      if (selectedId && !next.some(item => item.id === selectedId)) {
        setSelectedId(null)
      }
      return next
    })
  }, [hasAnyPrivacyBrush, pushPrivacyHistory, selectedId])

  const handleUndoPrivacy = useCallback(() => {
    setPrivacyHistory((historyState) => {
      if (!historyState.length) return historyState

      const restoreTarget = historyState[historyState.length - 1]
      const prevState = getPrivacySnapshot()
      restorePrivacySnapshot(restoreTarget)
      setPrivacyFuture((futureState) => [prevState, ...futureState].slice(0, 20))

      return historyState.slice(0, -1)
    })
  }, [getPrivacySnapshot, restorePrivacySnapshot])

  const handleRedoPrivacy = useCallback(() => {
    setPrivacyFuture((prev) => {
      if (!prev.length) return prev

      const [next, ...rest] = prev
      const prevState = getPrivacySnapshot()

      setPrivacyHistory((historyState) => [...historyState.slice(-20), prevState])
      restorePrivacySnapshot(next)
      return rest
    })
  }, [getPrivacySnapshot, restorePrivacySnapshot])

  const editTextPrompt = useCallback((item: AllItem) => {
    const next = window.prompt('텍스트를 입력하세요', item.text || '')
    if (next === null) return
    updateSelectedItem({ text: next })
  }, [updateSelectedItem])

  const onStageMouseDown = useCallback((e: any) => {
    if (!displayImage) return
    const stage = e.target.getStage()
    if (!stage) return

    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const x = pointer.x
    const y = pointer.y

    if (tool === 'select') {
      if (e.target.attrs?.id === 'bg-image' || e.target.attrs?.id === 'crop-preview') {
        setSelectedId(null)
      }
      return
    }

    if (tool === 'text') {
      pushHistory()
      const item: AllItem = {
        id: uid(),
        type: 'text',
        x,
        y,
        text: '텍스트',
        fill: strokeColor,
        fontSize: 24,
        opacity: 1,
        name: '텍스트',
      }
      setItems(prev => [...prev, item])
      setSelectedId(item.id)
      setTool('select')
      return
    }

    if (tool === 'blurBrush' || tool === 'mosaicBrush' || tool === 'grayscaleBrush' || tool === 'aiEraseBrush') {
      const privacyType = tool === 'blurBrush' ? 'privacyBlur' : tool === 'mosaicBrush' ? 'privacyMosaic' : tool === 'grayscaleBrush' ? 'grayscaleBrush' : 'aiEraseBrush'
      pushPrivacyHistory()
      const id = uid()
      const item: AllItem = {
        id,
        type: privacyType,
        x,
        y,
        points: [0, 0],
        strokeWidth: privacyBrushSize,
        opacity: 1,
        name: tool === 'blurBrush' ? '블러 마스킹' : tool === 'mosaicBrush' ? '모자이크 마스킹' : tool === 'grayscaleBrush' ? '부분 흑백' : 'AI 지우개',
      }
      pushHistory()
      setDrawingId(id)
      setIsDrawing(true)
      setDrawStart({ x, y })
      setSelectedId(null)
      setItems(prev => [...prev, item])
      return
    }

    if (tool === 'crop') {
      setIsDrawing(true)
      setDrawStart({ x, y })
      setCropRect({ x, y, w: 0, h: 0 })
      setCropError('')
      return
    }

    if (!bgImage) return

    let item: AllItem
    const id = uid()
    if (tool === 'ellipse' || tool === 'magnifier') {
      item = {
        id,
        type: tool,
        x,
        y,
        width: 1,
        height: 1,
        stroke: strokeColor,
        strokeWidth,
        opacity: 1,
        name: tool === 'magnifier' ? '돋보기' : '타원',
      }
    } else if (tool === 'freeLine') {
      item = {
        id,
        type: 'freeLine',
        x,
        y,
        points: [0, 0],
        stroke: strokeColor,
        strokeWidth,
        opacity: 1,
        name: '펜',
      }
    } else {
      item = {
        id,
        type: tool,
        x,
        y,
        points: [0, 0, 0, 0],
        stroke: strokeColor,
        strokeWidth,
        dashLength,
        dashGap,
        opacity: 1,
        name: tool === 'arrow' ? '화살표' : '점선',
      }
    }

    pushHistory()
    setDrawingId(id)
    setIsDrawing(true)
    setDrawStart({ x, y })
    setSelectedId(id)
    setItems(prev => [...prev, item])
  }, [
    tool,
    displayImage,
    dashGap,
    dashLength,
    pushHistory,
    pushPrivacyHistory,
    strokeColor,
    strokeWidth,
    bgImage,
    privacyBrushSize,
  ])

  const onStageMouseMove = useCallback((e: any) => {
    const stage = stageRef.current
    if (stage) {
      const pos = stage.getPointerPosition()
      if (pos) {
        setBrushCursor({ x: pos.x, y: pos.y })
      }
    }

    if (!isDrawing || !drawStart) return

    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return

    if (tool === 'crop') {
      setCropRect({ x: drawStart.x, y: drawStart.y, w: pos.x - drawStart.x, h: pos.y - drawStart.y })
      setCropError('')
      return
    }

    if (!drawingId) return

    setItems(prev => prev.map((item) => {
      if (item.id !== drawingId) return item

      if (item.type === 'freeLine') {
        const baseX = item.x ?? 0
        const baseY = item.y ?? 0
        return {
          ...item,
          points: [...(item.points || []), pos.x - baseX, pos.y - baseY],
        }
      }

      if (item.type === 'privacyBlur' || item.type === 'privacyMosaic' || item.type === 'grayscaleBrush' || item.type === 'aiEraseBrush') {
        const baseX = item.x ?? 0
        const baseY = item.y ?? 0
        return {
          ...item,
          points: [...(item.points || []), pos.x - baseX, pos.y - baseY],
        }
      }

      if (item.type === 'ellipse' || item.type === 'magnifier') {
        return {
          ...item,
          width: pos.x - (item.x || 0),
          height: pos.y - (item.y || 0),
        }
      }

      if (item.type === 'arrow' || item.type === 'dottedLine') {
        const baseX = item.x ?? 0
        const baseY = item.y ?? 0
        return {
          ...item,
          points: [0, 0, pos.x - baseX, pos.y - baseY],
        }
      }

      return item
    }))
  }, [drawStart, drawingId, isDrawing, tool])

  const onStageMouseUp = useCallback(() => {
    if (!isDrawing) return

    if (tool === 'crop') {
      setIsDrawing(false)
      setDrawStart(null)
      return
    }

    if (!drawingId) {
      setIsDrawing(false)
      return
    }

    setItems(prev => prev.map((item) => {
      if (item.id !== drawingId) return item

      if (item.type === 'freeLine') {
        return (item.points ?? []).length >= 4 ? item : null
      }

      if (item.type === 'privacyBlur' || item.type === 'privacyMosaic' || item.type === 'grayscaleBrush' || item.type === 'aiEraseBrush') {
        return (item.points ?? []).length >= 2 ? item : null
      }

      if (item.type === 'ellipse' || item.type === 'magnifier') {
        return Math.abs(item.width ?? 0) >= 4 && Math.abs(item.height ?? 0) >= 4 ? item : null
      }

      if (item.type === 'arrow' || item.type === 'dottedLine') {
        const p = item.points ?? []
        const dx = (p[2] ?? 0) - (p[0] ?? 0)
        const dy = (p[3] ?? 0) - (p[1] ?? 0)
        const totalMove = Math.abs(dx) + Math.abs(dy)

        if (totalMove > 0) {
          return item
        }

        if (totalMove === 0) {
          return {
            ...item,
            points: [0, 0, 16, 0],
          }
        }

        return null
      }

      return item
    }).filter((item): item is AllItem => item !== null))

    setIsDrawing(false)
    setDrawStart(null)
    setDrawingId(null)
  }, [tool, drawingId, isDrawing])

  const handleSetTool = useCallback((nextTool: EditorTool) => {
    setTool(nextTool)
    if (nextTool === 'blurBrush' || nextTool === 'mosaicBrush' || nextTool === 'grayscaleBrush' || nextTool === 'aiEraseBrush') {
      setPrivacyBrushSize(privacyBrushSizeByTool[nextTool])
    }
  }, [privacyBrushSizeByTool])

  useEffect(() => {
    if (tool !== 'blurBrush' && tool !== 'mosaicBrush' && tool !== 'grayscaleBrush' && tool !== 'aiEraseBrush') return

    setPrivacyBrushSize(privacyBrushSizeByTool[tool])
  }, [tool, privacyBrushSizeByTool])

  const handlePrivacyBrushSize = useCallback((nextSize: number) => {
    setPrivacyBrushSize(nextSize)
    if (tool === 'blurBrush' || tool === 'mosaicBrush' || tool === 'grayscaleBrush' || tool === 'aiEraseBrush') {
      setPrivacyBrushSizeByTool(prev => ({
        ...prev,
        [tool]: nextSize,
      }))
    }
  }, [tool])

  const onStageMouseLeave = useCallback(() => {
    setBrushCursor(null)
    onStageMouseUp()
  }, [onStageMouseUp])

  useEffect(() => {
    if (tool !== 'blurBrush' && tool !== 'mosaicBrush' && tool !== 'grayscaleBrush' && tool !== 'aiEraseBrush') {
      setBrushCursor(null)
    }
  }, [tool])
  useEffect(() => {
    const stage = stageRef.current
    const transformer = transformerRef.current
    if (!stage || !transformer) return

    if (!selectedId) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }

    const selected = items.find(item => item.id === selectedId)
    if (!selected || !canTransformNode(selected.type)) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }

    const node = stage.findOne(`#${selectedId}`)
    if (!node) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }

    transformer.nodes([node])
    transformer.getLayer()?.batchDraw()
  }, [items, canTransformNode, selectedId])

  const handleApplyCollage = useCallback((layoutType: 'grid2x2' | 'splitH' | 'splitV') => {
    const imageItems = itemsRef.current.filter(item => item.type === 'image')
    const imgCount = imageItems.length
    if (imgCount === 0) return

    pushHistory()
    const nextItems = [...itemsRef.current]
    const W = canvasSize.w
    const H = canvasSize.h
    const padding = 20

    if (layoutType === 'splitH' && imgCount >= 2) {
      const id1 = imageItems[0]?.id
      const id2 = imageItems[1]?.id
      const i1 = nextItems.findIndex(i => i.id === id1)
      const i2 = nextItems.findIndex(i => i.id === id2)

      const boxW = (W - padding * 3) / 2
      const boxH = H - padding * 2

      if (i1 >= 0 && nextItems[i1]) {
        nextItems[i1] = { ...nextItems[i1], x: padding, y: padding, width: boxW, height: boxH }
      }
      if (i2 >= 0 && nextItems[i2]) {
        nextItems[i2] = { ...nextItems[i2], x: padding * 2 + boxW, y: padding, width: boxW, height: boxH }
      }
    } else if (layoutType === 'splitV' && imgCount >= 2) {
      const id1 = imageItems[0]?.id
      const id2 = imageItems[1]?.id
      const i1 = nextItems.findIndex(i => i.id === id1)
      const i2 = nextItems.findIndex(i => i.id === id2)

      const boxW = W - padding * 2
      const boxH = (H - padding * 3) / 2

      if (i1 >= 0 && nextItems[i1]) {
        nextItems[i1] = { ...nextItems[i1], x: padding, y: padding, width: boxW, height: boxH }
      }
      if (i2 >= 0 && nextItems[i2]) {
        nextItems[i2] = { ...nextItems[i2], x: padding, y: padding * 2 + boxH, width: boxW, height: boxH }
      }
    } else if (layoutType === 'grid2x2' && imgCount >= 4) {
      for (let idx = 0; idx < 4; idx++) {
        const id = imageItems[idx]?.id
        const i = nextItems.findIndex(item => item.id === id)
        if (i >= 0 && nextItems[i]) {
          const row = Math.floor(idx / 2)
          const col = idx % 2
          const boxW = (W - padding * 3) / 2
          const boxH = (H - padding * 3) / 2
          nextItems[i] = {
            ...nextItems[i],
            x: padding + col * (boxW + padding),
            y: padding + row * (boxH + padding),
            width: boxW,
            height: boxH
          }
        }
      }
    }

    setItems(nextItems)
  }, [canvasSize.h, canvasSize.w, pushHistory])

  return (
    <div className="space-y-4">
      <ImageEditorToolbar
        tool={tool}
        setTool={handleSetTool}
        strokeColor={strokeColor}
        setStrokeColor={setStrokeColor}
        strokeWidth={strokeWidth}
        setStrokeWidth={setStrokeWidth}
        dashLength={dashLength}
        setDashLength={setDashLength}
        dashGap={dashGap}
        setDashGap={setDashGap}
        isGrayscale={isGrayscale}
        setIsGrayscale={setIsGrayscale}
        isBlur={isBlur}
        setIsBlur={setIsBlur}
        blurRadius={blurRadius}
        setBlurRadius={setBlurRadius}
        brightness={brightness}
        setBrightness={setBrightness}
        contrast={contrast}
        setContrast={setContrast}
        mosaicSize={mosaicSize}
        setMosaicSize={setMosaicSize}
        onUploadImage={handleUploadImage}
        onAddImages={handleAddImages}
        onApplyCollage={handleApplyCollage}
        onUploadLogo={handleUploadLogo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onExportPng={exportPng}
        onOpenGif={handleExportClick}
        privacyBrushSize={privacyBrushSize}
        setPrivacyBrushSize={handlePrivacyBrushSize}
        onClearPrivacy={clearPrivacyBrushes}
        hasAnyPrivacyBrush={hasAnyPrivacyBrush}
        canUndoPrivacy={privacyHistory.length > 0}
        canRedoPrivacy={privacyFuture.length > 0}
        onUndoPrivacy={handleUndoPrivacy}
        onRedoPrivacy={handleRedoPrivacy}
        onRotate={rotateBg}
        onFlipHorizontal={() => setBgFlipX(prev => !prev)}
        onFlipVertical={() => setBgFlipY(prev => !prev)}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        hasBackground={hasBackground}
      />

      <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-700">
        {usageHint}
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-h-[360px]">
          <div ref={containerRef} className="relative border border-sky-100 rounded-2xl overflow-hidden bg-slate-900">
            <Stage
              width={canvasSize.w}
              height={canvasSize.h}
              ref={stageRef}
              onMouseDown={onStageMouseDown}
              onMouseMove={onStageMouseMove}
              onMouseUp={onStageMouseUp}
              onMouseLeave={onStageMouseLeave}
            >
              <Layer>
                {displayImage && (
                  <KonvaImage
                    id="bg-image"
                    image={displayImage}
                    x={canvasSize.w / 2}
                    y={canvasSize.h / 2}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    offsetX={canvasSize.w / 2}
                    offsetY={canvasSize.h / 2}
                    rotation={bgRotation}
                    scaleX={bgFlipX ? -1 : 1}
                    scaleY={bgFlipY ? -1 : 1}
                    listening={false}
                  />
                )}
              </Layer>
              <Layer id="annotations">
                {items.map((item) => {
                  const commonProps = {
                    id: item.id,
                    x: item.x,
                    y: item.y,
                    opacity: item.opacity ?? 1,
                    draggable: tool === 'select',
                    onClick: () => setSelectedId(item.id),
                    onTap: () => setSelectedId(item.id),
                    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => handleDragEnd(item.id, e),
                    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => handleTransformEnd(item.id, e),
                  }

                  if (item.type === 'logo' || item.type === 'image') {
                    const logoImage = item.imageUrl ? logoImageCache[item.imageUrl] : null
                    const logoTintKey = item.imageUrl && item.fill && item.type === 'logo' ? `${item.imageUrl}|${item.fill}` : null
                    const renderedLogo = logoTintKey ? logoTintImageCache[logoTintKey] : null
                    const finalImage = renderedLogo ?? logoImage
                    if (!finalImage) return null

                    return (
                      <KonvaImage
                        key={item.id}
                        {...commonProps}
                        image={finalImage}
                        width={item.width ?? 120}
                        height={item.height ?? 120}
                        onTransformEnd={(e: Konva.KonvaEventObject<Event>) => {
                          if (tool === 'select') handleTransformEnd(item.id, e)
                        }}
                      />
                    )
                  }

                  if (item.type === 'text') {
                    const isBold = item.fontWeight === 'bold'
                    const isItalic = item.fontStyle === 'italic'
                    let konvaFontStyle = 'normal'
                    if (isBold && isItalic) konvaFontStyle = 'italic bold'
                    else if (isBold) konvaFontStyle = 'bold'
                    else if (isItalic) konvaFontStyle = 'italic'

                    return (
                      <Text
                        key={item.id}
                        {...commonProps}
                        text={item.text || ''}
                        fill={item.fill || item.stroke || '#000'}
                        fontSize={item.fontSize ?? 24}
                        fontFamily={item.fontFamily ?? 'Arial'}
                        fontStyle={konvaFontStyle}
                        textDecoration={item.textDecoration === 'underline' ? 'underline' : item.textDecoration === 'line-through' ? 'line-through' : ''}
                        onDblClick={() => editTextPrompt(item)}
                        onDblTap={() => editTextPrompt(item)}
                      />
                    )
                  }
                  if (item.type === 'arrow' || item.type === 'dottedLine') {
                    if (item.type === 'dottedLine') {
                      return (
                        <Line
                          key={item.id}
                          {...commonProps}
                          points={item.points ?? [0, 0, 0, 0]}
                          stroke={item.stroke ?? '#FF0000'}
                          strokeWidth={item.strokeWidth ?? 3}
                          dash={[
                            item.dashLength ?? 8,
                            item.dashGap ?? 5,
                          ]}
                          lineCap="round"
                          lineJoin="round"
                        />
                      )
                    }

                    return (
                      <Arrow
                        key={item.id}
                        {...commonProps}
                        points={item.points ?? [0, 0, 80, 80]}
                        stroke={item.stroke ?? '#FF0000'}
                        strokeWidth={item.strokeWidth ?? 3}
                        fill={item.stroke ?? '#FF0000'}
                        pointerLength={12}
                        pointerWidth={12}
                      />
                    )
                  }

                  if (item.type === 'ellipse') {
                    const rectW = item.width ?? 120
                    const rectH = item.height ?? 80
                    return (
                      <Ellipse
                        key={item.id}
                        {...commonProps}
                        x={item.x + rectW / 2}
                        y={item.y + rectH / 2}
                        radiusX={Math.abs(rectW) / 2}
                        radiusY={Math.abs(rectH) / 2}
                        stroke={item.stroke ?? '#FF0000'}
                        strokeWidth={item.strokeWidth ?? 3}
                        fill="transparent"
                      />
                    )
                  }

                  if (item.type === 'magnifier') {
                    const rectW = item.width ?? 120
                    const rectH = item.height ?? 120
                    const cx = rectW / 2
                    const cy = rectH / 2
                    const rw = Math.max(1, Math.abs(rectW))
                    const rh = Math.max(1, Math.abs(rectH))

                    const clipFunc = (ctx: any) => {
                      ctx.beginPath()
                      ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2)
                      ctx.closePath()
                    }

                    const magScale = 1.6
                    const absoluteCx = item.x + cx
                    const absoluteCy = item.y + cy
                    const innerX = -absoluteCx * magScale + cx
                    const innerY = -absoluteCy * magScale + cy

                    return (
                      <Group
                        key={item.id}
                        {...commonProps}
                        clipFunc={clipFunc}
                      >
                        <Rect x={cx - rw / 2} y={cy - rh / 2} width={rw} height={rh} fill="#ffffff" listening={false} />
                        {displayImage && (
                          <KonvaImage
                            image={displayImage}
                            x={innerX}
                            y={innerY}
                            width={canvasSize.w}
                            height={canvasSize.h}
                            scaleX={magScale}
                            scaleY={magScale}
                            listening={false}
                          />
                        )}
                        <Ellipse
                          x={cx}
                          y={cy}
                          radiusX={rw / 2}
                          radiusY={rh / 2}
                          stroke={item.stroke ?? '#3b82f6'}
                          strokeWidth={item.strokeWidth ?? 4}
                          listening={false}
                          shadowColor="#000"
                          shadowBlur={4}
                          shadowOpacity={0.3}
                        />
                      </Group>
                    )
                  }

                  if (item.type === 'aiEraseBrush') {
                    return (
                      <Line
                        key={item.id}
                        {...commonProps}
                        points={item.points ?? []}
                        stroke="rgba(239, 68, 68, 0.5)"
                        strokeWidth={item.strokeWidth ?? 40}
                        lineCap="round"
                        lineJoin="round"
                      />
                    )
                  }

                  if (item.type === 'freeLine') {
                    return (
                      <Line
                        key={item.id}
                        {...commonProps}
                        points={item.points ?? []}
                        stroke={item.stroke ?? '#FF0000'}
                        strokeWidth={item.strokeWidth ?? 3}
                        lineCap="round"
                        lineJoin="round"
                      />
                    )
                  }

                  return null
                })}

                {tool === 'crop' && previewCrop && (
                  <Rect
                    id="crop-preview"
                    x={previewCrop.x}
                    y={previewCrop.y}
                    width={previewCrop.w}
                    height={previewCrop.h}
                    fill="rgba(37, 99, 235, 0.15)"
                    stroke="#2563EB"
                    dash={[6, 6]}
                  />
                )}

                <Transformer ref={transformerRef} rotateEnabled={false} />
              </Layer>
              {tool === 'blurBrush' || tool === 'mosaicBrush' ? (
                <Layer listening={false}>
                  {brushCursor && displayImage && (
                    <Rect
                      x={brushCursor.x - (privacyBrushSize / 2)}
                      y={brushCursor.y - (privacyBrushSize / 2)}
                      width={privacyBrushSize}
                      height={privacyBrushSize}
                      fill="rgba(255,255,255,0)"
                      stroke={tool === 'blurBrush' ? '#60a5fa' : '#a855f7'}
                      strokeWidth={2}
                      dash={[4, 4]}
                    />
                  )}
                </Layer>
              ) : null}
            </Stage>
            {!displayImage && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-center px-6 text-slate-200 text-sm">
                <div>
                  <p className="font-semibold mb-1">이미지를 업로드해 편집을 시작하세요</p>
                  <p className="text-xs text-slate-400">
                    왼쪽의 &apos;배경 이미지 업로드&apos; 버튼을 눌러 시작할 수 있습니다.
                  </p>
                </div>
              </div>
            )}

            {items.some(item => item.type === 'aiEraseBrush') && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-lg shadow-black/10 border border-red-200 px-6 py-3 flex items-center gap-4 animate-bounce z-40">
                <span className="text-sm font-semibold text-red-600">AI 지우개 마스킹 완료</span>
                <button
                  type="button"
                  onClick={handleAIErase}
                  disabled={isErasing}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white text-sm font-bold px-6 py-2 rounded-full transition-colors shadow-sm"
                >
                  {isErasing ? '지우는 중...' : '지우기 실행'}
                </button>
              </div>
            )}

            {isErasing && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
                <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                <p className="mt-4 font-bold text-gray-800 text-lg">AI가 대상체 구조를 분석하여 지우는 중...</p>
                <p className="mt-2 text-sm text-gray-500">최대 20초 정도 소요될 수 있습니다.</p>
              </div>
            )}
          </div>
        </div>

        <div className="w-72 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">레이어</h3>
            {items.length === 0 ? (
              <p className="text-sm text-gray-400">항목이 없습니다.</p>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-auto pr-1">
                {items.map((item, index) => {
                  const active = item.id === selectedId
                  return (
                    <div
                      key={item.id}
                      className={`text-sm rounded-lg border p-2 ${active ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          className="text-left truncate flex-1"
                          onClick={() => setSelectedId(item.id)}
                        >
                          {index + 1}. {itemLabel(item)}
                        </button>
                        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">순서 {index + 1}</span>
                      </div>

                      <div className="mt-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(item.id, 'bottom')}
                          className="px-2 py-0.5 text-xs border rounded bg-gray-50 disabled:opacity-40"
                          disabled={index === 0}
                          title="맨 뒤로"
                        >
                          맨뒤
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(item.id, 'down')}
                          className="px-2 py-0.5 text-xs border rounded bg-gray-50 disabled:opacity-40"
                          disabled={index === 0}
                        >
                          아래
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(item.id, 'up')}
                          className="px-2 py-0.5 text-xs border rounded bg-gray-50 disabled:opacity-40"
                          disabled={index === items.length - 1}
                        >
                          위
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(item.id, 'top')}
                          className="px-2 py-0.5 text-xs border rounded bg-gray-50 disabled:opacity-40"
                          disabled={index === items.length - 1}
                          title="맨 앞으로"
                        >
                          맨앞
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {selectedItem && (
              <div className="mt-4 border-t border-gray-200 pt-3 space-y-2">
                <div className="text-sm font-medium text-gray-700">선택 항목 속성</div>

                <label className="text-xs text-gray-500 block">
                  색상
                  <input
                    type="color"
                    value={selectedItem.fill ?? selectedItem.stroke ?? '#000'}
                    onChange={(e) => {
                      const v = e.target.value
                      if (selectedItem.type === 'text' || selectedItem.type === 'logo') {
                        updateSelectedItem({ fill: v })
                      } else if (selectedItem.type === 'ellipse') {
                        updateSelectedItem({ stroke: v, fill: 'transparent' })
                      } else {
                        updateSelectedItem({ stroke: v })
                      }
                    }}
                    className="ml-2 w-8 h-8 border border-gray-300 rounded cursor-pointer"
                  />
                </label>

                <label className="text-xs text-gray-500 block">
                  두께
                  <input
                    type="range"
                    min={1}
                    max={16}
                    value={selectedItem.strokeWidth ?? 3}
                    onChange={(e) => updateSelectedItem({ strokeWidth: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                </label>

                {(selectedItem.type === 'image' || selectedItem.type === 'logo') && (
                  <label className="text-xs text-gray-500 block mb-2">
                    기울기 조절 (회전)
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selectedItem.rotation ?? 0}
                      onChange={(e) => updateSelectedItem({ rotation: Number(e.target.value) })}
                      className="w-full accent-primary-500 mt-1"
                    />
                  </label>
                )}

                {selectedItem.type === 'text' && (
                  <>
                    <label className="text-xs text-gray-500 block">
                      글자 폰트
                      <select
                        value={selectedItem.fontFamily ?? 'Arial'}
                        onChange={(e) => updateSelectedItem({ fontFamily: e.target.value })}
                        className="ml-2 w-full mt-1 border border-gray-300 rounded px-2 py-1 text-xs"
                      >
                        <option value="Arial">기본 (Arial)</option>
                        <option value="'Pretendard', sans-serif">프리텐다드</option>
                        <option value="'210 OmniGothic', sans-serif">단정고딕(옴니)</option>
                      </select>
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => updateSelectedItem({ fontWeight: selectedItem.fontWeight === 'bold' ? 'normal' : 'bold' })}
                        className={`flex-1 py-1.5 border rounded text-xs font-bold ${selectedItem.fontWeight === 'bold' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
                        title="굵게"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedItem({ fontStyle: selectedItem.fontStyle === 'italic' ? 'normal' : 'italic' })}
                        className={`flex-1 py-1.5 border rounded text-xs italic ${selectedItem.fontStyle === 'italic' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
                        title="기울이기"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSelectedItem({ textDecoration: selectedItem.textDecoration === 'underline' ? 'none' : 'underline' })}
                        className={`flex-1 py-1.5 border rounded text-xs underline ${selectedItem.textDecoration === 'underline' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white hover:bg-gray-50'}`}
                        title="밑줄"
                      >
                        U
                      </button>
                    </div>
                    <label className="text-xs text-gray-500 block">
                      글자 크기
                      <input
                        type="range"
                        min={12}
                        max={96}
                        value={selectedItem.fontSize ?? 24}
                        onChange={(e) => updateSelectedItem({ fontSize: Number(e.target.value) })}
                        className="w-full accent-primary-500"
                      />
                    </label>
                  </>
                )}

                {selectedItem.type === 'dottedLine' && (
                  <>
                    <label className="text-xs text-gray-500 block">
                      점선 길이
                      <input
                        type="range"
                        min={2}
                        max={30}
                        value={selectedItem.dashLength ?? 10}
                        onChange={(e) => updateSelectedItem({ dashLength: Number(e.target.value) })}
                        className="w-full accent-primary-500"
                      />
                    </label>
                    <label className="text-xs text-gray-500 block">
                      점선 간격
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={selectedItem.dashGap ?? 5}
                        onChange={(e) => updateSelectedItem({ dashGap: Number(e.target.value) })}
                        className="w-full accent-primary-500"
                      />
                    </label>
                  </>
                )}

                <label className="text-xs text-gray-500 block">
                  투명도
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={selectedItem.opacity ?? 1}
                    onChange={(e) => updateSelectedItem({ opacity: Number(e.target.value) })}
                    className="w-full accent-primary-500"
                  />
                </label>

                {selectedItem.type === 'text' && (
                  <button
                    type="button"
                    onClick={() => editTextPrompt(selectedItem)}
                    className="w-full text-xs px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    텍스트 편집
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDelete}
                  className="w-full text-xs px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                >
                  삭제
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">크롭</h3>
            {previewCrop ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  {previewCrop.w}px × {previewCrop.h}px 영역이 선택됨
                </p>
                {isCropTooSmall && (
                  <p className="text-xs text-amber-600">
                    최소 크기보다 작습니다. {MIN_CROP_SIZE}px × {MIN_CROP_SIZE}px 이상으로 선택하세요.
                  </p>
                )}
                {cropError && !isCropTooSmall && (
                  <p className="text-xs text-red-600">{cropError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={applyCrop}
                    disabled={isCropTooSmall}
                    className={`flex-1 px-3 py-1.5 text-xs rounded-lg ${isCropTooSmall ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-500 text-white'
                      }`}
                  >
                    적용
                  </button>
                  <button
                    type="button"
                    onClick={clearCrop}
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
                  >
                    초기화
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">툴에서 영역을 드래그해 시작하세요.</p>
            )}
          </div>
        </div>
      </div>

      {showGifModal && (
        <GifExporter
          stageRef={stageRef}
          canvasSize={canvasSize}
          bgDataUrl={bgDataUrl}
          onClose={() => setShowGifModal(false)}
        />
      )}

      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={onImageFileChange} />
      <input type="file" ref={imagesInputRef} className="hidden" accept="image/*" onChange={onImagesFileChange} multiple />
      <input type="file" ref={logoInputRef} className="hidden" accept="image/*" onChange={onLogoFileChange} />
    </div>
  )
}
