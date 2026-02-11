'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { GenerateFormData, UploadedImage, KeywordAnalysisState, WritingMode } from '@/types'

interface Props {
  onSubmit: (data: GenerateFormData) => void
  isLoading: boolean
}

const LLM_MODELS = [
  { id: 'claude', name: 'Claude Sonnet', description: '고품질 한국어 글쓰기 (추천)', icon: '🎯' },
  { id: 'gemini', name: 'Gemini Pro', description: '빠른 응답 + 무료', icon: '⚡' },
] as const

// 글쓰기 모드 옵션 (임상/정보성 2가지만 - BatchQueue와 통일)
const WRITING_MODES: Array<{ id: WritingMode; name: string; description: string; icon: string }> = [
  { id: 'expert', name: '🏥 임상 포스팅', description: '사진 판독 기반 · 전문 용어 + 해설 · 문어체', icon: '🎓' },
  { id: 'informative', name: '📚 정보성 포스팅', description: '일반인 눈높이 · 쉬운 비유 · 문어체 + 친근한 톤', icon: '📚' },
]

// 기본 치료 목록 (시트에서 못 가져올 경우)
const DEFAULT_TREATMENTS = [
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
]

// 검색 가능한 Combobox 컴포넌트
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  required,
  onCustomInput,
}: {
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  required?: boolean
  onCustomInput?: () => void
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
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
        required={required && !value}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-y-auto">
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
          ) : (
            <div className="px-3 py-2 text-gray-500">검색 결과 없음</div>
          )}
          {onCustomInput && (
            <button
              type="button"
              onClick={() => {
                onCustomInput()
                setIsOpen(false)
              }}
              className="w-full px-3 py-2 text-left text-primary-600 hover:bg-primary-50 border-t"
            >
              + 직접 입력하기
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// 키워드 버튼 컴포넌트
function KeywordButton({
  keyword,
  isSelected,
  onClick,
  variant = 'default',
}: {
  keyword: string
  isSelected: boolean
  onClick: () => void
  variant?: 'default' | 'trending' | 'seasonal'
}) {
  const baseClass = 'px-3 py-1.5 rounded-full text-sm font-medium transition-all border'
  const variants = {
    default: isSelected
      ? 'bg-primary-500 text-white border-primary-500'
      : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400 hover:text-primary-600',
    trending: isSelected
      ? 'bg-red-500 text-white border-red-500'
      : 'bg-red-50 text-red-700 border-red-200 hover:border-red-400',
    seasonal: isSelected
      ? 'bg-orange-500 text-white border-orange-500'
      : 'bg-orange-50 text-orange-700 border-orange-200 hover:border-orange-400',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClass} ${variants[variant]}`}
    >
      {variant === 'trending' && !isSelected && '🔥 '}
      {variant === 'seasonal' && !isSelected && '🗓️ '}
      {keyword}
      {isSelected && ' ✓'}
    </button>
  )
}

export default function GenerateForm({ onSubmit, isLoading }: Props) {
  // 시트 데이터
  const [sheetClinics, setSheetClinics] = useState<string[]>([])
  const [sheetClinicDetails, setSheetClinicDetails] = useState<Array<{name: string; region: string; doctorName: string}>>([])
  const [sheetTreatments, setSheetTreatments] = useState<string[]>([])
  const [isLoadingSheet, setIsLoadingSheet] = useState(true)

  // 치과별 주제 필터
  const [clinicTopics, setClinicTopics] = useState<string[]>([])
  const [isLoadingClinicTopics, setIsLoadingClinicTopics] = useState(false)

  // 직접 입력 모드
  const [customClinicMode, setCustomClinicMode] = useState(false)
  const [customTopicMode, setCustomTopicMode] = useState(false)

  // 이미지 업로드
  const [images, setImages] = useState<UploadedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 키워드 분석 상태
  const [keywordState, setKeywordState] = useState<KeywordAnalysisState>({
    isAnalyzed: false,
    isAnalyzing: false,
    recommendedKeywords: {
      main: [],
      sub: [],
      seasonal: [],
      trending: [],
    },
    selectedKeywords: [],
    seoRecommendations: [],
    seoScore: null,
    hasPersona: false,
    personaPostCount: 0,
  })

  const [formData, setFormData] = useState<GenerateFormData>({
    clinicName: '',
    region: '',
    doctorName: '',
    topic: '',
    customTopic: '',
    patientInfo: '',
    treatment: '',
    photoDescription: '',
    model: 'claude',
    writingMode: 'expert' as WritingMode, // 임상 포스팅 기본
  })

  // 시트 데이터 가져오기
  useEffect(() => {
    async function fetchSheetData() {
      try {
        const res = await fetch('/api/sheet-data')
        const data = await res.json()
        if (data.clinics?.length > 0) {
          setSheetClinics(data.clinics)
        }
        if (data.clinicDetails?.length > 0) {
          setSheetClinicDetails(data.clinicDetails)
        }
        if (data.treatments?.length > 0) {
          setSheetTreatments(data.treatments)
        }
      } catch (error) {
        console.error('Failed to fetch sheet data:', error)
      } finally {
        setIsLoadingSheet(false)
      }
    }
    fetchSheetData()
  }, [])

  // 치과명 선택 시 해당 치과의 주제 목록 가져오기
  useEffect(() => {
    if (!formData.clinicName) {
      setClinicTopics([])
      return
    }

    async function fetchClinicTopics() {
      setIsLoadingClinicTopics(true)
      try {
        const res = await fetch(`/api/clinic-topics?clinicName=${encodeURIComponent(formData.clinicName)}`)
        const data = await res.json()
        if (data.topics?.length > 0) {
          setClinicTopics(data.topics)
          // 현재 선택된 주제가 새 목록에 없으면 초기화
          if (formData.topic && !data.topics.includes(formData.topic)) {
            setFormData(prev => ({ ...prev, topic: '' }))
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
  }, [formData.clinicName])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    // 주요 필드가 변경되면 분석 상태 초기화
    if (['clinicName', 'topic', 'customTopic', 'region'].includes(name)) {
      setKeywordState(prev => ({
        ...prev,
        isAnalyzed: false,
        selectedKeywords: [],
      }))
    }
  }

  // 이미지 파일 처리 함수
  const processImageFile = useCallback((file: File) => {
    return new Promise<UploadedImage>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const url = event.target?.result as string
        resolve({
          name: file.name,
          url,
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

    // 이미지 파일만 필터링
    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.gif')
    )

    if (imageFiles.length === 0) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    try {
      const newImages = await Promise.all(imageFiles.map(processImageFile))
      setImages((prev) => [...prev, ...newImages])
    } catch (error) {
      console.error('이미지 업로드 오류:', error)
      alert('이미지 업로드에 실패했습니다.')
    }

    // input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processImageFile])

  // 이미지 삭제
  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // 키워드 선택/해제
  const toggleKeyword = (keyword: string) => {
    setKeywordState(prev => {
      const isSelected = prev.selectedKeywords.includes(keyword)
      return {
        ...prev,
        selectedKeywords: isSelected
          ? prev.selectedKeywords.filter(k => k !== keyword)
          : [...prev.selectedKeywords, keyword],
      }
    })
  }

  // 네이버 최적화 분석 실행
  const handleAnalyzeKeywords = async () => {
    const finalTopic = customTopicMode && formData.customTopic
      ? formData.customTopic
      : formData.topic

    if (!finalTopic) {
      alert('주제/치료를 선택해주세요.')
      return
    }

    setKeywordState(prev => ({ ...prev, isAnalyzing: true }))

    try {
      const response = await fetch('/api/analyze-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicName: formData.clinicName,
          topic: finalTopic,
          region: formData.region,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setKeywordState({
          isAnalyzed: true,
          isAnalyzing: false,
          recommendedKeywords: data.recommendedKeywords,
          selectedKeywords: [
            ...data.recommendedKeywords.main.slice(0, 2),
            ...data.recommendedKeywords.sub.slice(0, 2),
          ], // 기본 선택
          seoRecommendations: data.seoRecommendations,
          seoScore: data.trendAnalysis?.seoScore || null,
          hasPersona: !!data.persona,
          personaPostCount: data.persona?.postCount || 0,
        })
      } else {
        alert(data.error || '키워드 분석에 실패했습니다.')
        setKeywordState(prev => ({ ...prev, isAnalyzing: false }))
      }
    } catch (error) {
      console.error('Keyword analysis error:', error)
      alert('키워드 분석에 실패했습니다.')
      setKeywordState(prev => ({ ...prev, isAnalyzing: false }))
    }
  }

  // 글 생성 제출
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // 최종 토픽 결정
    const finalTopic = customTopicMode && formData.customTopic
      ? formData.customTopic
      : formData.topic

    onSubmit({
      ...formData,
      topic: finalTopic,
      images: images.length > 0 ? images : undefined,
      selectedKeywords: keywordState.selectedKeywords,
      usePersona: keywordState.hasPersona,
    })
  }

  // 분석 없이 바로 생성
  const handleDirectGenerate = (e: React.FormEvent) => {
    e.preventDefault()

    const finalTopic = customTopicMode && formData.customTopic
      ? formData.customTopic
      : formData.topic

    onSubmit({
      ...formData,
      topic: finalTopic,
      images: images.length > 0 ? images : undefined,
    })
  }

  // 사용할 치료 목록: 치과별 주제 > 시트 전체 주제 > 기본 목록
  const treatmentOptions = clinicTopics.length > 0
    ? clinicTopics
    : (sheetTreatments.length > 0 ? sheetTreatments : DEFAULT_TREATMENTS)

  // 필수 필드 체크
  const isBasicInfoComplete = formData.clinicName && formData.region && formData.doctorName &&
    (formData.topic || formData.customTopic) && formData.patientInfo && formData.treatment

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI 모델 선택 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🤖 AI 모델 선택</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LLM_MODELS.map((model) => (
            <label
              key={model.id}
              className={`relative flex flex-col p-5 cursor-pointer rounded-xl border-2 transition-all ${formData.model === model.id
                  ? 'border-primary-500 bg-primary-50 shadow-md'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
            >
              <input
                type="radio"
                name="model"
                value={model.id}
                checked={formData.model === model.id}
                onChange={handleChange}
                className="sr-only"
              />
              <span className="font-semibold text-gray-900 text-lg">{model.icon} {model.name}</span>
              <span className="text-sm text-gray-500 mt-1">{model.description}</span>
              {formData.model === model.id && (
                <span className="absolute top-3 right-3 text-primary-500 text-xl">✓</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* 글쓰기 모드 선택 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">✍️ 글쓰기 스타일</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {WRITING_MODES.map((mode) => (
            <label
              key={mode.id || 'default'}
              className={`relative flex flex-col p-4 cursor-pointer rounded-xl border-2 transition-all ${formData.writingMode === mode.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
                }`}
            >
              <input
                type="radio"
                name="writingMode"
                value={mode.id || ''}
                checked={formData.writingMode === mode.id}
                onChange={() => setFormData(prev => ({ ...prev, writingMode: mode.id }))}
                className="sr-only"
              />
              <span className="font-medium text-gray-900">{mode.icon} {mode.name}</span>
              <span className="text-xs text-gray-500 mt-1">{mode.description}</span>
              {formData.writingMode === mode.id && (
                <span className="absolute top-2 right-2 text-primary-500">✓</span>
              )}
            </label>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          💡 두 모드 모두 시트에 저장된 기존 글 스타일(페르소나)을 참고합니다. 어미 규칙은 선택한 모드가 우선합니다.
        </p>
      </div>

      {/* 치과 정보 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🏥 치과 정보</h3>
        <div className="space-y-4">
          {/* 치과명 선택/입력 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              치과명 <span className="text-red-500">*</span>
            </label>

            {!customClinicMode && sheetClinics.length > 0 ? (
              <>
                <SearchableSelect
                  options={sheetClinics}
                  value={formData.clinicName}
                  onChange={(value) => {
                    // 치과 선택 시 지역, 원장님 자동 채우기
                    const detail = sheetClinicDetails.find(d => d.name === value)
                    setFormData((prev) => ({
                      ...prev,
                      clinicName: value,
                      ...(detail?.region ? { region: detail.region } : {}),
                      ...(detail?.doctorName ? { doctorName: detail.doctorName } : {}),
                    }))
                  }}
                  placeholder="치과명 검색 또는 선택..."
                  required
                  onCustomInput={() => setCustomClinicMode(true)}
                />
              </>
            ) : (
              <>
                <input
                  type="text"
                  name="clinicName"
                  value={formData.clinicName}
                  onChange={handleChange}
                  required
                  placeholder="예: 서울하이탑치과"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                {sheetClinics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomClinicMode(false)
                      setFormData((prev) => ({ ...prev, clinicName: '' }))
                    }}
                    className="mt-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    ← 목록에서 선택
                  </button>
                )}
              </>
            )}
          </div>

          {/* 지역, 원장님 이름 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                지역 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="region"
                value={formData.region}
                onChange={handleChange}
                required
                placeholder="예: 부평, 간석동"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                원장님 이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="doctorName"
                value={formData.doctorName}
                onChange={handleChange}
                required
                placeholder="예: 윤홍기"
                className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 글 정보 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📝 글 정보</h3>
        <div className="space-y-4">
          {/* 주제/치료 선택/입력 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              주제/치료 <span className="text-red-500">*</span>
              {clinicTopics.length > 0 && (
                <span className="ml-2 text-xs text-primary-600 font-normal">
                  ({formData.clinicName}의 기존 글 주제 {clinicTopics.length}개)
                </span>
              )}
              {isLoadingClinicTopics && (
                <span className="ml-2 text-xs text-gray-400 font-normal">불러오는 중...</span>
              )}
            </label>

            {/* 치과별 주제 버튼 (RAG에서 가져온 주제들) */}
            {clinicTopics.length > 0 && !customTopicMode && (
              <div className="mb-3 p-3 bg-primary-50 rounded-xl border border-primary-100">
                <p className="text-xs text-primary-700 mb-2 font-medium">
                  {formData.clinicName}의 기존 글 주제 (클릭하여 선택)
                </p>
                <div className="flex flex-wrap gap-2">
                  {clinicTopics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, topic }))}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                        formData.topic === topic
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-primary-400 hover:text-primary-600'
                      }`}
                    >
                      {topic}
                      {formData.topic === topic && ' \u2713'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!customTopicMode ? (
              <>
                <SearchableSelect
                  options={treatmentOptions}
                  value={formData.topic}
                  onChange={(value) => setFormData((prev) => ({ ...prev, topic: value }))}
                  placeholder={clinicTopics.length > 0 ? "위 버튼으로 선택하거나 검색..." : "주제/치료 검색 또는 선택..."}
                  required
                  onCustomInput={() => setCustomTopicMode(true)}
                />
              </>
            ) : (
              <>
                <input
                  type="text"
                  name="customTopic"
                  value={formData.customTopic}
                  onChange={handleChange}
                  required
                  placeholder="예: 턱관절 치료, 레진 치료"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomTopicMode(false)
                    setFormData((prev) => ({ ...prev, customTopic: '' }))
                  }}
                  className="mt-2 text-sm text-gray-500 hover:text-gray-700"
                >
                  ← 목록에서 선택
                </button>
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              환자 정보 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="patientInfo"
              value={formData.patientInfo}
              onChange={handleChange}
              required
              rows={8}
              placeholder={"예:\n#36 치근단 병소 관찰\n저작 시 통증 호소\n골이식 후 임플란트 식립 예정\n\n💡 상세할수록 글 퀄리티가 올라갑니다!\n- 치식번호, 부위, 증상\n- 치료 단계/방법\n- 강조 포인트"}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
            />
            <p className="mt-1 text-xs text-gray-500">CC(주소), 임상 소견, 치료 계획 등을 상세히 입력하세요 — 내용이 많을수록 글 퀄리티 ↑</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              치료 내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="treatment"
              value={formData.treatment}
              onChange={handleChange}
              required
              rows={3}
              placeholder="예: 하악 좌측 제1대구치 임플란트 식립, 골이식 동반"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500">구체적인 시술 내용을 입력하세요</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              사진 설명 (선택)
            </label>
            <textarea
              name="photoDescription"
              value={formData.photoDescription}
              onChange={handleChange}
              rows={2}
              placeholder="예: Before - 치아 파절 상태, After - 지르코니아 보철 완료"
              className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* 이미지 업로드 */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📷 이미지 업로드 (선택)</h3>
        <p className="text-sm text-gray-500 mb-4">
          이미지를 업로드하면 파일명을 기반으로 블로그 글 적절한 위치에 배치됩니다.
          <br />
          <span className="text-primary-600">팁: 파일명에 before, after, 치료전, 치료후 등을 포함하면 더 정확하게 배치됩니다.</span>
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.gif"
          multiple
          onChange={handleImageUpload}
          className="hidden"
          id="image-upload"
        />

        <label
          htmlFor="image-upload"
          className="block w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-primary-500 hover:text-primary-600 transition-colors cursor-pointer text-center"
        >
          📁 클릭하여 이미지 선택 (여러 장 가능, GIF 지원)
        </label>

        {/* 업로드된 이미지 미리보기 */}
        {images.length > 0 && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">업로드된 이미지: {images.length}개</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {images.map((img, index) => (
                <div key={`${img.name}-${index}`} className="relative group">
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-full h-24 object-cover rounded-xl border border-gray-200"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="text-white text-sm bg-red-500 px-2 py-1 rounded hover:bg-red-600"
                    >
                      삭제
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 truncate" title={img.name}>{img.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 네이버 최적화 버튼 */}
      {!keywordState.isAnalyzed && (
        <button
          type="button"
          onClick={handleAnalyzeKeywords}
          disabled={!isBasicInfoComplete || keywordState.isAnalyzing || isLoading}
          className="w-full py-4 px-6 bg-green-600 text-white font-semibold rounded-2xl hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {keywordState.isAnalyzing ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              네이버 키워드 분석 중...
            </span>
          ) : (
            '🔍 네이버 최적화 분석'
          )}
        </button>
      )}

      {/* 키워드 추천 섹션 (분석 완료 시 표시) */}
      {keywordState.isAnalyzed && (
        <div className="bg-gradient-to-br from-green-50 to-blue-50 p-6 rounded-2xl border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">🎯 SEO 키워드 추천</h3>
            {keywordState.seoScore && (
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                keywordState.seoScore >= 80 ? 'bg-green-500 text-white' :
                keywordState.seoScore >= 60 ? 'bg-yellow-500 text-white' :
                'bg-red-500 text-white'
              }`}>
                SEO 점수: {keywordState.seoScore}점
              </span>
            )}
          </div>

          {/* SEO 추천 사항 */}
          {keywordState.seoRecommendations.length > 0 && (
            <div className="mb-4 p-3 bg-white rounded-xl">
              <p className="text-sm font-medium text-gray-700 mb-2">📊 분석 결과</p>
              <ul className="text-sm text-gray-600 space-y-1">
                {keywordState.seoRecommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 트렌딩 키워드 */}
          {keywordState.recommendedKeywords.trending.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">🔥 인기 키워드</p>
              <div className="flex flex-wrap gap-2">
                {keywordState.recommendedKeywords.trending.map((keyword) => (
                  <KeywordButton
                    key={keyword}
                    keyword={keyword}
                    isSelected={keywordState.selectedKeywords.includes(keyword)}
                    onClick={() => toggleKeyword(keyword)}
                    variant="trending"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 계절 키워드 */}
          {keywordState.recommendedKeywords.seasonal.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">🗓️ 이번 달 인기</p>
              <div className="flex flex-wrap gap-2">
                {keywordState.recommendedKeywords.seasonal.map((keyword) => (
                  <KeywordButton
                    key={keyword}
                    keyword={keyword}
                    isSelected={keywordState.selectedKeywords.includes(keyword)}
                    onClick={() => toggleKeyword(keyword)}
                    variant="seasonal"
                  />
                ))}
              </div>
            </div>
          )}

          {/* 메인 키워드 */}
          {keywordState.recommendedKeywords.main.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">📌 메인 키워드</p>
              <div className="flex flex-wrap gap-2">
                {keywordState.recommendedKeywords.main.map((keyword) => (
                  <KeywordButton
                    key={keyword}
                    keyword={keyword}
                    isSelected={keywordState.selectedKeywords.includes(keyword)}
                    onClick={() => toggleKeyword(keyword)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 서브 키워드 */}
          {keywordState.recommendedKeywords.sub.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">🏷️ 서브 키워드</p>
              <div className="flex flex-wrap gap-2">
                {keywordState.recommendedKeywords.sub.map((keyword) => (
                  <KeywordButton
                    key={keyword}
                    keyword={keyword}
                    isSelected={keywordState.selectedKeywords.includes(keyword)}
                    onClick={() => toggleKeyword(keyword)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 선택된 키워드 표시 */}
          {keywordState.selectedKeywords.length > 0 && (
            <div className="mt-4 p-3 bg-white rounded-xl">
              <p className="text-sm font-medium text-gray-700 mb-2">
                ✅ 선택된 키워드 ({keywordState.selectedKeywords.length}개)
              </p>
              <p className="text-sm text-primary-600">
                {keywordState.selectedKeywords.join(', ')}
              </p>
            </div>
          )}

          {/* 다시 분석 버튼 */}
          <button
            type="button"
            onClick={() => setKeywordState(prev => ({ ...prev, isAnalyzed: false }))}
            className="mt-4 text-sm text-gray-500 hover:text-gray-700"
          >
            ← 다시 분석하기
          </button>
        </div>
      )}

      {/* 글 생성 버튼 */}
      <div className="space-y-3">
        {keywordState.isAnalyzed ? (
          <button
            type="submit"
            disabled={isLoading || isLoadingSheet}
            className="w-full py-4 px-6 bg-primary-600 text-white font-semibold rounded-2xl hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                글 생성 중...
              </span>
            ) : (
              <>✨ 의료법 준수 블로그 글 생성하기</>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDirectGenerate}
            disabled={isLoading || isLoadingSheet || !isBasicInfoComplete}
            className="w-full py-3 px-6 bg-gray-100 text-gray-700 font-medium rounded-2xl hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {isLoadingSheet ? '데이터 로딩 중...' : '⚡ 분석 없이 바로 생성하기'}
          </button>
        )}
      </div>
    </form>
  )
}
