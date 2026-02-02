'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { LLMModel, GenerateResult, UploadedImage, ImageTag } from '@/types'

// 케이스 타입
interface BlogCase {
  id: string
  clinicName: string
  region: string
  doctorName: string
  topic: string
  memo: string
  images?: UploadedImage[]
  status: 'pending' | 'generating' | 'completed' | 'error'
  result?: GenerateResult
  error?: string
}

// 치과 프리셋 타입
interface ClinicPreset {
  name: string
  region: string
  doctorName: string
}

// 기본 치료 목록
const TREATMENTS = [
  '임플란트',
  '신경치료',
  '충치치료',
  '사랑니',
  '치아교정',
  '스케일링',
  '치주치료',
  '보철(크라운)',
  '라미네이트',
  '치아미백',
  '소아치과',
  '발치',
  '잇몸치료',
  '턱관절',
  '레진',
  '브릿지',
  '틀니',
]

// LLM 모델 옵션
const LLM_MODELS = [
  { id: 'gemini', name: 'Gemini Pro 💰', description: '무료 + 빠름 (권장)' },
  { id: 'claude-haiku', name: 'Claude Haiku', description: '빠름 + 저비용' },
  { id: 'openai-mini', name: 'GPT-4o-mini', description: '빠름 + 저비용' },
  { id: 'claude', name: 'Claude Sonnet', description: '고품질' },
  { id: 'openai', name: 'GPT-4o', description: '고품질 + 고비용' },
] as const

// 이미지 태그 옵션
const IMAGE_TAGS: { id: ImageTag; label: string; color: string }[] = [
  { id: 'before', label: '치료 전', color: 'bg-blue-100 text-blue-700' },
  { id: 'after', label: '치료 후', color: 'bg-green-100 text-green-700' },
  { id: 'xray', label: 'X-ray', color: 'bg-gray-100 text-gray-700' },
  { id: 'ct', label: 'CT', color: 'bg-purple-100 text-purple-700' },
  { id: 'progress', label: '치료 과정', color: 'bg-yellow-100 text-yellow-700' },
  { id: 'other', label: '기타', color: 'bg-gray-100 text-gray-600' },
]

// 파일명에서 태그 자동 감지
function detectTagFromFilename(filename: string): ImageTag {
  const lower = filename.toLowerCase()
  if (lower.includes('before') || lower.includes('치료전') || lower.includes('_전.') || lower.includes('_전_')) {
    return 'before'
  }
  if (lower.includes('after') || lower.includes('치료후') || lower.includes('_후.') || lower.includes('_후_')) {
    return 'after'
  }
  if (lower.includes('xray') || lower.includes('x-ray') || lower.includes('엑스레이') || lower.includes('파노라마')) {
    return 'xray'
  }
  if (lower.includes('ct') || lower.includes('씨티')) {
    return 'ct'
  }
  if (lower.includes('과정') || lower.includes('진행') || lower.includes('progress')) {
    return 'progress'
  }
  return 'other'
}

// 검색 가능한 Combobox 컴포넌트
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  allowCustom = false,
}: {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  allowCustom?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  )

  // 외부 클릭 감지
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        // 커스텀 입력 허용 시, 검색어를 값으로 설정
        if (allowCustom && search && !options.includes(search)) {
          onChange(search)
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [allowCustom, search, options, onChange])

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={isOpen ? search : value}
        onChange={(e) => {
          setSearch(e.target.value)
          if (!isOpen) setIsOpen(true)
        }}
        onFocus={() => {
          setIsOpen(true)
          setSearch(value)
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt)
                  setSearch('')
                  setIsOpen(false)
                }}
                className={`w-full px-3 py-2 text-left hover:bg-primary-50 ${
                  value === opt ? 'bg-primary-100 text-primary-700' : ''
                }`}
              >
                {opt}
              </button>
            ))
          ) : allowCustom && search ? (
            <button
              type="button"
              onClick={() => {
                onChange(search)
                setSearch('')
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-left text-primary-600 hover:bg-primary-50"
            >
              &quot;{search}&quot; 사용하기
            </button>
          ) : (
            <div className="px-3 py-2 text-gray-500">검색 결과 없음</div>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  onResultsReady?: (results: BlogCase[]) => void
}

export default function BatchQueue({ onResultsReady }: Props) {
  // 치과 프리셋 목록
  const [clinicPresets, setClinicPresets] = useState<ClinicPreset[]>([])
  const [sheetTreatments, setSheetTreatments] = useState<string[]>([])
  const [isLoadingPresets, setIsLoadingPresets] = useState(true)

  // 현재 입력 폼
  const [selectedClinic, setSelectedClinic] = useState<ClinicPreset | null>(null)
  const [selectedTopic, setSelectedTopic] = useState('')
  const [memo, setMemo] = useState('')

  // 카테고리별 이미지 상태
  const [imagesByCategory, setImagesByCategory] = useState<Record<ImageTag, UploadedImage[]>>({
    before: [],
    after: [],
    xray: [],
    ct: [],
    progress: [],
    other: [],
  })

  // 모델 선택
  const [model, setModel] = useState<LLMModel>('gemini')

  // 케이스 큐
  const [cases, setCases] = useState<BlogCase[]>([])

  // 생성 상태
  const [isGenerating, setIsGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  // 미리보기/편집 상태
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null)
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')

  // 파일 입력 refs (카테고리별)
  const fileInputRefs = useRef<Record<ImageTag, HTMLInputElement | null>>({
    before: null,
    after: null,
    xray: null,
    ct: null,
    progress: null,
    other: null,
  })

  // 드래그 앤 드랍 상태 (카테고리별)
  const [draggingCategory, setDraggingCategory] = useState<ImageTag | null>(null)

  // 도움말 모달 상태
  const [showGuide, setShowGuide] = useState(false)

  // 치과 프리셋 로드
  useEffect(() => {
    async function loadPresets() {
      try {
        const res = await fetch('/api/sheet-data')
        const data = await res.json()

        if (data.clinicDetails && data.clinicDetails.length > 0) {
          setClinicPresets(data.clinicDetails)
          setSelectedClinic(data.clinicDetails[0])
        } else if (data.clinics && data.clinics.length > 0) {
          const presets = data.clinics.map((name: string) => ({
            name,
            region: '',
            doctorName: '',
          }))
          setClinicPresets(presets)
          setSelectedClinic(presets[0])
        }

        if (data.treatments && data.treatments.length > 0) {
          setSheetTreatments(data.treatments)
        }
      } catch (error) {
        console.error('Failed to load clinic presets:', error)
      } finally {
        setIsLoadingPresets(false)
      }
    }
    loadPresets()
  }, [])

  // 이미지 파일 처리 (카테고리 지정)
  const processImageFile = useCallback((file: File, category: ImageTag) => {
    return new Promise<UploadedImage>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const url = event.target?.result as string
        resolve({
          name: file.name,
          url,
          file,
          tag: category,
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  // 카테고리별 이미지 업로드 처리
  const handleCategoryImageUpload = useCallback(async (
    e: React.ChangeEvent<HTMLInputElement>,
    category: ImageTag
  ) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.gif')
    )

    if (imageFiles.length === 0) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    try {
      const newImages = await Promise.all(imageFiles.map(f => processImageFile(f, category)))
      setImagesByCategory(prev => ({
        ...prev,
        [category]: [...prev[category], ...newImages],
      }))
    } catch (error) {
      console.error('이미지 업로드 오류:', error)
      alert('이미지 업로드에 실패했습니다.')
    }

    // ref 초기화
    const ref = fileInputRefs.current[category]
    if (ref) ref.value = ''
  }, [processImageFile])

  // 카테고리별 이미지 삭제
  const removeCategoryImage = useCallback((category: ImageTag, index: number) => {
    setImagesByCategory(prev => ({
      ...prev,
      [category]: prev[category].filter((_, i) => i !== index),
    }))
  }, [])

  // 드래그 앤 드랍 핸들러 (카테고리별)
  const handleDragOver = useCallback((e: React.DragEvent, category: ImageTag) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggingCategory(category)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggingCategory(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, category: ImageTag) => {
    e.preventDefault()
    e.stopPropagation()
    setDraggingCategory(null)

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.gif')
    )

    if (imageFiles.length === 0) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    try {
      const newImages = await Promise.all(imageFiles.map(f => processImageFile(f, category)))
      setImagesByCategory(prev => ({
        ...prev,
        [category]: [...prev[category], ...newImages],
      }))
    } catch (error) {
      console.error('이미지 업로드 오류:', error)
      alert('이미지 업로드에 실패했습니다.')
    }
  }, [processImageFile])

  // 모든 카테고리 이미지를 하나의 배열로 합치기
  const getAllImages = useCallback((): UploadedImage[] => {
    const order: ImageTag[] = ['before', 'xray', 'ct', 'progress', 'after', 'other']
    return order.flatMap(cat => imagesByCategory[cat])
  }, [imagesByCategory])

  // 총 이미지 수
  const totalImageCount = Object.values(imagesByCategory).reduce((sum, arr) => sum + arr.length, 0)

  // 치과명 목록
  const clinicNames = clinicPresets.map(c => c.name)

  // 치료 목록 (시트 + 기본)
  const allTreatments = [...new Set([...sheetTreatments, ...TREATMENTS])].sort()

  // 치과 선택 핸들러
  const handleClinicSelect = (name: string) => {
    const preset = clinicPresets.find(c => c.name === name)
    if (preset) {
      setSelectedClinic(preset)
    } else {
      // 커스텀 입력
      setSelectedClinic({ name, region: '', doctorName: '' })
    }
  }

  // 케이스 추가
  const addCase = () => {
    if (!selectedClinic || !selectedTopic) {
      alert('치과와 치료를 선택해주세요.')
      return
    }

    const allImages = getAllImages()
    const newCase: BlogCase = {
      id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      clinicName: selectedClinic.name,
      region: selectedClinic.region,
      doctorName: selectedClinic.doctorName,
      topic: selectedTopic,
      memo: memo.trim(),
      images: allImages.length > 0 ? allImages : undefined,
      status: 'pending',
    }

    setCases(prev => [...prev, newCase])
    setMemo('')
    // 모든 카테고리 이미지 초기화
    setImagesByCategory({
      before: [],
      after: [],
      xray: [],
      ct: [],
      progress: [],
      other: [],
    })
  }

  // 케이스 삭제
  const removeCase = (id: string) => {
    setCases(prev => prev.filter(c => c.id !== id))
    if (expandedCaseId === id) setExpandedCaseId(null)
    if (editingCaseId === id) setEditingCaseId(null)
  }

  // 미리보기 토글
  const togglePreview = (id: string) => {
    if (expandedCaseId === id) {
      setExpandedCaseId(null)
      setEditingCaseId(null)
    } else {
      setExpandedCaseId(id)
      setEditingCaseId(null)
    }
  }

  // 편집 모드 시작
  const startEditing = (caseItem: BlogCase) => {
    if (!caseItem.result) return
    setEditingCaseId(caseItem.id)
    setEditTitle(caseItem.result.title)
    setEditContent(caseItem.result.content)
  }

  // 편집 저장
  const saveEdit = (id: string) => {
    setCases(prev => prev.map(c => {
      if (c.id === id && c.result) {
        return {
          ...c,
          result: {
            ...c.result,
            title: editTitle,
            content: editContent,
            charCount: editContent.length,
          }
        }
      }
      return c
    }))
    setEditingCaseId(null)
  }

  // 편집 취소
  const cancelEdit = () => {
    setEditingCaseId(null)
    setEditTitle('')
    setEditContent('')
  }

  // 이미지 이름에 태그 정보 포함시키기
  const buildImageNameWithTag = (img: UploadedImage, index: number): string => {
    const tagLabels: Record<ImageTag, string> = {
      before: '치료전',
      after: '치료후',
      xray: 'xray',
      ct: 'ct',
      progress: '과정',
      other: '',
    }
    const tagLabel = img.tag ? tagLabels[img.tag] : ''
    // 태그가 있으면 파일명에 태그 정보 추가
    if (tagLabel && !img.name.toLowerCase().includes(tagLabel.toLowerCase())) {
      const ext = img.name.split('.').pop() || 'jpg'
      const baseName = img.name.replace(/\.[^/.]+$/, '')
      return `${baseName}_${tagLabel}_${String(index + 1).padStart(2, '0')}.${ext}`
    }
    return img.name
  }

  // 단일 케이스 생성
  const generateSingleCase = async (caseItem: BlogCase): Promise<BlogCase> => {
    try {
      const payload = {
        clinicName: caseItem.clinicName,
        region: caseItem.region,
        doctorName: caseItem.doctorName,
        topic: caseItem.topic,
        patientInfo: caseItem.memo || '일반 환자',
        treatment: `${caseItem.topic} 치료`,
        model,
        images: caseItem.images?.map((img, i) => ({
          name: buildImageNameWithTag(img, i),
          tag: img.tag,
        })),
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('글 생성 실패')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let result: GenerateResult | undefined

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'content') {
                  fullContent += parsed.text
                } else if (parsed.type === 'result') {
                  result = parsed.data
                }
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }

      return {
        ...caseItem,
        status: 'completed',
        result: result || {
          title: `${caseItem.topic} 치료 안내`,
          content: fullContent,
          keywords: { main: caseItem.topic, sub: [] },
          hashtags: [],
          charCount: fullContent.length,
        },
      }
    } catch (error) {
      return {
        ...caseItem,
        status: 'error',
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      }
    }
  }

  // 배치 생성
  const generateAll = async () => {
    const pendingCases = cases.filter(c => c.status === 'pending')
    if (pendingCases.length === 0) {
      alert('생성할 케이스가 없습니다.')
      return
    }

    setIsGenerating(true)
    setProgress({ current: 0, total: pendingCases.length })

    setCases(prev => prev.map(c =>
      c.status === 'pending' ? { ...c, status: 'generating' as const } : c
    ))

    const batchSize = 2
    for (let i = 0; i < pendingCases.length; i += batchSize) {
      const batch = pendingCases.slice(i, i + batchSize)

      const results = await Promise.all(
        batch.map(caseItem => generateSingleCase(caseItem))
      )

      setCases(prev => {
        const updated = [...prev]
        for (const result of results) {
          const idx = updated.findIndex(c => c.id === result.id)
          if (idx !== -1) {
            updated[idx] = result
          }
        }
        return updated
      })

      setProgress(prev => ({ ...prev, current: Math.min(i + batchSize, pendingCases.length) }))
    }

    setIsGenerating(false)

    if (onResultsReady) {
      const completedCases = cases.filter(c => c.status === 'completed')
      onResultsReady(completedCases)
    }
  }

  // 결과 복사
  const copyResult = async (caseItem: BlogCase) => {
    if (!caseItem.result) return

    const text = `${caseItem.result.title}\n\n${caseItem.result.content}`
    try {
      await navigator.clipboard.writeText(text)
      alert('클립보드에 복사되었습니다!')
    } catch {
      alert('복사에 실패했습니다.')
    }
  }

  // 전체 초기화
  const clearAll = () => {
    if (cases.length > 0 && !confirm('모든 케이스를 삭제하시겠습니까?')) return
    setCases([])
    setExpandedCaseId(null)
    setEditingCaseId(null)
  }

  // 완료된 케이스만 삭제
  const clearCompleted = () => {
    setCases(prev => prev.filter(c => c.status !== 'completed'))
  }

  const pendingCount = cases.filter(c => c.status === 'pending').length
  const completedCount = cases.filter(c => c.status === 'completed').length

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 도움말 모달 */}
      {showGuide && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">📖 사용 가이드</h2>
              <button
                onClick={() => setShowGuide(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 글 스타일 가이드 */}
              <section>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  ✍️ 원하는 스타일로 글 작성하기
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-700">🏥 치과별 스타일 자동 반영</p>
                    <p className="text-gray-600 mt-1">
                      등록된 치과를 선택하면, 해당 치과의 기존 블로그 글 스타일을 AI가 자동으로 분석하여 반영합니다.
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-gray-700">📝 메모 필드 활용법</p>
                    <p className="text-gray-600 mt-1">메모에 구체적인 정보를 입력할수록 좋은 글이 나옵니다:</p>
                    <ul className="mt-2 ml-4 space-y-1 text-gray-600">
                      <li>• <span className="text-primary-600">환자 정보:</span> 50대 남성, 40대 여성</li>
                      <li>• <span className="text-primary-600">증상:</span> 어금니 통증, 잇몸 출혈</li>
                      <li>• <span className="text-primary-600">부위:</span> 하악 좌측 6번, 상악 전치부</li>
                      <li>• <span className="text-primary-600">특이사항:</span> 골이식 동반, 수면마취</li>
                    </ul>
                  </div>
                  <div className="bg-primary-50 rounded-lg p-3">
                    <p className="font-medium text-primary-700">💡 좋은 메모 예시</p>
                    <p className="text-primary-600 mt-1 font-mono text-xs">
                      &quot;50대 남성, 하악 좌측 어금니, 오래된 신경치료 치아 발치 후 임플란트, 골이식 동반&quot;
                    </p>
                  </div>
                </div>
              </section>

              {/* 이미지 업로드 가이드 */}
              <section>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  📷 이미지 업로드
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
                  <p className="text-gray-600">
                    카테고리별로 이미지를 업로드하면 AI가 자동으로 적절한 위치에 배치합니다.
                  </p>

                  {/* 카테고리 설명 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-lg">치료 전</span>
                      <span className="text-xs text-gray-500">시술 전 상태 사진</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-lg">치료 후</span>
                      <span className="text-xs text-gray-500">시술 후 결과 사진</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-lg">X-ray</span>
                      <span className="text-xs text-gray-500">파노라마, 엑스레이</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-lg">CT</span>
                      <span className="text-xs text-gray-500">CT 촬영 영상</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-lg">치료 과정</span>
                      <span className="text-xs text-gray-500">시술 중 단계별 사진</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-lg">기타</span>
                      <span className="text-xs text-gray-500">그 외 사진</span>
                    </div>
                  </div>

                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p className="font-medium text-green-700">✨ 사용 방법</p>
                    <ul className="mt-2 space-y-1 text-xs text-green-600">
                      <li>• 해당 카테고리 영역에 이미지를 <strong>드래그 앤 드랍</strong></li>
                      <li>• 또는 영역을 <strong>클릭</strong>하여 파일 선택</li>
                      <li>• 파일명 규칙 없이 IMG_0001.jpg도 OK!</li>
                    </ul>
                  </div>

                  <div className="bg-primary-50 rounded-lg p-3">
                    <p className="font-medium text-primary-700">📋 글에 삽입되는 순서</p>
                    <p className="text-primary-600 mt-1 text-xs">
                      치료 전 → X-ray → CT → 치료 과정 → 치료 후 → 기타
                    </p>
                  </div>
                </div>
              </section>

              {/* Alt 코드 가이드 */}
              <section>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  🏷️ 이미지 Alt 태그 (대체 텍스트)
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
                  <p className="text-gray-600">
                    생성된 글에서 <code className="bg-gray-200 px-1 rounded">[IMAGE_1]</code>, <code className="bg-gray-200 px-1 rounded">[IMAGE_2]</code> 형태로 이미지 위치가 표시됩니다.
                  </p>
                  <div>
                    <p className="font-medium text-gray-700">네이버 블로그에 올릴 때:</p>
                    <ol className="mt-2 ml-4 space-y-2 text-gray-600">
                      <li>1. <code className="bg-gray-200 px-1 rounded">[IMAGE_1]</code> 위치에 해당 이미지 삽입</li>
                      <li>2. 이미지 클릭 → &quot;대체 텍스트&quot; 또는 &quot;이미지 설명&quot; 입력</li>
                      <li>3. SEO를 위해 키워드 포함한 설명 작성</li>
                    </ol>
                  </div>
                  <div className="bg-primary-50 rounded-lg p-3">
                    <p className="font-medium text-primary-700">💡 좋은 Alt 텍스트 예시</p>
                    <ul className="mt-2 space-y-1 text-xs text-gray-600">
                      <li>✅ &quot;부평 임플란트 치료 전 하악 어금니 상태&quot;</li>
                      <li>✅ &quot;신경치료 후 지르코니아 크라운 완료 사진&quot;</li>
                      <li>✅ &quot;사랑니 발치 전 파노라마 X-ray 영상&quot;</li>
                      <li>❌ &quot;사진1&quot; (너무 간단함)</li>
                      <li>❌ &quot;IMG_0234.jpg&quot; (파일명 그대로)</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* 추가 팁 */}
              <section>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  ⚡ 빠른 팁
                </h3>
                <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-4 space-y-2 text-sm">
                  <p className="flex items-start gap-2">
                    <span>🎯</span>
                    <span>같은 치과의 여러 케이스를 한 번에 추가하면 효율적입니다</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span>📋</span>
                    <span>&quot;모든 글 한 번에 복사&quot;로 여러 글을 빠르게 복사할 수 있습니다</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span>✏️</span>
                    <span>생성 후 &quot;미리보기&quot; → &quot;편집&quot;으로 글을 수정할 수 있습니다</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <span>💰</span>
                    <span>Gemini Pro는 무료이면서 빠르고 품질이 좋습니다</span>
                  </p>
                </div>
              </section>

              {/* 워크플로우 가이드 */}
              <section>
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  🔄 작업 워크플로우
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-4 text-sm">
                  {/* Step 1 */}
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-0 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
                    <div>
                      <p className="font-bold text-gray-800">사전 준비</p>
                      <ul className="mt-2 space-y-1 text-gray-600">
                        <li>• 오늘 올릴 케이스 목록 정리 (환자 정보, 치료 내용)</li>
                        <li>• 치료 사진 준비 (파일명 규칙 불필요!)</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-0 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                    <div>
                      <p className="font-bold text-gray-800">케이스 등록</p>
                      <ul className="mt-2 space-y-1 text-gray-600">
                        <li>• 치과 선택 → 치료 선택 → 메모 입력</li>
                        <li>• 이미지를 카테고리별 칸에 드래그 앤 드랍</li>
                        <li>• (치료전/치료후/X-ray/CT/과정/기타)</li>
                        <li>• &quot;큐에 추가&quot; 클릭</li>
                        <li>• 모든 케이스 반복 등록</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-0 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
                    <div>
                      <p className="font-bold text-gray-800">글 생성</p>
                      <ul className="mt-2 space-y-1 text-gray-600">
                        <li>• AI 모델 선택 (Gemini Pro 권장)</li>
                        <li>• &quot;N개 글 한 번에 생성하기&quot; 클릭</li>
                        <li>• 생성 완료까지 대기 (2개씩 동시 생성)</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-0 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</div>
                    <div>
                      <p className="font-bold text-gray-800">검토 및 수정</p>
                      <ul className="mt-2 space-y-1 text-gray-600">
                        <li>• 각 케이스별 &quot;미리보기&quot;로 확인</li>
                        <li>• 필요시 &quot;편집&quot; 버튼으로 수정</li>
                        <li>• 문맥 어색한 부분, 오타 수정</li>
                        <li>• 의료법 위반 표현 없는지 확인</li>
                      </ul>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="relative pl-8">
                    <div className="absolute left-0 top-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</div>
                    <div>
                      <p className="font-bold text-gray-800">네이버 블로그 업로드</p>
                      <ul className="mt-2 space-y-1 text-gray-600">
                        <li>• &quot;복사&quot; 버튼으로 글 복사</li>
                        <li>• 네이버 블로그 에디터에 붙여넣기</li>
                        <li>• [IMAGE_1] 위치에 실제 이미지 삽입</li>
                        <li>• 이미지 Alt 태그 입력 (SEO용)</li>
                        <li>• 해시태그 추가 후 발행</li>
                      </ul>
                    </div>
                  </div>

                  {/* 체크리스트 */}
                  <div className="mt-4 bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                    <p className="font-bold text-yellow-800 text-xs mb-2">✅ 발행 전 체크리스트</p>
                    <div className="grid grid-cols-2 gap-2 text-xs text-yellow-700">
                      <label className="flex items-center gap-1">
                        <span>□</span> 맞춤법/오타 확인
                      </label>
                      <label className="flex items-center gap-1">
                        <span>□</span> 이미지 삽입 완료
                      </label>
                      <label className="flex items-center gap-1">
                        <span>□</span> Alt 태그 입력
                      </label>
                      <label className="flex items-center gap-1">
                        <span>□</span> 해시태그 추가
                      </label>
                      <label className="flex items-center gap-1">
                        <span>□</span> 부작용 고지 포함
                      </label>
                      <label className="flex items-center gap-1">
                        <span>□</span> 의료법 위반 표현 없음
                      </label>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="text-center relative">
        <button
          onClick={() => setShowGuide(true)}
          className="absolute right-0 top-0 w-10 h-10 bg-primary-100 text-primary-600 rounded-full hover:bg-primary-200 transition-colors flex items-center justify-center text-lg font-bold"
          title="사용 가이드"
        >
          ?
        </button>
        <h1 className="text-2xl font-bold text-gray-900">🦷 블로그 글 배치 생성</h1>
        <p className="mt-2 text-gray-600">케이스를 추가하고 한 번에 여러 글을 생성하세요</p>
      </div>

      {/* 모델 선택 */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-sm font-medium text-gray-700 mb-3">🤖 AI 모델</h3>
        <div className="flex flex-wrap gap-2">
          {LLM_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModel(m.id as LLMModel)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                model === m.id
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {/* 입력 폼 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">➕ 케이스 추가</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* 치과 선택 (검색 가능) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              치과 <span className="text-red-500">*</span>
            </label>
            {isLoadingPresets ? (
              <div className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-gray-50 text-gray-500">
                로딩 중...
              </div>
            ) : (
              <SearchableSelect
                options={clinicNames}
                value={selectedClinic?.name || ''}
                onChange={handleClinicSelect}
                placeholder="치과명 검색..."
                allowCustom
              />
            )}
          </div>

          {/* 치료 선택 (검색 가능) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              치료 <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              options={allTreatments}
              value={selectedTopic}
              onChange={setSelectedTopic}
              placeholder="치료 검색..."
              allowCustom
            />
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              메모 (선택)
            </label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="예: 50대 남성, 어금니"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* 카테고리별 이미지 업로드 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            📷 이미지 (선택) {totalImageCount > 0 && <span className="text-primary-600">· {totalImageCount}개</span>}
          </label>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {IMAGE_TAGS.map((tagInfo) => {
              const categoryImages = imagesByCategory[tagInfo.id]
              const isDraggingHere = draggingCategory === tagInfo.id

              return (
                <div key={tagInfo.id} className="space-y-2">
                  {/* 카테고리 헤더 */}
                  <div className={`text-xs font-medium px-2 py-1 rounded-lg inline-block ${tagInfo.color}`}>
                    {tagInfo.label}
                  </div>

                  {/* 업로드 영역 */}
                  <input
                    ref={(el) => { fileInputRefs.current[tagInfo.id] = el }}
                    type="file"
                    accept="image/*,.gif"
                    multiple
                    onChange={(e) => handleCategoryImageUpload(e, tagInfo.id)}
                    className="hidden"
                    id={`upload-${tagInfo.id}`}
                  />
                  <label
                    htmlFor={`upload-${tagInfo.id}`}
                    onDragOver={(e) => handleDragOver(e, tagInfo.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, tagInfo.id)}
                    className={`block w-full min-h-[80px] p-2 border-2 border-dashed rounded-xl transition-all cursor-pointer ${
                      isDraggingHere
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-400 hover:bg-gray-50'
                    }`}
                  >
                    {categoryImages.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {categoryImages.map((img, idx) => (
                          <div key={`${img.name}-${idx}`} className="relative group">
                            <img
                              src={img.url}
                              alt={img.name}
                              className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                removeCategoryImage(tagInfo.id, idx)
                              }}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <div className="w-12 h-12 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-lg">
                          +
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-gray-400 py-2">
                        <span className="text-2xl mb-1">+</span>
                        <span className="text-xs">드래그 또는 클릭</span>
                      </div>
                    )}
                  </label>
                </div>
              )
            })}
          </div>

          {totalImageCount > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              이미지 순서: 치료 전 → X-ray → CT → 치료 과정 → 치료 후 → 기타
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={addCase}
          disabled={!selectedClinic?.name || !selectedTopic || isGenerating}
          className="w-full py-3 px-4 bg-primary-500 text-white font-medium rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + 큐에 추가
        </button>
      </div>

      {/* 케이스 큐 */}
      {cases.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              📋 케이스 큐 ({cases.length}개)
            </h3>
            <div className="flex gap-2">
              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={clearCompleted}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  완료 삭제
                </button>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="text-sm text-red-500 hover:text-red-700"
              >
                전체 삭제
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {cases.map((caseItem, index) => (
              <div
                key={caseItem.id}
                className={`rounded-xl border transition-all overflow-hidden ${
                  caseItem.status === 'completed'
                    ? 'bg-green-50 border-green-200'
                    : caseItem.status === 'error'
                    ? 'bg-red-50 border-red-200'
                    : caseItem.status === 'generating'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {/* 케이스 헤더 */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                    <span className="font-medium text-gray-900">{caseItem.clinicName}</span>
                    <span className="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded-lg">
                      {caseItem.topic}
                    </span>
                    {caseItem.memo && (
                      <span className="text-sm text-gray-500">{caseItem.memo}</span>
                    )}
                    {caseItem.images && caseItem.images.length > 0 && (
                      <span className="text-xs text-gray-400">📷 {caseItem.images.length}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {caseItem.status === 'pending' && (
                      <span className="text-sm text-gray-500">대기 중</span>
                    )}
                    {caseItem.status === 'generating' && (
                      <span className="text-sm text-yellow-600 flex items-center gap-1">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        생성 중...
                      </span>
                    )}
                    {caseItem.status === 'completed' && caseItem.result && (
                      <>
                        <span className="text-xs text-gray-500">
                          {caseItem.result.charCount?.toLocaleString()}자
                        </span>
                        <button
                          type="button"
                          onClick={() => togglePreview(caseItem.id)}
                          className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600"
                        >
                          {expandedCaseId === caseItem.id ? '접기' : '👁️ 미리보기'}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyResult(caseItem)}
                          className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
                        >
                          📋 복사
                        </button>
                      </>
                    )}
                    {caseItem.status === 'error' && (
                      <span className="text-sm text-red-600">❌ 실패</span>
                    )}
                    {caseItem.status === 'pending' && !isGenerating && (
                      <button
                        type="button"
                        onClick={() => removeCase(caseItem.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* 미리보기/편집 영역 */}
                {expandedCaseId === caseItem.id && caseItem.status === 'completed' && caseItem.result && (
                  <div className="border-t border-green-200">
                    {editingCaseId === caseItem.id ? (
                      /* 편집 모드 */
                      <div className="p-4 space-y-4 bg-white">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            본문 ({editContent.length.toLocaleString()}자)
                          </label>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={20}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm leading-relaxed"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(caseItem.id)}
                            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 미리보기 모드 */
                      <div className="p-6 bg-white">
                        {/* 편집 버튼 */}
                        <div className="flex justify-end mb-4">
                          <button
                            type="button"
                            onClick={() => startEditing(caseItem)}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                          >
                            ✏️ 편집
                          </button>
                        </div>

                        {/* 제목 */}
                        <h2 className="text-xl font-bold text-gray-900 mb-6 pb-4 border-b-2 border-primary-200">
                          {caseItem.result.title}
                        </h2>

                        {/* 본문 - 마크다운 렌더링 */}
                        <article className="prose prose-lg max-w-none">
                          <ReactMarkdown
                            components={{
                              h1: ({ children }) => (
                                <h1 className="text-2xl font-bold text-gray-900 mt-10 mb-5 pb-3 border-b border-gray-200">{children}</h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-xl font-bold text-gray-800 mt-8 mb-4 pb-2 border-b border-gray-100">{children}</h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-lg font-semibold text-gray-800 mt-6 mb-3">{children}</h3>
                              ),
                              p: ({ children }) => (
                                <p className="text-gray-700 leading-8 mb-5 text-base">{children}</p>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-disc list-outside space-y-3 mb-6 ml-6 text-gray-700">{children}</ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal list-outside space-y-3 mb-6 ml-6 text-gray-700">{children}</ol>
                              ),
                              li: ({ children }) => (
                                <li className="text-gray-700 leading-7 pl-2">{children}</li>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold text-gray-900">{children}</strong>
                              ),
                              em: ({ children }) => (
                                <em className="italic text-gray-800">{children}</em>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-primary-400 pl-5 py-3 my-6 bg-primary-50 rounded-r-lg italic text-gray-700">
                                  {children}
                                </blockquote>
                              ),
                              hr: () => (
                                <hr className="my-8 border-gray-200" />
                              ),
                              code: ({ children }) => (
                                <code className="bg-gray-100 px-2 py-1 rounded text-sm text-primary-700 font-medium">{children}</code>
                              ),
                            }}
                          >
                            {caseItem.result.content}
                          </ReactMarkdown>
                        </article>

                        {/* 해시태그 */}
                        {caseItem.result.hashtags && caseItem.result.hashtags.length > 0 && (
                          <div className="mt-8 pt-6 border-t border-gray-200">
                            <p className="text-sm font-medium text-gray-600 mb-3">해시태그</p>
                            <div className="flex flex-wrap gap-2">
                              {caseItem.result.hashtags.map((tag, i) => (
                                <span key={i} className="text-sm text-primary-600 bg-primary-50 px-3 py-1.5 rounded-full">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 생성 버튼 */}
      {cases.length > 0 && (
        <div className="space-y-3">
          {isGenerating ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-primary-100 rounded-2xl">
                <svg className="animate-spin h-6 w-6 text-primary-600" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-primary-700 font-medium">
                  생성 중... ({progress.current}/{progress.total})
                </span>
              </div>
              <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-500 h-2 rounded-full transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={generateAll}
              disabled={pendingCount === 0}
              className="w-full py-4 px-6 bg-gradient-to-r from-primary-500 to-primary-600 text-white font-semibold rounded-2xl hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
            >
              ✨ {pendingCount}개 글 한 번에 생성하기
            </button>
          )}
        </div>
      )}

      {/* 완료된 결과 보기 */}
      {completedCount > 0 && !isGenerating && (
        <div className="bg-gradient-to-br from-green-50 to-blue-50 p-6 rounded-2xl border border-green-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            ✅ 생성 완료 ({completedCount}개)
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            각 케이스의 &quot;미리보기&quot; 버튼으로 글을 확인하고, &quot;편집&quot;으로 수정할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => {
              const completedCases = cases.filter(c => c.status === 'completed' && c.result)
              const allContent = completedCases.map((c, i) =>
                `=== ${i + 1}. ${c.clinicName} - ${c.topic} ===\n\n${c.result?.title}\n\n${c.result?.content}`
              ).join('\n\n' + '='.repeat(50) + '\n\n')

              navigator.clipboard.writeText(allContent)
                .then(() => alert('모든 글이 복사되었습니다!'))
                .catch(() => alert('복사에 실패했습니다.'))
            }}
            className="w-full py-3 px-4 bg-green-500 text-white font-medium rounded-xl hover:bg-green-600 transition-colors"
          >
            📋 모든 글 한 번에 복사
          </button>
        </div>
      )}
    </div>
  )
}
