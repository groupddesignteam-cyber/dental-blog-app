// Google Sheets RAG - 기존 글 DB에서 패턴 참조
// sheets_rag.py를 TypeScript로 변환

import { google } from 'googleapis'

// 주제별 키워드 매핑
const TOPIC_KEYWORDS: Record<string, string[]> = {
  '임플란트': ['임플란트', '식립', '인공치아', '뼈이식', '골이식', '픽스쳐'],
  '보철': ['크라운', '지르코니아', '보철', '씌우', '올세라믹', '라미네이트'],
  '교정': ['교정', '투명교정', '인비절라인', '치열', '브라켓', '덧니', '돌출'],
  '신경치료': ['신경치료', '근관', '치수', '신경'],
  '충치': ['충치', '우식', '레진', '인레이', '썩은'],
  '잇몸': ['잇몸', '치주', '스케일링', '치은', '풍치'],
  '발치': ['발치', '사랑니', '매복', '뽑'],
  '미백': ['미백', '화이트닝', '누런'],
  '소아': ['소아', '아이', '어린이', '유치'],
}

// Google Sheets 인증
function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

// 카테고리 추출
function getCategory(topic: string): string | null {
  const topicLower = topic.toLowerCase()
  for (const [category, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => topicLower.includes(kw.toLowerCase()))) {
      return category
    }
  }
  return null
}

// 문자열 유사도 계산 (간단한 버전)
function similarityScore(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()

  if (aLower === bLower) return 1

  const aWords = new Set(aLower.split(/\s+/))
  const bWords = new Set(bLower.split(/\s+/))

  let matches = 0
  for (const word of aWords) {
    if (bWords.has(word)) matches++
  }

  return matches / Math.max(aWords.size, bWords.size)
}

export interface SimilarPost {
  clinic: string
  topic: string
  content: string
  score: number
}

export interface PatternAnalysis {
  introSamples: string[]
  subheadingPatterns: string[]
  commonExpressions: {
    transitions: string[]
    empathy: string[]
    cta: string[]
  }
  avgLength: number
}

// 서문 추출 (첫 3문장)
function extractIntro(content: string, sentences: number = 3): string {
  const lines = content.split('\n').filter(l => l.trim())

  const introLines: string[] = []
  for (const line of lines) {
    // 제목/소제목 스킵
    if (line.startsWith('#')) continue
    introLines.push(line)
    if (introLines.length >= sentences) break
  }

  return introLines.join('\n')
}

// 소제목 추출
function extractSubheadings(content: string): string[] {
  const matches = content.match(/^##?\s+(.+)$/gm) || []
  return matches.map(m => m.replace(/^##?\s+/, ''))
}

// 표현 추출
function extractExpressions(content: string): PatternAnalysis['commonExpressions'] {
  const expressions = {
    transitions: [] as string[],
    empathy: [] as string[],
    cta: [] as string[],
  }

  // 전환 표현
  const transitionPatterns = [
    /그래서.{0,20}요[,.]/g,
    /다행히.{0,20}요[,.]/g,
    /여기서.{0,20}요[,.]/g,
    /결론.{0,20}면요[,.]/g,
  ]
  for (const pattern of transitionPatterns) {
    const matches = content.match(pattern) || []
    expressions.transitions.push(...matches)
  }

  // 공감 표현
  const empathyPatterns = [
    /걱정.{0,15}시죠[?.]/g,
    /속상하.{0,15}요[?.]/g,
    /불편하.{0,15}요[?.]/g,
  ]
  for (const pattern of empathyPatterns) {
    const matches = content.match(pattern) || []
    expressions.empathy.push(...matches)
  }

  // CTA 표현 (마지막 200자에서)
  const lastPart = content.slice(-200)
  const ctaPatterns = [
    /궁금.{0,30}주세요[.]/g,
    /문의.{0,30}주세요[.]/g,
    /댓글.{0,30}주세요[.]/g,
  ]
  for (const pattern of ctaPatterns) {
    const matches = lastPart.match(pattern) || []
    expressions.cta.push(...matches)
  }

  return expressions
}

// 유사한 글 찾기
export async function findSimilarPosts(
  queryTopic: string,
  sheetId?: string,
  topN: number = 3
): Promise<SimilarPost[]> {
  const spreadsheetId = sheetId || process.env.GOOGLE_SHEETS_ID

  if (!spreadsheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    console.log('Google Sheets 설정이 없습니다.')
    return []
  }

  try {
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // 기존 블로그 DB 시트에서 데이터 가져오기
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'blog_db!A2:F', // 시트 이름과 범위 조정 필요
    })

    const rows = response.data.values || []
    if (rows.length === 0) return []

    const results: SimilarPost[] = []
    const queryCategory = getCategory(queryTopic)

    for (const row of rows) {
      const clinic = row[1] || '' // B열: 치과명
      const topic = row[2] || '' // C열: 주제
      const content = row[5] || '' // F열: 본문

      // 빈 내용 스킵
      if (!content || content.length < 100) continue

      // 점수 계산
      let score = 0

      // 1. 카테고리 매칭
      const rowCategory = getCategory(topic)
      if (queryCategory && rowCategory === queryCategory) {
        score += 0.5
      }

      // 2. 주제 유사도
      score += similarityScore(queryTopic, topic) * 0.3

      // 3. 키워드 포함 여부
      const queryWords = queryTopic.split(/\s+/)
      for (const word of queryWords) {
        if (topic.includes(word) || content.slice(0, 500).includes(word)) {
          score += 0.1
        }
      }

      if (score > 0.2) {
        results.push({ clinic, topic, content, score })
      }
    }

    // 점수 순 정렬
    results.sort((a, b) => b.score - a.score)

    return results.slice(0, topN)
  } catch (error) {
    console.error('Failed to fetch similar posts:', error)
    return []
  }
}

// 패턴 분석
export function analyzePostPatterns(posts: SimilarPost[]): PatternAnalysis {
  const analysis: PatternAnalysis = {
    introSamples: [],
    subheadingPatterns: [],
    commonExpressions: {
      transitions: [],
      empathy: [],
      cta: [],
    },
    avgLength: 0,
  }

  let totalLength = 0

  for (const post of posts) {
    // 서문 샘플
    const intro = extractIntro(post.content)
    if (intro) {
      analysis.introSamples.push(intro)
    }

    // 소제목
    const subheadings = extractSubheadings(post.content)
    analysis.subheadingPatterns.push(...subheadings)

    // 표현
    const expressions = extractExpressions(post.content)
    analysis.commonExpressions.transitions.push(...expressions.transitions)
    analysis.commonExpressions.empathy.push(...expressions.empathy)
    analysis.commonExpressions.cta.push(...expressions.cta)

    // 길이
    totalLength += post.content.length
  }

  if (posts.length > 0) {
    analysis.avgLength = Math.floor(totalLength / posts.length)
  }

  // 중복 제거
  analysis.commonExpressions.transitions = [...new Set(analysis.commonExpressions.transitions)]
  analysis.commonExpressions.empathy = [...new Set(analysis.commonExpressions.empathy)]
  analysis.commonExpressions.cta = [...new Set(analysis.commonExpressions.cta)]

  return analysis
}

// RAG 컨텍스트 생성
export async function generateRAGContext(queryTopic: string): Promise<string> {
  const similarPosts = await findSimilarPosts(queryTopic)

  if (similarPosts.length === 0) {
    return '[참조 가능한 기존 글 없음]'
  }

  const analysis = analyzePostPatterns(similarPosts)

  let context = `
## 📚 기존 글 DB 참조 결과

### 유사 주제 글 ${similarPosts.length}개 발견

`

  for (let i = 0; i < similarPosts.length; i++) {
    const post = similarPosts[i]
    context += `
#### 참조 글 ${i + 1}: ${post.topic} (${post.clinic})
- 유사도: ${post.score.toFixed(2)}
- 서문 샘플:
\`\`\`
${extractIntro(post.content)}
\`\`\`
`
  }

  context += `
### 패턴 분석 결과

**평균 글 길이:** ${analysis.avgLength}자

**서문 스타일:**
${analysis.introSamples.slice(0, 2).map(intro => `- ${intro.slice(0, 100)}...`).join('\n')}

**자주 쓰는 전환 표현:**
${analysis.commonExpressions.transitions.slice(0, 5).join(', ') || '없음'}

**자주 쓰는 공감 표현:**
${analysis.commonExpressions.empathy.slice(0, 5).join(', ') || '없음'}

**자주 쓰는 CTA:**
${analysis.commonExpressions.cta.slice(0, 3).join(', ') || '없음'}

---
⚠️ 위 내용은 패턴 참조용입니다. 그대로 복사하지 말고 변형하여 사용하세요.
`

  return context
}
