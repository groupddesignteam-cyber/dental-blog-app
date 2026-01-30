'use client'

import { useState } from 'react'
import { GenerateFormData } from '@/types'

interface Props {
  onSubmit: (data: GenerateFormData) => void
  isLoading: boolean
}

const TOPICS = [
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
  '기타',
]

const LLM_MODELS = [
  { id: 'claude', name: 'Claude (Anthropic)', description: '추천 - 한국어 글쓰기 우수' },
  { id: 'openai', name: 'GPT-4o (OpenAI)', description: '범용성 높음' },
  { id: 'gemini', name: 'Gemini (Google)', description: '빠른 응답' },
] as const

export default function GenerateForm({ onSubmit, isLoading }: Props) {
  const [formData, setFormData] = useState<GenerateFormData>({
    clinicName: '',
    region: '',
    doctorName: '',
    topic: '',
    patientInfo: '',
    treatment: '',
    photoDescription: '',
    model: 'claude',
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              치과명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="clinicName"
              value={formData.clinicName}
              onChange={handleChange}
              required
              placeholder="예: 서울하이탑치과"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
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

      {/* 글 정보 */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📝 글 정보</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              주제/치료 <span className="text-red-500">*</span>
            </label>
            <select
              name="topic"
              value={formData.topic}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">주제를 선택하세요</option>
              {TOPICS.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
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

      {/* 제출 버튼 */}
      <button
        type="submit"
        disabled={isLoading}
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
        ) : (
          '✨ 블로그 글 생성하기'
        )}
      </button>
    </form>
  )
}
