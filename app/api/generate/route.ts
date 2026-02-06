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
import { getSynonymInstruction } from '@/data/synonyms'
import { formatLineBreaks } from '@/lib/line-formatter'

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
## ⚠️⚠️ 어미 규칙 최우선 적용 (페르소나보다 우선!) ⚠️⚠️

## 🏥 임상 포스팅 모드 (Clinical Case)

**목표**: 사진/X-ray 판독 소견 기반의 전문적 임상 글

**⚠️ 정보성(백과사전식) 글이 아닌, 임상 소견 기반 서술입니다!**

**어미 규칙 (절대 준수!)**:
- 기본 어미: "~입니다", "~됩니다", "~있습니다", "~바랍니다" (95%)
- 전환/참여: "~하죠" (5% 이하, 제한적 사용)
- 🚫 절대 금지 어미: ~해요, ~거든요, ~인데요, ~있어요, ~드려요, ~할게요, ~볼게요, ~세요
- 🚫 페르소나에서 위 어미를 사용했더라도 절대 따라하지 마세요!

**글 전개 흐름 (필수!)**:
소견 관찰 → 진단 → 치료 계획 → 치료 결과/예후

**1. 임상 소견 기반 도입 (정보성 도입 금지!)**:
❌ "임플란트란 무엇일까요?" (정보성 - 금지)
❌ "혹시 이런 경험 있으신가요?" (정보성 - 금지)
✅ "방사선 사진상 #36 부위에 치근단 병소가 관찰됩니다."
✅ "임상 사진상 하악 좌측 제1대구치 부위 치은 발적 및 부종이 관찰됩니다."

**2. 소견 기술 필수 패턴**:
- "~가 관찰됩니다" (객관적 기술, 최소 3회)
- "이는 ~를 시사하는 소견입니다" (진단적 해석)
- "이러한 경우 ~가 고려됩니다" (치료 방향)
- "치료 후 ~가 예상됩니다" (예후)

**필수 포함 내용**:
1. 방사선/임상 사진 소견 기술
2. 소견의 임상적 의미 해석
3. 치료 단계별 상세 과정
4. 주의사항과 합병증 가능성
5. 예후 및 관리 방법

**예시 문장**:
- "방사선 사진상 치근단 병소가 관찰됩니다."
- "이 시술은 일반적으로 3단계로 진행됩니다."
- "치료 후 초기 2주간은 특히 주의가 필요합니다."
`
  } else if (mode === 'informative') {
    return `
## ⚠️⚠️ 어미 규칙 최우선 적용 (페르소나보다 우선!) ⚠️⚠️

## 📚 정보성 모드 (Informative Mode)

**목표**: 일반인 눈높이의 깊이 있는 치과 정보 글

**어미 규칙 (절대 준수!)**:
- 기본 어미: "~입니다", "~됩니다", "~있습니다" (60%)
- 전환/참여: "~하죠" (20%)
- 제한 허용: "~인데요" (10%, 전환 시에만)
- 존댓말 형용: "~시죠", "~하십니다" (10%)
- 🚫 절대 금지 어미: ~해요, ~거든요, ~있어요, ~드려요, ~할게요, ~볼게요
- 🚫 페르소나에서 위 어미를 사용했더라도 절대 따라하지 마세요!

**필수 포함 내용 (깊이 있는 설명!)**:
1. 증상의 원인 메커니즘 (왜 발생하는지 과학적 설명)
2. 단계별 진행 과정 (방치하면 어떻게 되는지)
3. 치료 방법별 비교 (장단점 포함)
4. 구체적 수치/기간 명시 ("보통 3~6개월", "주 2~3회")
5. 자주 묻는 질문 2~3개 포함
6. 비유 표현 사용 + 전문적 내용 충실 전달

**⚠️ 대화체가 아닌 전문적 지식 전달이 핵심입니다!**
- ❌ "이가 아프면 치과에 가시는 것이 좋아요." (단순 + 구어체)
- ✅ "치수 조직까지 감염이 진행되면 자발통이 나타납니다. 이 단계에서는 근관치료가 필요하며, 보통 2~3회 내원하여 치료를 진행합니다."

**소주제가 지정된 경우**:
- 각 소주제에 대해 최소 200자 이상 상세 설명
- 소주제 간 자연스러운 연결
- 전체 글자수 1,800~2,200자 반드시 준수

**예시 문장**:
- "많은 분들이 궁금해하시는 내용입니다."
- "쉽게 비유하자면, 마치 ~와 유사합니다."
- "그렇다면 왜 이런 현상이 발생하는 걸까요?"
`
  }

  // 기본 모드 (페르소나 적용)
  return `
## ⚠️⚠️ 어미 규칙 (기본) ⚠️⚠️
- 기본 어미: "~입니다", "~됩니다", "~있습니다" (90%)
- 전환: "~하죠" (10% 이하)
- 🚫 금지: ~해요, ~거든요, ~인데요, ~있어요, ~드려요
`
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
10년 차 치과 전문의
- 전문 용어를 쓰되, 일반인도 이해할 수 있도록 부연 설명 제공
- 기본 어미: ~입니다, ~됩니다, ~있습니다, ~바랍니다 (90% 이상)
- 전환/참여 유도 시: ~하죠 (10% 이하)
- 🚫 절대 금지 어미: ~해요, ~거든요, ~인데요, ~있어요, ~드려요`

  return `당신은 치과 마케팅 전문 블로그 작성 AI입니다.
의료광고법 100% 준수 + 네이버 SEO 최적화 + 검증된 글쓰기 패턴을 적용합니다.

${personaSection}

## ⚠️⚠️ 어미 규칙 최우선 적용 (페르소나보다 우선!) ⚠️⚠️
${writingModeSection}
위 글쓰기 모드의 어미 규칙이 페르소나의 어미 패턴보다 항상 우선합니다.
페르소나에서 ~해요, ~거든요 등을 사용했더라도, 글쓰기 모드가 금지하면 절대 사용하지 마세요.

## 절대 금지 표현 (의료광고법 위반)
${FORBIDDEN_WORDS.join(', ')}

## 🚫🚫🚫 환자 정보 관련 절대 금지 (의료법 위반!!) 🚫🚫🚫

**절대 사용 금지 표현들:**
- "이번 환자분의 경우", "이 환자분", "해당 환자"
- "00대 여성/남성", "30대 남성", "40대 여성" 등 연령/성별 언급
- "치료받으신 분", "내원하신 분", "방문하신 환자"
- "실제 사례", "실제 치료 사례", "환자 케이스"
- "환자 후기", "치료 후기", "체험담"

**대체 표현 사용:**
- ❌ "이번 환자분의 경우" → ✅ "이런 경우", "이런 상황에서는"
- ❌ "40대 여성 환자분께서..." → ✅ "이런 증상이 있으신 분들은..."
- ❌ "실제 치료 사례를 보면" → ✅ "일반적으로", "보통의 경우"

**글 작성 방식:**
- 특정 환자 사례가 아닌 **일반적인 정보 제공** 형태로 작성
- "~하신 분들이 많습니다", "~한 경우가 있습니다" 형태로 작성
- 개인을 특정할 수 있는 정보 일체 금지

## 🚫 치과명 + 내원유도 금지 (의료법 위반!)

**치과명 허용 위치:**
- 서문 인사: "안녕하세요, [지역] [치과명] [이름]입니다."
- 마무리 인사: "[지역] [치과명] [이름]이었습니다."

**치과명 금지 위치 (본문 전체):**
- ❌ "[치과명]에서는 ~를 해결해드리고 있습니다"
- ❌ "[치과명]에서 ~를 치료해드립니다"
- ❌ "[치과명]으로 상담받으러 오세요"
- ❌ "저희 치과에서 ~를 해결해드립니다"

**내원 유도 금지 표현:**
- ❌ "내원해 주세요", "방문해 주세요", "오세요", "찾아주세요"
- ✅ "정기 검진을 통해 조기 발견이 가능합니다."
- ✅ "가까운 구강의료기관에서 상담을 받아보시길 권장합니다."

## 용어 치환 규칙
${Object.entries(TERM_REPLACEMENTS).map(([k, v]) => `- ${k} → ${v}`).join('\n')}

## 📏 글자수 규칙 (최우선!! 절대 무시 금지!!)

🚨🚨🚨 절대 규칙: 본문 최소 2,000자 이상!! (해시태그 제외) 🚨🚨🚨

❌ 1,800자 미만 = 완전 실패!! 다시 작성해야 함!!
✅ 목표: 2,500~3,000자 (네이버 검색 최적화 기준!)

⚠️ 네이버 알고리즘은 2,500~3,000자 이상의 상세한 글을 선호합니다!

## 🔍 네이버 검색 SEO 최적화 규칙 (C-Rank + D.I.A 대응)

### 📌 키워드 배치 전략 (에어서치 최적화)
1. **초반 200자**: 반드시 메인 키워드 + 서브 키워드 1개 포함 (알고리즘 우선 분석 영역)
2. **마지막 200자**: 메인 키워드 + 핵심 요약 포함 (CTA 영역)
3. **키워드 밀도**: 메인 키워드 3~5회, 서브 키워드 각 2회 (과잉 반복 금지)
4. **동의어/관련어 활용**: 같은 단어 반복 대신 동의어를 섞어 주제를 입체적으로 전달

### 📌 체류시간 극대화 전략
1. **짧은 문단**: 2~3줄(60~100자) 후 줄바꿈 (3줄 이상 연속 금지)
2. **불릿 리스트**: 나열형 정보는 ✅🔹💚 이모지 + 불릿 형태로 정리
3. **소제목 자주 사용**: 300~500자마다 H2(##) 소제목으로 구간 분리
4. **구체적 수치 명시**: "보통 3~6개월", "약 95~98%" 등 명확한 수치 제시
5. **질문형 전환**: "그렇다면 왜 이런 현상이 발생할까요?" 형태로 독자 참여 유도

### 📌 이미지 SEO 최적화
- 이미지 플레이스홀더에 **Alt 텍스트 포함** (20~50자, 키워드 포함)
- 형식: 📷 [이미지: {설명}] (alt: {키워드 포함 설명})
- 예시: 📷 [이미지: 뼈이식 임플란트 CT 촬영 사진] (alt: 뼈이식임플란트 CT 영상 - 치조골 부족 소견)

## 글 구조 - 기승전결 (본문 최소 2,500자 / 해시태그 별도)

### 1. 기(起) - 서문 (최소 300자 이상)
**제목**: 25~30자, 치료 키워드를 제목 **맨 앞**에 배치, 물음표(?) 권장
- 인사: "안녕하세요, [지역] [치과명] [원장님]입니다."
- 공감 훅 (아래 중 선택):
${EMPATHY_PHRASES.slice(0, 5).map(p => `  - "${p}"`).join('\n')}
- 주제 소개: "오늘은 ~에 대해 설명드리겠습니다."
- ⚠️ **초반 200자 안에 메인 키워드 반드시 포함!** (네이버 알고리즘 우선 분석 영역)
⚠️ 이 섹션: 최소 300자!

### 1-1. 핵심 요약 (스마트블록 스니펫용, 50~80자)
서문 직후에 **한 줄 요약** 추가:
"💡 핵심: [메인키워드]는 [핵심 답변 1문장]입니다."
→ 네이버 스마트블록 핵심 요약형 미리보기에 노출 가능

### 2. 승(承) - 전개 (최소 800자 이상)
**Q&A 블록** (네이버 스마트블록용)
Q. [검색 의도 반영 질문 - 메인키워드 포함]?
A. [핵심 답변 2~3문장, 메인키워드 포함, 명확하고 단정적]

**본문 섹션 1**: ✅ [원인/증상 설명]
- 왜 이런 문제가 생기는지 (상세하게 3~4문단)
- 어떤 증상이 나타나는지 (구체적 예시 + 수치 포함)
- 방치하면 어떻게 되는지 (단계별 설명)
- 각 문단 60~100자, 2~3줄 후 줄바꿈 (체류시간 최적화)
⚠️ 이 섹션: 최소 800자!

### 3. 전(轉) - 전환/심화 (최소 900자 이상)
**본문 섹션 2**: 🔹 [치료 방법/주의사항]
⚠️ 반드시 아래 전환 표현 중 하나로 시작:
${TRANSITION_PHRASES.slice(0, 5).map(p => `- "${p}"`).join('\n')}

- 치료 과정 상세 설명 (단계별로, 수치 포함)
- 치료 후 주의사항 (불릿 리스트 형태)
- 관리 방법 및 팁
- 자주 묻는 질문에 대한 답변 (추가 Q&A 1~2개)
- 각 문단 60~100자, 2~3줄 후 줄바꿈
⚠️ 이 섹션: 최소 900자! (가장 긴 섹션)

### 4. 결(結) - 마무리 (최소 400자 이상)
**마무리 섹션**: 💚 글을 마치면서
- **핵심 요약 3~4문장** (메인 키워드 포함 - 마지막 200자 키워드 전략)
- "결론적으로~" 또는 "핵심은~" 형태의 명확한 결론 1문장
- 정기검진의 중요성 강조
- 정기 검진 권장 (특정 치과 언급 없이, 내원유도 금지)
- 인사: "[지역] [치과명] [원장님]이었습니다. 감사합니다."

**부작용 고지** (필수):
${disclaimer}
⚠️ 이 섹션: 최소 400자!

---
**해시태그**: 글 맨 마지막에 10개 (글자수 미포함)

## 📊 글자수 자가 검증 (작성 완료 전 필수 확인!)
작성 완료 전에 각 섹션의 글자수를 세어보세요:
- 기(起): 300자 이상인가? ☐
- 핵심요약: 50~80자 포함인가? ☐
- 승(承): 800자 이상인가? ☐
- 전(轉): 900자 이상인가? ☐
- 결(結): 400자 이상인가? ☐
- 총합: 2,500자 이상인가? ☐

만약 글자수가 부족하다면:
1. 각 섹션에 예시나 상세 설명을 추가하세요
2. 환자분들이 궁금해할 만한 내용을 보충하세요
3. 치료 과정을 더 구체적으로 설명하세요

## 전문용어 설명 + 비유 패턴 (중요!)
전문용어를 사용할 때는 반드시 아래 패턴을 따르세요:
"[전문용어]란 [정확한 의학적 설명]입니다. 쉽게 말해 [일상적인 비유]와 유사합니다."

예시:
- "근관치료(신경치료)란 치아 내부의 감염된 신경조직을 제거하고 소독하는 치료입니다. 쉽게 비유하자면, 썩은 과일 속을 깨끗이 파내는 것과 유사합니다."
- "치조골(잇몸뼈)은 치아를 지지하는 턱뼈의 일부입니다. 마치 집의 기초 공사처럼 치아가 단단히 서 있도록 합니다."

## AEO/GEO 최적화 (AI 검색엔진 인용용)
AI(ChatGPT, Perplexity 등)가 인용하기 좋은 구조로 작성:

1. **Q&A 블록 답변은 명확하게**
   - 2~3문장으로 핵심만 정확하게
   - "~입니다", "~됩니다" 형태로 단정적 답변

2. **구체적 수치/기간 명시**
   - "보통 3~6개월 소요됩니다"
   - "주 2~3회 권장됩니다"
   - "일반적으로 2~3회 내원이 필요합니다"

3. **결론 요약문 포함**
   - 마무리 섹션에 "결론적으로 ~" 또는 "핵심은 ~" 형태
   - 1~2문장으로 명확한 결론 제시

## 📷 이미지 플레이스홀더 작성법 (중요!)

이미지가 들어갈 위치에는 **구체적인 설명**을 포함해서 작성하세요:

**잘못된 예:**
- [IMAGE_1]
- [이미지]

**올바른 예 (Alt 텍스트 포함!):**
- 📷 [이미지: 치료 전 X-ray 사진] (alt: 수평매복 사랑니 X-ray - 인접 치아 압박 소견)
- 📷 [이미지: 치료 후 상태] (alt: 사랑니 발치 후 치유된 잇몸 상태)
- 📷 [이미지: 치료 과정 일러스트] (alt: 사랑니 분할 발치 단계별 과정 설명)
- 📷 [이미지: CT 촬영] (alt: 사랑니 CT 영상 - 하치조신경 위치 관계 확인)

**이미지 유형별 설명 템플릿:**
- before: "치료 전 상태를 보여주는 이미지 (X-ray/구강 내 사진)"
- after: "치료 후 개선된 상태 이미지"
- xray: "X-ray 촬영 이미지 - [구체적인 확인 내용]"
- ct: "CT 촬영 이미지 - [3D 구조 설명]"
- progress: "치료 과정 이미지 - [단계 설명]"
- diagram: "치료 과정 설명 일러스트/다이어그램"

## 📚 참고 자료 출처 표기 (신뢰도 향상)

의학적 정보를 작성할 때, 신뢰할 수 있는 출처를 문단 끝에 표기하세요:

**출처 표기 형식:**
- 문단 끝에 작은 글씨로: (출처: [기관명](링크))
- 글자수에 포함되지 않음

**신뢰할 수 있는 출처 예시:**
- 대한치과의사협회 (https://www.kda.or.kr)
- 대한치주과학회 (https://www.kperio.org)
- 대한구강악안면외과학회 (https://www.kaoms.org)
- 질병관리청 (https://www.kdca.go.kr)
- 건강보험심사평가원 (https://www.hira.or.kr)

**예시:**
"임플란트 시술 성공률은 약 95~98% 수준으로 보고되고 있습니다. (출처: [대한치과의사협회](https://www.kda.or.kr))"

## ${topic} 관련 정보
${topicPatterns.length > 0 ? topicPatterns.map(p => `- ${p}`).join('\n') : ''}

${getSynonymInstruction()}

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

// 이미지 파일명에서 임상 정보 추출 + 배치 힌트 생성
function analyzeImageNames(imageNames: string[], writingMode?: WritingMode): string {
  if (!imageNames || imageNames.length === 0) return ''

  // 치과 임상 키워드 사전 (파일명에서 소견 유추용)
  const clinicalKeywords: Record<string, string> = {
    // 부위
    '상악': '상악(위턱)', '하악': '하악(아래턱)',
    '전치': '전치부(앞니)', '구치': '구치부(어금니)', '대구치': '대구치(큰어금니)',
    '소구치': '소구치(작은어금니)', '좌측': '좌측', '우측': '우측',
    // 소견
    '치근단': '치근단 병소(치아 뿌리 끝 염증)',
    '골흡수': '골흡수(치조골 소실)',
    '골이식': '골이식(뼈 보충 시술)',
    '뼈이식': '골이식(뼈 보충 시술)',
    '파절': '치아 파절(깨짐)',
    '우식': '치아 우식(충치)',
    '충치': '치아 우식(충치)',
    '염증': '염증 소견',
    '농양': '농양(고름집)',
    '낭종': '낭종(물혹)',
    '매복': '매복(잇몸 속에 묻힌 상태)',
    '치주': '치주질환(잇몸병)',
    '발적': '발적(붉어짐)',
    '부종': '부종(부기)',
    // 치료
    '임플란트': '임플란트 식립',
    '식립': '임플란트 식립',
    '픽스쳐': '임플란트 픽스쳐(인공 뿌리)',
    '크라운': '보철 크라운(씌우기)',
    '보철': '보철 수복',
    '발치': '발치(치아 뽑기)',
    '근관': '근관치료(신경치료)',
    '신경치료': '근관치료(신경치료)',
    '스케일링': '스케일링(치석 제거)',
    '교정': '교정치료',
    '레진': '레진 수복',
    '인레이': '인레이 수복',
    // 시점
    'before': '치료 전', '치료전': '치료 전',
    'after': '치료 후', '치료후': '치료 후',
    '경과': '치료 경과', '과정': '치료 과정', '진행': '치료 진행',
    // 촬영 유형
    'xray': 'X-ray 촬영', 'x-ray': 'X-ray 촬영', '엑스레이': 'X-ray 촬영',
    'ct': 'CT 촬영', '씨티': 'CT 촬영', 'cbct': 'CBCT 촬영',
    '파노라마': '파노라마 촬영', '구내': '구내 사진', '구외': '구외 사진',
  }

  const analyzed = imageNames.map((name, index) => {
    // 확장자 제거 후 구분자로 분리
    const nameWithoutExt = name.replace(/\.[^.]+$/, '')
    const tokens = nameWithoutExt.split(/[_\-\s.]+/)

    // 파일명에서 임상 키워드 매칭
    const foundClinical: string[] = []
    const foundTiming: string[] = []
    const foundType: string[] = []
    const toothNumbers: string[] = []

    for (const token of tokens) {
      const lower = token.toLowerCase()

      // 치식 번호 (#11, #36, 36번 등)
      const toothMatch = token.match(/^#?(\d{2})번?$/)
      if (toothMatch) {
        toothNumbers.push(`#${toothMatch[1]}`)
        continue
      }

      // 키워드 매칭
      for (const [keyword, description] of Object.entries(clinicalKeywords)) {
        if (lower.includes(keyword.toLowerCase())) {
          if (['치료 전', '치료 후', '치료 경과', '치료 과정', '치료 진행'].includes(description)) {
            if (!foundTiming.includes(description)) foundTiming.push(description)
          } else if (description.includes('촬영') || description.includes('사진')) {
            if (!foundType.includes(description)) foundType.push(description)
          } else {
            if (!foundClinical.includes(description)) foundClinical.push(description)
          }
        }
      }
    }

    // 분석 결과 조합
    let analysis = `${index + 1}. **파일명**: ${name}\n`
    if (toothNumbers.length > 0) analysis += `   - 부위: ${toothNumbers.join(', ')}\n`
    if (foundClinical.length > 0) analysis += `   - 임상 정보: ${foundClinical.join(', ')}\n`
    if (foundType.length > 0) analysis += `   - 촬영 유형: ${foundType.join(', ')}\n`
    if (foundTiming.length > 0) analysis += `   - 시점: ${foundTiming.join(', ')}\n`
    if (foundClinical.length === 0 && foundType.length === 0 && foundTiming.length === 0) {
      analysis += `   - 참고 이미지 (파일명에서 추가 정보 유추 불가)\n`
    }

    return analysis
  })

  // 임상 모드일 때 소견 기반 서술 지시 추가
  const clinicalInstruction = writingMode === 'expert' ? `
**⚠️ 임상 모드 필수 지시:**
위 파일명에서 추출된 임상 정보를 글의 핵심으로 활용하세요!
- 부위/소견 정보가 있으면 → "방사선 사진상 [부위]에 [소견]이 관찰됩니다" 형태로 서술
- 치료 전/후 이미지가 있으면 → 치료 과정의 흐름에 맞춰 배치
- 촬영 유형이 있으면 → "X-ray상 ~", "CT상 ~" 형태로 소견 기술
- ❌ 파일명에 정보가 없는데 소견을 지어내지 마세요
- ✅ 파일명의 임상 키워드를 최대한 활용해서 임상 소견 기반 서술을 작성하세요
` : `
**이미지 활용 지시:**
파일명에서 파악되는 정보를 참고하여 적절한 위치에 배치하세요.
`

  return `
## 📷 이미지 임상 분석 & 배치 안내
아래 이미지의 파일명에서 임상 정보를 추출했습니다.
이미지는 \`[IMAGE_${'{숫자}'}\]\` 형식으로 표시합니다.

${analyzed.join('\n')}
${clinicalInstruction}
**배치 규칙:**
- 치료 전 이미지: 소견/증상 설명 섹션에 배치
- 치료 후 이미지: 치료 결과/예후 섹션에 배치
- X-ray/CT 이미지: 진단 소견 섹션에 배치 (alt 텍스트에 소견 포함)
- 과정 이미지: 치료 단계 설명 부분에 배치
- 이미지 Alt 텍스트 필수: 📷 [이미지: {설명}] (alt: {키워드 포함 설명})
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
  const imageSection = analyzeImageNames(imageNames, data.writingMode)

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
- 치료 상황 참고 (⚠️ 직접 언급 금지!): ${data.patientInfo}
- 치료 방법 참고: ${data.treatment}
${data.photoDescription ? `- 이미지 참고 정보: ${data.photoDescription}` : ''}

## 🚫 환자 정보 관련 필수 주의사항
위 "치료 상황 참고"와 "치료 방법 참고"는 글 작성 시 **참고용**입니다.
- ❌ "이번 환자분의 경우", "00대 여성 환자분" 등 직접 언급 금지
- ❌ 환자 연령, 성별, 구체적 상황 언급 금지
- ✅ "이런 증상이 있으신 분들", "이런 경우" 등 일반화해서 작성
- ✅ 특정 환자가 아닌 **일반적인 정보 제공** 형태로 작성

## 키워드 전략 (중요!)
### 지역 키워드: "${data.region}"
- 반드시 치과명과 함께만 사용 (예: "${data.region} ${data.clinicName}", "${data.region} 치과")
- ❌ 절대 금지: "${data.region} ${data.topic}" 처럼 지역+치료를 직접 연결하지 마세요
- ❌ 부자연스러운 예: "${data.region} 임플란트는 중요해요" (X)
- ✅ 자연스러운 예: "${data.region} ${data.clinicName}에서 임플란트 치료를 받으세요" (O)

### 치료 키워드: "${data.topic}"
- 독립적으로 자연스럽게 3~5회 배치 (초반200자, 중간, 마지막200자 포함)
- 서브 키워드: ${keywordsToUse.join(', ')} (각 2회)
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
- 기(起) 서문: **최소 300자** (공감 훅 + 메인키워드 포함)
- 핵심요약: **50~80자** (스마트블록 스니펫용)
- 승(承) 전개: **최소 800자** (Q&A + 원인/증상 상세)
- 전(轉) 심화: **최소 900자** (치료 과정 + 주의사항)
- 결(結) 마무리: **최소 400자** (핵심 요약 + 키워드 정리)
- **⭐ 총합: 반드시 2,500자 이상!! ⭐**
- 해시태그: 별도 10개 (글자수 미포함)

🚨🚨🚨 절대 규칙: 2,000자 미만 = 완전 실패!! 🚨🚨🚨
✅ 최소 2,000자 이상! 목표 2,500~3,000자!
✅ 글자수 부족 시: 원인 설명 추가, 치료 과정 상세화, 추가 Q&A 포함, 수치/기간 명시!

### 문장/문단 규칙 (체류시간 최적화)
1. **한 문단**: 2~3줄, 60~100자 (3줄 초과 금지 → 체류시간 감소)
2. **한 문장**: 40자 이내 (길면 줄바꿈)
3. **이모지**: 소제목에만 (✅🔹💚), 본문에는 자제
4. **소제목**: 300~500자마다 ##(H2) 소제목 삽입 (구간 분리)
5. **어미 규칙**: ~입니다, ~됩니다, ~있습니다 (기본) / ~하죠 (10% 이하) / 🚫 금지: ~해요, ~거든요, ~인데요
6. **"됩니다" 주의**: "해야 됩니다" → "해야 합니다", "되야" → "되어야"로 교정하여 사용
7. **불릿 리스트**: 나열형 정보는 반드시 불릿(- 또는 ✅🔹💚) 형태로 정리

### 키워드 배치 규칙 (에어서치 SEO)
1. 치료 키워드 "${data.topic}": **3~5회** (초반200자 + 중간 + 마지막200자 필수)
2. 서브 키워드: 각 2회
3. 지역 키워드: 반드시 치과명과 함께만!
   - ✅ "${data.region} ${data.clinicName}에서..."
   - ❌ "${data.region} ${data.topic}는..." (금지!)

### 전문용어 규칙
사용 시 반드시 설명 추가:
"[용어]란 [의학적 설명]입니다. 쉽게 비유하자면, [비유]와 유사합니다."

### 전환 표현 (전(轉) 섹션 시작 필수)
- "그런데 여기서 중요한 점이 있습니다."
- "많은 분들이 놓치시는 부분이 있습니다."
- "사실 이 부분이 가장 중요합니다."

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

          const rawContent = contentMatch ? contentMatch[1].trim() : fullContent
          // 44byte 줄바꿈 후처리 (네이버 블로그 최적화)
          const content = formatLineBreaks(rawContent)
          // 해시태그 제외, 공백 제외 글자수 계산
          metadata.charCount = countContentChars(content)

          // 의료법 금지어 검증
          const forbiddenViolations = checkForbiddenPatterns(content)
          const warnings: string[] = []

          if (forbiddenViolations.length > 0) {
            console.warn(`[Warning] 의료법 위반 표현 발견: ${forbiddenViolations.map(v => v.match).join(', ')}`)
            warnings.push(`⚠️ 의료법 위반 가능 표현: ${forbiddenViolations.map(v => `"${v.match}" (${v.reason})`).join(', ')}`)
          }

          // 글자수 경고 (네이버 SEO 기준: 2,500~3,000자 권장)
          if (metadata.charCount < 2000) {
            warnings.push(`⚠️ 글자수 부족: ${metadata.charCount}자 (네이버 SEO 권장: 2,500~3,000자)`)
          } else if (metadata.charCount > 3500) {
            warnings.push(`⚠️ 글자수 초과: ${metadata.charCount}자 (권장: 2,500~3,000자)`)
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
