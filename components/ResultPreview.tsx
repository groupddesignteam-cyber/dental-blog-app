'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { GenerateResult } from '@/types'
import { formatLineBreaks } from '@/lib/line-formatter'

interface Props {
  result: GenerateResult | null
  isStreaming: boolean
  streamContent: string
}

export default function ResultPreview({ result, isStreaming, streamContent }: Props) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'html' | 'naver'>('preview')

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

  // 네이버 블로그용 44byte 줄바꿈 포맷
  const convertToNaver = (markdown: string) => {
    // 마크다운 문법 제거 + 44byte 줄바꿈
    const plain = markdown
      .replace(/^#{1,3}\s*/gm, '')       // 헤더 마크업 제거
      .replace(/\*\*(.*?)\*\*/g, '$1')   // 볼드 제거
      .replace(/\*(.*?)\*/g, '$1')       // 이탤릭 제거
    return formatLineBreaks(plain)
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
          {(['preview', 'markdown', 'html', 'naver'] as const).map((tab) => (
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
              {tab === 'naver' && '네이버'}
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

        {activeTab === 'naver' && (
          <div>
            <p className="text-xs text-gray-500 mb-2">44byte(한글 22자) 줄바꿈 적용 - 네이버 블로그 붙여넣기용</p>
            <pre className="whitespace-pre-wrap text-sm font-mono bg-green-50 p-4 rounded-lg leading-relaxed">
              {convertToNaver(content)}
            </pre>
          </div>
        )}
      </div>

      {/* 푸터 */}
      {result && (
        <div className="border-t border-gray-100 p-4">
          {/* 경고 패널 */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="text-sm font-medium text-amber-800 mb-2">
                검증 결과 ({result.warnings.length}건)
              </div>
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 후처리 통계 */}
          {result.postProcessStats && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-medium text-blue-800 mb-2">후처리 분석</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-blue-700">
                {result.postProcessStats.sectionChars && (
                  <div>
                    <span className="font-medium">섹션 글자수:</span>{' '}
                    서론 {result.postProcessStats.sectionChars.intro}자 /
                    본론 {result.postProcessStats.sectionChars.body}자 /
                    결론 {result.postProcessStats.sectionChars.conclusion}자
                  </div>
                )}
                {result.postProcessStats.keywordFreq && (
                  <div>
                    <span className="font-medium">메인키워드:</span>{' '}
                    총 {result.postProcessStats.keywordFreq.mainCount}회
                    (제목{result.postProcessStats.keywordFreq.placement.title}/
                    서론{result.postProcessStats.keywordFreq.placement.intro}/
                    본론{result.postProcessStats.keywordFreq.placement.body}/
                    결론{result.postProcessStats.keywordFreq.placement.conclusion})
                  </div>
                )}
                {result.postProcessStats.style && (
                  <div>
                    <span className="font-medium">문체:</span>{' '}
                    문어체 {result.postProcessStats.style.formalEndingPct}% /
                    구어체 {result.postProcessStats.style.casualEndingPct}% /
                    비유 {result.postProcessStats.style.metaphorCount}개 /
                    임상소견 {result.postProcessStats.style.clinicalPhraseCount}개
                  </div>
                )}
                {result.postProcessStats.synonymReplacements != null && result.postProcessStats.synonymReplacements > 0 && (
                  <div>
                    <span className="font-medium">동의어 치환:</span>{' '}
                    {result.postProcessStats.synonymReplacements}건 자동 적용
                  </div>
                )}
                {result.postProcessStats.imageAlt && result.postProcessStats.imageAlt.total > 0 && (
                  <div>
                    <span className="font-medium">이미지:</span>{' '}
                    {result.postProcessStats.imageAlt.withAlt}/{result.postProcessStats.imageAlt.total}개 alt 텍스트
                  </div>
                )}
              </div>
            </div>
          )}

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
            <button
              onClick={() => handleCopy(convertToNaver(content))}
              className="flex-1 py-2 px-4 bg-green-100 text-green-700 font-medium rounded-lg hover:bg-green-200 transition-colors"
            >
              📗 네이버용 복사
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
