import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest } from 'next/server'
import { GenerateFormData, LLMModel, WritingMode } from '@/types'

// 데이터 파일들
import { TERM_REPLACEMENTS, FORBIDDEN_WORDS, MEDICAL_FACTS, METAPHORS, getMetaphorText, formatMedicalInfoForPrompt } from '@/data/knowledge'
import { REQUIRED_DISCLAIMERS, getDisclaimer, checkForbiddenPatterns } from '@/data/medical-law'
import { CONTENT_RULES, generateHashtags } from '@/data/seo'
import { getSeasonHook } from '@/data/season'
import { INTRO_PATTERNS, BODY_PATTERNS, CLOSING_PATTERNS, TOPIC_PATTERNS, TRANSITION_PHRASES, EMPATHY_PHRASES } from '@/data/patterns'
import { generateMainKeyword, suggestSubKeywords } from '@/data/keywords'

// RAG + 치과별 페르소나
import { generateRAGContext, extractClinicPersona, generatePersonaPrompt, ClinicPersona } from '@/lib/sheets-rag'

// 네이버 DataLab API (검색 트렌드 + 쇼핑 인사이트)
import {
  analyzeDentalKeywordTrend,
  getMonthlyPopularKeywords,
  analyzeKeywordsComprehensive,
  KeywordAnalysisResult
} from '@/lib/naver-datalab'

// LLM 클라이언트 초기화
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// 글쓰기 모드별 프롬프트 생성
function getWritingModePrompt(mode?: WritingMode): string {
  if (mode === 'expert') {
    return `
## 🎓 전문가 모드 (Expert Mode)

**목표**: 의학적으로 정확하고 신뢰감 있는 전문적인 글

**어조 특징**:
- 정확한 의학 용어 사용 후 쉬운 설명 추가
- 근거 기반 설명 ("~에 따르면", "연구 결과에 의하면")
- 치료 과정과 원리를 상세하게 설명
- 전문가다운 신뢰감 있는 톤
- 어미: "~입니다", "~됩니다" 70% + "~해요", "~거든요" 30%

**필수 포함 내용**:
1. 의학적 원리/메커니즘 설명
2. 치료 단계별 상세 과정
3. 일반적인 치료 기간 및 예후
4. 주의사항과 합병증 가능성
5. 최신 치료 트렌드 언급

**예시 문장**:
- "○○은 의학적으로 △△라고 불리는 상태입니다."
- "이 시술은 일반적으로 3단계로 진행됩니다."
- "치료 후 초기 2주간은 특히 주의가 필요합니다."
`
  } else if (mode === 'informative') {
    return `
## 📚 정보성 모드 (Informative Mode)

**목표**: 재미있고 이해하기 쉬운, 흥미를 유발하는 글

**어조 특징**:
- 친근하고 대화하는 듯한 말투
- 비유와 일상적 예시 풍부하게 사용
- 궁금증 유발하는 질문 형식
- 공감 표현 많이 사용
- 어미: "~해요", "~거든요", "~하죠" 80% + "~입니다" 20%

**필수 포함 내용**:
1. 흥미로운 훅/도입부
2. 일상에서 느끼는 증상과 연결
3. "알고 계셨나요?" 형식의 흥미 유발
4. 쉬운 비유 (예: "마치 ~와 같아요")
5. 환자 입장에서 궁금할 질문과 답변

**예시 문장**:
- "혹시 이런 경험 있으신가요?"
- "사실 많은 분들이 모르시는 게 있어요."
- "쉽게 비유하자면, 마치 ~와 같다고 보시면 돼요."
- "그렇다면 왜 이런 일이 생기는 걸까요?"
`
  }

  // 기본 모드 (페르소나 적용)
  return ''
}

// 통합 시스템 프롬프트 생성
function buildSystemPrompt(topic: string, persona?: ClinicPersona | null, writingMode?: WritingMode): string {
  const topicPatterns = TOPIC_PATTERNS[topic] || []
  const disclaimer = getDisclaimer(topic)

  // 글쓰기 모드 프롬프트
  const writingModeSection = getWritingModePrompt(writingMode)

  // 치과별 페르소나가 있으면 해당 스타일 사용
  const personaSection = persona
    ? generatePersonaPrompt(persona)
    : `## 페르소나
10년 차 치과 상담 실장
- 전문 용어를 쓰되, 환자가 겁먹지 않게 다정하게 설명
- 구어체 어미 필수: ~인데요, ~거든요, ~하죠, ~해요, ~드려요
- '습니다/합니다'는 50% 이하로 최소화`

  return `당신은 치과 마케팅 전문 블로그 작성 AI입니다.
의료광고법 100% 준수 + 네이버 SEO 최적화 + 검증된 글쓰기 패턴을 적용합니다.

${personaSection}
${writingModeSection}

## 절대 금지 표현 (의료광고법 위반)
${FORBIDDEN_WORDS.join(', ')}

## 용어 치환 규칙
${Object.entries(TERM_REPLACEMENTS).map(([k, v]) => `- ${k} → ${v}`).join('\n')}

## 📏 글자수 규칙 (최우선!! 절대 무시 금지!!)

🚨🚨🚨 절대 규칙: 본문 최소 1,500자 이상!! (해시태그 제외) 🚨🚨🚨

❌ 1,500자 미만 = 완전 실패!! 다시 작성해야 함!!
✅ 목표: 1,800~2,000자 (충분히 상세하게!)

⚠️ 짧은 글 = 품질 낮은 글! 반드시 각 섹션을 충분히 상세하게 작성하세요!

## 글 구조 - 기승전결 (본문 최소 1,800자 / 해시태그 별도)

### 1. 기(起) - 서문 (최소 200자 이상)
**제목**: 25~35자, 치료 키워드 앞쪽 배치, 물음표(?) 권장
- 인사: "안녕하세요, [지역] [치과명] [원장님]입니다."
- 공감 훅 (아래 중 선택):
${EMPATHY_PHRASES.slice(0, 3).map(p => `  - "${p}"`).join('\n')}
- 주제 소개: "오늘은 ~에 대해 이야기해볼게요."
- 환자분들의 걱정/궁금증 공감
⚠️ 이 섹션: 최소 200자!

### 2. 승(承) - 전개 (최소 600자 이상)
**Q&A 블록** (네이버 스마트블록용)
Q. [검색 의도 반영 질문]?
A. [핵심 답변 3~4문장, 메인키워드 포함, 상세하게!]

**본문 섹션 1**: ✅ [원인/증상 설명]
- 왜 이런 문제가 생기는지 (상세하게 3문단)
- 어떤 증상이 나타나는지 (구체적 예시 포함)
- 방치하면 어떻게 되는지
- 각 문단 100~150자, 총 4~5문단
⚠️ 이 섹션: 최소 600자!

### 3. 전(轉) - 전환/심화 (최소 700자 이상)
**본문 섹션 2**: 🔹 [치료 방법/주의사항]
⚠️ 반드시 아래 전환 표현 중 하나로 시작:
${TRANSITION_PHRASES.slice(0, 5).map(p => `- "${p}"`).join('\n')}

- 치료 과정 상세 설명 (단계별로)
- 치료 후 주의사항
- 관리 방법 및 팁
- 자주 묻는 질문에 대한 답변
- 각 문단 100~150자, 총 5~6문단
⚠️ 이 섹션: 최소 700자! (가장 긴 섹션)

### 4. 결(結) - 마무리 (최소 300자 이상)
**마무리 섹션**: 💚 글을 마치면서
- 핵심 요약 3~4문장 (상세하게)
- 정기검진의 중요성 강조
- 부드러운 내원 권유
- 인사: "[지역] [치과명] [원장님]이었습니다. 감사합니다."

**부작용 고지** (필수):
${disclaimer}
⚠️ 이 섹션: 최소 300자!

---
**해시태그**: 글 맨 마지막에 10개 (글자수 미포함)

## 📊 글자수 자가 검증 (작성 완료 전 필수 확인!)
작성 완료 전에 각 섹션의 글자수를 세어보세요:
- 기(起): 200자 이상인가? ☐
- 승(承): 600자 이상인가? ☐
- 전(轉): 700자 이상인가? ☐
- 결(結): 300자 이상인가? ☐
- 총합: 1,800자 이상인가? ☐

만약 글자수가 부족하다면:
1. 각 섹션에 예시나 상세 설명을 추가하세요
2. 환자분들이 궁금해할 만한 내용을 보충하세요
3. 치료 과정을 더 구체적으로 설명하세요

## 전문용어 설명 + 비유 패턴 (중요!)
전문용어를 사용할 때는 반드시 아래 패턴을 따르세요:
"[전문용어]란 [정확한 의학적 설명]이에요. 쉽게 말해 [일상적인 비유]와 비슷하다고 생각하시면 돼요."

예시:
- "근관치료(신경치료)란 치아 내부의 감염된 신경조직을 제거하고 소독하는 치료예요. 쉽게 말해 썩은 과일 속을 깨끗이 파내는 것과 비슷해요."
- "치조골(잇몸뼈)은 치아를 지지하는 턱뼈의 일부예요. 마치 집의 기초 공사처럼 치아가 단단히 서 있게 해줘요."

## AEO/GEO 최적화 (AI 검색엔진 인용용)
AI(ChatGPT, Perplexity 등)가 인용하기 좋은 구조로 작성:

1. **Q&A 블록 답변은 명확하게**
   - 2~3문장으로 핵심만 정확하게
   - "~입니다", "~에요" 형태로 단정적 답변

2. **구체적 수치/기간 명시**
   - "보통 3~6개월 소요됩니다"
   - "주 2~3회 권장됩니다"
   - "일반적으로 2~3회 내원이 필요해요"

3. **결론 요약문 포함**
   - 마무리 섹션에 "결론적으로 ~" 또는 "핵심은 ~" 형태
   - 1~2문장으로 명확한 결론 제시

## ${topic} 관련 정보
${topicPatterns.length > 0 ? topicPatterns.map(p => `- ${p}`).join('\n') : ''}

## 출력 형식
글 작성이 완료되면 아래 형식으로 출력하세요:

---METADATA_START---
{
  "title": "제목",
  "mainKeyword": "메인 키워드",
  "subKeywords": ["서브1", "서브2"],
  "hashtags": ["#해시태그1", "#해시태그2", ...],
  "charCount": 글자수
}
---METADATA_END---

---CONTENT_START---
[마크다운 형식의 본문]
---CONTENT_END---
`
}

// 해시태그 제외 글자수 계산 함수 (공백 제외)
function countContentChars(content: string): number {
  // 1. 해시태그 패턴 제거 (#키워드 형태 - 띄어쓰기 전까지)
  let cleanContent = content.replace(/#[^\s#]+/g, '')

  // 2. 해시태그만 있는 줄 제거 (빈 줄이 된 경우)
  cleanContent = cleanContent.split('\n')
    .filter(line => line.trim().length > 0 || line === '')
    .join('\n')

  // 3. 마크다운 태그 제외한 순수 텍스트
  const pureText = cleanContent
    .replace(/^#{1,6}\s+/gm, '')  // 제목 마크다운
    .replace(/\*\*|__/g, '')     // 볼드
    .replace(/\*|_/g, '')        // 이탤릭
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // 링크
    .replace(/`[^`]+`/g, '')     // 인라인 코드
    .replace(/^\s*[-*]\s+/gm, '') // 리스트 마커
    .replace(/^\s*\d+\.\s+/gm, '') // 숫자 리스트
    .replace(/---+/g, '')        // 구분선

  // 공백 제외 글자수
  return pureText.replace(/\s/g, '').length
}

// URL 및 불필요한 링크 제거 함수
function sanitizeInput(text: string): string {
  if (!text) return text

  // URL 패턴 (http, https, www, google docs 등)
  const urlPatterns = [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+/gi,
    /docs\.google\.com[^\s]*/gi,
    /drive\.google\.com[^\s]*/gi,
    /bit\.ly[^\s]*/gi,
    /goo\.gl[^\s]*/gi,
  ]

  let sanitized = text
  for (const pattern of urlPatterns) {
    sanitized = sanitized.replace(pattern, '')
  }

  // 연속 공백 정리
  sanitized = sanitized.replace(/\s+/g, ' ').trim()

  return sanitized
}

// 입력 데이터 전체 정화
function sanitizeFormData(data: GenerateFormData): GenerateFormData {
  return {
    ...data,
    clinicName: sanitizeInput(data.clinicName),
    region: sanitizeInput(data.region),
    doctorName: sanitizeInput(data.doctorName),
    topic: sanitizeInput(data.topic),
    customTopic: data.customTopic ? sanitizeInput(data.customTopic) : undefined,
    patientInfo: sanitizeInput(data.patientInfo),
    treatment: sanitizeInput(data.treatment),
    photoDescription: data.photoDescription ? sanitizeInput(data.photoDescription) : undefined,
  }
}

// 이미지 파일명에서 배치 힌트 추출
function analyzeImageNames(imageNames: string[]): string {
  if (!imageNames || imageNames.length === 0) return ''

  const analyzed = imageNames.map((name, index) => {
    const lower = name.toLowerCase()
    let hint = ''

    if (lower.includes('before') || lower.includes('전') || lower.includes('치료전')) {
      hint = '치료 전 상태'
    } else if (lower.includes('after') || lower.includes('후') || lower.includes('치료후')) {
      hint = '치료 후 상태'
    } else if (lower.includes('xray') || lower.includes('x-ray') || lower.includes('엑스레이')) {
      hint = 'X-ray 사진'
    } else if (lower.includes('ct') || lower.includes('씨티')) {
      hint = 'CT 사진'
    } else if (lower.includes('과정') || lower.includes('진행')) {
      hint = '치료 과정'
    } else {
      hint = '참고 이미지'
    }

    return `${index + 1}. ${name} → ${hint}`
  })

  return `
## 📷 이미지 배치 안내
아래 이미지들을 글의 적절한 위치에 배치해주세요.
이미지는 \`[IMAGE_${'{숫자}'}\]\` 형식으로 표시합니다.

${analyzed.join('\n')}

**배치 규칙:**
- before/치료전 이미지: 증상 설명 섹션 근처
- after/치료후 이미지: 치료 결과 섹션 근처
- X-ray/CT 이미지: 진단 설명 부분
- 과정 이미지: 치료 과정 설명 부분
- 일반 이미지: 관련 내용 근처에 자연스럽게 배치
`
}

// 사용자 프롬프트 생성
function buildUserPrompt(
  data: GenerateFormData,
  mainKeyword: string,
  subKeywords: string[],
  hashtags: string[],
  seasonHook: string,
  ragContext: string,
  trendAnalysis: string,
  popularKeywords: string[],
  imageNames: string[],
  selectedKeywords?: string[]
): string {
  const imageSection = analyzeImageNames(imageNames)

  // 사용자가 선택한 키워드가 있으면 우선 적용
  const keywordsToUse = selectedKeywords && selectedKeywords.length > 0
    ? selectedKeywords
    : [...subKeywords]

  return `다음 정보를 바탕으로 치과 블로그 글을 작성해주세요.

## 입력 정보
- 치과명: ${data.clinicName}
- 지역: ${data.region}
- 원장님 이름: ${data.doctorName}
- 주제/치료: ${data.topic}
- 환자 정보: ${data.patientInfo}
- 치료 내용: ${data.treatment}
${data.photoDescription ? `- 사진 설명: ${data.photoDescription}` : ''}

## 키워드 전략 (중요!)
### 지역 키워드: "${data.region}"
- 반드시 치과명과 함께만 사용 (예: "${data.region} ${data.clinicName}", "${data.region} 치과")
- ❌ 절대 금지: "${data.region} ${data.topic}" 처럼 지역+치료를 직접 연결하지 마세요
- ❌ 부자연스러운 예: "${data.region} 임플란트는 중요해요" (X)
- ✅ 자연스러운 예: "${data.region} ${data.clinicName}에서 임플란트 치료를 받으세요" (O)

### 치료 키워드: "${data.topic}"
- 독립적으로 자연스럽게 5~7회 배치
- 서브 키워드: ${keywordsToUse.join(', ')} (각 2~3회)
${selectedKeywords && selectedKeywords.length > 0 ? `- ⭐ 사용자 선택 키워드 (우선 반영): ${selectedKeywords.join(', ')}` : ''}

### SEO 키워드 조합 (제목, 서문, 마무리에만 사용)
- "${data.region} ${data.clinicName}" 형태로 3~4회 배치
- 이번 달 인기 키워드: ${popularKeywords.join(', ')}
- 추천 해시태그: ${hashtags.join(' ')}

## 시즌 훅 (서문에 자연스럽게 활용)
"${seasonHook}"

${ragContext !== '[기존 글 DB 참조 불가]' && ragContext !== '[참조 가능한 기존 글 없음]' ? `
## 기존 글 패턴 참조
${ragContext}
` : ''}

${trendAnalysis && trendAnalysis !== '[키워드 트렌드 분석 불가]' ? `
${trendAnalysis}
` : ''}

${imageSection}

${formatMedicalInfoForPrompt(data.topic)}

## 📝 글쓰기 규칙 (필수 준수!)

### ⚠️⚠️⚠️ 글자수 (매우 중요!!) ⚠️⚠️⚠️
해시태그 제외, 공백 제외 기준:
- 기(起) 서문: **최소 200자** (부족하면 공감 표현 추가)
- 승(承) 전개: **최소 600자** (부족하면 예시/설명 추가)
- 전(轉) 심화: **최소 700자** (부족하면 주의사항/팁 추가)
- 결(結) 마무리: **최소 300자** (부족하면 요약 확장)
- **⭐ 총합: 반드시 1,800자 이상!! ⭐**
- 해시태그: 별도 10개 (글자수 미포함)

🚨🚨🚨 절대 규칙: 1,500자 미만 = 완전 실패!! 🚨🚨🚨
✅ 최소 1,500자 이상! 목표 1,800~2,000자!
✅ 글자수 부족 시: 원인 설명 추가, 치료 과정 상세화, Q&A 추가, 주의사항 확장!

### 문장/문단 규칙
1. **한 문단**: 3~4문장, 100~150자
2. **한 문장**: 40자 이내 (길면 줄바꿈)
3. **이모지**: 소제목에만 (✅🔹💚), 본문에는 자제
4. **구어체 어미**: ~인데요, ~거든요, ~하죠, ~해요 (필수)

### 키워드 규칙
1. 치료 키워드 "${data.topic}": 5~7회
2. 서브 키워드: 각 2회
3. 지역 키워드: 반드시 치과명과 함께만!
   - ✅ "${data.region} ${data.clinicName}에서..."
   - ❌ "${data.region} ${data.topic}는..." (금지!)

### 전문용어 규칙
사용 시 반드시 설명 추가:
"[용어]란 [의학적 설명]이에요. 쉽게 말해 [비유]와 비슷하다고 보시면 돼요."

### 전환 표현 (전(轉) 섹션 시작 필수)
- "그런데 여기서 중요한 점이 있어요."
- "많은 분들이 놓치시는 부분인데요,"
- "사실 이게 가장 중요한 부분이에요."

### 필수 포함 항목
- Q&A 블록 (스마트블록용)
- 부작용 고지문
- 해시태그 10개 (중복 없이)
${imageNames.length > 0 ? '- 이미지 플레이스홀더 ([IMAGE_1], [IMAGE_2])' : ''}

글 작성을 시작해주세요.`
}

// ============================================================
// LLM 스트리밍 함수 (비용 최적화 옵션 포함)
// ============================================================

// Claude API 스트리밍 (Sonnet 4 사용)
async function* streamClaude(systemPrompt: string, userPrompt: string, useHaiku: boolean = false) {
  // 2026년 2월 기준: claude-sonnet-4-20250514 (고품질 + 긴 글 작성)
  // useHaiku 옵션과 상관없이 Sonnet 4 사용 (Haiku 모델 접근 불가)
  const modelId = 'claude-sonnet-4-20250514'
  console.log(`[LLM] Using Claude model: ${modelId}`)

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 8192,  // Sonnet 4는 8192 지원
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    stream: true,
  })

  for await (const event of response) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text
    }
  }
}

// OpenAI API 스트리밍 (GPT-4o / GPT-4o-mini 선택)
async function* streamOpenAI(systemPrompt: string, userPrompt: string, useMini: boolean = false) {
  // 💰 GPT-4o-mini = 빠름 + 저비용 (~15배 저렴), GPT-4o = 고품질
  // 2026년 1월 기준 사용 가능한 모델
  const modelId = useMini ? 'gpt-4o-mini-2024-07-18' : 'gpt-4o-2024-11-20'
  console.log(`[LLM] Using OpenAI model: ${modelId}`)

  const response = await openai.chat.completions.create({
    model: modelId,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: true,
  })

  for await (const chunk of response) {
    const text = chunk.choices[0]?.delta?.content
    if (text) {
      yield text
    }
  }
}

// Gemini API 스트리밍 (무료 할당량 내 사용 가능)
async function* streamGemini(systemPrompt: string, userPrompt: string) {
  // 2026년 1월 기준: gemini-2.0-flash (빠름 + 무료)
  console.log(`[LLM] Using Gemini model: gemini-2.0-flash`)

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  })

  const result = await model.generateContentStream(userPrompt)

  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      yield text
    }
  }
}

// 모델별 스트리밍 선택 (저비용 옵션 지원)
function getStreamGenerator(model: LLMModel, systemPrompt: string, userPrompt: string) {
  switch (model) {
    case 'claude-haiku':
      return streamClaude(systemPrompt, userPrompt, true) // 💰 저비용
    case 'claude':
      return streamClaude(systemPrompt, userPrompt, false)
    case 'openai-mini':
      return streamOpenAI(systemPrompt, userPrompt, true) // 💰 저비용
    case 'openai':
      return streamOpenAI(systemPrompt, userPrompt, false)
    case 'gemini':
      return streamGemini(systemPrompt, userPrompt)
    default:
      return streamClaude(systemPrompt, userPrompt, true) // 기본값 = 저비용
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawData: GenerateFormData = await request.json()

    // 🛡️ URL 및 링크 제거 (사용자 입력에서 URL이 포함된 경우 필터링)
    const data = sanitizeFormData(rawData)

    // API 키 확인 (저비용 모델 포함)
    const model = data.model || 'claude-haiku' // 기본값 = 저비용 모델
    const needsAnthropicKey = model === 'claude' || model === 'claude-haiku'
    const needsOpenAIKey = model === 'openai' || model === 'openai-mini'

    if (needsAnthropicKey && !process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'Claude API 키가 설정되지 않았습니다.' }), { status: 400 })
    }
    if (needsOpenAIKey && !process.env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API 키가 설정되지 않았습니다.' }), { status: 400 })
    }
    if (model === 'gemini' && !process.env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Gemini API 키가 설정되지 않았습니다.' }), { status: 400 })
    }

    // ============================================================
    // 🚀 최적화: 동기 작업 먼저 처리 (0ms)
    // ============================================================
    const seasonHook = getSeasonHook(data.topic)
    const mainKeyword = generateMainKeyword(data.region, data.topic)
    const subKeywords = suggestSubKeywords(data.topic)
    const popularKeywords = getMonthlyPopularKeywords()

    // ============================================================
    // 🚀 최적화: 비동기 API 호출 병렬 처리 (기존 순차 3-4초 → 병렬 1-2초)
    // ============================================================
    const [ragResult, keywordResult, personaResult] = await Promise.allSettled([
      generateRAGContext(data.topic),
      analyzeKeywordsComprehensive(data.topic),
      // 치과별 페르소나 추출 (usePersona가 true이거나 기본적으로 항상 시도)
      data.clinicName ? extractClinicPersona(data.clinicName, data.topic) : Promise.resolve(null),
    ])

    // RAG 결과 처리
    const ragContext = ragResult.status === 'fulfilled'
      ? ragResult.value
      : '[기존 글 DB 참조 불가]'

    // 치과별 페르소나 처리
    let clinicPersona: ClinicPersona | null = null
    if (personaResult.status === 'fulfilled' && personaResult.value) {
      clinicPersona = personaResult.value
      console.log(`[Persona] ${data.clinicName}의 "${data.topic}" 스타일 발견 (${clinicPersona.postCount}개 글 분석)`)
    } else {
      console.log(`[Persona] ${data.clinicName}의 기존 글 없음 - 기본 스타일 사용`)
    }

    // 키워드 분석 결과 처리
    let keywordAnalysis: KeywordAnalysisResult | null = null
    let trendAnalysis = ''

    if (keywordResult.status === 'fulfilled') {
      keywordAnalysis = keywordResult.value
      trendAnalysis = keywordAnalysis.searchTrend.analysis

      if (keywordAnalysis.searchTrend.topKeyword) {
        trendAnalysis += `\n\n### 🏆 1위 인기 키워드\n`
        trendAnalysis += `**"${keywordAnalysis.searchTrend.topKeyword}"** `
        trendAnalysis += keywordAnalysis.searchTrend.direction === 'up' ? '(📈 상승 중)' :
                         keywordAnalysis.searchTrend.direction === 'down' ? '(📉 하락 중)' : '(➡️ 안정적)'
        trendAnalysis += `\n\n**SEO 점수:** ${keywordAnalysis.seoScore}/100\n`
      }

      if (keywordAnalysis.recommendations.length > 0) {
        trendAnalysis += `\n### 💡 키워드 전략 추천\n`
        trendAnalysis += keywordAnalysis.recommendations.join('\n')
      }

      // 쇼핑 인사이트 추가 (해당되는 경우)
      if (keywordAnalysis.shoppingTrend.available) {
        trendAnalysis += `\n\n### 🛒 쇼핑 인사이트\n${keywordAnalysis.shoppingTrend.analysis}`
      }
    } else {
      // Promise.allSettled에서 rejected된 경우
      console.error('Keyword analysis error:', keywordResult.status === 'rejected' ? keywordResult.reason : 'unknown')
      trendAnalysis = '[키워드 트렌드 분석 불가]'
    }

    // 해시태그 미리 생성
    const hashtags = generateHashtags(mainKeyword, subKeywords, data.region, data.topic)

    // 이미지 파일명 추출
    const imageNames = data.images?.map(img => img.name) || []

    // 프롬프트 빌드 (치과별 페르소나 + 글쓰기 모드 적용)
    const systemPrompt = buildSystemPrompt(data.topic, clinicPersona, data.writingMode)
    const userPrompt = buildUserPrompt(
      data, mainKeyword, subKeywords, hashtags, seasonHook,
      ragContext, trendAnalysis, popularKeywords, imageNames,
      data.selectedKeywords // 사용자 선택 키워드
    )

    // 스트리밍 응답 생성
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          let fullContent = ''

          // 모델 정보 전송
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'model', model })}\n\n`)
          )

          const generator = getStreamGenerator(model, systemPrompt, userPrompt)

          for await (const text of generator) {
            fullContent += text
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'content', text })}\n\n`)
            )
          }

          // 메타데이터 파싱
          const metadataMatch = fullContent.match(
            /---METADATA_START---\s*([\s\S]*?)\s*---METADATA_END---/
          )
          const contentMatch = fullContent.match(
            /---CONTENT_START---\s*([\s\S]*?)\s*---CONTENT_END---/
          )

          let metadata = {
            title: '',
            mainKeyword: mainKeyword,
            subKeywords: subKeywords,
            hashtags: hashtags,
            charCount: 0,
          }

          if (metadataMatch) {
            try {
              const parsed = JSON.parse(metadataMatch[1])
              metadata = { ...metadata, ...parsed }
            } catch {
              // 파싱 실패 시 기본값 사용
            }
          }

          const content = contentMatch ? contentMatch[1].trim() : fullContent
          // 해시태그 제외, 공백 제외 글자수 계산
          metadata.charCount = countContentChars(content)

          // 의료법 금지어 검증
          const forbiddenViolations = checkForbiddenPatterns(content)
          const warnings: string[] = []

          if (forbiddenViolations.length > 0) {
            console.warn(`[Warning] 의료법 위반 표현 발견: ${forbiddenViolations.map(v => v.match).join(', ')}`)
            warnings.push(`⚠️ 의료법 위반 가능 표현: ${forbiddenViolations.map(v => `"${v.match}" (${v.reason})`).join(', ')}`)
          }

          // 글자수 경고
          if (metadata.charCount < 1600) {
            warnings.push(`⚠️ 글자수 부족: ${metadata.charCount}자 (권장: 1,700~1,900자)`)
          } else if (metadata.charCount > 2100) {
            warnings.push(`⚠️ 글자수 초과: ${metadata.charCount}자 (권장: 1,700~1,900자)`)
          }

          // 최종 결과 전송
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'result',
                data: {
                  title: metadata.title,
                  content,
                  keywords: {
                    main: metadata.mainKeyword,
                    sub: metadata.subKeywords,
                  },
                  hashtags: metadata.hashtags,
                  charCount: metadata.charCount,
                  model: model,
                  warnings: warnings.length > 0 ? warnings : undefined,
                },
              })}\n\n`
            )
          )

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('Stream error:', error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Generate API error:', error)
    return new Response(
      JSON.stringify({ error: '글 생성에 실패했습니다.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
