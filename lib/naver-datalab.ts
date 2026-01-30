// 네이버 데이터랩 API 연동

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
