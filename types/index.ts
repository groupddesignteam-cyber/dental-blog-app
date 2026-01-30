export interface Clinic {
  id: string
  name: string
  region: string
  doctorName: string
  createdAt: string
}

export type LLMModel = 'claude' | 'openai' | 'gemini'

export interface GenerateFormData {
  clinicName: string
  region: string
  doctorName: string
  topic: string
  patientInfo: string
  treatment: string
  photoDescription?: string
  model: LLMModel
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
