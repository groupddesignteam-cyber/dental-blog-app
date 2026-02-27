'use client'

import { useEffect, useMemo, useState } from 'react'
import { Post } from '@/types'

export default function HistoryPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedTopic, setSelectedTopic] = useState('전체')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

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
    alert('클립보드에 복사했습니다.')
  }

  const topics = useMemo(() => {
    const set = new Set<string>()
    posts.forEach((post) => {
      if (post.topic) set.add(post.topic)
    })
    return ['전체', ...Array.from(set).sort()]
  }, [posts])

  const filteredPosts = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    let result = [...posts]

    if (selectedTopic !== '전체') {
      result = result.filter((post) => post.topic === selectedTopic)
    }

    if (keyword) {
      result = result.filter((post) => {
        return (
          (post.title || '').toLowerCase().includes(keyword) ||
          (post.topic || '').toLowerCase().includes(keyword) ||
          (post.content || '').toLowerCase().includes(keyword)
        )
      })
    }

    return result.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
      const aOrder = Number.isNaN(aTime) ? 0 : aTime
      const bOrder = Number.isNaN(bTime) ? 0 : bTime
      return sortOrder === 'newest' ? bOrder - aOrder : aOrder - bOrder
    })
  }, [posts, searchKeyword, selectedTopic, sortOrder])

  useEffect(() => {
    if (!selectedPost && filteredPosts[0]) {
      setSelectedPost(filteredPosts[0])
      return
    }

    if (selectedPost && !filteredPosts.some((post) => post.id === selectedPost.id)) {
      setSelectedPost(filteredPosts[0] || null)
    }
  }, [filteredPosts, selectedPost])

  const formatDate = (value: string) => new Date(value).toLocaleDateString('ko-KR')

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
        <h1 className="text-2xl font-bold text-gray-900">이력 히스토리</h1>
        <p className="mt-1 text-gray-600">
          필터·검색·정렬로 원하는 글을 바로 찾아서 관리하세요.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder="제목 / 주제 / 본문 검색"
          className="md:col-span-2 w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
        <select
          value={selectedTopic}
          onChange={(e) => setSelectedTopic(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {topic}
            </option>
          ))}
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="newest">최신순</option>
          <option value="oldest">오래된순</option>
        </select>
      </div>

      {filteredPosts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="text-gray-400 text-6xl mb-4">🗂️</div>
          <p className="text-gray-500">조건에 맞는 글이 없습니다.</p>
          <p className="text-sm text-gray-400 mt-2">
            검색어나 주제 조건을 바꿔 다시 확인해 보세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {filteredPosts.map((post) => (
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
                  <span className="px-2 py-1 bg-gray-100 rounded">{post.topic}</span>
                  <span>{post.createdAt ? formatDate(post.createdAt) : '-'}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {selectedPost ? (
              <>
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {selectedPost.title || '제목 없음'}
                </h2>
                <p className="text-sm text-gray-500 mb-2">
                  주제: {selectedPost.topic} ·{' '}
                  {selectedPost.createdAt ? formatDate(selectedPost.createdAt) : '-'}
                </p>
                <p className="text-sm text-gray-500 mb-4">본문 길이: {selectedPost.content?.length || 0}자</p>
                <div className="prose max-w-none text-sm text-gray-600 max-h-96 overflow-y-auto mb-4">
                  <pre className="whitespace-pre-wrap font-sans">{selectedPost.content}</pre>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => copyToClipboard(selectedPost.content || '')}
                    className="w-full py-2 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    본문 복사
                  </button>
                  <button
                    onClick={() => copyToClipboard(selectedPost.title || '')}
                    className="w-full py-2 px-4 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    제목 복사
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-400 py-12">
                <p>왼쪽 리스트에서 글을 선택하면 상세 내용이 표시됩니다.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
