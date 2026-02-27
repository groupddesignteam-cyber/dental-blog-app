'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import GenerateForm from '@/components/GenerateForm'
import ResultPreview from '@/components/ResultPreview'
import BatchQueue from '@/components/BatchQueue'
import { GenerateFormData, GenerateResult, Post } from '@/types'

const ImageEditor = dynamic(() => import('@/components/ImageEditor'), { ssr: false })
const SketchImageGenerator = dynamic(() => import('@/components/SketchImageGenerator'), { ssr: false })

type ViewMode = 'batch' | 'single' | 'editor' | 'generator'
type AdminStats = {
  totalPosts: number
  totalClinics: number
  postsThisWeek: number
  avgContentLength: number
  recentPostTitles: string[]
}

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('batch')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [streamContent, setStreamContent] = useState('')
  const [error, setError] = useState('')
  const [lastFormData, setLastFormData] = useState<GenerateFormData | null>(null)
  const [generatedImageForEditor, setGeneratedImageForEditor] = useState<string>('')
  const [isLoadingStats, setIsLoadingStats] = useState(true)
  const [stats, setStats] = useState<AdminStats>({
    totalPosts: 0,
    totalClinics: 0,
    postsThisWeek: 0,
    avgContentLength: 0,
    recentPostTitles: [],
  })

  useEffect(() => {
    let isMounted = true

    const fetchDashboardData = async () => {
      try {
        const [postsResponse, clinicsResponse] = await Promise.all([
          fetch('/api/posts'),
          fetch('/api/clinics'),
        ])

        const postsData: unknown = postsResponse.ok ? await postsResponse.json() : []
        const clinicsData: unknown = clinicsResponse.ok ? await clinicsResponse.json() : []
        const posts = Array.isArray(postsData) ? (postsData as Post[]) : []
        const clinics = Array.isArray(clinicsData) ? clinicsData : []
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        const validPosts = posts.filter(
          (post) => post && post.createdAt && !Number.isNaN(new Date(post.createdAt).getTime())
        )

        const postsThisWeek = validPosts.filter(
          (post) => new Date(post.createdAt).getTime() >= oneWeekAgo
        ).length

        const avgContentLength = validPosts.length
          ? Math.round(
              validPosts.reduce((sum, post) => sum + (post.content?.length || 0), 0) /
                validPosts.length
            )
          : 0

        const recentPostTitles = [...validPosts]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5)
          .map((post) => post.title || post.topic || '제목 없음')

        if (!isMounted) return

        setStats({
          totalPosts: posts.length || 0,
          totalClinics: clinics.length || 0,
          postsThisWeek,
          avgContentLength,
          recentPostTitles,
        })
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error)
      } finally {
        if (isMounted) setIsLoadingStats(false)
      }
    }

    fetchDashboardData()

    return () => {
      isMounted = false
    }
  }, [])

  const handleSubmit = async (data: GenerateFormData) => {
    setLastFormData(data)
    setIsLoading(true)
    setError('')
    setResult(null)
    setStreamContent('')

    try {
      const payload = {
        ...data,
        images: data.images?.map((img) => ({ name: img.name })),
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('요청 처리 중 오류가 발생했습니다.')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('응답 스트림을 읽을 수 없습니다.')
      }

      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const dataLine = line.slice(6)
          if (dataLine === '[DONE]') continue

          try {
            const parsed = JSON.parse(dataLine)
            if (parsed.type === 'content') {
              fullContent += parsed.text
              setStreamContent(fullContent)
            } else if (parsed.type === 'result') {
              setResult(parsed.data)
            }
          } catch {
            // ignore invalid json chunks
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">관리자 대시보드</h1>
        <p className="mt-1 text-gray-600">운영 상태를 한 번에 확인하고, 작업으로 바로 이동하세요.</p>
      </div>

      {isLoadingStats ? (
        <div className="mb-6 flex justify-center">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm text-gray-500">총 포스트</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalPosts}건</p>
            <p className="text-xs text-gray-500 mt-2">누적 생성 내역</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm text-gray-500">총 클리닉</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalClinics}개</p>
            <p className="text-xs text-gray-500 mt-2">등록된 진료소 목록</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm text-gray-500">최근 7일 글</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.postsThisWeek}건</p>
            <p className="text-xs text-gray-500 mt-2">최근 활동량</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <p className="text-sm text-gray-500">평균 글 길이</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.avgContentLength}자</p>
            <p className="text-xs text-gray-500 mt-2">본문 기준 평균</p>
          </div>
        </div>
      )}

      <div className="mb-6 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">최근 포스트</h2>
        {stats.recentPostTitles.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {stats.recentPostTitles.map((title, index) => (
              <li key={`${title}-${index}`} className="text-sm text-gray-600">
                • {title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 mt-2">아직 등록된 포스트가 없습니다.</p>
        )}
      </div>

      <div className="mb-6 flex justify-center">
        <div className="inline-flex bg-slate-100 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setViewMode('batch')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'batch'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            배치 생성
          </button>
          <button
            type="button"
            onClick={() => setViewMode('single')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'single'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            단일 생성
            <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded-full leading-none">NEW</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'editor'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            이미지 편집기
          </button>
          <button
            type="button"
            onClick={() => setViewMode('generator')}
            className={`px-6 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'generator'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            AI 이미지 생성
          </button>
        </div>
      </div>

      <div className="mb-4 text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-500 text-xs font-mono rounded-full">
          v{process.env.NEXT_PUBLIC_APP_VERSION || '3.11.2'} AI 이미지 생성
        </span>
      </div>

      {viewMode === 'batch' ? (
        <BatchQueue />
      ) : viewMode === 'editor' ? (
        <ImageEditor initialBgDataUrl={generatedImageForEditor || undefined} />
      ) : viewMode === 'generator' ? (
        <SketchImageGenerator
          onGenerated={(url) => {
            setGeneratedImageForEditor(url)
            setViewMode('editor')
          }}
        />
      ) : (
        <>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">단일 생성</h1>
            <p className="mt-1 text-gray-600">
              단일 프롬프트로 콘텐츠를 생성합니다. 제목/설명/키워드를 입력해 주세요.
            </p>
          </div>

          {error && <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg">{error}</div>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <GenerateForm onSubmit={handleSubmit} isLoading={isLoading} />
            </div>
            <div>
              <ResultPreview
                result={result}
                isStreaming={isLoading}
                streamContent={streamContent}
                clinicName={lastFormData?.clinicName}
                region={lastFormData?.region}
                topic={lastFormData?.topic}
                writingMode={lastFormData?.writingMode}
                mainKeyword={lastFormData?.mainKeyword}
                customSections={lastFormData?.customSections}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
