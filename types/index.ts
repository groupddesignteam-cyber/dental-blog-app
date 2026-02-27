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

// 복합 임상 케이스 시술 단계
export interface ClinicalProcedure {
  name: string          // "상악동 거상술"
  sequence: number      // 1, 2, 3 (시술 순서)
  isPrimary: boolean    // 주 시술 여부
  details: string       // 상세 임상 내용
  toothNumber?: string  // "#26"
  emphasis?: string     // 강조 포인트
}

// 소제목 커스텀 템플릿
export interface SectionTemplate {
  title: string        // H2 소제목 텍스트
  description?: string // 이 섹션에서 다룰 내용 (선택)
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
  // 논문 인용 모드 (PubMed 검색)
  citePapers?: boolean
  // 복합 임상 케이스 시술 단계 (구조화 CC)
  procedures?: ClinicalProcedure[]
  // 소제목 커스텀 (선택)
  customSections?: SectionTemplate[]
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

// PubMed 논문 인용 정보
export interface PaperCitation {
  pmid: string
  title: string
  authors: string
  journal: string
  year: number
  doi?: string
  abstract?: string
}

// 리서치 CC 자동 생성 결과
export interface ResearchResult {
  topic: string
  keyFacts: string[]
  misconceptions: string[]
  faqs: string[]
  paperSummaries: {
    citation: string
    keyFinding: string
    pmid: string
  }[]
  webCitations: string[]       // Perplexity 웹 검색 출처 URL
  ragPostCount: number
  formattedCC: string
  source: 'perplexity' | 'gemini' | 'fallback'  // 리서치 생성 소스
}

// 이미지 편집기 도구 타입
export type EditorTool = 'select' | 'arrow' | 'dottedLine' | 'text' | 'ellipse' | 'freeLine' | 'crop' | 'blurBrush'
  | 'mosaicBrush'
  | 'grayscaleBrush'
  | 'aiEraseBrush'
  | 'magnifier'

// 이미지 편집기 어노테이션 아이템
export interface AnnotationItem {
  id: string
  type:
  | 'arrow'
  | 'dottedLine'
  | 'text'
  | 'logo'
  | 'image'
  | 'ellipse'
  | 'freeLine'
  | 'privacyBlur'
  | 'privacyMosaic'
  | 'grayscaleBrush'
  | 'aiEraseBrush'
  | 'magnifier'
  x: number
  y: number
  points?: number[]        // arrow/dottedLine: [x1,y1,x2,y2]
  text?: string
  fontSize?: number
  fontFamily?: string
  fontStyle?: 'normal' | 'italic'
  fontWeight?: 'normal' | 'bold'
  textDecoration?: 'none' | 'underline' | 'line-through'
  stroke?: string
  fill?: string
  strokeWidth?: number
  rotation?: number
  scaleX?: number
  scaleY?: number
  width?: number           // logo
  height?: number          // logo
  imageUrl?: string        // logo base64
  dashLength?: number      // 점선 간격 (선 길이)
  dashGap?: number         // 점선 간격 (빈 공간)
  opacity?: number         // 투명도 0~1
  name?: string            // 레이어 패널 표시명
}

// GIF 내보내기 설정
export interface GifExportConfig {
  mode: 'beforeAfter' | 'annotationBlink' | 'annotationMotion'
  delay: number            // ms (기본 1000)
  loops: number            // 0 = 무한 (기본 0)
  beforeImage?: string     // base64 (전후 비교 모드)
  afterImage?: string      // base64 (전후 비교 모드)
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
  references?: PaperCitation[] // 논문 인용 목록
  ragInfo?: {
    personaApplied: boolean
    personaPostCount: number
    personaAvgLength: number
    ragAvailable: boolean
  }
}
