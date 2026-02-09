// Google Sheets RAG - 기존 글 DB에서 패턴 참조
// sheets_rag.py를 TypeScript로 변환

import { google } from 'googleapis'

// 시트 탭 이름 후보 (순서대로 시도)
const SHEET_TAB_CANDIDATES = ['Rawdata', '블로그 포스팅', '블로그포스팅', 'Sheet1', '시트1']

// 탭 이름 캐시 (서버 런타임 동안 유지)
let _cachedTabName: string | null = null

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
      console.log(`[Sheets] API 오류: ${response.status} (range: ${range})`)
      return null
    }

    const data = await response.json()
    return data.values || []
  } catch (error) {
    console.error('[Sheets] 데이터 가져오기 실패:', error)
    return null
  }
}

// 여러 탭 이름을 시도하여 블로그 글 데이터 가져오기
async function fetchBlogPostsData(): Promise<string[][] | null> {
  // 1. 캐시된 탭 이름이 있으면 바로 사용
  if (_cachedTabName !== null) {
    const range = _cachedTabName ? `${_cachedTabName}!A2:F` : 'A2:F'
    const rows = await fetchSheetDataWithApiKey(range)
    if (rows && rows.length > 0) return rows
    _cachedTabName = null // 캐시 무효화
  }

  // 2. 후보 탭 이름들을 순서대로 시도
  for (const tabName of SHEET_TAB_CANDIDATES) {
    console.log(`[Sheets] 탭 "${tabName}" 시도 중...`)
    const rows = await fetchSheetDataWithApiKey(`${tabName}!A2:F`)
    if (rows && rows.length > 0) {
      console.log(`[Sheets] ✅ 탭 "${tabName}"에서 ${rows.length}개 행 발견`)
      _cachedTabName = tabName
      return rows
    }
  }

  // 3. 탭 이름 없이 기본 시트 시도
  console.log(`[Sheets] 기본 시트(탭명 없음) 시도 중...`)
  const rows = await fetchSheetDataWithApiKey('A2:F')
  if (rows && rows.length > 0) {
    console.log(`[Sheets] ✅ 기본 시트에서 ${rows.length}개 행 발견`)
    _cachedTabName = '' // 빈 문자열 = 기본 시트
    return rows
  }

  console.log('[Sheets] ❌ 모든 탭에서 데이터를 찾지 못했습니다.')
  return null
}

// URL 제거 함수 (Google Docs, Drive 등 시트 본문에 포함된 링크 정화)
function stripUrls(text: string): string {
  if (!text) return text
  return text
    .replace(/https?:\/\/[^\s)>\]]+/gi, '')
    .replace(/www\.[^\s)>\]]+/gi, '')
    .replace(/docs\.google\.com[^\s)>\]]*/gi, '')
    .replace(/drive\.google\.com[^\s)>\]]*/gi, '')
    .replace(/bit\.ly[^\s)>\]]*/gi, '')
    .replace(/goo\.gl[^\s)>\]]*/gi, '')
    .replace(/\(출처:\s*\)/g, '')        // 빈 출처 태그 정리
    .replace(/\[([^\]]*)\]\(\s*\)/g, '$1') // 빈 링크 마크다운 정리
    .replace(/[ \t]{2,}/g, ' ')           // 연속 공백 정리
    .trim()
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

// 유사한 글 찾기 (자동 탭 탐색)
export async function findSimilarPosts(
  queryTopic: string,
  sheetId?: string,
  topN: number = 3
): Promise<SimilarPost[]> {
  // 자동 탭 탐색으로 데이터 가져오기
  const rows = await fetchBlogPostsData()

  if (!rows || rows.length === 0) {
    console.log('[findSimilarPosts] 시트 데이터 없음')
    return []
  }

  const results: SimilarPost[] = []
  const queryCategory = getCategory(queryTopic)

  for (const row of rows) {
    const clinic = (row[1] || '').trim() // B열: 치과명
    const topic = (row[2] || '').trim() // C열: 주제
    const content = stripUrls(row[5] || '') // F열: 본문 (URL 제거)

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
  // 치과명이 있으면 해당 치과 글 우선 검색
  let similarPosts: SimilarPost[] = []
  if (clinicName) {
    similarPosts = await findClinicTopicPosts(clinicName, queryTopic)
  }
  // 치과 글이 없으면 전체 DB에서 주제 유사도로 검색
  if (similarPosts.length === 0) {
    similarPosts = await findSimilarPosts(queryTopic)
  }

  if (similarPosts.length === 0) {
    return '[참조 가능한 기존 글 없음]'
  }

  const analysis = analyzePostPatterns(similarPosts)

  let context = `
## 📚 기존 글 DB 참조 결과

### ${clinicName ? `${clinicName} ` : ''}유사 주제 글 ${similarPosts.length}개 발견

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

// 치과명 + 주제별 글 찾기 (자동 탭 탐색)
export async function findClinicTopicPosts(
  clinicName: string,
  topic: string,
  sheetId?: string
): Promise<SimilarPost[]> {
  // 자동 탭 탐색으로 데이터 가져오기
  const rows = await fetchBlogPostsData()

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
    const content = stripUrls(row[5] || '') // F열: 본문 (URL 제거)

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
  }
}

// 치과별 기존 글에서 사용된 메인키워드 추출
export async function extractUsedKeywords(clinicName: string): Promise<string[]> {
  const rows = await fetchBlogPostsData()
  if (!rows || rows.length === 0) return []

  const keywords = new Set<string>()
  const clinicNameTrimmed = clinicName.trim()

  for (const row of rows) {
    const rowClinic = (row[1] || '').trim()
    const rowTopic = (row[2] || '').trim()
    const region = (row[3] || '').trim()

    // 치과명 일치
    if (!rowClinic.includes(clinicNameTrimmed) && !clinicNameTrimmed.includes(rowClinic)) continue

    // 지역+치과명 조합
    if (region && rowClinic) {
      keywords.add(`${region} ${rowClinic}`)
    }
    // 지역+치료 조합
    if (region && rowTopic) {
      keywords.add(`${region} ${rowTopic}`)
    }
  }

  return [...keywords]
}

// 스타일 핑거프린트 추출 (치과별 고유 문체 특징)
interface StyleFingerprint {
  avgSentenceLength: number     // 평균 문장 길이 (자)
  emojiDensity: string          // 이모지 사용 빈도 (높음/보통/낮음)
  emojiSamples: string[]        // 사용된 이모지 예시
  headerStyle: string           // 소제목 스타일 (이모지+텍스트 / 번호+텍스트 / 텍스트만)
  paragraphRhythm: string       // 문단 리듬 (짧은문단 / 보통 / 긴문단)
  usesQnA: boolean              // Q&A 형식 사용 여부
  usesBullets: boolean          // 불릿 리스트 사용 여부
  usesBold: boolean             // 볼드 강조 사용 여부
  sentenceStarters: string[]    // 자주 쓰는 문장 시작 패턴
}

function extractStyleFingerprint(content: string): StyleFingerprint {
  // 문장 분리 (마침표/물음표/느낌표 기준)
  const sentences = content.split(/[.?!]\s/).filter(s => s.trim().length > 5)
  const avgSentenceLength = sentences.length > 0
    ? Math.floor(sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length)
    : 30

  // 이모지 분석
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}✅❌⚠️📷🔹✓☐📋📊🏥📚⚡🎯💡🛒🏆]/gu
  const emojis = content.match(emojiRegex) || []
  const emojiCount = emojis.length
  const contentLength = content.length
  const emojiDensity = emojiCount > contentLength / 200 ? '높음'
    : emojiCount > contentLength / 500 ? '보통' : '낮음'
  const emojiSamples = [...new Set(emojis)].slice(0, 10)

  // 소제목 스타일
  const headers = content.match(/^##?\s+(.+)$/gm) || []
  let headerStyle = '텍스트만'
  if (headers.some(h => emojiRegex.test(h))) headerStyle = '이모지+텍스트'
  else if (headers.some(h => /^\d+\./.test(h.replace(/^##?\s+/, '')))) headerStyle = '번호+텍스트'

  // 문단 리듬
  const paragraphs = content.split(/\n{2,}/).filter(p => p.trim().length > 20)
  const avgParagraphLen = paragraphs.length > 0
    ? Math.floor(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length)
    : 100
  const paragraphRhythm = avgParagraphLen < 80 ? '짧은문단' : avgParagraphLen < 200 ? '보통' : '긴문단'

  // Q&A / 불릿 / 볼드 사용
  const usesQnA = /Q\.\s|Q:|질문:|궁금/.test(content)
  const usesBullets = /^[-•·]\s/m.test(content)
  const usesBold = /\*\*[^*]+\*\*/.test(content)

  // 문장 시작 패턴 (처음 3어절)
  const starters = new Map<string, number>()
  for (const sentence of sentences.slice(0, 30)) {
    const trimmed = sentence.trim()
    if (trimmed.length < 5) continue
    const firstWords = trimmed.split(/\s+/).slice(0, 2).join(' ')
    starters.set(firstWords, (starters.get(firstWords) || 0) + 1)
  }
  const sentenceStarters = [...starters.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s)

  return {
    avgSentenceLength,
    emojiDensity,
    emojiSamples,
    headerStyle,
    paragraphRhythm,
    usesQnA,
    usesBullets,
    usesBold,
    sentenceStarters,
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

// 페르소나 기반 프롬프트 생성 (강화된 버전 - 스타일 핑거프린트 포함)
export function generatePersonaPrompt(persona: ClinicPersona): string {
  // 문단 길이 분석
  const paragraphs = persona.sampleContent.split('\n\n').filter(p => p.trim().length > 50)
  const avgParagraphLength = paragraphs.length > 0
    ? Math.floor(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length)
    : 100

  // ★ 샘플 텍스트에서 ~요 어미를 ~다 체로 정화
  const cleanedSampleContent = sanitizeEndings(persona.sampleContent)
  const cleanedSampleIntros = persona.sampleIntros.map(intro => sanitizeEndings(intro))

  // ★ 스타일 핑거프린트 추출 (치과별 고유 문체)
  const fingerprint = extractStyleFingerprint(persona.sampleContent)

  return `
## 🎭 ${persona.clinicName} 고유 글쓰기 스타일 (반드시 반영!)

⚠️⚠️ **이 치과만의 고유한 글쓰기 스타일입니다. 아래 특징을 반드시 반영하세요!** ⚠️⚠️

**분석된 기존 글**: ${persona.postCount}개
**평균 글 길이**: ${persona.avgLength}자
**평균 문단 길이**: ${avgParagraphLength}자

---

### 1. 어조 & 말투 특징
${persona.writingStyle.tone.map(t => `✓ ${t}`).join('\n')}

### 2. 📐 문체 핑거프린트 (이 치과의 고유 패턴 — 반드시 따라하세요!)

| 항목 | ${persona.clinicName} 스타일 |
|------|------|
| 평균 문장 길이 | ${fingerprint.avgSentenceLength}자 내외 |
| 이모지 사용 | ${fingerprint.emojiDensity} ${fingerprint.emojiSamples.length > 0 ? `(${fingerprint.emojiSamples.join('')})` : ''} |
| 소제목 스타일 | ${fingerprint.headerStyle} |
| 문단 리듬 | ${fingerprint.paragraphRhythm} (평균 ${avgParagraphLength}자) |
| Q&A 형식 | ${fingerprint.usesQnA ? '사용함' : '사용 안 함'} |
| 불릿 리스트 | ${fingerprint.usesBullets ? '사용함' : '사용 안 함'} |
| 볼드 강조 | ${fingerprint.usesBold ? '사용함' : '사용 안 함'} |

${fingerprint.sentenceStarters.length > 0 ? `**자주 쓰는 문장 시작 패턴**: ${fingerprint.sentenceStarters.map(s => `"${s}~"`).join(', ')}` : ''}

⚡ **핵심**: 위 표의 스타일을 그대로 따라하세요!
- 이모지 ${fingerprint.emojiDensity === '높음' ? '적극 사용' : fingerprint.emojiDensity === '보통' ? '적절히 사용' : '최소한 사용'}
- 소제목은 "${fingerprint.headerStyle}" 스타일로
- 문단은 "${fingerprint.paragraphRhythm}" 리듬 유지
- 문장 길이 ${fingerprint.avgSentenceLength}자 내외 유지

### 3. 기존 글에서 발견된 어미 패턴 (참고만!)
- 문어체: ${persona.writingStyle.endings.formal.length > 0 ? persona.writingStyle.endings.formal.join(', ') : '없음'}
- 구어체: ${persona.writingStyle.endings.colloquial.length > 0 ? persona.writingStyle.endings.colloquial.join(', ') : '없음'}

⚠️ **중요**: 어미 스타일은 위 패턴이 아닌, 아래 "글쓰기 모드"의 어미 규칙을 따르세요!
기존 글에서 ~해요, ~거든요 등 구어체가 발견되더라도, 글쓰기 모드가 금지하면 사용하지 마세요.

### 4. 인사말 패턴 (서문 참고)
${persona.writingStyle.greetings.length > 0
  ? persona.writingStyle.greetings.slice(0, 3).map((g, i) => `${i + 1}. "${g}"`).join('\n')
  : '1. "안녕하세요, [치과명] [원장님]입니다."'}

### 5. 마무리 패턴 (결(結) 참고)
${persona.writingStyle.closings.length > 0
  ? persona.writingStyle.closings.slice(0, 3).map((c, i) => `${i + 1}. "${c}"`).join('\n')
  : '1. "[치과명] [원장님]이었습니다. 감사합니다."'}

### 6. 서문 샘플 (⚠️ 구조/흐름을 반드시 참고! 어미만 글쓰기 모드 따를 것)
⚠️ 아래 서문의 **구조, 문장 길이, 도입 방식, 공감 표현 순서**를 최대한 유사하게 작성하세요!
${cleanedSampleIntros.slice(0, 3).map((intro, i) => `
**서문 샘플 ${i + 1}:**
\`\`\`
${intro}
\`\`\`
`).join('\n')}

---

## 📖 기존 글 참조 (구조/흐름 참고, 어미는 글쓰기 모드 우선!)

아래는 ${persona.clinicName}의 기존 글입니다.
**글의 구조, 문장 길이, 이모지 사용법, 설명 방식, 문단 리듬**을 참고하되,
**어미(~요/~다)**는 반드시 글쓰기 모드의 규칙을 따르세요!

${cleanedSampleContent}

---

## ⚠️ ${persona.clinicName} 스타일 적용 체크리스트

☐ 인사말 구조가 기존 글과 유사한가?
☐ 이모지 사용 빈도가 기존 글과 비슷한가? (${fingerprint.emojiDensity})
☐ 문장 길이가 기존 글과 비슷한가? (평균 ${fingerprint.avgSentenceLength}자)
☐ 문단 길이가 기존 글과 비슷한가? (평균 ${avgParagraphLength}자)
☐ 소제목 스타일이 기존 글과 유사한가? (${fingerprint.headerStyle})
☐ 전체 글 길이가 기존 글과 비슷한가? (평균 ${persona.avgLength}자)
☐ 마무리 구조가 기존 글과 유사한가?
☐ **어미는 글쓰기 모드(임상/정보성) 규칙을 따랐는가?** ← 최우선!

⚠️ 내용은 새롭게 작성! 복사/표절 금지!
`
}
