'use client'

import { useState, useEffect } from 'react'

interface Props {
  onComplete: () => void
}

export default function IntroAnimation({ onComplete }: Props) {
  const [phase, setPhase] = useState(0)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // 5초 인트로 애니메이션 단계
    const timers = [
      setTimeout(() => setPhase(1), 200),    // 배경 효과 시작
      setTimeout(() => setPhase(2), 600),    // GROUP-D 2.0 등장
      setTimeout(() => setPhase(3), 1800),   // BLOG bot 등장
      setTimeout(() => setPhase(4), 3000),   // 글로우 효과
      setTimeout(() => {
        setIsExiting(true)
        setTimeout(onComplete, 800)
      }, 5000), // 5초 후 종료
    ]

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  const handleSkip = () => {
    setIsExiting(true)
    setTimeout(onComplete, 400)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden cursor-pointer transition-opacity duration-800 ${
        isExiting ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={handleSkip}
      style={{ perspective: '1000px' }}
    >
      {/* 3D 배경 그리드 */}
      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${phase >= 1 ? 'opacity-100' : 'opacity-0'}`}
        style={{
          background: `
            linear-gradient(90deg, rgba(0, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(rgba(0, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          transform: 'perspective(500px) rotateX(60deg)',
          transformOrigin: 'center top',
          animation: phase >= 1 ? 'gridMove 20s linear infinite' : 'none',
        }}
      />

      {/* 글로우 오브 1 */}
      <div
        className={`absolute w-96 h-96 rounded-full blur-3xl transition-all duration-1000 ${
          phase >= 1 ? 'opacity-60' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(0, 200, 255, 0.4) 0%, transparent 70%)',
          animation: 'float1 4s ease-in-out infinite',
          left: '10%',
          top: '20%',
        }}
      />

      {/* 글로우 오브 2 */}
      <div
        className={`absolute w-80 h-80 rounded-full blur-3xl transition-all duration-1000 ${
          phase >= 1 ? 'opacity-50' : 'opacity-0'
        }`}
        style={{
          background: 'radial-gradient(circle, rgba(147, 51, 234, 0.4) 0%, transparent 70%)',
          animation: 'float2 5s ease-in-out infinite',
          right: '15%',
          bottom: '25%',
        }}
      />

      {/* 파티클 효과 */}
      {phase >= 1 && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-cyan-400 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `particle ${3 + Math.random() * 4}s linear infinite`,
                animationDelay: `${Math.random() * 2}s`,
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      )}

      {/* 메인 콘텐츠 */}
      <div className="relative z-10 text-center" style={{ transform: 'translateZ(50px)' }}>
        {/* GROUP-D 2.0 */}
        <div
          className={`transition-all duration-1000 ease-out ${
            phase >= 2
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-10 scale-95'
          }`}
        >
          <h1
            className="text-6xl md:text-8xl font-black tracking-wider mb-2"
            style={{
              background: 'linear-gradient(135deg, #00d4ff 0%, #00ff88 50%, #00d4ff 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: phase >= 4 ? 'gradientShift 3s ease infinite' : 'none',
              textShadow: '0 0 60px rgba(0, 212, 255, 0.5)',
              filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.3))',
            }}
          >
            GROUP-D
          </h1>
          <div
            className={`text-4xl md:text-6xl font-bold text-cyan-400 transition-all duration-500 ${
              phase >= 2 ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              textShadow: '0 0 40px rgba(0, 255, 255, 0.6)',
              animation: phase >= 4 ? 'pulse3d 2s ease-in-out infinite' : 'none',
            }}
          >
            2.0
          </div>
        </div>

        {/* 구분선 */}
        <div
          className={`my-8 mx-auto h-px transition-all duration-700 ${
            phase >= 3 ? 'w-48 opacity-100' : 'w-0 opacity-0'
          }`}
          style={{
            background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
            boxShadow: '0 0 20px rgba(0, 212, 255, 0.5)',
          }}
        />

        {/* BLOG bot */}
        <div
          className={`transition-all duration-1000 ease-out ${
            phase >= 3
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-10 scale-95'
          }`}
        >
          <h2
            className="text-5xl md:text-7xl font-black tracking-widest"
            style={{
              background: 'linear-gradient(135deg, #ff00ff 0%, #00ffff 50%, #ff00ff 100%)',
              backgroundSize: '200% 200%',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              animation: phase >= 4 ? 'gradientShift 3s ease infinite reverse' : 'none',
              textShadow: '0 0 60px rgba(255, 0, 255, 0.5)',
              filter: 'drop-shadow(0 0 30px rgba(255, 0, 255, 0.3))',
            }}
          >
            BLOG
          </h2>
          <div
            className={`text-3xl md:text-5xl font-medium text-purple-400 mt-1 transition-all duration-500 ${
              phase >= 3 ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              textShadow: '0 0 30px rgba(168, 85, 247, 0.6)',
              letterSpacing: '0.3em',
            }}
          >
            bot
          </div>
        </div>
      </div>

      {/* 하단 로딩 바 */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <div
          className="h-full transition-all ease-linear"
          style={{
            width: phase >= 1 ? '100%' : '0%',
            transitionDuration: '5000ms',
            background: 'linear-gradient(90deg, #00d4ff, #ff00ff, #00d4ff)',
            backgroundSize: '200% 100%',
            animation: 'gradientShift 2s linear infinite',
          }}
        />
      </div>

      {/* 스킵 안내 */}
      <div
        className={`absolute bottom-8 text-white/40 text-xs tracking-widest uppercase transition-all duration-500 ${
          phase >= 3 ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Click to skip
      </div>

      {/* 커스텀 애니메이션 스타일 */}
      <style jsx>{`
        @keyframes gridMove {
          0% { background-position: 0 0; }
          100% { background-position: 0 50px; }
        }
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(30px, -30px) scale(1.1); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, 20px) scale(1.15); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes pulse3d {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes particle {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
