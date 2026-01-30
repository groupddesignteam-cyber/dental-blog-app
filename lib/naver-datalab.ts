// 네이버 데이터랩 API 연동
import { withCache, CACHE_TTL, cache } from './cache'

export interface KeywordTrend {
  period: string
  ratio: number
}

export interface KeywordGroup {
  groupName: string
  keywords: string[]
}

export interface DataLabResponse {
  startDate: string
  endDate: string
  timeUnit: string
  results: Array<{
    title: string
    keywords: string[]
    data: KeywordTrend[]
  }>
}

// 네이버 데이터랩 검색어 트렌드 API 호출
export async function getSearchTrend(
  keywordGroups: KeywordGroup[],
  startDate?: string,
  endDate?: string
): Promise<DataLabResponse | null> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.log('네이버 API 설정이 없습니다.')
    return null
  }

  // 기본 날짜 설정 (최근 1년)
  const end = endDate || new Date().toISOString().split('T')[0]
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  try {
    const response = await fetch('https://openapi.naver.com/v1/datalab/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        timeUnit: 'month',
        keywordGroups,
      }),
    })

    if (!response.ok) {
      throw new Error(`Naver API error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch Naver DataLab:', error)
    return null
  }
}

// 치과 관련 키워드 트렌드 분석
export async function analyzeDentalKeywordTrend(topic: string): Promise<{
  trend: DataLabResponse | null
  analysis: string
}> {
  // 주제에 따른 키워드 그룹 설정
  const keywordGroups: KeywordGroup[] = []

  if (topic.includes('임플란트')) {
    keywordGroups.push(
      { groupName: '임플란트', keywords: ['임플란트', '임플란트 가격', '임플란트 비용'] },
      { groupName: '임플란트 관련', keywords: ['임플란트 후기', '임플란트 수명', '뼈이식'] }
    )
  } else if (topic.includes('교정')) {
    keywordGroups.push(
      { groupName: '교정', keywords: ['치아교정', '투명교정', '인비절라인'] },
      { groupName: '교정 관련', keywords: ['교정 비용', '교정 기간', '성인교정'] }
    )
  } else if (topic.includes('신경') || topic.includes('충치')) {
    keywordGroups.push(
      { groupName: '신경치료', keywords: ['신경치료', '충치치료', '치아 통증'] },
      { groupName: '관련', keywords: ['충치 비용', '신경치료 비용', '이가 아파요'] }
    )
  } else if (topic.includes('사랑니')) {
    keywordGroups.push(
      { groupName: '사랑니', keywords: ['사랑니', '사랑니 발치', '매복사랑니'] },
      { groupName: '관련', keywords: ['사랑니 통증', '사랑니 비용', '사랑니 후'] }
    )
  } else {
    // 기본 치과 키워드
    keywordGroups.push(
      { groupName: topic, keywords: [topic, `${topic} 비용`, `${topic} 치과`] }
    )
  }

  const trend = await getSearchTrend(keywordGroups)

  // 분석 텍스트 생성
  let analysis = ''

  if (trend && trend.results && trend.results.length > 0) {
    analysis = `
### 📊 네이버 검색 트렌드 분석

**분석 기간:** ${trend.startDate} ~ ${trend.endDate}

`
    for (const result of trend.results) {
      const data = result.data || []
      if (data.length > 0) {
        const latestRatio = data[data.length - 1]?.ratio || 0
        const prevRatio = data[data.length - 2]?.ratio || 0
        const change = latestRatio - prevRatio

        analysis += `**${result.title}:** `
        if (change > 0) {
          analysis += `상승 추세 (↑${change.toFixed(1)})\n`
        } else if (change < 0) {
          analysis += `하락 추세 (↓${Math.abs(change).toFixed(1)})\n`
        } else {
          analysis += `안정적\n`
        }
      }
    }

    analysis += `
**키워드 전략 제안:**
- 검색량이 높은 키워드를 제목에 배치
- 트렌드 상승 키워드 우선 활용
`
  } else {
    analysis = '[네이버 데이터랩 API 미설정 또는 데이터 없음]'
  }

  return { trend, analysis }
}

// 월별 인기 키워드 가져오기
export function getMonthlyPopularKeywords(): string[] {
  const month = new Date().getMonth() + 1

  // 계절별 인기 키워드
  const seasonalKeywords: Record<number, string[]> = {
    1: ['치아교정', '라미네이트', '새해 치아관리'],
    2: ['치아교정', '졸업 치아관리', '입학 전 교정'],
    3: ['봄 스케일링', '치아미백', '교정 상담'],
    4: ['치아미백', '스케일링', '잇몸 관리'],
    5: ['부모님 임플란트', '효도 임플란트', '어르신 틀니'],
    6: ['스케일링', '충치 예방', '여름 전 치료'],
    7: ['방학 교정', '학생 교정', '사랑니 발치'],
    8: ['방학 교정', '사랑니', '충치 치료'],
    9: ['추석 전 치료', '스케일링', '잇몸 치료'],
    10: ['수능 전 치료', '치아 관리', '교정'],
    11: ['수능 후 교정', '임플란트', '치아교정'],
    12: ['연말 미백', '스케일링', '연말정산 치료'],
  }

  return seasonalKeywords[month] || ['치과', '치아관리', '스케일링']
}

// ============================================================
// 네이버 쇼핑인사이트 API (카테고리별 클릭 트렌드)
// ============================================================

export interface ShoppingCategory {
  name: string
  param: string[] // 네이버 쇼핑 카테고리 ID
}

export interface ShoppingTrendResponse {
  startDate: string
  endDate: string
  timeUnit: string
  results: Array<{
    title: string
    category: string[]
    data: Array<{
      period: string
      ratio: number
    }>
  }>
}

// 치과 관련 쇼핑 카테고리 매핑
const DENTAL_SHOPPING_CATEGORIES: Record<string, ShoppingCategory> = {
  '치아미백': { name: '치아미백', param: ['50000008'] }, // 뷰티 > 구강용품
  '전동칫솔': { name: '전동칫솔', param: ['50000804'] },
  '치실': { name: '치실/치간칫솔', param: ['50000805'] },
  '구강용품': { name: '구강용품', param: ['50000008'] },
}

// 쇼핑인사이트 카테고리 트렌드 조회
export async function getShoppingCategoryTrend(
  categories: ShoppingCategory[],
  startDate?: string,
  endDate?: string
): Promise<ShoppingTrendResponse | null> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return null
  }

  const end = endDate || new Date().toISOString().split('T')[0]
  const start = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  try {
    const response = await fetch('https://openapi.naver.com/v1/datalab/shopping/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        timeUnit: 'month',
        category: categories,
      }),
    })

    if (!response.ok) {
      console.error('Shopping Insight API error:', response.status)
      return null
    }

    return await response.json()
  } catch (error) {
    console.error('Failed to fetch Shopping Insight:', error)
    return null
  }
}

// ============================================================
// 트렌드 기반 1위 키워드 추출
// ============================================================

export interface TopKeywordResult {
  topKeyword: string
  trendDirection: 'up' | 'down' | 'stable'
  changePercent: number
  relatedKeywords: string[]
}

// 검색 트렌드에서 1위 키워드 추출
export function extractTopKeyword(trendData: DataLabResponse | null): TopKeywordResult | null {
  if (!trendData || !trendData.results || trendData.results.length === 0) {
    return null
  }

  // 가장 최근 데이터 기준으로 1위 키워드 찾기
  let topResult = trendData.results[0]
  let maxRatio = 0

  for (const result of trendData.results) {
    const latestData = result.data[result.data.length - 1]
    if (latestData && latestData.ratio > maxRatio) {
      maxRatio = latestData.ratio
      topResult = result
    }
  }

  // 트렌드 방향 계산
  const data = topResult.data
  const latest = data[data.length - 1]?.ratio || 0
  const previous = data[data.length - 2]?.ratio || 0
  const change = latest - previous
  const changePercent = previous > 0 ? (change / previous) * 100 : 0

  let trendDirection: 'up' | 'down' | 'stable' = 'stable'
  if (change > 5) trendDirection = 'up'
  else if (change < -5) trendDirection = 'down'

  return {
    topKeyword: topResult.title,
    trendDirection,
    changePercent: Math.round(changePercent * 10) / 10,
    relatedKeywords: topResult.keywords,
  }
}

// ============================================================
// 통합 키워드 분석 (검색 트렌드 + 쇼핑 인사이트)
// ============================================================

export interface KeywordAnalysisResult {
  searchTrend: {
    topKeyword: string | null
    direction: string
    analysis: string
  }
  shoppingTrend: {
    available: boolean
    analysis: string
  }
  recommendations: string[]
  seoScore: number // 0-100
}

export async function analyzeKeywordsComprehensive(topic: string): Promise<KeywordAnalysisResult> {
  // 🚀 캐싱: 동일 토픽은 30분간 캐시 (API 호출 절약)
  const cacheKey = `keyword-analysis:${topic}`
  const cached = cache.get<KeywordAnalysisResult>(cacheKey)
  if (cached) {
    console.log(`[Cache HIT] Keyword analysis for "${topic}"`)
    return cached
  }

  // 1. 검색어 트렌드 분석
  const { trend: searchTrend, analysis: searchAnalysis } = await analyzeDentalKeywordTrend(topic)
  const topKeyword = extractTopKeyword(searchTrend)

  // 2. 쇼핑 인사이트 (관련 카테고리가 있는 경우)
  let shoppingAnalysis = '[치과 시술은 쇼핑인사이트 대상 아님]'
  const relatedCategory = DENTAL_SHOPPING_CATEGORIES[topic]

  if (relatedCategory) {
    const shoppingTrend = await getShoppingCategoryTrend([relatedCategory])
    if (shoppingTrend && shoppingTrend.results.length > 0) {
      const result = shoppingTrend.results[0]
      const latestRatio = result.data[result.data.length - 1]?.ratio || 0
      shoppingAnalysis = `**${relatedCategory.name} 쇼핑 트렌드:** 관심도 ${latestRatio.toFixed(0)}점`
    }
  }

  // 3. SEO 점수 계산 (트렌드 기반)
  let seoScore = 70 // 기본 점수
  if (topKeyword) {
    if (topKeyword.trendDirection === 'up') seoScore += 20
    else if (topKeyword.trendDirection === 'down') seoScore -= 10
    if (topKeyword.changePercent > 10) seoScore += 10
  }
  seoScore = Math.min(100, Math.max(0, seoScore))

  // 4. 키워드 추천 생성
  const recommendations: string[] = []
  if (topKeyword) {
    recommendations.push(`🔥 인기 키워드: "${topKeyword.topKeyword}" 활용 권장`)
    if (topKeyword.trendDirection === 'up') {
      recommendations.push(`📈 상승 트렌드 - 제목에 배치 시 노출 증가 예상`)
    }
    recommendations.push(...topKeyword.relatedKeywords.slice(0, 2).map(k => `💡 연관 키워드: "${k}"`))
  }

  const result: KeywordAnalysisResult = {
    searchTrend: {
      topKeyword: topKeyword?.topKeyword || null,
      direction: topKeyword?.trendDirection || 'stable',
      analysis: searchAnalysis,
    },
    shoppingTrend: {
      available: !!relatedCategory,
      analysis: shoppingAnalysis,
    },
    recommendations,
    seoScore,
  }

  // 🚀 캐시 저장 (30분)
  cache.set(cacheKey, result, CACHE_TTL.KEYWORD)
  console.log(`[Cache SET] Keyword analysis for "${topic}"`)

  return result
}
