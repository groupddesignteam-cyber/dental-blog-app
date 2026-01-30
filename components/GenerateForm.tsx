'use client'

import { useState, useEffect, useRef } from 'react'
import { GenerateFormData, UploadedImage } from '@/types'

interface Props {
  onSubmit: (data: GenerateFormData) => void
  isLoading: boolean
}

const LLM_MODELS = [
  { id: 'claude', name: 'Claude (Anthropic)', description: '추천 - 한국어 글쓰기 우수' },
  { id: 'openai', name: 'GPT-4o (OpenAI)', description: '범용성 높음' },
  { id: 'gemini', name: 'Gemini (Google)', description: '빠른 응답' },
] as const

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

export default function GenerateForm({ onSubmit, isLoading }: Props) {
  // 시트 데이터
  const [sheetClinics, setSheetClinics] = useState<string[]>([])
  const [sheetTreatments, setSheetTreatments] = useState<string[]>([])
  const [isLoadingSheet, setIsLoadingSheet] = useState(true)

  // 직접 입력 모드
  const [customClinicMode, setCustomClinicMode] = useState(false)
  const [customTopicMode, setCustomTopicMode] = useState(false)

  // 이미지 업로드
  const [images, setImages] = useState<UploadedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  // 이미지 업로드 처리
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newImages: UploadedImage[] = []

    Array.from(files).forEach((file) => {
      // 이미지 파일만 허용 (GIF 포함)
      if (!file.type.startsWith('image/')) return

      const reader = new FileReader()
      reader.onload = (event) => {
        const url = event.target?.result as string
        newImages.push({
          name: file.name,
          url,
          file,
        })

        // 모든 파일 처리 완료 후 상태 업데이트
        if (newImages.length === files.length) {
          setImages((prev) => [...prev, ...newImages])
        }
      }
      reader.readAsDataURL(file)
    })

    // input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 이미지 삭제
  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

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
    })
  }

  // 사용할 치료 목록
  const treatmentOptions = sheetTreatments.length > 0 ? sheetTreatments : DEFAULT_TREATMENTS

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* AI 모델 선택 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🤖 AI 모델 선택</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {LLM_MODELS.map((model) => (
            <label
              key={model.id}
              className={`relative flex flex-col p-4 cursor-pointer rounded-lg border-2 transition-all ${
                formData.model === model.id
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
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
              <span className="font-medium text-gray-900">{model.name}</span>
              <span className="text-xs text-gray-500 mt-1">{model.description}</span>
              {formData.model === model.id && (
                <span className="absolute top-2 right-2 text-primary-500">✓</span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* 치과 정보 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🏥 치과 정보</h3>
        <div className="space-y-4">
          {/* 치과명 선택/입력 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              치과명 <span className="text-red-500">*</span>
            </label>

            {!customClinicMode && sheetClinics.length > 0 ? (
              <>
                <select
                  name="clinicName"
                  value={formData.clinicName}
                  onChange={handleChange}
                  required={!customClinicMode}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">치과를 선택하세요</option>
                  {sheetClinics.map((clinic) => (
                    <option key={clinic} value={clinic}>
                      {clinic}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCustomClinicMode(true)}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-700"
                >
                  + 새 치과 직접 입력
                </button>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 글 정보 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📝 글 정보</h3>
        <div className="space-y-4">
          {/* 주제/치료 선택/입력 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              주제/치료 <span className="text-red-500">*</span>
            </label>

            {!customTopicMode ? (
              <>
                <select
                  name="topic"
                  value={formData.topic}
                  onChange={handleChange}
                  required={!customTopicMode}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">주제를 선택하세요</option>
                  {treatmentOptions.map((treatment) => (
                    <option key={treatment} value={treatment}>
                      {treatment}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCustomTopicMode(true)}
                  className="mt-2 text-sm text-primary-600 hover:text-primary-700"
                >
                  + 새 주제 직접 입력
                </button>
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
            <input
              type="text"
              name="patientInfo"
              value={formData.patientInfo}
              onChange={handleChange}
              required
              placeholder="예: 50대 남성, 어금니 통증"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-gray-500">성별, 연령대, 주호소를 입력하세요</p>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      {/* 이미지 업로드 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📷 이미지 업로드 (선택)</h3>
        <p className="text-sm text-gray-500 mb-4">
          이미지를 업로드하면 파일명을 기반으로 블로그 글 적절한 위치에 배치됩니다.
          <br />
          <span className="text-primary-600">팁: 파일명에 before, after, 치료전, 치료후 등을 포함하면 더 정확하게 배치됩니다.</span>
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageUpload}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-500 hover:text-primary-600 transition-colors"
        >
          클릭하여 이미지 선택 (여러 장 가능, GIF 지원)
        </button>

        {/* 업로드된 이미지 미리보기 */}
        {images.length > 0 && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <img
                  src={img.url}
                  alt={img.name}
                  className="w-full h-24 object-cover rounded-lg border border-gray-200"
                />
                <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="text-white text-sm bg-red-500 px-2 py-1 rounded"
                  >
                    삭제
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500 truncate">{img.name}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={isLoading || isLoadingSheet}
        className="w-full py-4 px-6 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            글 생성 중...
          </span>
        ) : isLoadingSheet ? (
          '데이터 로딩 중...'
        ) : (
          '✨ 블로그 글 생성하기'
        )}
      </button>
    </form>
  )
}
