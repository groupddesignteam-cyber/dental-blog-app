'use client'

import { EditorTool } from '@/types'

interface ToolbarProps {
  tool: EditorTool
  setTool: (t: EditorTool) => void
  strokeColor: string
  setStrokeColor: (c: string) => void
  strokeWidth: number
  setStrokeWidth: (w: number) => void
  dashLength: number
  setDashLength: (v: number) => void
  dashGap: number
  setDashGap: (v: number) => void
  isGrayscale: boolean
  setIsGrayscale: (v: boolean) => void
  isBlur: boolean
  setIsBlur: (v: boolean) => void
  blurRadius: number
  setBlurRadius: (v: number) => void
  brightness: number
  setBrightness: (v: number) => void
  contrast: number
  setContrast: (v: number) => void
  mosaicSize: number
  setMosaicSize: (v: number) => void
  privacyBrushSize: number
  setPrivacyBrushSize: (v: number) => void
  onClearPrivacy: () => void
  hasAnyPrivacyBrush: boolean
  onUploadImage: () => void
  onAddImages: () => void
  onApplyCollage: (type: 'grid2x2' | 'splitH' | 'splitV') => void
  onUploadLogo: () => void
  onUndo: () => void
  onRedo: () => void
  canUndoPrivacy: boolean
  canRedoPrivacy: boolean
  onUndoPrivacy: () => void
  onRedoPrivacy: () => void
  onExportPng: () => void
  onOpenGif: () => void
  onRotate: (direction: 'left' | 'right') => void
  onFlipHorizontal: () => void
  onFlipVertical: () => void
  canUndo: boolean
  canRedo: boolean
  hasBackground: boolean
}

const COLORS = ['#FF0000', '#FF6600', '#FFCC00', '#00CC00', '#0066FF', '#9933FF', '#FFFFFF', '#000000']

const TOOL_LABELS: Record<EditorTool, string> = {
  select: '선택',
  arrow: '화살표',
  dottedLine: '점선',
  text: '텍스트',
  ellipse: '타원',
  freeLine: '펜',
  blurBrush: '블러 마스킹',
  mosaicBrush: '모자이크',
  grayscaleBrush: '부분 흑백',
  aiEraseBrush: 'AI 지우개',
  magnifier: '돋보기',
  crop: '크롭',
}

export default function ImageEditorToolbar({
  tool,
  setTool,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  dashLength,
  setDashLength,
  dashGap,
  setDashGap,
  isGrayscale,
  setIsGrayscale,
  isBlur,
  setIsBlur,
  blurRadius,
  setBlurRadius,
  brightness,
  setBrightness,
  contrast,
  setContrast,
  mosaicSize,
  setMosaicSize,
  privacyBrushSize,
  setPrivacyBrushSize,
  onClearPrivacy,
  hasAnyPrivacyBrush,
  onUploadImage,
  onAddImages,
  onApplyCollage,
  onUploadLogo,
  onUndo,
  onRedo,
  canUndoPrivacy,
  canRedoPrivacy,
  onUndoPrivacy,
  onRedoPrivacy,
  onExportPng,
  onOpenGif,
  onRotate,
  onFlipHorizontal,
  onFlipVertical,
  canUndo,
  canRedo,
  hasBackground,
}: ToolbarProps) {
  const btnBase = 'px-3 py-2 rounded-xl text-sm font-semibold transition-all border'
  const btnActive = 'bg-primary-500 text-white border-primary-500 shadow-sm scale-[1.01]'
  const btnInactive = 'bg-white/80 text-gray-700 border-gray-200 hover:bg-white hover:text-primary-600'
  const controlLabel = 'text-xs text-gray-500 w-14 font-medium'
  const privacyPreset = [12, 20, 32, 48, 72]

  const toolButtons: EditorTool[] = ['select', 'arrow', 'dottedLine', 'ellipse', 'freeLine', 'text', 'blurBrush',
    'mosaicBrush',
    'grayscaleBrush',
    'aiEraseBrush',
    'magnifier',
    'crop',
  ]

  return (
    <div className="bg-gradient-to-r from-slate-50 via-white to-sky-50 border border-sky-200 rounded-2xl p-4 mb-3 space-y-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onUploadImage}
          className={`${btnBase} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100`}
        >
          배경 이미지 전환
        </button>
        <button
          type="button"
          onClick={onAddImages}
          className={`${btnBase} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100`}
        >
          사진 여러장 추가
        </button>

        {hasBackground && (
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-xl border border-gray-200 ml-1">
            <span className="text-xs text-gray-500 px-2 font-medium">콜라주</span>
            <button type="button" onClick={() => onApplyCollage('splitH')} className={`${btnBase} text-xs py-1 px-2 ${btnInactive}`}>가로2분할</button>
            <button type="button" onClick={() => onApplyCollage('splitV')} className={`${btnBase} text-xs py-1 px-2 ${btnInactive}`}>세로2분할</button>
            <button type="button" onClick={() => onApplyCollage('grid2x2')} className={`${btnBase} text-xs py-1 px-2 ${btnInactive}`}>격자(4장)</button>
          </div>
        )}

        <div className="w-px h-8 bg-gray-200" />

        {toolButtons.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTool(value)}
            className={`${btnBase} ${tool === value ? btnActive : btnInactive}`}
          >
            {TOOL_LABELS[value]}
          </button>
        ))}

        <button type="button" onClick={onUploadLogo} className={`${btnBase} ${btnInactive}`}>
          로고 업로드
        </button>

        <div className="w-px h-8 bg-gray-200" />

        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setStrokeColor(c)}
              className={`w-6 h-6 rounded-full border-2 transition-transform ${strokeColor === c ? 'border-primary-500 scale-125' : 'border-gray-300'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="w-px h-8 bg-gray-200" />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className={`${btnBase} ${canUndo ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          실행 취소
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className={`${btnBase} ${canRedo ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          다시 실행
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={onExportPng}
          disabled={!hasBackground}
          className={`${btnBase} ${hasBackground ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          PNG 내보내기
        </button>
        <button
          type="button"
          onClick={onOpenGif}
          disabled={!hasBackground}
          className={`${btnBase} ${hasBackground ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          GIF 내보내기
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <span className={controlLabel}>선 굵기</span>
          <input
            type="range"
            min={1}
            max={15}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-20 accent-primary-500"
          />
          <span className="text-xs text-gray-400 w-8">{strokeWidth}px</span>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${tool === 'dottedLine' ? 'bg-gray-50' : ''}`}>
          <span className="text-xs text-gray-500 w-14 font-medium">점선</span>
          <span className="text-xs text-gray-400">길이</span>
          <input
            type="range"
            min={3}
            max={30}
            value={dashLength}
            onChange={(e) => setDashLength(Number(e.target.value))}
            className="w-14 accent-primary-500"
          />
          <span className="text-xs text-gray-400 w-6">{dashLength}</span>
          <span className="text-xs text-gray-400">간격</span>
          <input
            type="range"
            min={2}
            max={20}
            value={dashGap}
            onChange={(e) => setDashGap(Number(e.target.value))}
            className="w-14 accent-primary-500"
          />
          <span className="text-xs text-gray-400 w-6">{dashGap}</span>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <button
          type="button"
          onClick={() => setIsGrayscale(!isGrayscale)}
          disabled={!hasBackground}
          className={`${btnBase} text-xs ${isGrayscale
            ? 'bg-gray-800 text-white border-gray-800'
            : hasBackground
              ? btnInactive
              : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          {isGrayscale ? '흑백 적용' : '흑백'}
        </button>

        <button
          type="button"
          onClick={() => setIsBlur(!isBlur)}
          disabled={!hasBackground}
          className={`${btnBase} text-xs ${isBlur
            ? 'bg-gray-800 text-white border-gray-800'
            : hasBackground
              ? btnInactive
              : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          흐림
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <span className={controlLabel}>전체 흐림</span>
          <input
            type="range"
            min={0}
            max={12}
            value={blurRadius}
            onChange={(e) => setBlurRadius(Number(e.target.value))}
            className="w-24 accent-primary-500"
            disabled={!hasBackground || !isBlur}
          />
          <span className="text-xs text-gray-400 w-8">{blurRadius}px</span>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center gap-1.5">
          <span className={controlLabel}>밝기</span>
          <input
            type="range"
            min={60}
            max={160}
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            className="w-24 accent-primary-500"
            disabled={!hasBackground}
          />
          <span className="text-xs text-gray-400 w-10">{brightness}%</span>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center gap-1.5">
          <span className={controlLabel}>명암</span>
          <input
            type="range"
            min={60}
            max={160}
            value={contrast}
            onChange={(e) => setContrast(Number(e.target.value))}
            className="w-24 accent-primary-500"
            disabled={!hasBackground}
          />
          <span className="text-xs text-gray-400 w-10">{contrast}%</span>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <div className="flex items-center gap-1.5">
          <span className={controlLabel}>모자이크</span>
          <input
            type="range"
            min={0}
            max={60}
            value={mosaicSize}
            onChange={(e) => setMosaicSize(Number(e.target.value))}
            className="w-24 accent-primary-500"
            disabled={!hasBackground}
          />
          <span className="text-xs text-gray-400 w-10">{mosaicSize}px</span>
        </div>
      </div>

      {/* --- 개인정보/마스킹 공통 사이즈 조절 패널 --- */}
      <div className={`flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100 ${tool === 'blurBrush' || tool === 'mosaicBrush' || tool === 'grayscaleBrush' || tool === 'aiEraseBrush' ? 'bg-white/80 -mx-1 px-1 py-1 rounded-xl' : ''}`}>
        {(tool === 'blurBrush' || tool === 'mosaicBrush' || tool === 'grayscaleBrush' || tool === 'aiEraseBrush') && (
          <>
            <div className="flex items-center gap-1.5">
              <span className={controlLabel}>마스킹 굵기</span>
              <input
                type="range"
                min={6}
                max={120}
                value={privacyBrushSize}
                onChange={(e) => setPrivacyBrushSize(Number(e.target.value))}
                className="w-32 accent-primary-500"
              />
              <span className="text-xs text-gray-400 w-10">{privacyBrushSize}px</span>
            </div>

            <div className="flex items-center gap-1.5">
              {privacyPreset.map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPrivacyBrushSize(size)}
                  className={`${btnBase} text-[11px] px-2 py-1 ${privacyBrushSize === size ? 'bg-primary-500 text-white border-primary-500' : btnInactive}`}
                >
                  {size}px
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClearPrivacy}
              disabled={!hasAnyPrivacyBrush}
              className={`${btnBase} text-xs ${hasAnyPrivacyBrush ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
            >
              마스킹 지우기
            </button>

            <button
              type="button"
              onClick={onUndoPrivacy}
              disabled={!canUndoPrivacy}
              className={`${btnBase} text-xs ${canUndoPrivacy ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
            >
              마스킹 되돌리기
            </button>

            <button
              type="button"
              onClick={onRedoPrivacy}
              disabled={!canRedoPrivacy}
              className={`${btnBase} text-xs ${canRedoPrivacy ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
            >
              마스킹 재실행
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
        <button
          type="button"
          onClick={() => onRotate('left')}
          disabled={!hasBackground}
          className={`${btnBase} text-xs ${hasBackground ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          왼쪽 회전
        </button>
        <button
          type="button"
          onClick={() => onRotate('right')}
          disabled={!hasBackground}
          className={`${btnBase} text-xs ${hasBackground ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          오른쪽 회전
        </button>
        <button
          type="button"
          onClick={onFlipHorizontal}
          disabled={!hasBackground}
          className={`${btnBase} text-xs ${hasBackground ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          좌우 반전
        </button>
        <button
          type="button"
          onClick={onFlipVertical}
          disabled={!hasBackground}
          className={`${btnBase} text-xs ${hasBackground ? btnInactive : 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed'}`}
        >
          상하 반전
        </button>
      </div>
    </div>
  )
}
