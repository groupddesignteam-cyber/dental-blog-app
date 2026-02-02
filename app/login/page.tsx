'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import IntroAnimation from '@/components/IntroAnimation'

const INTRO_SHOWN_KEY = 'dental-blog-intro-shown'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showIntro, setShowIntro] = useState(false)
  const [introChecked, setIntroChecked] = useState(false)
  const router = useRouter()

  // 인트로 표시 여부 확인
  useEffect(() => {
    const hasSeenIntro = localStorage.getItem(INTRO_SHOWN_KEY)
    if (!hasSeenIntro) {
      setShowIntro(true)
    }
    setIntroChecked(true)
  }, [])

  const handleIntroComplete = () => {
    localStorage.setItem(INTRO_SHOWN_KEY, 'true')
    setShowIntro(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } else {
      router.push('/dashboard')
    }
  }

  // 인트로 확인 전에는 빈 화면
  if (!introChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-600 via-primary-500 to-blue-500">
        <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <>
      {/* 인트로 애니메이션 */}
      {showIntro && <IntroAnimation onComplete={handleIntroComplete} />}

      {/* 로그인 폼 */}
      <div className={`min-h-screen flex items-center justify-center bg-gray-50 transition-opacity duration-500 ${showIntro ? 'opacity-0' : 'opacity-100'}`}>
        <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
          <div>
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center">
                <span className="text-4xl">🦷</span>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-center text-gray-900">
              치과 블로그 글 작성기
            </h1>
            <p className="mt-2 text-center text-gray-600">
              팀 계정으로 로그인하세요
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  이메일
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  비밀번호
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          {/* 기능 소개 */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-center text-gray-500 mb-3">주요 기능</p>
            <div className="flex justify-center gap-4 text-xs text-gray-600">
              <span>⚖️ 의료법 준수</span>
              <span>🔍 SEO 최적화</span>
              <span>🤖 AI 작성</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
