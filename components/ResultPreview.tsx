'use client'

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import { GenerateResult } from '@/types'
import { formatLineBreaks } from '@/lib/line-formatter'
import { validatePost, ValidationResult, ValidationCheck } from '@/lib/post-validator'

interface Props {
  result: GenerateResult | null
  isStreaming: boolean
  streamContent: string
  clinicName?: string
  region?: string
  topic?: string
  writingMode?: string
  mainKeyword?: string
  customSections?: { title: string; description?: string }[]
}

// 검증 결과 패널 컴포넌트
function ValidationPanel({ validation }: { validation: ValidationResult }) {
  const [expanded, setExpanded] = useState(false)

  const scoreColor = validation.score >= 80
    ? 'text-green-700 bg-green-100'
    : validation.score >= 50
    ? 'text-yellow-700 bg-yellow-100'
    : 'text-red-700 bg-red-100'

  return (
    <div className="border-t border-gray-100 p-4">
      {/* 요약 헤더 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">
            {validation.passed ? '\u2705' : '\u26A0\uFE0F'} 규칙 검사
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${scoreColor}`}>
            {validation.score}점
          </span>
          <span className="text-xs text-gray-500">
            {validation.checks.filter(c => c.passed).length}/{validation.checks.length} 통과
          </span>
        </div>
        <span className="text-gray-400 text-sm">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* 상세 결과 */}
      {expanded && (
        <div className="mt-3 space-y-2">
          {validation.checks.map((check, i) => (
            <CheckItem key={i} check={check} />
          ))}
        </div>
      )}
    </div>
  )
}

function CheckItem({ check }: { check: ValidationCheck }) {
  const [showDetails, setShowDetails] = useState(false)
  const icon = check.passed ? '\u2705' : check.severity === 'error' ? '\u274C' : '\u26A0\uFE0F'
  const bgColor = check.passed
    ? 'bg-green-50 border-green-200'
    : check.severity === 'error'
    ? 'bg-red-50 border-red-200'
    : 'bg-yellow-50 border-yellow-200'

  return (
    <div className={`rounded-lg border p-2.5 ${bgColor}`}>
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => check.details && setShowDetails(!showDetails)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <span className="text-xs font-medium text-gray-800">{check.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{check.message}</span>
          {check.details && (
            <span className="text-gray-400 text-xs">{showDetails ? '\u25B2' : '\u25BC'}</span>
          )}
        </div>
      </div>
      {showDetails && check.details && (
        <div className="mt-2 pl-6 space-y-0.5">
          {check.details.map((d, j) => (
            <p key={j} className="text-xs text-gray-500">{d}</p>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ResultPreview({ result, isStreaming, streamContent, clinicName, region, topic, writingMode, mainKeyword, customSections }: Props) {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'html' | 'naver'>('preview')

  const content = result?.content || streamContent

  // 검증 실행 (result가 있을 때만)
  const validation = useMemo(() => {
    if (!result?.content) return null
    return validatePost(result.content, {
      clinicName: clinicName || '',
      topic: topic || result.keywords?.main || '',
      writingMode: writingMode || 'expert',
      mainKeyword: mainKeyword || result.keywords?.main || '',
      region: region || '',
      citePapers: !!(result.references && result.references.length > 0),
      customSections,
    })
  }, [result, clinicName, region, topic, writingMode, mainKeyword, customSections])

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
            <div className="flex items-center gap-3">
              {result.ragInfo && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  result.ragInfo.personaApplied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {result.ragInfo.personaApplied
                    ? `RAG ${result.ragInfo.personaPostCount}건 참조`
                    : 'RAG 미적용'}
                </span>
              )}
              <span className="text-sm text-gray-500">
                {result.charCount.toLocaleString()}자
              </span>
            </div>
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

          {/* 논문 인용 */}
          {result.references && result.references.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-sm font-medium text-gray-700">📎 References:</span>
              <div className="mt-1 space-y-1">
                {result.references.map((ref, i) => (
                  <p key={ref.pmid} className="text-xs text-gray-500">
                    [{i + 1}] {ref.authors}. &quot;{ref.title}&quot; <em>{ref.journal}</em>, {ref.year}.
                    {ref.doi && (
                      <a href={`https://doi.org/${ref.doi}`} target="_blank" rel="noopener noreferrer"
                         className="text-blue-600 hover:underline ml-1">
                        DOI
                      </a>
                    )}
                  </p>
                ))}
              </div>
            </div>
          )}

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

      {/* 검증 결과 패널 */}
      {validation && <ValidationPanel validation={validation} />}
    </div>
  )
}
