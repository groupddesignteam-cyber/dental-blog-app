'use client'

import { useState } from 'react'
import GenerateForm from '@/components/GenerateForm'
import ResultPreview from '@/components/ResultPreview'
import { GenerateFormData, GenerateResult } from '@/types'

export default function DashboardPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [streamContent, setStreamContent] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (data: GenerateFormData) => {
    setIsLoading(true)
    setError('')
    setResult(null)
    setStreamContent('')

    try {
      // 이미지는 파일명만 전송 (base64 URL은 너무 큼)
      const payload = {
        ...data,
        images: data.images?.map(img => ({ name: img.name })),
      }

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error('글 생성에 실패했습니다.')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('스트림을 읽을 수 없습니다.')
      }

      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              continue
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content') {
                fullContent += parsed.text
                setStreamContent(fullContent)
              } else if (parsed.type === 'result') {
                setResult(parsed.data)
              }
            } catch {
              // JSON 파싱 실패는 무시
            }
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">블로그 글 생성</h1>
        <p className="mt-1 text-gray-600">
          의료광고법 준수 + 네이버 SEO 최적화 블로그 글을 자동으로 생성합니다
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <GenerateForm onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
        <div>
          <ResultPreview
            result={result}
            isStreaming={isLoading}
            streamContent={streamContent}
          />
        </div>
      </div>
    </div>
  )
}
