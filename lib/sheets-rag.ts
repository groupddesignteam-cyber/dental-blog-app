// Google Sheets RAG - 기존 글 DB에서 패턴 참조
// sheets_rag.py를 TypeScript로 변환

import { google } from 'googleapis'

// API Key 방식으로 시트 데이터 가져오기 (더 간단하고 안정적)
async function fetchSheetDataWithApiKey(range: string): Promise<string[][] | null> {
  const sheetId = process.env.GOOGLE_SHEETS_ID
  const apiKey = process.env.GOOGLE_API_KEY

  if (!sheetId || !apiKey) {
    console.log('[Sheets] API Key 또는 Sheet ID가 없습니다.')
    return null
  }

  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.log(`[Sheets] API 오류: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data.values || []
  } catch (error) {
    console.error('[Sheets] 데이터 가져오기 실패:', error)
    return null
  }
}

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

// 유사한 글 찾기 (API Key 방식)
export async function findSimilarPosts(
  queryTopic: string,
  sheetId?: string,
  topN: number = 3
): Promise<SimilarPost[]> {
  // API Key 방식으로 데이터 가져오기
  const rows = await fetchSheetDataWithApiKey('Rawdata!A2:F')

  if (!rows || rows.length === 0) {
    console.log('[findSimilarPosts] 시트 데이터 없음')
    return []
  }

  const results: SimilarPost[] = []
  const queryCategory = getCategory(queryTopic)

  for (const row of rows) {
    const clinic = (row[1] || '').trim() // B열: 치과명
    const topic = (row[2] || '').trim() // C열: 주제
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

// RAG 컨텍스트 생성 (치과명이 있으면 해당 치과 글 우선 참조)
export async function generateRAGContext(queryTopic: string, clinicName?: string): Promise<string> {
  // 1단계: 해당 치과 글 검색 (스타일 + 주제)
  let clinicPosts: SimilarPost[] = []
  if (clinicName) {
    clinicPosts = await findClinicTopicPosts(clinicName, queryTopic)
  }

  // 2단계: 치과 글이 아예 없으면 전체 DB에서 주제 유사도로 검색
  if (clinicPosts.length === 0) {
    clinicPosts = await findSimilarPosts(queryTopic)
  }

  if (clinicPosts.length === 0) {
    return '[참조 가능한 기존 글 없음]'
  }

  // 3단계: 주제 매칭 품질 확인 → 낮으면 다른 치과에서 치료 흐름 빌려오기
  const topScore = clinicPosts[0]?.score || 0
  const hasGoodTopicMatch = topScore >= 0.7
  let topicRefPosts: SimilarPost[] = []

  if (!hasGoodTopicMatch && clinicName) {
    topicRefPosts = await findTopicReferencePosts(queryTopic, clinicName, 2)
  }

  const analysis = analyzePostPatterns(clinicPosts)

  let context = `
## 📚 기존 글 DB 참조 결과

### ${clinicName ? `${clinicName} ` : ''}유사 주제 글 ${clinicPosts.length}개 발견

`

  for (let i = 0; i < Math.min(clinicPosts.length, 3); i++) {
    const post = clinicPosts[i]
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

  // 다른 치과의 치료 흐름 참고 섹션 추가
  if (topicRefPosts.length > 0) {
    context += `
### 🔄 치료 흐름 참고 (다른 치과의 "${queryTopic}" 글)
⚠️ 아래는 **치료 흐름/구조만 참고**하세요! 스타일/톤은 위 ${clinicName} 패턴을 따르세요!

`
    for (let i = 0; i < topicRefPosts.length; i++) {
      const post = topicRefPosts[i]
      const intro = extractIntro(post.content, 3)
      const middle = post.content.slice(
        Math.floor(post.content.length * 0.3),
        Math.floor(post.content.length * 0.5)
      )
      context += `**치료 흐름 ${i + 1}** (${post.topic}):
[치료 흐름 서두] ${intro.slice(0, 200)}
[치료 흐름 본문] ${middle.slice(0, 400)}...
---
`
    }
  }

  return context
}

// ============================================================
// 치과명 + 주제별 글 스타일/페르소나 추출
// ============================================================

export interface ClinicPersona {
  clinicName: string
  topic: string
  writingStyle: {
    tone: string[]           // 어조 특징 (예: 다정함, 전문적, 친근함)
    endings: {
      formal: string[]       // 문어체 어미 (예: ~입니다, ~됩니다)
      colloquial: string[]   // 구어체 어미 (참고용, 예: ~인데요, ~거든요)
    }
    greetings: string[]      // 인사말 패턴
    closings: string[]       // 마무리 패턴
    expressions: string[]    // 자주 쓰는 표현
  }
  sampleIntros: string[]     // 서문 샘플
  sampleContent: string      // 참조용 본문 샘플 (가장 유사한 글)
  avgLength: number
  postCount: number
  topicMatchQuality: 'high' | 'medium' | 'low' | 'none'
  styleFingerprint: string[] // 치과별 고유 스타일 특성 (P3: 거래처별 차별화용)
}

// 어미 추출 (문어체/구어체 분류)
function extractEndings(content: string): { formal: string[], colloquial: string[] } {
  const formal: string[] = []
  const colloquial: string[] = []

  // 문어체 어미 (우선 - ~다 체)
  const formalPatterns = [
    { pattern: /입니다/g, label: '~입니다' },
    { pattern: /됩니다/g, label: '~됩니다' },
    { pattern: /있습니다/g, label: '~있습니다' },
    { pattern: /겠습니다/g, label: '~겠습니다' },
    { pattern: /바랍니다/g, label: '~바랍니다' },
    { pattern: /습니다/g, label: '~습니다' },
    { pattern: /하죠/g, label: '~하죠' },
  ]

  // 구어체 어미 (참고용 - ~요 체)
  const colloquialPatterns = [
    { pattern: /인데요/g, label: '~인데요' },
    { pattern: /거든요/g, label: '~거든요' },
    { pattern: /해요/g, label: '~해요' },
    { pattern: /드려요/g, label: '~드려요' },
    { pattern: /이에요/g, label: '~이에요' },
    { pattern: /예요/g, label: '~예요' },
    { pattern: /세요/g, label: '~세요' },
  ]

  for (const { pattern, label } of formalPatterns) {
    if ((content.match(pattern) || []).length >= 2) formal.push(label)
  }
  for (const { pattern, label } of colloquialPatterns) {
    if ((content.match(pattern) || []).length >= 2) colloquial.push(label)
  }

  return {
    formal: [...new Set(formal)],
    colloquial: [...new Set(colloquial)],
  }
}

// 인사말 추출
function extractGreetings(content: string): string[] {
  const greetings: string[] = []
  const lines = content.split('\n').slice(0, 10) // 처음 10줄에서

  for (const line of lines) {
    if (line.includes('안녕하세요') || line.includes('반갑습니다')) {
      greetings.push(line.trim().slice(0, 100))
    }
  }

  return greetings
}

// 마무리 추출
function extractClosings(content: string): string[] {
  const closings: string[] = []
  const lines = content.split('\n').slice(-15) // 마지막 15줄에서

  for (const line of lines) {
    const trimmed = line.trim()
    if (
      trimmed.includes('감사합니다') ||
      trimmed.includes('였습니다') ||
      trimmed.includes('이었습니다') ||
      trimmed.includes('바랍니다') ||
      trimmed.includes('드리겠습니다')
    ) {
      closings.push(trimmed.slice(0, 150))
    }
  }

  return closings
}

// 어조 분석
function analyzeTone(content: string): string[] {
  const tones: string[] = []

  // 다정한 어조
  if (/(걱정|안심|편안|괜찮)/.test(content)) {
    tones.push('다정함')
  }

  // 전문적 어조
  if (/(치료|시술|진단|검사).*?(필요|중요|권장)/.test(content)) {
    tones.push('전문적')
  }

  // 친근한 어조
  if (/[ㅎㅋ]|~요[.!]|정말|많이/.test(content)) {
    tones.push('친근함')
  }

  // 설명적 어조
  if (/(이란|라는|의미|말해)/.test(content)) {
    tones.push('설명적')
  }

  return tones.length > 0 ? tones : ['일반적']
}

// 치과명 + 주제별 글 찾기 (API Key 방식)
export async function findClinicTopicPosts(
  clinicName: string,
  topic: string,
  sheetId?: string
): Promise<SimilarPost[]> {
  // API Key 방식으로 데이터 가져오기
  const rows = await fetchSheetDataWithApiKey('Rawdata!A2:F')

  if (!rows || rows.length === 0) {
    console.log('[findClinicTopicPosts] 시트 데이터 없음')
    return []
  }

  console.log(`[findClinicTopicPosts] ${rows.length}개 행 로드, 치과: ${clinicName}, 주제: ${topic}`)

  const results: SimilarPost[] = []
  const queryCategory = getCategory(topic)

  for (const row of rows) {
    const rowClinic = (row[1] || '').trim() // B열: 치과명
    const rowTopic = (row[2] || '').trim() // C열: 주제
    const content = row[5] || '' // F열: 본문

    // 빈 내용 스킵
    if (!content || content.length < 100) continue

    // 치과명이 일치하는지 확인 (trim 적용)
    const clinicNameTrimmed = clinicName.trim()
    const clinicMatch = rowClinic.includes(clinicNameTrimmed) || clinicNameTrimmed.includes(rowClinic)
    if (!clinicMatch) continue

    // 점수 계산
    let score = 0.5 // 치과명 일치 기본 점수

    // 1. 카테고리 매칭
    const rowCategory = getCategory(rowTopic)
    if (queryCategory && rowCategory === queryCategory) {
      score += 0.3
    }

    // 2. 주제 유사도
    score += similarityScore(topic, rowTopic) * 0.2

    results.push({ clinic: rowClinic, topic: rowTopic, content, score })
  }

  console.log(`[findClinicTopicPosts] ${results.length}개 매칭됨`)

  // 점수 순 정렬
  results.sort((a, b) => b.score - a.score)

  return results
}

// 다른 치과에서 같은 주제 글 찾기 (치료 흐름/구조 참고용)
export async function findTopicReferencePosts(
  topic: string,
  excludeClinic: string,
  topN: number = 2
): Promise<SimilarPost[]> {
  const rows = await fetchSheetDataWithApiKey('Rawdata!A2:F')

  if (!rows || rows.length === 0) return []

  const results: SimilarPost[] = []
  const queryCategory = getCategory(topic)
  const excludeTrimmed = excludeClinic.trim()

  for (const row of rows) {
    const rowClinic = (row[1] || '').trim()
    const rowTopic = (row[2] || '').trim()
    const content = row[5] || ''

    if (!content || content.length < 100) continue

    // 현재 치과 제외
    if (rowClinic.includes(excludeTrimmed) || excludeTrimmed.includes(rowClinic)) continue

    // 주제 매칭 점수 계산
    let score = 0
    const rowCategory = getCategory(rowTopic)
    if (queryCategory && rowCategory === queryCategory) score += 0.5

    // 주제 단어 매칭
    const queryWords = topic.split(/[,\s]+/).filter(w => w.length >= 2)
    for (const word of queryWords) {
      if (rowTopic.includes(word)) score += 0.2
      if (content.slice(0, 500).includes(word)) score += 0.1
    }

    score += similarityScore(topic, rowTopic) * 0.2

    if (score >= 0.3) {
      results.push({ clinic: rowClinic, topic: rowTopic, content, score })
    }
  }

  results.sort((a, b) => b.score - a.score)
  const selected = results.slice(0, topN)

  if (selected.length > 0) {
    console.log(`[TopicRef] "${topic}" 치료 흐름 참고 ${selected.length}개 (${selected.map(p => p.clinic).join(', ')})`)
  }

  return selected
}

// 치과별 고유 스타일 핑거프린트 추출 (P3: 거래처별 차별화)
function extractStyleFingerprint(allContent: string, intros: string[]): string[] {
  const fp: string[] = []

  // 1. 서문 시작 패턴 분석
  const firstLines = intros.map(intro => {
    const lines = intro.split('\n').filter(l => l.trim() && !l.includes('안녕하세요'))
    return lines[0] || ''
  }).filter(Boolean)

  let introType = ''
  const questionIntros = firstLines.filter(l => /\?/.test(l)).length
  const clinicalIntros = firstLines.filter(l => /관찰|소견|확인|방사선|사진상/.test(l)).length
  const empathyIntros = firstLines.filter(l => /적\s?있|느끼|겪|불편|시린/.test(l)).length

  if (questionIntros > firstLines.length * 0.5) {
    introType = '질문형 도입 (독자에게 질문을 던지며 시작)'
  } else if (clinicalIntros > firstLines.length * 0.3) {
    introType = '소견 직입형 (임상 소견으로 바로 시작)'
  } else if (empathyIntros > firstLines.length * 0.3) {
    introType = '공감형 도입 (증상/경험에 공감하며 시작)'
  } else {
    introType = '주제 설명형 (주제를 자연스럽게 소개하며 시작)'
  }
  fp.push(`서문 패턴: ${introType}`)

  // 2. 이모지 사용 빈도
  const emojiMatches = allContent.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}✅🔹💚⚠️📷📌🏥✓☐🦷💪🔬]/gu) || []
  const emojiDensity = emojiMatches.length / (allContent.length / 1000)
  if (emojiDensity > 3) {
    fp.push('이모지 활용: 적극적 (소제목·강조에 이모지 사용)')
  } else if (emojiDensity < 0.5) {
    fp.push('이모지 활용: 최소 (텍스트 중심의 담백한 스타일)')
  } else {
    fp.push('이모지 활용: 보통 (포인트에만 가끔 사용)')
  }

  // 3. 문단 길이 선호
  const paragraphs = allContent.split(/\n\s*\n/).filter(p => p.trim().length > 30)
  if (paragraphs.length > 0) {
    const avgPLen = paragraphs.reduce((s, p) => s + p.trim().length, 0) / paragraphs.length
    if (avgPLen < 100) {
      fp.push('문단 스타일: 짧고 간결 (1~2문장씩 끊어서)')
    } else if (avgPLen > 250) {
      fp.push('문단 스타일: 상세하고 긴 문단 (5문장 이상)')
    } else {
      fp.push('문단 스타일: 중간 길이 (3~4문장)')
    }
  }

  // 4. 설명 방식
  const metaphorCount = (allContent.match(/마치|비유|처럼|같은\s*(것|느낌|원리)|쉽게\s*(말|설명|비유)/g) || []).length
  const statsCount = (allContent.match(/\d+%|\d+명|\d+만|통계|연구|보고/g) || []).length
  const clinicalCount = (allContent.match(/관찰|소견|진단|확인됩니다|시사|의미합니다/g) || []).length

  if (metaphorCount > 5) fp.push('설명 방식: 비유를 자주 사용 ("마치 ~처럼")')
  if (statsCount > 3) fp.push('설명 방식: 수치/통계 근거 제시')
  if (clinicalCount > 10) fp.push('설명 방식: 임상 소견 기반 서술 ("~가 관찰됩니다")')

  // 5. 소제목 스타일
  const headings = allContent.match(/^#{1,3}\s+.+$/gm) || []
  if (headings.length > 0) {
    const emojiHeadings = headings.filter(h => /[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}✅🔹💚⚠️📌🦷]/u.test(h))
    const numberedHeadings = headings.filter(h => /^\s*#{1,3}\s+\d+[.)]\s/.test(h))
    if (emojiHeadings.length > headings.length * 0.5) {
      fp.push('소제목: 이모지 + 키워드 스타일')
    } else if (numberedHeadings.length > headings.length * 0.3) {
      fp.push('소제목: 번호 + 키워드 스타일')
    } else {
      fp.push('소제목: 텍스트 키워드 스타일')
    }
  }

  // 6. 독자 참여도 (질문 빈도)
  const questionMarks = (allContent.match(/\?/g) || []).length
  const totalSentences = allContent.split(/[.!?]/).filter(s => s.trim().length > 5).length
  if (totalSentences > 0 && questionMarks / totalSentences > 0.08) {
    fp.push('독자 소통: 질문을 자주 던지는 참여 유도형')
  } else {
    fp.push('독자 소통: 정보 전달 위주의 설명형')
  }

  // 7. 인사→본론 전환 패턴
  const transitionPatterns = intros.map(intro => {
    if (/오늘은|이번에는|이번 글/.test(intro)) return '주제 예고형 ("오늘은 ~에 대해")'
    if (/혹시|적\s?있/.test(intro)) return '경험 질문형 ("혹시 ~해 보신 적")'
    if (/많이|자주|흔히/.test(intro)) return '보편화형 ("~하시는 분들이 많습니다")'
    return null
  }).filter(Boolean)
  if (transitionPatterns.length > 0) {
    // 가장 빈번한 전환 패턴 선택
    const counts: Record<string, number> = {}
    for (const p of transitionPatterns) { counts[p!] = (counts[p!] || 0) + 1 }
    const topTransition = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (topTransition) fp.push(`본론 전환: ${topTransition[0]}`)
  }

  return fp
}

// 치과별 자주 쓰는 치료 키워드 추출
function extractFrequentKeywords(content: string): string[] {
  const keywordPatterns: Record<string, RegExp> = {
    '수면마취': /수면\s?마취|수면\s?진정|진정\s?마취|정맥\s?진정|수면\s?치료/g,
    '골이식': /골이식|뼈이식|골\s?보충|골\s?대체/g,
    '상악동거상술': /상악동\s?거상|상악동\s?수술|사이너스\s?리프트/g,
    '즉시식립': /즉시\s?식립|즉시\s?임플란트|당일\s?식립/g,
    'GBR': /GBR|골유도\s?재생/g,
    '네비게이션': /네비게이션|디지털\s?가이드|가이드\s?수술/g,
    '오스템': /오스템|오스\s?템/g,
    '디지털': /디지털\s?스캔|디지털\s?인상|구강\s?스캐너/g,
    '무절개': /무절개|절개\s?없이|플랩리스/g,
    '전신마취': /전신\s?마취/g,
    '잇몸이식': /잇몸\s?이식|결합조직\s?이식|유리\s?치은/g,
    '치조골보존술': /치조골\s?보존|소켓\s?보존|발치\s?후\s?골보존/g,
  }

  const found: { keyword: string; count: number }[] = []
  for (const [keyword, pattern] of Object.entries(keywordPatterns)) {
    const matches = content.match(pattern) || []
    if (matches.length >= 2) {
      found.push({ keyword, count: matches.length })
    }
  }

  return found.sort((a, b) => b.count - a.count).map(f => `${f.keyword}(${f.count}회)`)
}

// 치과별 페르소나 추출 (강화된 버전 - 모든 글 참조)
export async function extractClinicPersona(
  clinicName: string,
  topic: string,
  sheetId?: string
): Promise<ClinicPersona | null> {
  const posts = await findClinicTopicPosts(clinicName, topic, sheetId)

  if (posts.length === 0) {
    return null
  }

  // 주제 매칭 품질 판정
  const highScorePosts = posts.filter(p => p.score >= 0.8).length
  const medScorePosts = posts.filter(p => p.score >= 0.7).length
  let topicMatchQuality: 'high' | 'medium' | 'low' | 'none'
  if (highScorePosts >= 3) topicMatchQuality = 'high'
  else if (medScorePosts >= 1) topicMatchQuality = 'medium'
  else topicMatchQuality = 'low'
  console.log(`[Persona] topicMatchQuality: ${topicMatchQuality} (high≥0.8: ${highScorePosts}개, med≥0.7: ${medScorePosts}개)`)

  // 모든 글 내용 합치기 (분석용) - 전체 글 참조
  const allContent = posts.map(p => p.content).join('\n\n')

  // 스타일 분석
  const writingStyle = {
    tone: analyzeTone(allContent),
    endings: extractEndings(allContent),
    greetings: extractGreetings(allContent),
    closings: extractClosings(allContent),
    expressions: extractExpressions(allContent).transitions.slice(0, 5),
  }

  // 서문 샘플 추출 - 더 많이 수집
  const sampleIntros = posts.slice(0, 5).map(p => extractIntro(p.content))

  // 평균 길이
  const avgLength = Math.floor(
    posts.reduce((sum, p) => sum + p.content.length, 0) / posts.length
  )

  // 치료 특화 키워드 추출 (수면마취, 골이식 등 자주 쓰는 키워드)
  const frequentKeywords = extractFrequentKeywords(allContent)

  // 스타일 핑거프린트 추출 (P3: 거래처별 차별화)
  const styleFingerprint = extractStyleFingerprint(allContent, sampleIntros)
  console.log(`[Persona] ${clinicName} 스타일 DNA: ${styleFingerprint.join(' | ')}`)

  // 샘플 콘텐츠 확대 - 여러 글의 핵심 부분 수집
  let sampleContent = ''

  // 자주 쓰는 치료 키워드 정보 추가
  if (frequentKeywords.length > 0) {
    sampleContent += `\n### ⚡ ${clinicName} 자주 사용하는 치료 키워드\n`
    sampleContent += frequentKeywords.join(', ')
    sampleContent += `\n→ 위 키워드가 기존 글에서 빈번하게 사용됩니다. 새 글에서도 관련 내용을 적극 반영하세요!\n---\n`
  }

  for (let i = 0; i < Math.min(posts.length, 3); i++) {
    const post = posts[i]
    // 각 글에서 중요 부분 추출 (서문, 본문 일부, 마무리)
    const intro = extractIntro(post.content, 5) // 서문 5문장
    const middle = post.content.slice(
      Math.floor(post.content.length * 0.3),
      Math.floor(post.content.length * 0.6)
    ) // 본문 중간 부분
    const closing = post.content.slice(-500) // 마지막 500자

    sampleContent += `\n\n### 참조 글 ${i + 1} (${post.topic})\n`
    sampleContent += `[서문]\n${intro}\n\n`
    sampleContent += `[본문 일부]\n${middle.slice(0, 600)}...\n\n`
    sampleContent += `[마무리]\n${closing}\n`
    sampleContent += `---\n`
  }

  return {
    clinicName,
    topic,
    writingStyle,
    sampleIntros,
    sampleContent: sampleContent.slice(0, 6000), // 최대 6000자까지 샘플 확대
    avgLength,
    postCount: posts.length,
    topicMatchQuality,
    styleFingerprint,
  }
}

// ~요 어미를 ~다 체로 치환 (페르소나 샘플 정화용)
function sanitizeEndings(text: string): string {
  return text
    .replace(/해요/g, '합니다')
    .replace(/거든요/g, '기 때문입니다')
    .replace(/있어요/g, '있습니다')
    .replace(/드려요/g, '드립니다')
    .replace(/할게요/g, '하겠습니다')
    .replace(/볼게요/g, '보겠습니다')
    .replace(/인데요/g, '인데,')
    .replace(/하세요/g, '하시길 바랍니다')
    .replace(/되세요/g, '되시길 바랍니다')
    .replace(/네요/g, '습니다')
    .replace(/줄게요/g, '주겠습니다')
    .replace(/갈게요/g, '가겠습니다')
    .replace(/같아요/g, '같습니다')
    .replace(/싶어요/g, '싶습니다')
}

// 페르소나 기반 프롬프트 생성 (강화된 버전)
export function generatePersonaPrompt(persona: ClinicPersona): string {
  // 문단 길이 분석
  const paragraphs = persona.sampleContent.split('\n\n').filter(p => p.trim().length > 50)
  const avgParagraphLength = paragraphs.length > 0
    ? Math.floor(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length)
    : 100

  // ★ 샘플 텍스트에서 ~요 어미를 ~다 체로 정화
  const cleanedSampleContent = sanitizeEndings(persona.sampleContent)
  const cleanedSampleIntros = persona.sampleIntros.map(intro => sanitizeEndings(intro))

  // 스타일 DNA 요약
  const styleDNA = persona.styleFingerprint.length > 0
    ? persona.styleFingerprint.map(f => `• ${f}`).join('\n')
    : '• 분석 데이터 부족'

  return `
## 🎭 ${persona.clinicName} 글쓰기 스타일 참조

**분석된 기존 글**: ${persona.postCount}개
**평균 글 길이**: ${persona.avgLength}자
**평균 문단 길이**: ${avgParagraphLength}자

---

### 🧬 이 치과만의 스타일 DNA (반드시 반영!)
아래는 ${persona.clinicName}의 기존 글을 분석하여 추출한 **고유 스타일**입니다.
다른 치과와 차별화되는 핵심 특성이므로, 새 글에서 반드시 반영하세요!

${styleDNA}

→ 위 스타일 DNA를 서문~결론 전체에 일관되게 적용하세요!

---

### 1. 어조 & 말투 특징
${persona.writingStyle.tone.map(t => `✓ ${t}`).join('\n')}

### 2. 기존 글에서 발견된 어미 패턴 (참고만!)
- 문어체: ${persona.writingStyle.endings.formal.length > 0 ? persona.writingStyle.endings.formal.join(', ') : '없음'}
- 구어체: ${persona.writingStyle.endings.colloquial.length > 0 ? persona.writingStyle.endings.colloquial.join(', ') : '없음'}

⚠️ **중요**: 어미 스타일은 위 패턴이 아닌, 아래 "글쓰기 모드"의 어미 규칙을 따르세요!
기존 글에서 ~해요, ~거든요 등 구어체가 발견되더라도, 글쓰기 모드가 금지하면 사용하지 마세요.

### 3. 인사말 패턴 (서문 참고)
${persona.writingStyle.greetings.length > 0
  ? persona.writingStyle.greetings.slice(0, 3).map((g, i) => `${i + 1}. "${g}"`).join('\n')
  : '1. "안녕하세요, [치과명] [원장님]입니다."'}

### 4. 마무리 패턴 (결(結) 참고)
${persona.writingStyle.closings.length > 0
  ? persona.writingStyle.closings.slice(0, 3).map((c, i) => `${i + 1}. "${c}"`).join('\n')
  : '1. "[치과명] [원장님]이었습니다. 감사합니다."'}

### 5. 서문 샘플 (⚠️ 구조/흐름/도입 방식을 그대로 모방!)
🚨 아래 서문의 **도입 방식, 문장 순서, 공감 표현, 주제 전환 흐름**을 그대로 따라하세요!
(어미만 글쓰기 모드 규칙 적용)
${cleanedSampleIntros.slice(0, 3).map((intro, i) => `
**서문 샘플 ${i + 1}:**
\`\`\`
${intro}
\`\`\`
`).join('\n')}

---

## 📖 기존 글 참조 (구조/흐름 참고, 어미는 글쓰기 모드 우선!)

아래는 ${persona.clinicName}의 기존 글입니다.
**글의 구조, 문장 길이, 이모지 사용법, 설명 방식**을 참고하되,
**어미(~요/~다)**는 반드시 글쓰기 모드의 규칙을 따르세요!
🚫 아래 샘플에 ~해요, ~거든요 등이 남아있더라도 절대 따라하지 마세요!

${cleanedSampleContent}

---

## ⚠️ 스타일 적용 체크리스트

☐ 인사말 구조가 기존 글과 유사한가?
☐ 문단 길이가 기존 글과 비슷한가? (평균 ${avgParagraphLength}자)
☐ 전체 글 길이가 기존 글과 비슷한가? (평균 ${persona.avgLength}자)
☐ 마무리 구조가 기존 글과 유사한가?
☐ **어미는 글쓰기 모드(임상/정보성) 규칙을 따랐는가?** ← 최우선!

⚠️ 내용은 새롭게 작성! 복사/표절 금지!
`
}
