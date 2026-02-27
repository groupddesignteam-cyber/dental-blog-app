'use client'

import { useEffect, useMemo, useState } from 'react'
import { Clinic } from '@/types'

export default function SettingsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [sortMode, setSortMode] = useState<'newest' | 'oldest' | 'name' | 'region'>('newest')
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    doctorName: '',
  })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formMessage, setFormMessage] = useState('')

  useEffect(() => {
    fetchClinics()
  }, [])

  const fetchClinics = async () => {
    try {
      const response = await fetch('/api/clinics')
      if (response.ok) {
        const data = await response.json()
        setClinics(data)
      }
    } catch (error) {
      console.error('Failed to fetch clinics:', error)
    } finally {
      setLoading(false)
    }
  }

  const clinicsByFilter = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    let result = [...clinics]

    if (keyword) {
      result = result.filter((clinic) => {
        return (
          clinic.name.toLowerCase().includes(keyword) ||
          clinic.region.toLowerCase().includes(keyword) ||
          clinic.doctorName.toLowerCase().includes(keyword)
        )
      })
    }

    return result.sort((a, b) => {
      if (sortMode === 'name') {
        return a.name.localeCompare(b.name, 'ko')
      }
      if (sortMode === 'region') {
        return a.region.localeCompare(b.region, 'ko')
      }
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      const aOrder = Number.isNaN(aTime) ? 0 : aTime
      const bOrder = Number.isNaN(bTime) ? 0 : bTime
      return sortMode === 'newest' ? bOrder - aOrder : aOrder - bOrder
    })
  }, [clinics, searchKeyword, sortMode])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setFormMessage('')

    if (!formData.name.trim() || !formData.region.trim() || !formData.doctorName.trim()) {
      setFormError('병원명, 지역, 원장명은 모두 입력해야 합니다.')
      return
    }

    const hasDuplicate = clinics.some(
      (clinic) =>
        clinic.name.trim().toLowerCase() === formData.name.trim().toLowerCase() &&
        clinic.region.trim().toLowerCase() === formData.region.trim().toLowerCase()
    )
    if (hasDuplicate) {
      setFormError('같은 병원명+지역이 이미 등록되어 있습니다.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(data?.error || '병원 저장에 실패했습니다.')
      }

      setShowForm(false)
      setFormData({ name: '', region: '', doctorName: '' })
      setFormMessage('병원이 등록되었습니다.')
      fetchClinics()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '병원 저장에 실패했습니다.')
      console.error('Failed to save clinic:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/clinics?id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('삭제에 실패했습니다.')
      }

      setFormMessage('병원이 삭제되었습니다.')
      fetchClinics()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '삭제에 실패했습니다.')
      console.error('Failed to delete clinic:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="mt-1 text-gray-600">운영에 필요한 클리닉 정보를 관리하세요.</p>
      </div>

      <div className="mb-4 flex gap-3 text-sm text-gray-500">
        <p>등록된 클리닉: {clinics.length}개</p>
      </div>

      {formError && <p className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg">{formError}</p>}
      {formMessage && <p className="mb-4 text-sm text-green-700 bg-green-50 p-3 rounded-lg">{formMessage}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">클리닉 목록</h2>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            + 클리닉 추가
          </button>
        </div>

        <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="이름 / 지역 / 원장명 검색"
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'newest' | 'oldest' | 'name' | 'region')}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="newest">최신등록순</option>
            <option value="oldest">오래된순</option>
            <option value="name">이름순</option>
            <option value="region">지역순</option>
          </select>
          <button
            onClick={() => {
              setSearchKeyword('')
              setSortMode('newest')
            }}
            className="px-3 py-2 bg-gray-100 rounded-lg text-gray-700 hover:bg-gray-200"
          >
            초기화
          </button>
        </div>

        {clinicsByFilter.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>조건에 맞는 클리닉이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {clinicsByFilter.map((clinic) => (
              <div
                key={clinic.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-gray-900">{clinic.name}</h3>
                  <p className="text-sm text-gray-500">
                    {clinic.region} / {clinic.doctorName}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(clinic.id)}
                  className="text-red-500 hover:text-red-600 text-sm"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-4">클리닉 등록</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">클리닉명</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">지역</label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">원장명</label>
                  <input
                    type="text"
                    value={formData.doctorName}
                    onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setFormError('')
                    setFormData({ name: '', region: '', doctorName: '' })
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">시스템 정보</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>버전: 1.0.0</p>
          <p>AI 모델: Claude API</p>
          <p>저장소: Google Sheets</p>
        </div>
      </div>
    </div>
  )
}
