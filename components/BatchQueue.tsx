'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { LLMModel, GenerateResult, UploadedImage, WritingMode, BatchDiversityHints } from '@/types'
import { validatePost, ValidationResult, ValidationCheck } from '@/lib/post-validator'

// 케이스 타입
interface BlogCase {
  id: string
  clinicName: string
  region: string
  doctorName: string
  topic: string
  sourceClinic?: string // 타 치과 주제 차용 시 원본 치과명
  memo: string
  writingMode: WritingMode
  citePapers?: boolean // 논문 인용 모드
  mainKeyword?: string // 메인키워드 (사용자 직접 입력)
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

// LLM 모델 옵션 (2개만)
const LLM_MODELS = [
  { id: 'claude', name: 'Claude Sonnet 🎯', description: '고품질 한국어 글쓰기 (추천)' },
  { id: 'gemini', name: 'Gemini Pro ⚡', description: '빠른 응답 + 무료' },
] as const

// 포스팅 모드 옵션
const POSTING_MODES = [
  {
    id: 'expert' as WritingMode,
    name: '🏥 임상 포스팅',
    description: '사진 판독 기반 · 전문 용어 + 해설 · 문어체',
    details: ['임상 소견 중심', '전문적 신뢰감']
  },
  {
    id: 'informative' as WritingMode,
    name: '📚 정보성 포스팅',
    description: '일반인 눈높이 · 쉬운 비유 · 문어체 + 친근한 톤',
    details: ['궁금증 해결 중심', '이해하기 쉬운']
  },
] as const

// 파일명에서 순번 추출 (01_xxx.jpg → 1, 없으면 999)
function extractOrderFromFilename(filename: string): number {
  const match = filename.match(/^(\d{1,3})[_\-\s]/)
  return match ? parseInt(match[1], 10) : 999
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
                className={`w-full px-3 py-2 text-left hover:bg-primary-50 ${value === opt ? 'bg-primary-100 text-primary-700' : ''
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

// 검증 패널 컴포넌트
function BatchValidationPanel({ caseItem }: { caseItem: BlogCase }) {
  const [expanded, setExpanded] = useState(false)

  const validation = useMemo(() => {
    if (!caseItem.result?.content) return null
    return validatePost(caseItem.result.content, {
      clinicName: caseItem.clinicName,
      topic: caseItem.topic,
      writingMode: caseItem.writingMode,
      mainKeyword: caseItem.mainKeyword,
      region: caseItem.region,
      citePapers: !!(caseItem.result.references && caseItem.result.references.length > 0),
    })
  }, [caseItem.result?.content, caseItem.clinicName, caseItem.topic, caseItem.writingMode, caseItem.mainKeyword])

  if (!validation) return null

  const scoreColor = validation.score >= 80
    ? 'text-green-700 bg-green-100'
    : validation.score >= 50
      ? 'text-yellow-700 bg-yellow-100'
      : 'text-red-700 bg-red-100'

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">
            {validation.passed ? '\u2705' : '\u26A0\uFE0F'} 규칙 검사
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>
            {validation.score}점
          </span>
          <span className="text-xs text-gray-500">
            {validation.checks.filter(c => c.passed).length}/{validation.checks.length} 통과
          </span>
        </div>
        <span className="text-gray-400 text-sm">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {validation.checks.map((check, i) => (
            <BatchCheckItem key={i} check={check} />
          ))}
        </div>
      )}
    </div>
  )
}

function BatchCheckItem({ check }: { check: ValidationCheck }) {
  const [showDetails, setShowDetails] = useState(false)
  const icon = check.passed ? '\u2705' : check.severity === 'error' ? '\u274C' : '\u26A0\uFE0F'
  const bgColor = check.passed
    ? 'bg-green-50 border-green-200'
    : check.severity === 'error'
      ? 'bg-red-50 border-red-200'
      : 'bg-yellow-50 border-yellow-200'

  return (
    <div className={`rounded-lg border p-2.5 ${bgColor}`}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => check.details && setShowDetails(!showDetails)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-medium text-gray-800">{check.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{check.message}</span>
          {check.details && (
            <span className="text-gray-400 text-xs">{showDetails ? '\u25B2' : '\u25BC'}</span>
          )}
        </div>
      </div>
      {showDetails && check.details && (
        <div className="mt-2 pl-6 space-y-0.5">
          {check.details.map((d, j) => (
            <p key={j} className="text-xs text-gray-500">{d}</p>
          ))}
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

  // 치과별 주제 필터
  const [clinicTopics, setClinicTopics] = useState<string[]>([])
  const [isLoadingClinicTopics, setIsLoadingClinicTopics] = useState(false)

  // 현재 입력 폼
  const [selectedClinic, setSelectedClinic] = useState<ClinicPreset | null>(null)
  const [selectedTopic, setSelectedTopic] = useState('')
  const [memo, setMemo] = useState('')
  const [mainKeyword, setMainKeyword] = useState('')

  // 타 치과 주제 불러오기 상태
  const [sheetAllClinicTopics, setSheetAllClinicTopics] = useState<Array<{ clinic: string; topic: string }>>([])
  const [borrowTopicMode, setBorrowTopicMode] = useState(false)
  const [borrowSearch, setBorrowSearch] = useState('')
  const [selectedSourceClinic, setSelectedSourceClinic] = useState('')
  // 다중 선택 상태: Key="Clinic:Topic", Value={clinic, topic}
  const [borrowSelection, setBorrowSelection] = useState<Map<string, { clinic: string; topic: string }>>(new Map())

  // 임상 이미지 (단일 배열)
  const [images, setImages] = useState<UploadedImage[]>([])

  // 모델 선택 (기본: Claude Sonnet)
  const [model, setModel] = useState<LLMModel>('claude')

  // 포스팅 모드 선택 (기본: 임상 포스팅)
  const [postingMode, setPostingMode] = useState<WritingMode>('expert')

  // 논문 인용 모드 (정보성 모드에서만 활성)
  const [citePapers, setCitePapers] = useState(false)

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

  // 파일 입력 ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 드래그 앤 드랍 상태
  const [isDragging, setIsDragging] = useState(false)

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

        if (data.allClinicTopics) {
          setSheetAllClinicTopics(data.allClinicTopics)
        }
      } catch (error) {
        console.error('Failed to load clinic presets:', error)
      } finally {
        setIsLoadingPresets(false)
      }
    }
    loadPresets()
  }, [])

  // 치과명 선택 시 해당 치과의 주제 목록 가져오기
  useEffect(() => {
    if (!selectedClinic?.name) {
      setClinicTopics([])
      return
    }

    async function fetchClinicTopics() {
      setIsLoadingClinicTopics(true)
      try {
        const res = await fetch(`/api/clinic-topics?clinicName=${encodeURIComponent(selectedClinic!.name)}`)
        const data = await res.json()
        if (data.topics?.length > 0) {
          setClinicTopics(data.topics)
          // 현재 선택된 주제가 새 목록에 없으면 초기화
          if (selectedTopic && !data.topics.includes(selectedTopic)) {
            setSelectedTopic('')
          }
        } else {
          setClinicTopics([])
        }
      } catch (error) {
        console.error('Failed to fetch clinic topics:', error)
        setClinicTopics([])
      } finally {
        setIsLoadingClinicTopics(false)
      }
    }
    fetchClinicTopics()
  }, [selectedClinic?.name])

  // 이미지 파일 처리
  const processImageFile = useCallback((file: File) => {
    return new Promise<UploadedImage>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        resolve({
          name: file.name,
          url: event.target?.result as string,
          file,
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  // 이미지 업로드 처리
  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const newImages = await Promise.all(imageFiles.map(f => processImageFile(f)))
      setImages(prev => [...prev, ...newImages])
    } catch (error) {
      console.error('이미지 업로드 오류:', error)
      alert('이미지 업로드에 실패했습니다.')
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [processImageFile])

  // 이미지 삭제
  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index))
  }, [])

  // 드래그 앤 드랍 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

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
      const newImages = await Promise.all(imageFiles.map(f => processImageFile(f)))
      setImages(prev => [...prev, ...newImages])
    } catch (error) {
      console.error('이미지 업로드 오류:', error)
      alert('이미지 업로드에 실패했습니다.')
    }
  }, [processImageFile])

  // 파일명 순번 기준 정렬
  const getSortedImages = useCallback((): UploadedImage[] => {
    return [...images].sort((a, b) =>
      extractOrderFromFilename(a.name) - extractOrderFromFilename(b.name)
    )
  }, [images])

  // 치과명 목록
  const clinicNames = clinicPresets.map(c => c.name)

  // 치료 목록: 치과별 주제 > 시트 전체 > 기본 목록
  const allTreatments = clinicTopics.length > 0
    ? clinicTopics
    : [...new Set([...sheetTreatments, ...TREATMENTS])].sort()

  // 치과 선택 핸들러
  const handleClinicSelect = (name: string) => {
    const preset = clinicPresets.find(c => c.name === name)
    if (preset) {
      setSelectedClinic(preset)
    } else {
      // 커스텀 입력
      setSelectedClinic({ name, region: '', doctorName: '' })
    }
    // 치과 변경 시 소스 치과 초기화
    setSelectedSourceClinic('')
  }

  // 케이스 추가
  const addCase = () => {
    if (!selectedClinic || !selectedTopic) {
      alert('치과와 치료를 선택해주세요.')
      return
    }

    const sortedImages = getSortedImages()
    const newCase: BlogCase = {
      id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      clinicName: selectedClinic.name,
      region: selectedClinic.region,
      doctorName: selectedClinic.doctorName,
      topic: selectedTopic,
      sourceClinic: selectedSourceClinic || undefined,
      memo: memo.trim(),
      writingMode: postingMode,
      citePapers: postingMode === 'informative' ? citePapers : false,
      mainKeyword: mainKeyword.trim() || undefined,
      images: sortedImages.length > 0 ? sortedImages : undefined,
      status: 'pending',
    }

    setCases(prev => [...prev, newCase])
    setMemo('')
    setMainKeyword('')
    setImages([])
  }

  // 선택된 차용 주제들 일괄 추가
  const addBorrowedBatch = () => {
    if (!selectedClinic) {
      alert('치과를 먼저 선택해주세요.')
      return
    }

    if (borrowSelection.size === 0) return

    const newCases: BlogCase[] = []
    const sortedImages = getSortedImages() // 현재 업로드된 이미지를 모든 케이스에 공통 적용 (원치 않으면 사전에 제거)

    borrowSelection.forEach((startItem) => {
      const newCase: BlogCase = {
        id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        clinicName: selectedClinic.name,
        region: selectedClinic.region,
        doctorName: selectedClinic.doctorName,
        topic: startItem.topic,
        sourceClinic: startItem.clinic,
        memo: memo.trim(),
        writingMode: postingMode,
        citePapers: postingMode === 'informative' ? citePapers : false,
        mainKeyword: mainKeyword.trim() || undefined,
        images: sortedImages.length > 0 ? [...sortedImages] : undefined, // 복사해서 할당
        status: 'pending',
      }
      newCases.push(newCase)
    })

    setCases(prev => [...prev, ...newCases])
    setBorrowSelection(new Map())
    setBorrowTopicMode(false)
    alert(`${newCases.length}개의 케이스가 추가되었습니다.`)
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

  // 배치 다양성 힌트 사전 배분 (Shuffle-and-Cycle 알고리즘)
  const assignDiversityHints = (pendingCases: BlogCase[]): Map<string, BatchDiversityHints> => {
    const total = pendingCases.length
    const hints = new Map<string, BatchDiversityHints>()

    const INTRO_HOOK_TYPES = ['체험공감', '숫자통계', '일상상황', '오해반전', '계절시기']

    // 셔플+사이클 분배: poolSize보다 많으면 전체 셔플을 반복 채움
    function distribute(poolSize: number, count: number): number[] {
      const result: number[] = []
      let pool: number[] = []
      while (result.length < count) {
        if (pool.length === 0) {
          pool = Array.from({ length: poolSize }, (_, i) => i)
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
              ;[pool[i], pool[j]] = [pool[j], pool[i]]
          }
        }
        result.push(pool.shift()!)
      }
      return result
    }

    const greetings = distribute(8, total)
    const empathyHooks = distribute(8, total)
    const transitions = distribute(8, total)
    const seasonHooks = distribute(5, total)
    const empathyPhrases = distribute(5, total)
    const transitionPhrases = distribute(10, total)
    const introHookTypes = distribute(5, total)
    const closingCtas = distribute(5, total)

    pendingCases.forEach((c, i) => {
      hints.set(c.id, {
        batchIndex: i,
        totalBatchSize: total,
        greetingIndex: greetings[i],
        empathyHookIndex: empathyHooks[i],
        transitionIndex: transitions[i],
        seasonHookIndex: seasonHooks[i],
        empathyPhraseIndex: empathyPhrases[i],
        transitionPhraseIndex: transitionPhrases[i],
        introHookType: INTRO_HOOK_TYPES[introHookTypes[i]],
        closingCtaIndex: closingCtas[i],
      })
    })

    return hints
  }

  // 단일 케이스 생성
  const generateSingleCase = async (caseItem: BlogCase, diversityHints?: BatchDiversityHints): Promise<BlogCase> => {
    try {
      const payload = {
        clinicName: caseItem.clinicName,
        region: caseItem.region,
        doctorName: caseItem.doctorName,
        topic: caseItem.topic,
        sourceClinic: caseItem.sourceClinic,
        patientInfo: caseItem.memo || '일반 환자',
        treatment: caseItem.memo
          ? `${caseItem.topic} - ${caseItem.memo.substring(0, 100)}`
          : `${caseItem.topic} 치료`,
        model,
        writingMode: caseItem.writingMode,
        citePapers: caseItem.citePapers || false,
        mainKeyword: caseItem.mainKeyword || undefined,
        images: caseItem.images?.map((img) => ({
          name: img.name,
        })),
        diversityHints: diversityHints || undefined,
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

  // 배치 생성 (다양성 힌트 + 적응적 병렬 처리)
  const generateAll = async () => {
    const pendingCases = cases.filter(c => c.status === 'pending')
    if (pendingCases.length === 0) {
      alert('생성할 케이스가 없습니다.')
      return
    }

    setIsGenerating(true)
    setProgress({ current: 0, total: pendingCases.length })

    // ★ 배치 전체에 대해 다양성 힌트 사전 배분
    const diversityMap = assignDiversityHints(pendingCases)

    setCases(prev => prev.map(c =>
      c.status === 'pending' ? { ...c, status: 'generating' as const } : c
    ))

    // 적응적 배치 크기: 10개 이하 → 2, 11개 이상 → 3
    const batchSize = pendingCases.length > 10 ? 3 : 2
    const delayMs = pendingCases.length > 10 ? 1000 : 500

    for (let i = 0; i < pendingCases.length; i += batchSize) {
      const batch = pendingCases.slice(i, i + batchSize)

      const results = await Promise.all(
        batch.map(caseItem => generateSingleCase(caseItem, diversityMap.get(caseItem.id)))
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

      // 배치 간 딜레이 (rate limit 방지)
      if (i + batchSize < pendingCases.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }

    setIsGenerating(false)

    if (onResultsReady) {
      const completedCases = cases.filter(c => c.status === 'completed')
      onResultsReady(completedCases)
    }
  }

  // 실패 케이스 리트라이
  const retryFailed = () => {
    const failedCases = cases.filter(c => c.status === 'error')
    if (failedCases.length === 0) return

    // pending으로 전환 → 사용자가 "생성하기" 버튼으로 재실행
    setCases(prev => prev.map(c =>
      c.status === 'error' ? { ...c, status: 'pending' as const, error: undefined } : c
    ))
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
                  📷 임상 이미지 업로드
                </h3>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 text-sm">
                  <p className="text-gray-600">
                    임상 이미지를 한 곳에 업로드하면 AI가 파일명을 분석하여 자동으로 글에 배치합니다.
                  </p>

                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p className="font-medium text-green-700">✨ 사용 방법</p>
                    <ul className="mt-2 space-y-1 text-xs text-green-600">
                      <li>• 업로드 영역에 이미지를 <strong>드래그 앤 드랍</strong> 또는 <strong>클릭</strong></li>
                      <li>• 여러 장 한 번에 선택 가능</li>
                    </ul>
                  </div>

                  <div className="bg-primary-50 rounded-lg p-3">
                    <p className="font-medium text-primary-700">📋 파일명 규칙 (권장)</p>
                    <ul className="mt-2 space-y-1 text-xs text-primary-600">
                      <li>• <strong>01_초진_파노라마.jpg</strong> → 순서 1, 초진 파노라마</li>
                      <li>• <strong>02_치료중_상악동거상술.jpg</strong> → 순서 2, 치료중</li>
                      <li>• <strong>03_치료후_임플란트세팅.jpg</strong> → 순서 3, 치료후</li>
                      <li>• 숫자가 없어도 업로드 순서대로 배치됩니다</li>
                    </ul>
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
                        <li>• 도입부 자동 다양화 (10+개도 OK)</li>
                        <li>• 실패 시 &quot;대기열로 복구&quot; 버튼 사용</li>
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
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${model === m.id
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
              {clinicTopics.length > 0 && (
                <span className="ml-1 text-xs text-primary-600 font-normal">
                  ({selectedClinic?.name} 주제 {clinicTopics.length}개)
                </span>
              )}
              {isLoadingClinicTopics && (
                <span className="ml-1 text-xs text-gray-400 font-normal">불러오는 중...</span>
              )}
            </label>
            <SearchableSelect
              options={allTreatments}
              value={selectedTopic}
              onChange={(val) => {
                setSelectedTopic(val)
                setSelectedSourceClinic('')
              }}
              placeholder={clinicTopics.length > 0 ? `${selectedClinic?.name} 주제 검색...` : "치료 검색..."}
              allowCustom
            />

            {/* 다른 치과 주제 불러오기 */}
            <div className="mt-2">
              {!borrowTopicMode ? (
                <button
                  type="button"
                  onClick={() => setBorrowTopicMode(true)}
                  className="text-xs text-primary-600 font-medium hover:text-primary-800 flex items-center gap-1"
                >
                  [+] 다른 치과 주제 불러오기 (다른 병원 글 참고)
                </button>
              ) : (
                <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-700">다른 치과 주제 검색 (다중 선택 가능)</span>
                    <button
                      onClick={() => setBorrowTopicMode(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  <input
                    type="text"
                    value={borrowSearch}
                    placeholder="주제 또는 병원명 검색..."
                    className="w-full text-xs px-2 py-1.5 border rounded-lg mb-2 focus:outline-none focus:border-primary-500"
                    onChange={(e) => setBorrowSearch(e.target.value)}
                    autoFocus
                  />

                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {sheetAllClinicTopics
                      .filter(item =>
                        !borrowSearch ||
                        item.topic.toLowerCase().includes(borrowSearch.toLowerCase()) ||
                        item.clinic.toLowerCase().includes(borrowSearch.toLowerCase())
                      )
                      .length > 0 ? (
                      sheetAllClinicTopics
                        .filter(item =>
                          !borrowSearch ||
                          item.topic.toLowerCase().includes(borrowSearch.toLowerCase()) ||
                          item.clinic.toLowerCase().includes(borrowSearch.toLowerCase())
                        )
                        .map((item, idx) => {
                          const key = `${item.clinic}:${item.topic}`
                          const isSelected = borrowSelection.has(key)
                          return (
                            <div
                              key={`${item.clinic}-${item.topic}-${idx}`}
                              className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded border transition-colors ${isSelected ? 'bg-primary-50 border-primary-200' : 'bg-white border-gray-100 hover:border-primary-200'
                                }`}
                            >
                              {/* 체크박스 (다중 선택) */}
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  const newMap = new Map(borrowSelection)
                                  if (newMap.has(key)) {
                                    newMap.delete(key)
                                  } else {
                                    newMap.set(key, item)
                                  }
                                  setBorrowSelection(newMap)
                                }}
                                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                              />

                              {/* 텍스트 클릭 시 단일 채우기 (기존 동작) */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedTopic(item.topic)
                                  setSelectedSourceClinic(item.clinic)
                                  setBorrowTopicMode(false)
                                  setBorrowSearch('')
                                }}
                                className="flex-1 text-left flex justify-between items-center group"
                              >
                                <span className="font-medium text-gray-700">{item.topic}</span>
                                <span className="text-gray-400 group-hover:text-primary-600 text-[10px]">
                                  {item.clinic}
                                </span>
                              </button>
                            </div>
                          )
                        })
                    ) : (
                      <p className="text-xs text-gray-400 p-1">검색 결과가 없습니다.</p>
                    )}
                  </div>

                  {/* 다중 추가 버튼 */}
                  {borrowSelection.size > 0 && (
                    <button
                      type="button"
                      onClick={addBorrowedBatch}
                      className="w-full py-2 bg-primary-600 text-white text-xs font-bold rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
                    >
                      선택한 {borrowSelection.size}개 케이스 일괄 추가하기
                    </button>
                  )}
                </div>
              )}

              {/* 선택된 소스 치과 표시 */}
              {selectedSourceClinic && (
                <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg border border-blue-100 flex items-center justify-between">
                  <span>🔄 <b>{selectedSourceClinic}</b>의 글을 참조합니다</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSourceClinic('')}
                    className="text-blue-400 hover:text-red-500 font-bold px-1"
                    title="참조 취소"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CC / 메모 (선택)
            </label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={4}
              placeholder={"예:\n#36 치근단 병소 관찰\n저작 시 통증 호소\n골이식 후 임플란트 식립 예정"}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
          </div>
        </div>

        {/* 메인키워드 입력 (3열 아래에 full-width) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            🎯 메인키워드 (선택)
            <span className="ml-2 text-xs text-gray-400 font-normal">제목 포함 7회 배치 · 미입력 시 자동 생성</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={mainKeyword}
              onChange={(e) => setMainKeyword(e.target.value)}
              placeholder={selectedClinic?.region && selectedTopic
                ? `예: ${selectedClinic.region} 치과  또는  ${selectedClinic.region} ${selectedTopic}`
                : '예: 부평 치과  또는  부평 임플란트'}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {selectedClinic?.region && (
              <button
                type="button"
                onClick={() => setMainKeyword(`${selectedClinic.region} 치과`)}
                className="px-3 py-2 text-xs bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 whitespace-nowrap border border-blue-200"
              >
                지역+치과
              </button>
            )}
            {selectedClinic?.region && selectedTopic && (
              <button
                type="button"
                onClick={() => setMainKeyword(`${selectedClinic.region} ${selectedTopic}`)}
                className="px-3 py-2 text-xs bg-green-50 text-green-600 rounded-xl hover:bg-green-100 whitespace-nowrap border border-green-200"
              >
                지역+진료
              </button>
            )}
          </div>
        </div>

        {/* 임상 이미지 업로드 (단일 영역) */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            📷 임상 이미지 (선택) {images.length > 0 && <span className="text-primary-600">· {images.length}개</span>}
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.gif"
            multiple
            onChange={handleImageUpload}
            className="hidden"
            id="upload-images"
          />
          <label
            htmlFor="upload-images"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`block w-full min-h-[100px] p-4 border-2 border-dashed rounded-xl transition-all cursor-pointer ${isDragging
              ? 'border-primary-500 bg-primary-50'
              : 'border-gray-200 hover:border-primary-400 hover:bg-gray-50'
              }`}
          >
            {images.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {getSortedImages().map((img, idx) => (
                  <div key={`${img.name}-${idx}`} className="relative group text-center">
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                    />
                    <p className="text-[10px] text-gray-500 mt-1 max-w-[64px] truncate" title={img.name}>
                      {img.name}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        removeImage(images.indexOf(img))
                      }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="w-16 h-16 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-lg">
                  +
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-4">
                <span className="text-3xl mb-2 block">📷</span>
                <span className="text-sm">임상 이미지를 드래그하거나 클릭하여 업로드</span>
                <span className="block text-xs mt-1 text-gray-300">파일명 규칙: 01_초진_파노라마.jpg, 02_치료중_골이식.jpg</span>
              </div>
            )}
          </label>

          {images.length > 0 && (
            <p className="text-xs text-gray-500 mt-2">
              파일명의 숫자 순서(01, 02...)대로 글에 배치됩니다.
            </p>
          )}
        </div>

        {/* 케이스별 포스팅 모드 선택 */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm font-medium text-gray-700 shrink-0">모드:</span>
          <div className="flex gap-2 flex-1">
            {POSTING_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setPostingMode(mode.id)}
                className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all border ${postingMode === mode.id
                  ? mode.id === 'expert'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-green-500 bg-green-50 text-green-700'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                  }`}
              >
                {mode.id === 'expert' ? '🏥 임상' : '📚 정보성'}
              </button>
            ))}
          </div>
        </div>

        {/* 논문 인용 옵션 - 정보성 모드에서만 */}
        {postingMode === 'informative' && (
          <div className="mb-3">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={citePapers}
                onChange={(e) => setCitePapers(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-gray-700">📎 논문 인용 모드</span>
              <span className="text-xs text-gray-400">(PubMed 학술 인용)</span>
            </label>
          </div>
        )}

        <button
          type="button"
          onClick={addCase}
          disabled={!selectedClinic?.name || !selectedTopic || isGenerating}
          className="w-full py-3 px-4 bg-primary-500 text-white font-medium rounded-xl hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          + 큐에 추가 ({postingMode === 'expert' ? '🏥 임상' : '📚 정보성'})
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
                className={`rounded-xl border transition-all overflow-hidden ${caseItem.status === 'completed'
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
                    {caseItem.sourceClinic && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg flex items-center gap-1" title={`출처: ${caseItem.sourceClinic}`}>
                        🔄 {caseItem.sourceClinic}
                      </span>
                    )}
                    {/* 포스팅 모드 배지 (클릭으로 변경 가능) */}
                    <button
                      type="button"
                      onClick={() => {
                        if (caseItem.status !== 'pending') return
                        setCases(prev => prev.map(c =>
                          c.id === caseItem.id
                            ? { ...c, writingMode: c.writingMode === 'expert' ? 'informative' : 'expert' }
                            : c
                        ))
                      }}
                      disabled={caseItem.status !== 'pending'}
                      className={`px-2 py-0.5 text-xs rounded-lg transition-all ${caseItem.writingMode === 'expert'
                        ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                        } ${caseItem.status !== 'pending' ? 'cursor-default opacity-70' : 'cursor-pointer'}`}
                      title={caseItem.status === 'pending' ? '클릭하여 모드 변경' : ''}
                    >
                      {caseItem.writingMode === 'expert' ? '🏥 임상' : '📚 정보성'}
                    </button>
                    {caseItem.mainKeyword && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-lg">
                        🎯 {caseItem.mainKeyword}
                      </span>
                    )}
                    {caseItem.memo && (
                      <span className="text-sm text-gray-500 truncate max-w-[200px]">{caseItem.memo}</span>
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

                        {/* 규칙 검증 패널 */}
                        <BatchValidationPanel caseItem={caseItem} />
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

          {/* 실패 케이스 리트라이 버튼 */}
          {cases.some(c => c.status === 'error') && !isGenerating && (
            <button
              type="button"
              onClick={retryFailed}
              className="w-full py-3 px-4 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 transition-colors"
            >
              🔄 실패한 {cases.filter(c => c.status === 'error').length}개 대기열로 복구
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
