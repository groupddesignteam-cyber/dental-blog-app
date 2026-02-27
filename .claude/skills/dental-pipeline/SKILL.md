---
name: dental-pipeline
description: "기술 파이프라인 워크플로우. 후처리/검증/RAG 디버깅 시 사용."
disable-model-invocation: true
---

# 글 생성 파이프라인 (v3.12.0)

## 전체 흐름

```
[UI 입력] → [API /api/generate] → [병렬 I/O: RAG + 키워드 + 페르소나]
→ [프롬프트 조립: system + user] → [LLM 스트리밍]
→ [후처리 14단계] → [44byte 라인포맷] → [검증 14항목] → [SSE 응답]
```

---

## 핵심 파일 맵

| 파일 | 역할 | 주요 함수 |
|------|------|----------|
| `app/api/generate/route.ts` | 메인 파이프라인 (~1,639줄) | POST handler, buildSystemPrompt, buildUserPrompt |
| `lib/sheets-rag.ts` | Google Sheets RAG + 페르소나 | findClinicTopicPosts, extractClinicPersona, generateRAGContext |
| `lib/post-processor.ts` | LLM 출력 후처리 (14단계) | postProcess() |
| `lib/post-validator.ts` | 검증 14항목 | validatePost() |
| `lib/line-formatter.ts` | 네이버 44byte EUC-KR 포맷 | formatLineBreaks() |
| `data/synonyms.ts` | 동의어 사전 49개 | SYNONYM_DICTIONARY, getSynonymInstruction() |
| `data/knowledge.ts` | 용어치환, 의학정보 | TERM_REPLACEMENTS, formatMedicalInfoForPrompt() |
| `data/medical-law.ts` | 의료법 패턴 | checkForbiddenPatterns(), REQUIRED_DISCLAIMERS |
| `data/seo.ts` | SEO 규칙, 해시태그 | generateHashtags() |
| `data/patterns.ts` | 배치 다양성 패턴 | getGreetingByIndex(), 인사/전환/마무리 8종 |
| `data/keywords.ts` | 키워드 생성 | generateMainKeyword(), suggestSubKeywords() |
| `components/ResultPreview.tsx` | 결과 UI + 검증패널 | RAG 배지, ValidationPanel |
| `components/GenerateForm.tsx` | 단건 입력폼 | |
| `components/BatchQueue.tsx` | 배치 큐 | assignDiversityHints(), generateAll() |

---

## 후처리 파이프라인 (`postProcess()`)

| Step | 함수 | 임계값/규칙 |
|------|------|------------|
| 1 | `sanitizeForbiddenWords` | 16개 활용형 + 14개 1:1 치환 (걱정->염려, 고민->염려 + 조사 보정) |
| 1.5 | `sanitizeMedicalExpressions` | 26개 의료법 패턴 (무통->저통증, 환자분->분들) |
| 1.6 | `💡 핵심 치과명 제거` | 💡 핵심: 문장에서 치과명/지역+치과+효과 연결 제거 (의료법) |
| 1.7 | `enforceQnaPosition` | 임상=Q&A 전체삭제, 정보성=결론1건만 |
| 1.8 | `removeBoilerplatePhrases` | 6패턴, 2회+ 등장 시 2번째부터 줄 삭제 |
| 1.9 | `limitMetaphors` | 임상=0회, 정보성=2회 초과분 삭제 |
| 2 | `sanitizeForbiddenEndings` | ~해요->합니다, ~거든요->기 때문이죠 등 9패턴 |
| 2.5 | `breakConsecutiveImnida` | [정보성] 3연속 ~입니다 -> ~이죠/~인데요 교체 |
| 3 | `enforceMorphemeLimit` | 형태소B **>9회** -> 동의어교체, 서브키워드 **>5회** -> 교체 |
| 4 | `rotateSynonyms` | 일반단어 **>6회** -> 동의어회전 (49개 사전, 복합어 보호+조사 보정) |
| 4.5 | `limitEmphasisAdverbs` | 가장/특히/무엇보다 각 **>2회** -> 대체어 |
| 5 | `enforceRegionFrequency` | 지역명 5~8회 범위 + 상한 8회 cap + 본문 <2회 시만 브릿지 삽입 |
| 6 | `ensureSentenceLineBreaks` | 종결어미+공백+새문장 -> 줄바꿈 |
| 7 | `ensureHeadingLineBreaks` | ## 앞뒤 빈 줄 보장 |

---

## v3.11.2~3.11.3 변경사항

### 동의어 사전 정비 (`data/synonyms.ts`)

**삭제된 엔트리** (임상 표준 용어 — 동의어 회전 시 의미 파괴):
- `진행` — "감염이 진행된"→"감염이 시행된" 의미 파괴
- `부위` — "43번 부분는" 등 해부학 표준 용어 교체 방지
- `상태` — "골유착 수행 현황" 행정 문서 톤 방지

**수정된 엔트리** (부적절 동의어 제거):
- `치아`: 영구치 제거 → `['자연치']`만 유지
- `경우`: 케이스 제거 → `['상황', '사례']`만 유지
- `조직`: 세포 제거 → `['연조직', '조직층']`만 유지 (세포≠조직)
- `보철`: 지르코니아 제거 → `['수복물', '보철 수복']`만 유지
- `발치`: 발거 제거 → `['치아 제거', '치아 적출']`만 유지
- `식립`: 설치 제거 → `['매식', '배치']`만 유지 (설치는 비의학적)

### rotateSynonyms 복합어 보호 (`lib/post-processor.ts`)

**COMPOUND_SUFFIXES**: 매칭된 단어 뒤에 `물/술/치/재/법/학/과/막` 이 오면 복합어 내부로 판단 → 교체 스킵
```typescript
const COMPOUND_SUFFIXES = /^[물술치재법학과막]/
```
- "보철**물**" 내부의 "보철" 매칭 → 스킵 → "수복물물" 방지

**PROTECTED_COMPOUNDS 확장**:
```
보철물, 수복물, 골이식재, 상악동막, 발치와
```

### rotateSynonyms 조사 보정 (`lib/post-processor.ts`)

동의어 교체 시 한국어 조사 자동 조정:
```
식립이 → 배치가 (받침 유→무: 이→가)
식립을 → 배치를 (받침 유→무: 을→를)
```
- `adjustParticle(synonym, oldParticle)` 함수로 받침 유무에 따라 은/는, 이/가, 을/를, 과/와 자동 전환

### enforceRegionFrequency 개선 (`lib/post-processor.ts`)

1. **writingMode 파라미터** 추가: 임상/정보성 브릿지 문장 분기
2. **임상 모드 브릿지 문장**: 임상 톤에 맞는 6개 문장 추가
   - "~에서도 이와 유사한 증례가 보고되고 있습니다."
   - "~에서도 유사한 임상 양상이 관찰됩니다." 등
3. **상한 cap 로직**: 지역명 >8회 시 본문 후방에서 초과분 제거
4. **서론 체크 강화**: sections[0] + sections[2] (첫 ## 본문)에서 기존 지역명 확인

### Step 1.6: 💡 핵심 치과명 제거

💡 핵심: 문장에서 `${치과명}에서`, `${지역명} 치과에서 진행하는` 등 패턴 제거
→ 의료법 위반 방지 (치과명+치료효과 연결 금지)

### CONTEXT_REPLACEMENTS 조사 보정

- `고민이` → `염려가` (기존 `고충이`는 비문)
- `고민을` → `염려를` (기존 `고충을`은 비문)
- `고민` → `염려` (기존 `숙고`는 톤 부적합)

### FAQ_HEADER 패턴 개선

마크다운 볼드 `**FAQ**` 패턴도 매칭하도록 업데이트

---

## 검증 14항목 (`validatePost()`)

| # | 이름 | 기준 | 가중치(E/W) |
|---|------|------|------------|
| 1 | 글자수 | >=2,000(에러), >=2,500(경고) | 10/5 |
| 2 | 치과명 위치 | 서론15%+결론85%만 | 20/10 |
| 3 | 금지 어미 | ~해요/거든요 등 0건 | 15/8 |
| 4 | 키워드 빈도 | 형태소A/B 각 4~9회, 치과명<=3 | 10/6 |
| 5 | 의료법 준수 | 효과보장/환자정보 0건 | **25/12** |
| 6 | 금칙어 | 19단어 독립출현 0건 | 8/5 |
| 7 | 부작용 고지 | ※부작용 고지문 포함 | 5/4 |
| 8 | 동의어 회전 | 섹션당 <4회, 전체 <=6회 | 8/5 |
| 9 | 어미 다양성 | [정보성] ~입니다 <4연속 | 5/3 |
| 10 | AI 패턴 | 번호단계/상투어 0건 | 8/5 |
| 11 | 논문 인용 | [선택] 인용+References 존재 | 5/3 |
| 12 | Q&A 위치 | 임상=0, 정보성=결론1이하 | 8/5 |
| 13 | 비유 횟수 | 임상=0, 정보성<=2 | 8/5 |
| 14 | 번호 목록 | [정보성] <3건 | 5/3 |

점수 = 100 - 감점합계, 통과 = error급 실패 0건

---

## RAG 시스템 (`sheets-rag.ts`)

```
Google Sheets (Rawdata!A2:F, ~2,100행)
  │
  ├─ findClinicTopicPosts(clinicName, topic)
  │    B열 매칭 → 카테고리(+0.3) + 주제유사도(+0.2) 스코어링
  │
  ├─ extractClinicPersona(clinicName, topic)
  │    주제매칭(score>0.6) 우선 스타일 분석
  │    어미패턴 + 어조 + 인사/마무리 + 샘플 추출
  │    금지어미(해요/거든요/드려요) 자동 필터
  │
  └─ generatePersonaPrompt(persona) → 시스템 프롬프트에 주입
```

API 응답에 `ragInfo` 포함: personaApplied, personaPostCount, ragAvailable
UI에서 RAG 배지 표시 (초록=적용, 회색=미적용)

---

## 배치 다양성 (`assignDiversityHints`)

각 케이스에 중복 없이 분배:
- 인사 패턴 8종, 공감 훅 8종, 전환어 8종
- 본론 구조 5종 (시간순/비교/원인결과/FAQ삽입/사례-일반화)
- 마무리 CTA 8종, 인트로 훅 5종 (체험공감/통계/일상/오해반전/계절)

---

## 디버깅 가이드

### RAG 미적용
1. UI의 RAG 배지 확인 (회색 = 미적용)
2. 원인: 시트에 해당 치과명 없음 / 오타 (바다치괴, 서울약속치 등)
3. `tmp-rag-sim.mjs`로 매칭 시뮬레이션 가능

### 후처리 오탐 (정상 문장 삭제)
1. 어떤 Step에서 삭제되는지 확인 (Step 1.7~1.9 순서)
2. 해당 패턴 배열에서 오탐 regex 수정 또는 화이트리스트 추가
3. 예: "에 해당합니다" 비유 오탐 → METAPHOR_PATTERNS에서 제거 (v3.11.0)

### 동의어 회전 오류 (v3.11.3 이후)
1. **복합어 파괴**: "보철물"→"수복물물" — COMPOUND_SUFFIXES 누락 시 발생. 접미사 추가.
2. **임상 용어 의미 파괴**: "감염이 진행된"→"감염이 시행된" — 해당 단어를 synonyms.ts에서 삭제.
3. **조사 불일치**: "식립이"→"배치이" — adjustParticle 미적용. PARTICLE_PATTERN 확인.
4. **복합어 내부 매칭**: PROTECTED_COMPOUNDS에 해당 복합어 추가, 또는 COMPOUND_SUFFIXES에 접미사 추가.

### 검증-후처리 임계값 불일치
후처리와 검증의 threshold가 다르면 "후처리 통과 → 검증 실패" 발생
- `rotateSynonyms` >6회 교체 ↔ `checkSynonymRotation` >6회 경고 (일치)
- `enforceMorphemeLimit` >7회 교체 ↔ `checkKeywordFrequency` >8회 에러 (1회 여유)

### 글자수 부족
- 후처리 Step 1.7~1.9에서 문장 삭제 시 글자수 감소
- 검증 checkCharCount가 2,000자 미만 에러 표시
- 원인: LLM이 짧게 생성 + 후처리가 추가 삭제 → 프롬프트에서 글자수 목표 강화

### 지역명 과다/부족
- `enforceRegionFrequency` 목표 5~8회, 상한 8회
- 부족 시: 본문 0~1회일 때만 브릿지 문장 삽입 (임상/정보성 톤 자동 분기)
- 과다 시: 본문 후방에서 초과 라인 제거 (첫 3라인, 마지막 1라인 보호)

---

## v3.12.0 변경사항

### 키워드 배치 완화 (F3)
- 프롬프트: 형태소A/B 각 "정확히 7회" → "5~8회 범위 내 자연스럽게 분산"
- `enforceMorphemeLimit`: 교체 트리거 >7회 → >9회
- `enforceRegionFrequency`: 본문 브릿지 삽입 기준 <4회 → <2회
- `checkKeywordFrequency`: 허용 범위 6~8회 → 4~9회

### 복합 임상 케이스 지원 (F2)
- `types/index.ts`: `ClinicalProcedure` 인터페이스 추가
- `GenerateForm.tsx`: 임상 모드에 "단순 입력 / 복합 케이스" 토글 추가
  - 복합 케이스: 시술 단계별 카드 UI (이름, 치식번호, 상세, 강조, 주시술 여부)
- `route.ts`: procedures[] 존재 시 구조화된 CC 프롬프트 생성
  - 주 치료 40%+ 본론 비중, 인과 연결어 사용, 독립 나열 금지

### 소제목 커스텀 (F1)
- `types/index.ts`: `SectionTemplate` 인터페이스 추가
- `GenerateForm.tsx`: 아코디언형 소제목 편집 UI (프리셋 3종 + 자유 편집)
- `route.ts`: customSections[] 존재 시 "반드시 이 제목 사용" 프롬프트 삽입

### 크롭 버그 수정 (F4)
- `ImageEditor.tsx`: applyCrop useCallback 의존성 배열에 bgRotation, bgFlipX, bgFlipY, clearPrivacyHistory 추가
