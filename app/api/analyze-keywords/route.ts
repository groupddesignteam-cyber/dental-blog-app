import { NextRequest, NextResponse } from 'next/server'
import {
  analyzeKeywordsComprehensive,
  getMonthlyPopularKeywords,
  KeywordAnalysisResult,
} from '@/lib/naver-datalab'
import { extractClinicPersona, ClinicPersona } from '@/lib/sheets-rag'
import { suggestSubKeywords } from '@/data/keywords'

export interface AnalyzeKeywordsRequest {
  clinicName: string
  topic: string
  region: string
}

export interface AnalyzeKeywordsResponse {
  success: boolean
  // 네이버 트렌드 분석 결과
  trendAnalysis: KeywordAnalysisResult | null
  // 추천 키워드 목록
  recommendedKeywords: {
    main: string[]
    sub: string[]
    seasonal: string[]
    trending: string[]
  }
  // 치과별 페르소나 (기존 글 스타일)
  persona: ClinicPersona | null
  // SEO 추천 사항
  seoRecommendations: string[]
  error?: string
}

export async function POST(request: NextRequest) {
  try {
    const data: AnalyzeKeywordsRequest = await request.json()
    const { clinicName, topic, region } = data

    if (!topic) {
      return NextResponse.json(
        { success: false, error: '주제를 입력해주세요.' },
        { status: 400 }
      )
    }

    console.log(`[Analyze Keywords] 치과: ${clinicName}, 주제: ${topic}, 지역: ${region}`)

    // 병렬로 분석 실행
    const [trendResult, personaResult] = await Promise.allSettled([
      analyzeKeywordsComprehensive(topic),
      clinicName ? extractClinicPersona(clinicName, topic) : Promise.resolve(null),
    ])

    // 트렌드 분석 결과
    const trendAnalysis = trendResult.status === 'fulfilled' ? trendResult.value : null

    // 페르소나 결과
    const persona = personaResult.status === 'fulfilled' ? personaResult.value : null

    // 키워드 추천 생성
    const subKeywords = suggestSubKeywords(topic)
    const seasonalKeywords = getMonthlyPopularKeywords()

    // 트렌드 기반 키워드
    const trendingKeywords: string[] = []
    if (trendAnalysis?.searchTrend.topKeyword) {
      trendingKeywords.push(trendAnalysis.searchTrend.topKeyword)
    }
    if (trendAnalysis?.recommendations) {
      // 추천에서 키워드 추출
      for (const rec of trendAnalysis.recommendations) {
        const match = rec.match(/"([^"]+)"/)
        if (match) {
          trendingKeywords.push(match[1])
        }
      }
    }

    // 메인 키워드 (지역+치료 조합)
    const mainKeywords = [
      topic,
      `${region} ${topic}`,
      `${topic} 치료`,
      `${topic} 비용`,
      `${topic} 후기`,
    ].filter((k, i, arr) => arr.indexOf(k) === i) // 중복 제거

    // SEO 추천 사항
    const seoRecommendations: string[] = []

    if (trendAnalysis) {
      if (trendAnalysis.searchTrend.direction === 'up') {
        seoRecommendations.push(`📈 "${topic}" 검색량 상승 중 - 지금이 글 작성 적기!`)
      } else if (trendAnalysis.searchTrend.direction === 'down') {
        seoRecommendations.push(`📉 "${topic}" 검색량 하락 추세 - 관련 키워드로 확장 권장`)
      }

      if (trendAnalysis.seoScore >= 80) {
        seoRecommendations.push(`🎯 SEO 점수 ${trendAnalysis.seoScore}점 - 높은 노출 가능성`)
      }
    }

    if (persona) {
      seoRecommendations.push(`✅ ${clinicName}의 기존 ${persona.postCount}개 글 스타일 분석 완료`)
      seoRecommendations.push(`📝 평균 글 길이: ${persona.avgLength}자 (참고용)`)
    } else if (clinicName) {
      seoRecommendations.push(`ℹ️ ${clinicName}의 "${topic}" 관련 기존 글이 없습니다. 기본 스타일로 작성됩니다.`)
    }

    // 계절 키워드 추천
    const currentMonth = new Date().getMonth() + 1
    seoRecommendations.push(`🗓️ ${currentMonth}월 인기 키워드: ${seasonalKeywords.join(', ')}`)

    const response: AnalyzeKeywordsResponse = {
      success: true,
      trendAnalysis,
      recommendedKeywords: {
        main: mainKeywords,
        sub: subKeywords,
        seasonal: seasonalKeywords,
        trending: [...new Set(trendingKeywords)],
      },
      persona,
      seoRecommendations,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Analyze keywords error:', error)
    return NextResponse.json(
      {
        success: false,
        error: '키워드 분석에 실패했습니다.',
        trendAnalysis: null,
        recommendedKeywords: { main: [], sub: [], seasonal: [], trending: [] },
        persona: null,
        seoRecommendations: [],
      },
      { status: 500 }
    )
  }
}
