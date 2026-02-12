export interface Clinic {
  id: string
  name: string
  region: string
  doctorName: string
  createdAt: string
}

// LLM 모델 (고성능 + 저비용 옵션)
export type LLMModel =
  | 'claude'        // Claude Sonnet (고품질, 중간 비용)
  | 'claude-haiku'  // Claude Haiku (빠름, 저비용) 💰
  | 'openai'        // GPT-4o (고품질, 높은 비용)
  | 'openai-mini'   // GPT-4o-mini (빠름, 저비용) 💰
  | 'gemini'        // Gemini Pro (고품질, 무료/저비용)

// 이미지 태그 타입
export type ImageTag = 'before' | 'after' | 'xray' | 'ct' | 'progress' | 'other'

// 글쓰기 페르소나 모드
export type WritingMode =
  | 'expert'      // 전문가 모드: 의학적 정확성, 전문 용어, 신뢰감
  | 'informative' // 정보성 모드: 재미있고 흥미로운, 이해하기 쉬운

export interface UploadedImage {
  name: string
  url: string // base64 data URL for preview
  file?: File // 클라이언트에서만 사용, API 전송 시 제외
  tag?: ImageTag // 이미지 유형 태그
}

// 배치 다양성 힌트 (패턴 인덱스 사전 배분 — 도입부 중복 방지)
export interface BatchDiversityHints {
  batchIndex: number            // 배치 내 순번 (0-based)
  totalBatchSize: number        // 전체 배치 크기
  greetingIndex: number         // INTRO_PATTERNS.greeting 인덱스
  empathyHookIndex: number      // INTRO_PATTERNS.empathyHooks 인덱스
  transitionIndex: number       // INTRO_PATTERNS.transition 인덱스
  seasonHookIndex: number       // SEASON_DATA[month].hooks 인덱스
  empathyPhraseIndex: number    // EMPATHY_PHRASES 인덱스
  transitionPhraseIndex: number // TRANSITION_PHRASES 인덱스
  introHookType?: string        // 정보성 모드: 체험공감/숫자통계/일상상황/오해반전/계절시기
  closingCtaIndex: number       // CLOSING_CTA_PHRASES 인덱스
}

export interface GenerateFormData {
  clinicName: string
  region: string
  doctorName: string
  topic: string
  customTopic?: string // 직접 입력한 치료명
  patientInfo: string
  treatment: string
  photoDescription?: string
  model: LLMModel
  images?: UploadedImage[]
  // 키워드 분석 후 선택된 키워드
  selectedKeywords?: string[]
  // 치과별 페르소나 사용 여부
  usePersona?: boolean
  // 글쓰기 모드 (전문가/정보성)
  writingMode?: WritingMode
  // 배치 생성 시 도입부 다양성 힌트
  diversityHints?: BatchDiversityHints
  // 메인키워드 (사용자 직접 입력, 예: "부평 임플란트", "부평 더굿모닝치과")
  mainKeyword?: string
  // 타 치과 주제 차용 시 원본 치과명 (RAG 참조용)
  sourceClinic?: string
}

// 키워드 분석 결과 타입 (클라이언트용)
export interface KeywordAnalysisState {
  isAnalyzed: boolean
  isAnalyzing: boolean
  recommendedKeywords: {
    main: string[]
    sub: string[]
    seasonal: string[]
    trending: string[]
  }
  selectedKeywords: string[]
  seoRecommendations: string[]
  seoScore: number | null
  hasPersona: boolean
  personaPostCount: number
}

export interface Post {
  id: string
  clinicId: string
  topic: string
  patientInfo: string
  treatment: string
  title: string
  content: string
  metadata: {
    mainKeyword?: string
    subKeywords?: string[]
    hashtags?: string[]
    charCount?: number
  }
  createdAt: string
}

export interface GenerateResult {
  title: string
  content: string
  keywords: {
    main: string
    sub: string[]
  }
  hashtags: string[]
  charCount: number
  imageFileNames?: string[]
  warnings?: string[] // 의료법 위반, 글자수 경고 등
}
