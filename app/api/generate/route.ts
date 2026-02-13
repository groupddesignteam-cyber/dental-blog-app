import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest } from 'next/server'
import { GenerateFormData, LLMModel, WritingMode, BatchDiversityHints } from '@/types'

// 데이터 파일들
import { TERM_REPLACEMENTS, FORBIDDEN_WORDS, MEDICAL_FACTS, METAPHORS, getMetaphorText, formatMedicalInfoForPrompt } from '@/data/knowledge'
import { REQUIRED_DISCLAIMERS, getDisclaimer, checkForbiddenPatterns } from '@/data/medical-law'
import { CONTENT_RULES, generateHashtags } from '@/data/seo'
import { getSeasonHook, getSeasonHookByIndex } from '@/data/season'
import { INTRO_PATTERNS, BODY_PATTERNS, CLOSING_PATTERNS, TOPIC_PATTERNS, TRANSITION_PHRASES, EMPATHY_PHRASES, CLOSING_CTA_PHRASES, getGreetingByIndex, getEmpathyHookByIndex, getTransitionByIndex, getTransitionPhraseByIndex, getEmpathyPhraseByIndex, getClosingCtaByIndex } from '@/data/patterns'
import { generateMainKeyword, suggestSubKeywords } from '@/data/keywords'
import { getSynonymInstruction } from '@/data/synonyms'
import { formatLineBreaks } from '@/lib/line-formatter'
import { postProcess } from '@/lib/post-processor'

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
  apiKey: process.env.OPENAI_API_KEY || 'dummy-key-for-build',
})

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// 글쓰기 모드별 프롬프트 생성
function getWritingModePrompt(mode?: WritingMode): string {
  if (mode === 'expert') {
    return `
## ⚠️⚠️ 어미 규칙 최우선 적용 (페르소나보다 우선!) ⚠️⚠️

## 🏥 임상 포스팅 모드 (Clinical Case) — 전문가 설명 톤

**목표**: 10년차 치과 전문의가 임상 소견을 바탕으로 치료 과정을 전문적으로 설명하는 글
- 마치 의사가 동료 의료진이나 환자에게 "이런 상태에서는 이렇게 치료합니다"라고 설명하는 톤
- 전문 용어를 사용하되, 괄호 안에 쉬운 설명을 병기

**⚠️⚠️ 정보성(백과사전식) 글과 완전히 다릅니다! ⚠️⚠️**
- ❌ 정보성: "임플란트란 무엇일까요?" → 사전적 설명, 일반인 궁금증 해소 중심
- ✅ 임상: "치조골 흡수가 관찰되어 골이식 후 임플란트 식립을 진행하였습니다." → 전문의 관점 서술

**전문가 톤 핵심 원칙:**
1. 관찰 → 판단 → 치료 계획 → 시행 → 경과 순서로 전개
2. "~가 관찰됩니다", "~로 판단됩니다", "~를 시행하였습니다", "~가 확인됩니다" 등 임상 서술체 사용
3. 전문 용어 + 괄호 해설: "치근단 병소(치아 뿌리 끝 염증)", "치조골 흡수(잇몸뼈 소실)"
4. 구체적 수치와 기간 명시: "약 4~6개월", "직경 4.0mm, 길이 10mm 픽스쳐"
5. 단계별 치료 과정을 순서대로 상세 기술

**어미 규칙 (절대 준수!)**:
- 기본 어미: "~입니다", "~됩니다", "~있습니다", "~하였습니다" (95%)
- 전환/참여: "~하죠" (5% 이하, 제한적 사용)
- 🚫 절대 금지 어미: ~해요, ~거든요, ~인데요, ~있어요, ~드려요, ~할게요, ~볼게요, ~세요
- 🚫 페르소나에서 위 어미를 사용했더라도 절대 따라하지 마세요!

**CC(치료 상황) 활용 — 글의 뼈대 (최우선!)**:
⚠️ CC가 글의 뼈대입니다. CC 내용이 본론의 50% 이상을 구성해야 합니다!
- CC에 치식번호(#36 등), 부위, 증상이 있으면 → 그대로 임상 소견으로 활용
- CC에 "어금니 통증" → "하악 구치부에 자발통을 호소하시는 경우가 있습니다"
- CC에 "뼈가 부족" → "CT 확인 시 잔존 치조골 높이가 부족하여 골이식이 선행되었습니다"
- CC에 "#26 상악동거상술" → 해당 치식번호와 술식을 본론에서 상세 전개
- CC에 구체적 치료법/단계 → 각 단계를 임상적 시각에서 순서대로 상세 설명
- CC에 강조포인트 → 본론의 핵심 차별점으로 반드시 반영
- ❌ 단, "이번 환자분" 등 특정 환자 직접 언급은 절대 금지!
- ✅ "이러한 소견이 확인되는 경우", "이런 상태에서는" 형태로 일반화

**글 전개 흐름 (필수!)**:
소견 관찰 → 진단/평가 → 치료 계획 수립 → 치료 과정 → 경과 확인 → 예후/관리

**서론 (500자) - 전문가 관점 도입:**
❌ "임플란트란 무엇일까요?" (정보성 도입 - 금지!)
❌ "혹시 이런 경험 있으신가요?" (정보성 도입 - 금지!)
✅ 인사 → 시의성 훅 → CC 연결 ("이런 증상으로 내원하시는 분들이 계십니다") → 임상 소견 소개
✅ "방사선 사진상 #36 부위에 근단부 방사선 투과상이 관찰되는 경우가 있습니다."
✅ "임상 검사상 해당 부위 치은(잇몸)의 발적 및 부종이 확인되며, 추가적인 정밀 검사가 필요한 상태입니다."

**본론 (1,500자) - 전문의 관점 치료 설명:**

섹션 1: ✅ 소견/진단 (500자 이상)
- "~가 관찰됩니다" (객관적 기술, 최소 3회)
- "이는 ~를 시사하는 소견입니다" (진단적 해석)
- 감별진단이나 추가검사 필요성 언급
- 전문 용어마다 괄호 해설 필수

섹션 2: 🔹 치료 과정 (500자 이상)
- "이러한 경우 ~가 고려됩니다" (치료 방향 제시)
- 치료 단계를 순서대로 상세 기술 (1단계, 2단계...)
- 각 단계별 수치/기간/재료 구체적 명시
- "~를 시행하였습니다", "~가 진행됩니다" 등 임상 서술체

섹션 3: 🔵 주의사항/예후 (400자 이상)
- 치료 후 주의사항 (전문가 관점)
- 가능한 합병증과 대처법
- 추가 Q&A 1~2개

**결론 (500자) - 예후 평가 + 관리:**
- 치료 후 예상 경과 (기간별)
- 관리 방법 (전문가 권고 사항)
- 정기검진의 중요성 (주기 명시)
- 마무리 인사

**임상 모드 예시 문장 (이런 톤으로 작성!):**
- "방사선 사진상 #46 부위에 광범위한 치근단 방사선 투과상이 관찰됩니다."
- "이는 만성 치근단 병소로 판단되며, 근관치료 또는 발치 후 임플란트 식립이 고려됩니다."
- "CT 분석 결과 잔존 치조골 높이가 약 5mm로 확인되어, 상악동 거상술을 동반한 골이식이 선행되었습니다."
- "1차 수술로 골이식재를 적용하였으며, 약 4~6개월간 골유착 기간을 거친 후 2차 수술을 진행합니다."
- "술 후 3개월 경과 시점에서 골유착이 양호하게 진행되고 있음이 확인됩니다."

**⚠️ 비유/은유 사용 제한:**
- 🚫 "마치 ~처럼", "~와 같은 원리", "~에 비유하자면" 등의 비유적 표현을 사용하지 마세요.
- ✅ 의학적 사실과 임상 소견을 객관적으로 기술하세요.
- ⚠️ 비유는 정보성 모드 전용입니다. 임상 모드에서는 전문 용어 + 괄호 해설만 사용하세요.
`
  } else if (mode === 'informative') {
    return `
## ⚠️⚠️ 어미 규칙 최우선 적용 (페르소나보다 우선!) ⚠️⚠️

## 📚 정보성 모드 (Informative Mode) — 친근한 전문가 설명 톤

**목표**: 10년차 치과 전문의가 일반인 눈높이에서 깊이 있게 설명하는 글
- 마치 의사가 환자에게 "이건 이런 원리입니다, 쉽게 말하면~"이라고 친절히 설명하는 톤
- 전문 용어 사용 + 반드시 일상 비유로 풀어서 설명

**⚠️⚠️ 임상 모드(전문의 서술)와 완전히 다릅니다! ⚠️⚠️**
- ❌ 임상: "방사선 사진상 치근단 병소가 관찰됩니다." → 전문의 소견 보고체
- ✅ 정보성: "치아 뿌리 끝에 염증이 생긴 상태인데요. 마치 여드름이 뿌리 끝에 생긴 것과 유사합니다." → 비유+설명체

**어미 규칙 (절대 준수! 이 비율을 반드시 지키세요!)**:
- 기본 어미: "~입니다", "~됩니다", "~있습니다" (60%) — 10문장 중 6문장
- 전환/참여: "~하죠", "~되죠", "~이죠" (20%) — 10문장 중 2문장
- 전환 허용: "~인데요" (10%, 전환 시에만) — 10문장 중 1문장
- 존댓말: "~시죠", "~하십니다", "~계시죠" (10%) — 10문장 중 1문장
- 🚫 절대 금지 어미: ~해요, ~거든요, ~있어요, ~드려요, ~할게요, ~볼게요
- 🚫 페르소나에서 위 어미를 사용했더라도 절대 따라하지 마세요!
- ⚠️ ~입니다만 연속 3문장 이상 사용 금지! 반드시 ~하죠, ~인데요를 섞어주세요!

**CC(치료 상황) 활용 방법:**
- CC 정보가 있으면 해당 상황을 글의 공감 소재로 활용
- "이런 증상을 겪으시는 분들이 많습니다" 형태로 서론에 녹이기
- CC에 언급된 치료법 → 본론에서 해당 치료의 원리/과정을 깊이 있게 설명

**🎯 비유 표현 필수! (정보성 모드 핵심 차별점)**
모든 전문 용어/개념이 처음 등장할 때 반드시 일상 비유를 함께 제공하세요!
- 임플란트 → "땅에 말뚝을 박고 그 위에 집을 짓는 것과 유사합니다"
- 신경치료 → "막힌 하수구를 뚫는 것과 비슷한 원리입니다"
- 골이식 → "화분에 흙을 더 넣어주는 것과 비슷합니다"
- 치조골 → "치아를 감싸고 있는 잇몸뼈입니다. 건물의 기초와 같은 역할을 합니다"
- 필수: 글 전체에서 최소 5개 이상의 비유 표현 포함!
- 패턴: "쉽게 비유하자면~", "마치 ~와 유사합니다", "~라고 생각하시면 됩니다"

**⚠️ 뻔한 내용 금지! 전문가만 알려줄 수 있는 깊이 있는 정보!**
- ❌ "이가 아프면 치과에 가시는 것이 좋습니다." (뻔한 내용)
- ❌ "임플란트는 인공 치아를 심는 시술입니다." (사전적 정의만)
- ✅ "치수 조직까지 감염이 진행되면 자발통이 나타나는데요. 쉽게 말해 신경까지 세균이 침투한 상태이죠. 이 단계에서는 근관치료가 필요하며, 보통 2~3회 내원하여 치료를 진행합니다." (구체적 + 비유 + ~하죠 어미)
- ✅ "임플란트 식립 시 치조골 높이가 최소 8mm 이상이어야 하는데요. 마치 건물을 세우려면 기초 공사가 탄탄해야 하는 것과 같은 원리이죠." (수치 + 비유 + ~인데요/~이죠 어미)

**서론 (500자) - 공감 도입:**
✅ 인사 → 시의성 훅 → 공감 질문 → 주제 소개 + 메인 키워드
- "혹시 ~하신 적 있으신가요?" (체험 공감)
- "약 ~%의 분들이 이런 증상을 겪고 계십니다." (숫자 통계)
- "~할 때 ~하신 분들이 적지 않으시죠." (일상 상황)
- "~라고 생각하시죠? 사실은 조금 다릅니다." (오해 반전)
⚠️ 서론에서부터 ~하죠, ~인데요를 적극 사용하여 친근한 톤 확립!

**본론 (1,500자) - 깊이 있는 정보:**

섹션 1: ✅ 원인/메커니즘 (500자 이상)
- 왜 이런 문제가 발생하는지 과학적 설명
- 전문 용어 등장 시 반드시 비유 1개 이상 동반
- 방치하면 어떻게 진행되는지 단계별 설명 (수치 포함)
- "~인데요", "~이죠" 적극 활용하여 설명 톤 유지

섹션 2: 🔹 치료 방법/비교 (500자 이상)
- ⚠️ **번호 매긴 단계 목록 금지!** ("1단계: ~, 2단계: ~" 형태 절대 사용하지 마세요!)
- ✅ 치료 과정을 **이야기하듯 자연스럽게 풀어서** 서술하세요
- ✅ "먼저 ~를 진행하게 됩니다. 이후 ~를 확인한 뒤, ~로 이어지는데요." 형태
- ✅ "치료를 시작하면 우선 ~부터 살펴보게 됩니다. ~가 확인되면 다음으로 ~를 진행하죠."
- ❌ "1단계: 진단 → 2단계: 치료 → 3단계: 보철" (AI 티 100% — 절대 금지!)
- 구체적 수치: 기간, 성공률 등은 문장 속에 자연스럽게 녹여서 표현
- "~하죠", "~시죠" 활용하여 독자 참여 유도

섹션 3: 🔵 Q&A + 관리 팁 (400자 이상)
- 자주 묻는 질문 2~3개 (Q&A 형태)
- 일상에서 실천 가능한 구체적 관리 팁
- "~하시는 것이 좋습니다", "~을 권장합니다"

**결론 (500자) - 안심 + 행동:**
- 핵심 요약 2~3문장
- 독자 안심 문구: "충분히 개선 가능한 상태이니 편안하게 상담받아 보시길 바랍니다."
- 관리 팁 요약 + 정기검진 권유 (치과명 없이)
- 마무리 인사

**정보성 모드 예시 문장 (이런 톤으로 작성!):**
- "많은 분들이 궁금해하시는 내용인데요. 오늘은 이 주제를 깊이 있게 다뤄보겠습니다."
- "쉽게 비유하자면, 마치 건물의 기초 공사와 같은 원리이죠."
- "그렇다면 왜 이런 현상이 발생하는 걸까요? 원인은 크게 세 가지로 나뉩니다."
- "수치로 보면, 약 95% 이상에서 양호한 결과를 보이는 것으로 알려져 있습니다."
- "이런 상황이 익숙하시죠? 많은 분들이 비슷한 궁금증을 갖고 계십니다."

**⚠️⚠️ AI 티 방지 — 사람이 쓴 것처럼! ⚠️⚠️**
정보성 글에서 가장 중요한 것은 **사람이 직접 쓴 느낌**입니다.
아래 패턴은 AI가 쓴 것처럼 보이므로 절대 사용하지 마세요:

❌ 금지 패턴 (AI 티 100%):
- "1단계: ~, 2단계: ~, 3단계: ~" (번호 매긴 단계 목록)
- "첫째, ~입니다. 둘째, ~입니다. 셋째, ~입니다." (기계적 나열)
- "~의 장점은 다음과 같습니다: ①~, ②~, ③~" (체계적 정리)
- "결론적으로 정리하면~" 바로 뒤에 불릿 목록 (기계적 요약)

✅ 대신 이렇게 (사람이 쓴 느낌):
- "치료를 시작하면 우선 잇몸 상태부터 살펴보게 됩니다. 문제가 없다면 바로 다음 과정으로 넘어가죠."
- "진단이 끝나면 본격적인 치료에 들어가는데요. 보통 이 과정에서 약 2~3주 정도가 소요됩니다."
- "여기서 중요한 포인트가 하나 있습니다. 치료 직후에는~"
- 문장과 문장 사이에 자연스러운 연결어 ("그런데", "그래서", "이때", "보통은") 사용
`
  }

  // 기본 모드 → expert 모드로 폴백 (UI에서 모드 선택 필수화됨)
  return getWritingModePrompt('expert')
}

// 배치 다양성 지시 프롬프트 생성
function buildDiversityDirective(hints: BatchDiversityHints): string {
  const greeting = getGreetingByIndex(hints.greetingIndex)
  const empathyHook = getEmpathyHookByIndex(hints.empathyHookIndex)
  const transition = getTransitionByIndex(hints.transitionIndex)
  const empathyPhrase = getEmpathyPhraseByIndex(hints.empathyPhraseIndex)
  const transitionPhrase = getTransitionPhraseByIndex(hints.transitionPhraseIndex)
  const closingCta = getClosingCtaByIndex(hints.closingCtaIndex)

  let directive = `
## 🎯 글 다양성 지시 (배치 ${hints.batchIndex + 1}/${hints.totalBatchSize}번째)

다른 글과 구분되는 도입부를 위해 아래 패턴을 **반드시** 사용하세요:

### 서문 인사말 (첫 문장):
"${greeting}" → [지역], [치과명], [이름]에 맞게 치환하여 사용

### 공감 훅 (인사 직후 2~3문장):
"${empathyHook}" → [증상], [질문], [치료], [상황]에 맞게 치환

### 주제 전환 (공감 훅 뒤):
"${transition}" → [주제], [질문]에 맞게 치환

### 본론 전환 (섹션 2 시작):
"${transitionPhrase}"

### 공감 표현 (서론 내 사용):
"${empathyPhrase}"

### 마무리 권유 (결론):
"${closingCta}"

⚠️ 위 6개 패턴은 이 글에 고유 할당된 것입니다. 다른 패턴으로 대체하지 마세요!

### ⚠️ 어미 재확인 (배치 글마다 반드시 체크!)
🚫 절대 금지: ~해요, ~거든요, ~있어요, ~드려요, ~할게요, ~볼게요
✅ 시스템 프롬프트의 "글쓰기 모드" 어미 규칙을 반드시 따르세요!`

  // 본론 구조 다양화 (batchIndex 기반)
  const bodyStructures = [
    '본론 섹션 1을 "원인/메커니즘" 중심으로, 섹션 2를 "치료 과정 단계별 설명"으로 구성하세요.',
    '본론 섹션 1을 "증상별 분류/비교" 중심으로, 섹션 2를 "치료 옵션 장단점 비교표"로 구성하세요.',
    '본론 섹션 1을 "Q&A 형태의 궁금증 해소" 중심으로, 섹션 2를 "치료 후 관리/예후"로 구성하세요.',
    '본론 섹션 1을 "발생 원인과 진행 단계" 중심으로, 섹션 2를 "예방법과 자가 관리 팁"으로 구성하세요.',
    '본론 섹션 1을 "진단 방법과 검사 과정" 중심으로, 섹션 2를 "치료 방법별 상세 비교"로 구성하세요.',
  ]
  directive += `\n\n### 본론 구조 (이 글의 지정 구조):\n${bodyStructures[hints.batchIndex % bodyStructures.length]}`

  // 결론 톤 다양화 (8개 — "안심" 톤 제거, 중복 문구 금지)
  const closingTones = [
    '결론은 "행동 촉구" 톤으로 마무리하세요. 예: "정기 검진을 받아보시길 권장합니다." ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
    '결론은 "습관 연결" 톤으로 마무리하세요. 예: "일상 속 작은 습관이 큰 차이를 만듭니다." ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
    '결론은 "요약 정리" 톤으로 마무리하세요. 예: "오늘 말씀드린 핵심을 정리하면~" ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
    '결론은 "공감 마무리" 톤으로 마무리하세요. 예: "건강한 미소를 되찾으시길 바랍니다." ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
    '결론은 "안심+검진" 톤으로 마무리하세요. 예: "충분히 개선 가능한 상태이니 편하게 상담받아 보시길 바랍니다." ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
    '결론은 "격려" 톤으로 마무리하세요. 예: "작은 관심이 큰 건강으로 이어집니다." ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
    '결론은 "전문성 강조" 톤으로 마무리하세요. 예: "정밀 진단을 통해 최적의 방법을 찾으실 수 있습니다." ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
    '결론은 "미래 비전" 톤으로 마무리하세요. 예: "적절한 관리로 오래도록 건강한 치아를 유지하실 수 있습니다." ⚠️ "지나치게 염려하지 않으셔도" 문구 사용 금지!',
  ]
  directive += `\n\n### 결론 톤 (이 글의 지정 톤):\n${closingTones[hints.batchIndex % closingTones.length]}`

  if (hints.introHookType) {
    const hookDesc: Record<string, string> = {
      '체험공감': '"혹시 ~하신 적 있으신가요?" 형태의 체험 공감 질문으로 시작하세요.',
      '숫자통계': '"약 ~%의 분들이 ~" 형태의 통계/수치로 시작하세요.',
      '일상상황': '"~할 때 ~하신 분들이 적지 않으시죠." 형태의 일상 상황으로 시작하세요.',
      '오해반전': '"~라고 생각하시죠? 사실은 조금 다릅니다." 형태의 오해 반전으로 시작하세요.',
      '계절시기': '시즌 훅과 자연스럽게 연결하여 시작하세요.',
    }
    directive += `\n\n### 정보성 도입부 유형: ${hints.introHookType}\n${hookDesc[hints.introHookType] || ''}`
  }

  return directive
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
- ⚠️ 어미 규칙은 아래 "글쓰기 모드" 섹션의 규칙을 따르세요!
- 🚫 공통 절대 금지 어미: ~해요, ~거든요, ~있어요, ~드려요, ~할게요, ~볼게요`

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
### 📌 결론 (300자 내외, 공백 제외)
1. 요약 및 제언 (메인 키워드 **1회** 포함)
2. 마무리 인사: "[지역] [치과명] [이름]이었습니다." (형식 준수)

⚠️ **서문 인사 필수 형식:** "안녕하세요, [지역] [치과명] [이름]입니다."
- 🚫 "진료하고 있는", "진료 중인" 등의 부가 설명을 인사말에 넣지 마세요.
- 🚫 마무리에서 "의사", "원장" 등 직함을 붙이지 마세요. "[지역] [치과명] [이름]이었습니다." 형식만 사용하세요.

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

### 📌 키워드 배치 전략 (에어서치 최적화 — 분산 배치 필수!)
1. **초반 200자**: 반드시 메인 키워드 + 서브 키워드 1개 포함 (알고리즘 우선 분석 영역)
2. **마지막 200자**: 메인 키워드 + 핵심 요약 포함 (CTA 영역)
3. **메인 키워드**: 제목 포함 총 7회 (제목1 + 서론1 + 본론4 + 결론1) — 분산 배치!
4. **키워드 밀도**: 서브 키워드 각 3~5회 (과잉 반복 금지)
5. **동의어/관련어 활용**: 같은 단어가 글 전체에서 6회를 넘으면 반드시 동의어로 교체!
6. **"치과" 형태소**: 글 전체에서 최대 7회 (인사 포함), 본문에서는 최소화

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

## 글 구조 - 서론/본론/결론 (총 2,500자 이상 / 공백 제외)

### 📌 서론 (최소 500자 이상 필수, 공백 제외)

**제목**: 25~30자 (⚠️ 첫 줄에 1회만 작성하고, 본문에 다시 쓰지 마세요)
형식: "[치료], [지역] [치과명]에서 알려드립니다"
예: "[치료], [지역] [치과명]에서 알려드립니다"

**서론 구성 (500자를 반드시 채우세요! 짧은 서론은 절대 불가!):**
1. 인사 (1~2문장): ⚠️ 반드시 "안녕하세요, [지역] [치과명] [원장님이름]입니다." 순서 고정! + "치과" 1회
   ❌ 금지: "[치과명] [이름]입니다. 안녕하세요." (순서 뒤바뀜!)
   ❌ 금지: 지역명 누락
2. 시의성 훅 (최소 3문장 이상!): 계절/시기와 연관된 치아 이슈를 충분히 서술. 1~2문장으로 끝내지 마세요!
3. CC 연결 공감 (최소 4문장 이상!): 환자의 구체적 증상, 일상 속 불편을 생생하고 풍부하게 묘사. 짧은 공감은 독자를 놓칩니다!
4. 주제 소개 (2~3문장): 오늘 다룰 내용 소개 + 메인 키워드 **1회** 자연스럽게 포함
5. 핵심 요약 (1문장): "💡 핵심: [메인키워드]는 [답변 1문장]입니다." (스마트블록 스니펫용)

- ⚠️ **초반 200자 안에 메인 키워드 반드시 포함!**
- 🚨🚨 **서론이 300자 미만이면 실패입니다! 반드시 500자 이상 채우세요!** 🚨🚨
- 공감 훅 예시:
${EMPATHY_PHRASES.slice(0, 5).map(p => `  - "${p}"`).join('\n')}

### 📌 본론 (최소 1,500자 이상 필수, 공백 제외 - 상세하고 풍부하게!)

**⚠️ 본론 진입 전 정보 브릿지 섹션 (반드시 별도 소제목으로 분리!):**
🔍 소제목을 달아서 본론 시작 전에 해당 주제의 핵심 개념을 3~4문장으로 설명하세요.
이 섹션은 의료법 위반 위험을 줄이고 글의 전문성을 높이는 핵심 역할을 합니다.
반드시 비유를 포함하세요!

- 인접면 우식이 주제 → "🔍 인접면 우식이란?\n인접면이란 치아와 치아가 맞닿는 면을 말합니다. 쉽게 비유하면 책장에 빽빽이 꽂힌 책과 책 사이 면과 유사합니다."
- 신경치료가 주제 → "🔍 치아 신경은 어디에 있을까?\n치수(신경 조직)는 치아 내부 중심에 위치한 조직으로, 혈관과 신경이 밀집해 있습니다. 나무의 뿌리 속 수액 통로와 유사한 역할을 합니다."
- 임플란트가 주제 → "🔍 임플란트란 무엇인가?\n임플란트란 치아가 소실된 부위에 인공 치근(픽스처)을 식립하는 것입니다. 나무를 심을 때 뿌리를 땅에 단단히 심는 것과 유사합니다."
- 사랑니가 주제 → "🔍 사랑니는 어떤 치아인가?\n사랑니(제3대구치)는 가장 나중에 맹출하는 어금니입니다."
→ 이 브릿지 섹션 뒤에 원인/증상 섹션으로 자연스럽게 이어가세요.

**Q&A 블록** (네이버 스마트블록용)
Q. [검색 의도 반영 질문 - 메인키워드 포함]?
A. [핵심 답변 2~3문장, 명확하고 단정적]

**본론 섹션 1**: ✅ [원인/증상 설명] (최소 600자 이상!)
- **반드시 3가지 이상의 소주제로 나누어 상세히 서술하세요.**
  - 예: 1. 초기 증상과 원인, 2. 중기 진행 과정, 3. 말기 위험성
- 각 소주제마다 2문단 이상(200자 이상) 작성하여 깊이 있는 정보를 제공하세요.
- 방치했을 때의 위험성을 환자가 경각심을 가질 수 있도록 구체적인 시나리오로 경고하세요.
- **메인 키워드 1회** 자연스럽게 포함
- 각 문단 60~100자, 2~3줄 후 빈 줄(모바일 가독성)

⚠️ 전환 표현으로 다음 섹션 시작:
${TRANSITION_PHRASES.slice(0, 5).map(p => `- "${p}"`).join('\n')}

**본론 섹션 2**: 🔹 [치료 방법/과정] (최소 600자 이상!)
- **치료 과정을 반드시 3단계(준비/마취 → 핵심 시술 → 마무리/회복)로 나누어 서술하세요.**
- 🚨 단순히 순서를 나열하지 말고, **각 단계가 왜 필요한지, 어떤 효과가 있는지** 상세히 서술하세요!
- 환자가 진료 의자에서 겪는 경험(소리, 느낌, 냄새, 안도감 등)을 **오감**을 활용하여 생동감 있게 묘사하세요.
- 전문 용어는 반드시 쉬운 비유(일상 사물)를 곁들여 설명하세요.
- CC에 언급된 치료법을 일반화하여 설명
- **메인 키워드 1회** 자연스럽게 포함

**본론 섹션 3**: 🔵 [주의사항/관리] (최소 500자 이상)
- **치료 후 3가지 핵심 관리 수칙을 상세히 안내하세요.** (예: 식사 습관, 양치법, 정기검진)
- 각 수칙마다 구체적인 행동 가이드를 제시하세요. (예: "양치할 때는 45도 각도로...")
- 추가 Q&A 2~3개 (환자들이 자주 묻는 질문)를 반드시 포함하세요.
- **메인 키워드 1회** 자연스럽게 포함
(본론에서 총 **3~4회**가 되도록 조정)

### 📌 결론 (최소 500자 이상 필수, 공백 제외)

**🚨🚨 결론이 300자 미만이면 실패입니다! 반드시 500자 이상 채우세요! 🚨🚨**
**환자의 건강을 진심으로 생각하는 의사의 마음을 담아 길게 작성하세요.**

1. **핵심 요약** (3~4문장): 오늘 다룬 내용 정리 + 메인 키워드 포함
2. **결론 1문장**: "결론적으로~" 또는 "핵심은~" 형태
3. **관리 당부** (2~3문장): 정기검진의 중요성, 일상 관리 팁
4. **마무리 인사** (2~3문장): 따뜻한 마무리 + "치과" 1회
   "[지역] [치과명] [원장님이름]이었습니다. 감사합니다."

**부작용 고지** (필수):
${disclaimer}

---
**해시태그**: 글 맨 마지막에 10개 (글자수 미포함)

## 📊 글자수 자가 검증 (작성 완료 전 필수 확인! 공백 제외 기준!)
작성 완료 전에 각 섹션의 글자수(공백 제외)를 세어보세요:
- 서론: 500자 내외인가? ☐ (짧으면 공감 스토리 추가!)
- 본론: 1,500자 내외인가? ☐ (짧으면 원인 메커니즘, Q&A 추가!)
- 결론: 500자 내외인가? ☐ (짧으면 관리법, 정기검진 당부 추가!)
- 총합: 2,500자 이상인가? ☐
- 메인키워드 7회 분산 배치인가? ☐ (제목1 + 서론1 + 본론4 + 결론1)
- 같은 키워드가 한 문단에 2회 이상 몰려있지 않은가? ☐

만약 글자수가 부족하다면:
1. 서론: 공감 스토리와 배경 설명 추가 (환자들이 겪는 상황 묘사)
2. 본론: 원인 메커니즘, 치료 단계, 수치/기간, Q&A 추가
3. 결론: 핵심 요약 확대, 관리법 상세화, 정기검진 당부 추가

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

// 이미지 파일명에서 임상 정보 추출 + 순번 기반 구조화
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
    '치주염': '치주염(잇몸 염증)',
    '발적': '발적(붉어짐)',
    '부종': '부종(부기)',
    '결손': '결손치(빠진 치아)',
    '결손치': '결손치(빠진 치아)',
    // 치료
    '임플란트': '임플란트 식립',
    '식립': '임플란트 식립',
    '픽스쳐': '픽스쳐(임플란트 인공 뿌리)',
    '픽스처': '픽스쳐(임플란트 인공 뿌리)',
    '어버트먼트': '보강관(임플란트-보철 연결체)',
    '힐링어버트먼트': '보강관(치유 지대주)',
    '크라운': '지르코니아 보철(씌우기)',
    '지르코니아': '지르코니아 보철',
    '보철': '보철 수복',
    '임시보철': '심미 수복물(임시 보철)',
    '임시치아': '심미 수복물(임시 치아)',
    '발치': '발치(치아 뽑기)',
    '근관': '근관치료(신경치료)',
    '신경치료': '근관치료(신경치료)',
    '스케일링': '스케일링(치석 제거)',
    '교정': '교정치료',
    '레진': '레진 수복',
    '인레이': '인레이 수복',
    // 수술 관련
    '상악동거상술': '상악동 거상술(위턱 뼈 보충 수술)',
    '상악동': '상악동(위턱 공기주머니)',
    '근치술': '상악동 근치술(상악동 내 염증 제거)',
    '멤브레인': '차폐막(골이식 보호막)',
    '봉합': '봉합(수술 부위 꿰매기)',
    '절개': '절개(잇몸 열기)',
    '수면마취': '수면 마취(진정 요법)',
    '골유착': '골유착(뼈와 임플란트 결합)',
    '2차수술': '2차 수술(보강관 교체)',
    // 시점
    'before': '치료 전', '치료전': '치료 전',
    '초진': '초진(첫 진찰)',
    'after': '치료 후', '치료후': '치료 후',
    '치료중': '치료 중',
    '경과': '치료 경과', '과정': '치료 과정', '진행': '치료 진행',
    // 촬영 유형
    'xray': 'X-ray', 'x-ray': 'X-ray', '엑스레이': 'X-ray',
    'ct': 'CT 촬영', '씨티': 'CT 촬영', 'cbct': 'CBCT 촬영',
    '파노라마': '파노라마 촬영', '구내': '구내 사진', '구외': '구외 사진',
  }

  // 파일명에서 순번 + 시점 + 설명 파싱
  interface ParsedImage {
    originalName: string
    order: number          // 순번 (01, 02, ...)
    phase: string          // 시점 (초진, 치료전, 치료중, 치료후)
    description: string    // 설명 텍스트
    clinicalInfo: string[] // 추출된 임상 키워드
    imagingType: string[]  // 촬영 유형
    toothNumbers: string[] // 치식 번호
  }

  const parsed: ParsedImage[] = imageNames.map(name => {
    const nameWithoutExt = name.replace(/\.[^.]+$/, '')

    // 순번 파싱: 파일명 앞 숫자 (01_, 02_ 등)
    const orderMatch = nameWithoutExt.match(/^(\d{1,3})[_\-\s]/)
    const order = orderMatch ? parseInt(orderMatch[1], 10) : 999

    // 시점 파싱
    let phase = '기타'
    if (/초진/.test(nameWithoutExt)) phase = '초진'
    else if (/치료전|치료_전|before/i.test(nameWithoutExt)) phase = '치료전'
    else if (/치료중|치료_중|progress/i.test(nameWithoutExt)) phase = '치료중'
    else if (/치료후|치료_후|after/i.test(nameWithoutExt)) phase = '치료후'

    // 순번에서 시점/설명 분리 후 설명 추출
    const descPart = nameWithoutExt
      .replace(/^\d{1,3}[_\-\s]/, '')           // 순번 제거
      .replace(/^(초진|치료전|치료중|치료후)[_\-\s]*/i, '') // 시점 제거
      .replace(/\s*\(\d+\)\s*$/, '')             // 끝에 (1), (2) 등 제거
      .trim()

    // 키워드 매칭
    const clinicalInfo: string[] = []
    const imagingType: string[] = []
    const toothNumbers: string[] = []

    const tokens = nameWithoutExt.split(/[_\-\s.()]+/)
    for (const token of tokens) {
      const lower = token.toLowerCase()
      // 치식 번호
      const toothMatch = token.match(/^#?(\d{2})번?$/)
      if (toothMatch) { toothNumbers.push(`#${toothMatch[1]}`); continue }
      // 번대 (10번대, 40번대 등)
      const rangeMatch = token.match(/^(\d{2})번대$/)
      if (rangeMatch) { toothNumbers.push(`${rangeMatch[1]}번대`); continue }
      // 키워드 매칭
      for (const [keyword, desc] of Object.entries(clinicalKeywords)) {
        if (lower.includes(keyword.toLowerCase())) {
          if (desc.includes('X-ray') || desc.includes('CT') || desc.includes('촬영') || desc.includes('사진')) {
            if (!imagingType.includes(desc)) imagingType.push(desc)
          } else if (!['치료 전', '치료 후', '치료 중', '초진(첫 진찰)', '치료 경과', '치료 과정', '치료 진행'].includes(desc)) {
            if (!clinicalInfo.includes(desc)) clinicalInfo.push(desc)
          }
        }
      }
    }

    return { originalName: name, order, phase, description: descPart, clinicalInfo, imagingType, toothNumbers }
  })

  // 순번 기준 오름차순 정렬
  parsed.sort((a, b) => a.order - b.order)

  // 시점별 그룹핑 (글 구조 자동 생성)
  const groups: Record<string, ParsedImage[]> = { '초진': [], '치료전': [], '치료중': [], '치료후': [], '기타': [] }
  for (const img of parsed) {
    groups[img.phase].push(img)
  }
  const introImages = [...groups['초진'], ...groups['치료전']]
  const processImages = groups['치료중']
  const resultImages = groups['치료후']
  const hasStructuredOrder = parsed.some(p => p.order !== 999) // 순번이 있는 파일인지

  // 개별 이미지 분석 출력
  const analyzed = parsed.map((img, idx) => {
    let line = `${idx + 1}. [IMAGE_${idx + 1}] (순번 ${img.order !== 999 ? String(img.order).padStart(2, '0') : '-'}) **${img.phase}** | ${img.originalName}\n`
    if (img.toothNumbers.length > 0) line += `   - 부위: ${img.toothNumbers.join(', ')}\n`
    if (img.clinicalInfo.length > 0) line += `   - 임상: ${img.clinicalInfo.join(', ')}\n`
    if (img.imagingType.length > 0) line += `   - 촬영: ${img.imagingType.join(', ')}\n`
    if (img.description) line += `   - 설명: ${img.description}\n`
    return line
  })

  // 글 구조 지시 (순번이 있는 경우 자동 섹션 분배)
  let structureDirective = ''
  if (hasStructuredOrder && parsed.length >= 5) {
    structureDirective = `
## 📐 이미지 순번 기반 글 구조 (자동 생성)

파일명의 순번과 시점(초진/치료전/치료중/치료후)을 분석하여 글 흐름을 자동 구성했습니다.
**반드시 아래 순서대로 글을 전개하세요!**

### 🔹 도입부 (서론) — 초진/치료 전 상태 설명
${introImages.length > 0 ? introImages.map((img, i) => `- [IMAGE_${parsed.indexOf(img) + 1}] ${img.description || img.originalName}`).join('\n') : '- (해당 이미지 없음 — 일반적인 증상/상황 설명으로 시작)'}
→ 이 이미지들을 참고하여 초진 상태, 주요 소견, 치료 계획을 서술하세요.
→ "사진을 보시면~", "방사선 사진상~" 형태로 독자가 이미지를 참고하도록 유도하세요.

### 🔹 전개 (본론) — 치료 과정 상세 묘사
${processImages.length > 0 ? processImages.map((img, i) => `- [IMAGE_${parsed.indexOf(img) + 1}] ${img.description || img.originalName}`).join('\n') : '- (해당 이미지 없음)'}
→ 순번 순서대로 치료 과정을 시간 흐름에 맞춰 서술하세요.
→ 각 단계를 소제목으로 구분하고, 해당 이미지를 소제목 아래에 배치하세요.
→ "다음 사진에서 확인하실 수 있듯이~" 형태로 이미지 참조를 유도하세요.

### 🔹 결말 (결론) — 치료 완료/최종 상태
${resultImages.length > 0 ? resultImages.map((img, i) => `- [IMAGE_${parsed.indexOf(img) + 1}] ${img.description || img.originalName}`).join('\n') : '- (해당 이미지 없음)'}
→ 최종 보철/수복 완료 상태를 설명하고, 사후 관리를 안내하세요.
`
  }

  // 임상 모드 추가 지시
  const clinicalInstruction = writingMode === 'expert' ? `
**⚠️ 임상 모드 필수 지시:**
- 파일명에서 추출된 임상 정보를 글의 핵심으로 활용하세요!
- 부위/소견 정보 → "방사선 사진상 [부위]에 [소견]이 관찰됩니다" 형태로 서술
- 촬영 유형 → "X-ray상 ~", "CT상 ~" 형태로 소견 기술
- "사진을 보시면~", "다음 사진에서 확인하실 수 있듯이~" 형태로 이미지 참조 유도
- ❌ 파일명에 정보가 없는데 소견을 지어내지 마세요
- ✅ 파일명의 임상 키워드를 최대한 활용해서 임상 소견 기반 서술을 작성하세요
` : `
**이미지 활용 지시:**
- 파일명에서 파악되는 정보를 참고하여 적절한 위치에 배치하세요.
- "사진을 보시면~" 형태로 독자가 이미지를 참고하도록 유도하세요.
`

  // 용어 치환 안내
  const termReminder = `
**⚠️ 필수 용어 치환:**
- 크라운(Crown) → **지르코니아 보철**
- 임시 치아/임시 보철 → **심미 수복물**
- 힐링 어버트먼트(Healing Abutment) → **보강관**
- 임플란트 나사/뿌리 → **픽스쳐**
- 뼈이식 → **골이식**
- 잇몸뼈 → **치조골**
`

  return `
## 📷 이미지 임상 분석 & 배치 안내
이미지 ${parsed.length}장을 분석했습니다.${hasStructuredOrder ? ' (순번 기반 정렬 완료)' : ''}

${analyzed.join('\n')}
${structureDirective}
${clinicalInstruction}
${termReminder}
**배치 규칙:**
- 이미지는 반드시 순번 순서대로 글에 배치하세요
- 각 이미지 위치: 📷 [이미지 위치: {설명}] (alt: {키워드 포함 설명})
- 치료 전 이미지 → 소견/증상 설명 섹션에 배치
- 치료 과정 이미지 → 해당 치료 단계 설명 바로 아래에 배치
- 치료 후 이미지 → 치료 결과/예후 섹션에 배치
- X-ray/CT 이미지 → 진단 소견 섹션에 배치
`
}

// 정보성 모드 이미지 힌트 생성 (이미지 없을 때 추천)
function generateImageHints(topic: string): string {
  const topicHints: Record<string, string[]> = {
    '임플란트': [
      '📷 추천 이미지 1: 임플란트 구조 일러스트 (픽스쳐-보강관-보철 3단 구조)',
      '📷 추천 이미지 2: 치조골(잇몸뼈)과 임플란트 식립 과정 단계 다이어그램',
      '📷 추천 이미지 3: 골이식 전후 비교 일러스트',
      '📷 추천 이미지 4: 임플란트 수술 후 관리 방법 인포그래픽',
    ],
    '신경치료': [
      '📷 추천 이미지 1: 치아 내부 구조 (법랑질-상아질-치수) 단면 일러스트',
      '📷 추천 이미지 2: 신경치료(근관치료) 과정 다이어그램',
      '📷 추천 이미지 3: 치수염 진행 단계 비교 일러스트',
      '📷 추천 이미지 4: 치료 후 지르코니아 보철 씌우기 과정',
    ],
    '사랑니': [
      '📷 추천 이미지 1: 사랑니 종류 (정상/매복/수평) 비교 일러스트',
      '📷 추천 이미지 2: 매복 사랑니 X-ray 예시 사진 (라이센스 프리)',
      '📷 추천 이미지 3: 사랑니 발치 후 관리 방법 인포그래픽',
      '📷 추천 이미지 4: 하치조신경과 사랑니 위치 관계 다이어그램',
    ],
    '충치': [
      '📷 추천 이미지 1: 충치 진행 단계 (초기-중기-심화) 비교 일러스트',
      '📷 추천 이미지 2: 레진/인레이/크라운 치료 범위 비교 다이어그램',
      '📷 추천 이미지 3: 올바른 칫솔질 방법 인포그래픽',
      '📷 추천 이미지 4: 치아 단면 구조와 충치 침투 경로 일러스트',
    ],
    '교정': [
      '📷 추천 이미지 1: 교정 장치 종류 (메탈/세라믹/투명) 비교 사진',
      '📷 추천 이미지 2: 교정 치료 전후 비교 일러스트',
      '📷 추천 이미지 3: 유지장치 착용 방법 인포그래픽',
      '📷 추천 이미지 4: 교정 치료 기간별 변화 타임라인',
    ],
    '스케일링': [
      '📷 추천 이미지 1: 치석 축적 과정 일러스트',
      '📷 추천 이미지 2: 스케일링 전후 비교 사진 (라이센스 프리)',
      '📷 추천 이미지 3: 올바른 잇몸 관리 인포그래픽',
    ],
    '잇몸': [
      '📷 추천 이미지 1: 건강한 잇몸 vs 치주질환 잇몸 비교 일러스트',
      '📷 추천 이미지 2: 치주질환 진행 단계 (치은염→치주염) 다이어그램',
      '📷 추천 이미지 3: 잇몸 관리 방법 인포그래픽',
    ],
  }

  // 주제에 매칭되는 힌트 찾기
  let hints: string[] = []
  for (const [key, value] of Object.entries(topicHints)) {
    if (topic.includes(key)) {
      hints = value
      break
    }
  }

  // 매칭 안 되면 일반 힌트
  if (hints.length === 0) {
    hints = [
      `📷 추천 이미지 1: ${topic} 관련 치료 과정 일러스트/다이어그램`,
      `📷 추천 이미지 2: 치료 전후 비교 참고 이미지 (라이센스 프리)`,
      `📷 추천 이미지 3: ${topic} 관리 방법 인포그래픽`,
      `📷 추천 이미지 4: 관련 치아/구강 구조 해부학적 일러스트`,
    ]
  }

  return `
## 🖼️ 추천 이미지 힌트 (정보성 포스팅용)

이미지가 제공되지 않았으므로, 아래 이미지를 글에 배치하시는 것을 추천합니다.
글 본문에서 적절한 위치에 이미지 플레이스홀더를 삽입하세요.

${hints.join('\n')}

**배치 위치 추천:**
- 서론 뒤: 주제 관련 대표 이미지 1장
- 본론 섹션 1 (원인/증상): 구조/단계 일러스트 1장
- 본론 섹션 2 (치료 방법): 치료 과정 다이어그램 1장
- 결론 앞: 관리 방법 인포그래픽 1장
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
  selectedKeywords?: string[],
  diversityDirective?: string
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
- CC / 치료 상황 (글의 핵심 소재 — 일반화하여 서술): ${data.patientInfo}
- 치료 방법: ${data.treatment}
${data.photoDescription ? `- 이미지 참고 정보: ${data.photoDescription}` : ''}

## 환자 정보 일반화 규칙
위 CC/치료 상황은 글의 **핵심 소재**입니다. 임상 내용을 적극 활용하되, 표현만 일반화하세요:
- ✅ CC의 치식번호, 부위, 증상, 치료법을 그대로 임상 소견으로 활용
- ✅ "이런 증상이 있으신 분들", "이런 경우" 형태로 서술
- ❌ 특정 환자의 연령/성별 직접 언급만 금지 (임상 내용 자체는 적극 사용!)

${ragContext !== '[기존 글 DB 참조 불가]' && ragContext !== '[참조 가능한 기존 글 없음]' ? `
## 🎭 이 치과의 기존 글 패턴 (스타일 반드시 반영!)
${ragContext}
` : ''}

## 키워드 전략 — 형태소 분리 규칙 (매우 중요!)

### 🎯 메인키워드: "${mainKeyword}" (형태소 분리 가능!)
메인키워드는 2개의 형태소로 구성됩니다. 각각 독립적으로 7회 배치하세요!

- **형태소A**: "${data.region}" — 7회 (제목1 + 서론1 + 본론4 + 마무리1)
- **형태소B**: "${mainKeyword.replace(data.region, '').trim() || '치과'}" — 7회 (제목1 + 서론1 + 본론4 + 마무리1)

🚨🚨🚨 주의: 서론·마무리에만 넣고 본론에서 빠뜨리는 실수가 매우 잦습니다!
본론 ## 섹션마다 형태소A 또는 형태소B를 최소 1회 이상 포함하세요!

⚠️ 배치 규칙:
- **제목**: A+B 합쳐서 1회 (예: "${mainKeyword}")
- **서론**: A+B 합쳐서 1회 (예: "${data.region} ${mainKeyword.replace(data.region, '').trim() || '치과'}")
- **본론 (4회씩!)**: 각 ## 섹션에서 A, B를 합쳐서 또는 따로 사용!
  ✅ "${data.region}에서는 이런 증상을..." (A만)
  ✅ "${mainKeyword.replace(data.region, '').trim() || '치과'}에서 정밀 진단을..." (B만)
  ✅ "${mainKeyword}에서 알려드리는..." (A+B 합쳐서)
  ✅ "${data.region} 지역에서도..." (A만, 자연스러운 문맥)
- **마무리**: A+B 합쳐서 1회
- ❌ 한 문단에 동일 형태소 2회 이상 금지!
- ✅ 본론이 ## 섹션 2~3개라면, 각 섹션에 A 1~2회 + B 1~2회 분산

${(data.topic && !mainKeyword.includes(data.topic)) ? `### 치료 서브키워드: "${data.topic}"
- 형태소B와 별도로 3~5회 자연스럽게 배치 (초반200자, 중간, 마지막200자 포함)` : `### 치료 키워드: "${data.topic}"
- ⚠️ 형태소B와 동일한 단어! 위 형태소B 7회 규칙이 곧 "${data.topic}" 배치 규칙입니다.
- "${data.topic}"을 추가로 단독 반복하지 마세요 — 형태소B 7회에 이미 포함됨!`}
- 서브 키워드: ${keywordsToUse.join(', ')} (각 2회)
${selectedKeywords && selectedKeywords.length > 0 ? `- ⭐ 사용자 선택 키워드 (우선 반영): ${selectedKeywords.join(', ')}` : ''}

${getSynonymInstruction()}

### SEO 키워드 조합 (제목, 서문, 마무리에만 사용)
- "${data.region} ${data.clinicName}" 형태로 2~3회 배치
- 이번 달 인기 키워드: ${popularKeywords.join(', ')}
- 추천 해시태그: ${hashtags.join(' ')}

## 시즌 훅 (서문에 자연스럽게 활용)
"${seasonHook}"

${diversityDirective || ''}

${trendAnalysis && trendAnalysis !== '[키워드 트렌드 분석 불가]' ? `
${trendAnalysis}
` : ''}

${imageSection}

${imageNames.length === 0 && data.writingMode === 'informative' ? generateImageHints(data.topic) : ''}

${formatMedicalInfoForPrompt(data.topic)}

## 📝 글쓰기 규칙 (필수 준수!)

### ⚠️⚠️⚠️ 글자수 (공백 제외 기준!) ⚠️⚠️⚠️
- **서론**: 500자 내외 (공백 제외)
- **본론**: 1,500자 내외 (공백 제외)
- **결론**: 500자 내외 (공백 제외)
- **⭐ 총합: 반드시 2,500자 이상!! (공백 제외) ⭐**
- 해시태그: 별도 10개 (글자수 미포함)

🚨🚨🚨 절대 규칙: 2,000자(공백 제외) 미만 = 완전 실패!! 🚨🚨🚨
✅ 각 섹션의 글자수를 반드시 채우세요!
✅ 서론이 짧으면 공감 스토리와 배경 설명을 추가하세요!
✅ 본론이 짧으면 원인 메커니즘, Q&A, 치료 단계, 수치/기간을 상세히!
✅ 결론이 짧으면 핵심 요약, 관리법, 정기검진 당부를 충분히!

### 🚨 형태소 배치 확인 (자가 검증 — 반드시 수행!)
글 작성 완료 후, 아래 체크리스트를 하나씩 확인하세요:
- [ ] 형태소A "${data.region}" 총 7회인가? (제목1 + 서론1 + **본론4** + 마무리1)
- [ ] 형태소B "${mainKeyword.replace(data.region, '').trim() || '치과'}" 총 7회인가? (제목1 + 서론1 + **본론4** + 마무리1)
- [ ] **본론에서 형태소A가 4회 이상 등장하는가?** ← 가장 흔한 실패 원인!
- [ ] **본론에서 형태소B가 4회 이상 등장하는가?** ← 가장 흔한 실패 원인!
- [ ] 한 문단에 동일 형태소 2회 이상 없는가?
🚨 본론에서 형태소가 부족하면 "~${data.region}에서도~", "~${mainKeyword.replace(data.region, '').trim() || '치과'}의 경우~" 등을 본론 문장에 자연스럽게 삽입하세요!
⚠️ "치료", "진행", "확인", "상태" 등 일반 단어는 한 섹션(##) 내 3회 이상 반복 금지! 반드시 동의어로 교체!

### 문장/문단 규칙 (모바일 최적화!)
1. **한 문단**: 2~3줄, 60~100자 (3줄 초과 금지!)
2. **한 문장**: 30~40자 이내 (모바일에서 2줄 넘어가면 줄바꿈)
3. **문단 사이**: 반드시 빈 줄(엔터 2회) 삽입 → 모바일 가독성
4. **소제목**: 300~400자마다 ##(H2) 소제목 삽입
5. **이모지**: 소제목에만 (✅🔹💚), 본문 중간에는 자제
6. **불릿 리스트**: 나열형 정보는 반드시 불릿(- 또는 ✅🔹💚) 형태
7. **어미**: 반드시 시스템 프롬프트의 "글쓰기 모드" 어미 규칙을 따르세요! 🚫 절대 금지: ~해요, ~거든요, ~있어요, ~드려요
8. **"됩니다" 주의**: "해야 됩니다" → "해야 합니다", "되야" → "되어야"

### 🔄🔄🔄 중복 단어 방지 (유의어 순환 — 가장 중요!!) 🔄🔄🔄
⚠️ 이전 글에서 단어 반복이 심각한 문제였습니다! 반드시 아래 규칙을 지키세요!

**글 전체 반복 횟수 상한선:**
- 형태소A/B (위 형태소 규칙 참조): 각 7회 엄수!
- 기타 일반 명사 (치료, 진행, 확인, 상태 등): 최대 5~6회
- 한 문단 내 같은 단어 2회 이상 금지!

**유의어 순환 사전 (반드시 적용!):**
- 치료 → 시술 → 처치 → 진료 (4회전)
- 증상 → 양상 → 소견 → 징후 (4회전)
- 관찰 → 확인 → 발견 → 식별 (4회전)
- 진행 → 시행 → 수행 → 실시 (4회전)
- 경우 → 상황 → 케이스 → 사례 (4회전)
- 중요 → 핵심적 → 필수적 → 주요한 (4회전)
- 필요 → 권장되는 → 요구되는 → 고려되는 (4회전)
- 통증 → 불편감 → 동통 → 압통 (4회전)
- 부위 → 영역 → 부분 → 해당 위치 (4회전)
- 골이식 → 뼈이식 → 골보충 (3회전)
- 상태 → 양상 → 정도 → 현황 (4회전)

**자가 검증 필수 (글 완성 전!):**
각 주요 단어의 글 전체 등장 횟수를 세어보세요.
상한선을 초과하면 반드시 유의어로 교체하세요!
⚠️ 유의어 교체 시 문맥을 살려 자연스럽게 이어지도록!

### CC/치료 정보 반영 규칙 (⚠️ 글의 핵심!)
CC가 곧 글의 뼈대입니다. 본론의 50% 이상이 CC 내용에서 나와야 합니다:
- CC에 언급된 증상/상태 → 서론의 공감 훅 + 본론의 소견 서술 소재
- CC에 언급된 치료법/단계 → 본론의 치료 과정을 순서대로 상세 전개
- CC에 치식번호(#26 등), 강조포인트 → 본론에서 핵심적으로 다루기
- ✅ "이런 증상으로 내원하시는 분들이 많습니다" → CC 내용을 녹여서 작성
- ❌ 단, 특정 환자 직접 언급은 금지! "이런 경우" 형태로 일반화

### 🏥 의료광고법 6원칙 (절대 준수!)
1. **최상급 표현 금지**: 최고→숙련된, 유일→OOO에 집중하는, 최첨단→정밀한, 제일→전문적인
2. **후기 형식 금지**: 환자 후기/체험담 금지 → 정보 전달/증례 소개 형식으로 작성
3. **전후 사진 3원칙**: 동일 조건 촬영, 부작용 고지 병기, 혐오감 유발 이미지 주의
4. **통증/부작용 단정 금지**: 무통→저통증, 부작용 없음→금지, 아프지 않→통증이 적
5. **전문 용어 사용**: 크라운→지르코니아 보철, 때우기→수복, 이빨→치아, 씌우기→보철
6. **환자 유인/알선 금지**: 무료, 할인, 상품권, 이벤트, 가성비 표현 절대 금지

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
    const seasonHook = data.diversityHints
      ? getSeasonHookByIndex(data.topic, data.diversityHints.seasonHookIndex)
      : getSeasonHook(data.topic)
    // 메인키워드: 사용자 직접 입력 우선 → 없으면 자동 생성
    const mainKeyword = data.mainKeyword?.trim() || generateMainKeyword(data.region, data.topic)
    const subKeywords = suggestSubKeywords(data.topic)
    const popularKeywords = getMonthlyPopularKeywords()

    // ============================================================
    // 🚀 최적화: 비동기 API 호출 병렬 처리 (기존 순차 3-4초 → 병렬 1-2초)
    // ============================================================
    const [ragResult, keywordResult, personaResult] = await Promise.allSettled([
      // RAG 컨텍스트 생성: sourceClinic이 있으면 해당 치과 글 우선 참조, 없으면 clinicName 참조
      generateRAGContext(data.topic, data.sourceClinic || data.clinicName || undefined),
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
    // 배치 다양성 지시 생성
    const diversityDirective = data.diversityHints
      ? buildDiversityDirective(data.diversityHints)
      : ''

    const userPrompt = buildUserPrompt(
      data, mainKeyword, subKeywords, hashtags, seasonHook,
      ragContext, trendAnalysis, popularKeywords, imageNames,
      data.selectedKeywords, // 사용자 선택 키워드
      diversityDirective     // 배치 다양성 지시
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
          // 금칙어·의료법·키워드빈도·동의어회전 후처리
          const processed = postProcess(rawContent, {
            topic: data.topic || '',
            mainKeyword: mainKeyword,
            clinicName: data.clinicName || '',
            region: data.region || '',
            writingMode: data.writingMode,
          })
          // 44byte 줄바꿈 후처리 (네이버 블로그 최적화)
          const content = formatLineBreaks(processed)
          // 해시태그 제외, 공백 제외 글자수 계산
          metadata.charCount = countContentChars(content)

          // 의료법 금지어 검증
          const forbiddenViolations = checkForbiddenPatterns(content)
          const warnings: string[] = []

          if (forbiddenViolations.length > 0) {
            console.warn(`[Warning] 의료법 위반 표현 발견: ${forbiddenViolations.map(v => v.match).join(', ')}`)
            warnings.push(`⚠️ 의료법 위반 가능 표현: ${forbiddenViolations.map(v => `"${v.match}" (${v.reason})`).join(', ')}`)
          }

          // ~요 어미 검증 (금지 어미 사후 검사)
          const forbiddenEndings = ['해요', '거든요', '있어요', '드려요', '할게요', '볼게요', '줄게요']
          const foundEndings: string[] = []
          for (const ending of forbiddenEndings) {
            const regex = new RegExp(ending, 'g')
            const matches = content.match(regex)
            if (matches && matches.length > 0) {
              foundEndings.push(`${ending}(${matches.length}회)`)
            }
          }
          if (foundEndings.length > 0) {
            console.warn(`[Warning] 금지 어미 ~요 발견: ${foundEndings.join(', ')}`)
            warnings.push(`🚫 금지 어미(~요) 발견: ${foundEndings.join(', ')} — 수정이 필요합니다`)
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
