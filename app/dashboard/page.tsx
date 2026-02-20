'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import GenerateForm from '@/components/GenerateForm'
import ResultPreview from '@/components/ResultPreview'
import BatchQueue from '@/components/BatchQueue'
import { GenerateFormData, GenerateResult } from '@/types'

const ImageEditor = dynamic(() => import('@/components/ImageEditor'), { ssr: false })
const SketchImageGenerator = dynamic(() => import('@/components/SketchImageGenerator'), { ssr: false })

type ViewMode = 'batch' | 'single' | 'editor' | 'generator'

export default function DashboardPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('batch')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [streamContent, setStreamContent] = useState('')
  const [error, setError] = useState('')
  const [lastFormData, setLastFormData] = useState<GenerateFormData | null>(null)
  const [generatedImageForEditor, setGeneratedImageForEditor] = useState<string>('')

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
          v3.10.0 AI 이미지 생성
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
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
