'use client'

import { useState, useEffect } from 'react'
import { Clinic } from '@/types'

export default function SettingsPage() {
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    region: '',
    doctorName: '',
  })
  const [saving, setSaving] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const response = await fetch('/api/clinics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        setShowForm(false)
        setFormData({ name: '', region: '', doctorName: '' })
        fetchClinics()
      }
    } catch (error) {
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

      if (response.ok) {
        fetchClinics()
      }
    } catch (error) {
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
        <p className="mt-1 text-gray-600">
          치과 프로필을 관리하고 앱 설정을 변경할 수 있습니다
        </p>
      </div>

      {/* 치과 프로필 섹션 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">🏥 치과 프로필</h2>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            + 치과 추가
          </button>
        </div>

        {clinics.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <p>등록된 치과가 없습니다</p>
            <p className="text-sm mt-1">치과를 추가하면 글 생성 시 빠르게 선택할 수 있습니다</p>
          </div>
        ) : (
          <div className="space-y-4">
            {clinics.map((clinic) => (
              <div
                key={clinic.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div>
                  <h3 className="font-medium text-gray-900">{clinic.name}</h3>
                  <p className="text-sm text-gray-500">
                    {clinic.region} · {clinic.doctorName} 원장
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

        {/* 치과 추가 폼 */}
        {showForm && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-4">새 치과 추가</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    치과명
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    지역
                  </label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) =>
                      setFormData({ ...formData, region: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    원장님 이름
                  </label>
                  <input
                    type="text"
                    value={formData.doctorName}
                    onChange={(e) =>
                      setFormData({ ...formData, doctorName: e.target.value })
                    }
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
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* 앱 정보 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">ℹ️ 앱 정보</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>버전: 1.0.0</p>
          <p>AI 엔진: Claude API</p>
          <p>데이터 저장: Google Sheets</p>
        </div>
      </div>
    </div>
  )
}
