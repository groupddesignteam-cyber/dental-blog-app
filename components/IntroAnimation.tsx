'use client'

import { useState, useEffect } from 'react'

interface Props {
  onComplete: () => void
}

export default function IntroAnimation({ onComplete }: Props) {
  const [phase, setPhase] = useState(0)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // 애니메이션 단계별 진행
    const timers = [
      setTimeout(() => setPhase(1), 300),   // 로고 페이드인
      setTimeout(() => setPhase(2), 800),   // 텍스트 1 등장
      setTimeout(() => setPhase(3), 1500),  // 텍스트 2 등장
      setTimeout(() => setPhase(4), 2200),  // 기능 아이콘들 등장
      setTimeout(() => {
        setIsExiting(true)
        setTimeout(onComplete, 600)
      }, 3500), // 종료
    ]

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  const handleSkip = () => {
    setIsExiting(true)
    setTimeout(onComplete, 400)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-primary-600 via-primary-500 to-blue-500 transition-opacity duration-500 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleSkip}
    >
      {/* 배경 효과 */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-white/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-blue-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* 메인 콘텐츠 */}
      <div className="relative z-10 text-center px-8">
        {/* 로고/아이콘 */}
        <div
          className={`mb-8 transition-all duration-700 ease-out ${
            phase >= 1 ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-90'
          }`}
        >
          <div className="inline-flex items-center justify-center w-28 h-28 bg-white rounded-3xl shadow-2xl">
            <span className="text-6xl">🦷</span>
          </div>
        </div>

        {/* 타이틀 */}
        <h1
          className={`text-4xl md:text-5xl font-bold text-white mb-4 transition-all duration-700 ease-out ${
            phase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          치과 블로그 글 작성기
        </h1>

        {/* 서브타이틀 */}
        <p
          className={`text-lg md:text-xl text-white/90 mb-10 transition-all duration-700 ease-out ${
            phase >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          AI가 의료광고법을 준수하며 SEO 최적화된 글을 작성합니다
        </p>

        {/* 기능 아이콘들 */}
        <div
          className={`flex justify-center gap-6 md:gap-10 transition-all duration-700 ease-out ${
            phase >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <FeatureIcon icon="⚖️" label="의료법 준수" delay={0} />
          <FeatureIcon icon="🔍" label="SEO 최적화" delay={100} />
          <FeatureIcon icon="🤖" label="AI 작성" delay={200} />
          <FeatureIcon icon="📊" label="키워드 분석" delay={300} />
        </div>
      </div>

      {/* 스킵 안내 */}
      <div
        className={`absolute bottom-10 text-white/60 text-sm transition-all duration-500 ${
          phase >= 3 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        화면을 클릭하여 건너뛰기
      </div>

      {/* 로딩 바 */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className="h-full bg-white transition-all duration-[3500ms] ease-linear"
          style={{ width: phase >= 1 ? '100%' : '0%' }}
        />
      </div>
    </div>
  )
}

function FeatureIcon({ icon, label, delay }: { icon: string; label: string; delay: number }) {
  return (
    <div
      className="flex flex-col items-center animate-bounce-slow"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="w-14 h-14 md:w-16 md:h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-2 shadow-lg">
        <span className="text-2xl md:text-3xl">{icon}</span>
      </div>
      <span className="text-xs md:text-sm text-white/80 font-medium">{label}</span>
    </div>
  )
}
