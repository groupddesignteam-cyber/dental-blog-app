'use client'

import { useState, useEffect } from 'react'
import { Post } from '@/types'

export default function HistoryPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)

  useEffect(() => {
    fetchPosts()
  }, [])

  const fetchPosts = async () => {
    try {
      const response = await fetch('/api/posts')
      if (response.ok) {
        const data = await response.json()
        setPosts(data)
      }
    } catch (error) {
      console.error('Failed to fetch posts:', error)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = async (content: string) => {
    await navigator.clipboard.writeText(content)
    alert('클립보드에 복사되었습니다!')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">생성 히스토리</h1>
        <p className="mt-1 text-gray-600">
          이전에 생성한 블로그 글을 확인하고 재사용할 수 있습니다
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-gray-400 text-6xl mb-4">📋</div>
          <p className="text-gray-500">아직 생성된 글이 없습니다</p>
          <p className="text-sm text-gray-400 mt-2">
            글 생성 페이지에서 블로그 글을 작성해보세요
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 글 목록 */}
          <div className="space-y-4">
            {posts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className={`bg-white rounded-xl shadow-sm border p-4 cursor-pointer transition-all ${
                  selectedPost?.id === post.id
                    ? 'border-primary-500 ring-2 ring-primary-100'
                    : 'border-gray-100 hover:border-gray-200'
                }`}
              >
                <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                  {post.title || '제목 없음'}
                </h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="px-2 py-1 bg-gray-100 rounded">
                    {post.topic}
                  </span>
                  <span>{new Date(post.createdAt).toLocaleDateString('ko-KR')}</span>
                </div>
              </div>
            ))}
          </div>

          {/* 선택된 글 미리보기 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {selectedPost ? (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {selectedPost.title}
                </h2>
                <div className="prose max-w-none text-sm text-gray-600 max-h-96 overflow-y-auto mb-4">
                  <pre className="whitespace-pre-wrap font-sans">
                    {selectedPost.content.slice(0, 500)}...
                  </pre>
                </div>
                <button
                  onClick={() => copyToClipboard(selectedPost.content)}
                  className="w-full py-2 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
                >
                  📋 전체 내용 복사
                </button>
              </>
            ) : (
              <div className="text-center text-gray-400 py-12">
                <p>글을 선택하면 미리보기가 표시됩니다</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
