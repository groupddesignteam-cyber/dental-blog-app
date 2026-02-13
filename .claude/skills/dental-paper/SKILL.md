---
name: dental-paper
description: "논문 검색 및 인용 워크플로우. PubMed 연동, 학술 인용 추가 시 사용."
disable-model-invocation: true
---

# 논문 검색 및 인용 가이드

## 인용 철칙
1. **실존 논문만** 인용 (제목, 저자, 저널, 연도 모두 정확)
2. 존재 불확실하면 절대 인용 금지
3. 확인 불가 시 → "관련 연구에 따르면~"으로 대체
4. References 블록은 글자수에 포함하지 않음

## 인용 형식

### 본문 내
```
"...보고되고 있습니다.[1]"
"Kim et al.(2023)에 따르면..."
```

### 글 하단 References
```
📎 References
[1] 저자명. "논문 제목." 저널명, vol.X, no.X, pp.XX-XX, 연도.
[2] 저자명. "논문 제목." 저널명, 연도. DOI: xxx
※ 이 섹션은 본문 글자수에 포함되지 않습니다.
```

## 인용 가능 출처
- PubMed 등재 논문 (영문/국문)
- 대한치과의사협회지, 대한치주과학회지 등 국내 학회지
- Cochrane Review, 체계적 문헌 고찰
- 교과서적 사실은 출처 없이 서술 가능

## 인용 금지
- AI가 생성한 가짜 논문
- 블로그, 뉴스 기사, 위키피디아
- 제약/의료기기 회사 홍보 자료

## 신뢰 기관 출처 (논문 외)
- 대한치과의사협회 (https://www.kda.or.kr)
- 대한치주과학회 (https://www.kperio.org)
- 대한구강악안면외과학회 (https://www.kaoms.org)
- 질병관리청 (https://www.kdca.go.kr)
- 건강보험심사평가원 (https://www.hira.or.kr)

## 한→영 키워드 매핑 (PubMed 검색용)

| 한국어 | English (PubMed Query) |
|--------|----------------------|
| 임플란트 | dental implant |
| 신경치료 | root canal treatment, endodontics |
| 충치 | dental caries |
| 사랑니 | wisdom tooth, third molar |
| 치아교정 | orthodontic treatment |
| 스케일링 | dental scaling, periodontal |
| 치주치료 | periodontal treatment |
| 보철 | dental prosthesis, crown |
| 라미네이트 | dental veneer, laminate |
| 치아미백 | tooth whitening, bleaching |
| 소아치과 | pediatric dentistry |
| 발치 | tooth extraction |
| 잇몸치료 | gingival treatment, periodontitis |
| 턱관절 | temporomandibular joint, TMJ |
| 골이식 | bone graft, dental |
| 상악동거상술 | sinus lift, augmentation |
| 치아크랙 | cracked tooth, tooth fracture |
| 지르코니아 | zirconia, dental ceramic |
| 브릿지 | dental bridge, fixed partial denture |

## PubMed API (개발 참고)
- Base: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`
- 검색: `esearch.fcgi?db=pubmed&term={query}&retmax=5&retmode=json`
- 상세: `efetch.fcgi?db=pubmed&id={pmids}&retmode=xml`
- Rate: API key 없으면 3req/sec, 있으면 10req/sec
- API key: `.env.local`에 `PUBMED_API_KEY` 설정
