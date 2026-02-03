'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { GenerateResult } from '@/types'

interface Props {
  result: GenerateResult | null
  isStreaming: boolean
  streamContent: string
}

export default function ResultPreview({ result, isStreaming, streamContent }: Props) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'html'>('preview')

  const content = result?.content || streamContent

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 마크다운을 HTML로 변환 (네이버 블로그용)
  const convertToHtml = (markdown: string) => {
    // 간단한 변환 (실제로는 더 정교한 변환 필요)
    return markdown
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>')
  }

  if (!content && !isStreaming) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
        <div className="text-gray-400 text-6xl mb-4">📝</div>
        <p className="text-gray-500">
          왼쪽 폼을 작성하고 &quot;글 생성하기&quot; 버튼을 클릭하세요
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* 헤더 */}
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {isStreaming ? '🔄 생성 중...' : '✅ 생성 완료'}
          </h3>
          {result && (
            <span className="text-sm text-gray-500">
              {result.charCount.toLocaleString()}자
            </span>
          )}
        </div>

        {/* 탭 */}
        <div className="flex gap-2 mt-4">
          {(['preview', 'markdown', 'html'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab
                  ? 'bg-primary-100 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab === 'preview' && '미리보기'}
              {tab === 'markdown' && '마크다운'}
              {tab === 'html' && 'HTML'}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="p-6 max-h-[600px] overflow-y-auto">
        {activeTab === 'preview' && (
          <div className="markdown-body prose max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {activeTab === 'markdown' && (
          <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 p-4 rounded-lg">
            {content}
          </pre>
        )}

        {activeTab === 'html' && (
          <pre className="whitespace-pre-wrap text-sm font-mono bg-gray-50 p-4 rounded-lg">
            {convertToHtml(content)}
          </pre>
        )}
      </div>

      {/* 푸터 */}
      {result && (
        <div className="border-t border-gray-100 p-4">
          {/* 키워드 정보 */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">메인 키워드:</span>
              <span className="px-2 py-1 bg-primary-100 text-primary-700 text-sm rounded">
                {result.keywords.main}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">서브 키워드:</span>
              {result.keywords.sub.map((kw, i) => (
                <span key={i} className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                  {kw}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">해시태그:</span>
              <span className="text-sm text-gray-600">
                {result.hashtags.join(' ')}
              </span>
            </div>
          </div>

          {/* 복사 버튼 */}
          <div className="flex gap-2">
            <button
              onClick={() => handleCopy(content)}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              {copied ? '✅ 복사됨!' : '📋 마크다운 복사'}
            </button>
            <button
              onClick={() => handleCopy(convertToHtml(content))}
              className="flex-1 py-2 px-4 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              🌐 HTML 복사
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
