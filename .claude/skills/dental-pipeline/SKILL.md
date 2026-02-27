---
name: dental-pipeline
description: "기술 파이프라인 워크플로우. 후처리/검증/RAG 디버깅 시 사용."
disable-model-invocation: true
---

# 글 생성 파이프라인 (v3.11.1)

## 전체 흐름

```
[UI 입력] → [API /api/generate] → [병렬 I/O: RAG + 키워드 + 페르소나]
→ [프롬프트 조립: system + user] → [LLM 스트리밍]
→ [후처리 11단계] → [44byte 라인포맷] → [검증 14항목] → [SSE 응답]
```

---

## 핵심 파일 맵

| 파일 | 역할 | 주요 함수 |
|------|------|----------|
| `app/api/generate/route.ts` | 메인 파이프라인 (~1,639줄) | POST handler, buildSystemPrompt, buildUserPrompt |
| `lib/sheets-rag.ts` | Google Sheets RAG + 페르소나 | findClinicTopicPosts, extractClinicPersona, generateRAGContext |
| `lib/post-processor.ts` | LLM 출력 후처리 (11단계) | postProcess() |
| `lib/post-validator.ts` | 검증 14항목 | validatePost() |
| `lib/line-formatter.ts` | 네이버 44byte EUC-KR 포맷 | formatLineBreaks() |
| `data/synonyms.ts` | 동의어 사전 72개 | SYNONYM_DICTIONARY, getSynonymInstruction() |
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
| 1 | `sanitizeForbiddenWords` | 16개 활용형 + 14개 1:1 치환 (걱정->염려, 해결->개선) |
| 1.5 | `sanitizeMedicalExpressions` | 26개 의료법 패턴 (무통->저통증, 환자분->분들) |
| 1.7 | `enforceQnaPosition` | 임상=Q&A 전체삭제, 정보성=결론1건만 |
| 1.8 | `removeBoilerplatePhrases` | 6패턴, 2회+ 등장 시 2번째부터 줄 삭제 |
| 1.9 | `limitMetaphors` | 임상=0회, 정보성=2회 초과분 삭제 |
| 2 | `sanitizeForbiddenEndings` | ~해요->합니다, ~거든요->기 때문이죠 등 9패턴 |
| 2.5 | `breakConsecutiveImnida` | [정보성] 3연속 ~입니다 -> ~이죠/~인데요 교체 |
| 3 | `enforceMorphemeLimit` | 형태소B **>7회** -> 동의어교체, 서브키워드 **>5회** -> 교체 |
| 4 | `rotateSynonyms` | 일반단어 **>6회** -> 동의어회전 (72개 사전, 보호구간 제외) |
| 4.5 | `limitEmphasisAdverbs` | 가장/특히/무엇보다 각 **>2회** -> 대체어 |
| 5 | `enforceRegionFrequency` | 지역명 총 7회 분포 (제목1+서론1+본론4+결론1), 헤더<2 시 fallback |
| 6 | `ensureSentenceLineBreaks` | 종결어미+공백+새문장 -> 줄바꿈 |
| 7 | `ensureHeadingLineBreaks` | ## 앞뒤 빈 줄 보장 |

---

## 검증 14항목 (`validatePost()`)

| # | 이름 | 기준 | 가중치(E/W) |
|---|------|------|------------|
| 1 | 글자수 | >=2,000(에러), >=2,500(경고) | 10/5 |
| 2 | 치과명 위치 | 서론15%+결론85%만 | 20/10 |
| 3 | 금지 어미 | ~해요/거든요 등 0건 | 15/8 |
| 4 | 키워드 빈도 | 형태소A/B 각 6~8회, 치과명<=3 | 10/6 |
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

### 검증-후처리 임계값 불일치
후처리와 검증의 threshold가 다르면 "후처리 통과 → 검증 실패" 발생
- `rotateSynonyms` >6회 교체 ↔ `checkSynonymRotation` >6회 경고 (일치)
- `enforceMorphemeLimit` >7회 교체 ↔ `checkKeywordFrequency` >8회 에러 (1회 여유)

### 글자수 부족
- 후처리 Step 1.7~1.9에서 문장 삭제 시 글자수 감소
- 검증 checkCharCount가 2,000자 미만 에러 표시
- 원인: LLM이 짧게 생성 + 후처리가 추가 삭제 → 프롬프트에서 글자수 목표 강화
