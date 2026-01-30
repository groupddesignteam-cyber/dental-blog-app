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

export interface UploadedImage {
  name: string
  url: string // base64 data URL for preview
  file?: File // 클라이언트에서만 사용, API 전송 시 제외
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
}
