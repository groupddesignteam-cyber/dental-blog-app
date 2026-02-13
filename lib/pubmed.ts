/**
 * PubMed E-utilities 클라이언트
 * - 한국어 의료 키워드 → 영문 PubMed 쿼리 변환
 * - esearch (검색) + efetch (상세) 2단계
 * - regex 기반 XML 파싱 (외부 라이브러리 없음)
 * - 지원 과목: 치과, 비뇨기과, 정형외과
 */

export interface PaperCitation {
  pmid: string
  title: string
  authors: string      // "Kim JS, Park YH, et al."
  journal: string
  year: number
  doi?: string
  abstract?: string
}

// ── 한→영 의료 키워드 매핑 (과목별) ──

const MEDICAL_KEYWORD_MAP: Record<string, { en: string; mesh: string }> = {
  // ── 치과 (Dentistry) ──
  '임플란트': { en: 'dental implant', mesh: 'dental' },
  '신경치료': { en: 'root canal treatment endodontics', mesh: 'dental' },
  '충치': { en: 'dental caries', mesh: 'dental' },
  '사랑니': { en: 'wisdom tooth third molar', mesh: 'dental' },
  '치아교정': { en: 'orthodontic treatment', mesh: 'dental' },
  '교정': { en: 'orthodontic treatment', mesh: 'dental' },
  '스케일링': { en: 'dental scaling periodontal', mesh: 'dental' },
  '치주치료': { en: 'periodontal treatment', mesh: 'dental' },
  '치주': { en: 'periodontal', mesh: 'dental' },
  '보철': { en: 'dental prosthesis crown', mesh: 'dental' },
  '라미네이트': { en: 'dental veneer laminate', mesh: 'dental' },
  '치아미백': { en: 'tooth whitening bleaching', mesh: 'dental' },
  '미백': { en: 'tooth whitening bleaching', mesh: 'dental' },
  '소아치과': { en: 'pediatric dentistry', mesh: 'dental' },
  '발치': { en: 'tooth extraction', mesh: 'dental' },
  '잇몸치료': { en: 'gingival treatment periodontitis', mesh: 'dental' },
  '잇몸': { en: 'gingival periodontal', mesh: 'dental' },
  '턱관절': { en: 'temporomandibular joint TMJ', mesh: 'dental' },
  '골이식': { en: 'bone graft dental', mesh: 'dental' },
  '상악동거상술': { en: 'sinus lift augmentation', mesh: 'dental' },
  '치아크랙': { en: 'cracked tooth fracture', mesh: 'dental' },
  '크랙': { en: 'cracked tooth fracture', mesh: 'dental' },
  '지르코니아': { en: 'zirconia dental ceramic', mesh: 'dental' },
  '브릿지': { en: 'dental bridge fixed partial denture', mesh: 'dental' },
  '틀니': { en: 'denture removable prosthesis', mesh: 'dental' },
  '레진': { en: 'composite resin restoration', mesh: 'dental' },
  '뼈이식': { en: 'bone graft dental', mesh: 'dental' },
  '치아': { en: 'dental tooth', mesh: 'dental' },
  '어금니': { en: 'molar tooth', mesh: 'dental' },

  // ── 비뇨기과 (Urology) ──
  '전립선': { en: 'prostate', mesh: 'urology' },
  '전립선비대증': { en: 'benign prostatic hyperplasia BPH', mesh: 'urology' },
  '전립선암': { en: 'prostate cancer', mesh: 'urology' },
  '요로결석': { en: 'urolithiasis kidney stone', mesh: 'urology' },
  '신장결석': { en: 'kidney stone nephrolithiasis', mesh: 'urology' },
  '방광염': { en: 'cystitis urinary tract infection', mesh: 'urology' },
  '요로감염': { en: 'urinary tract infection UTI', mesh: 'urology' },
  '혈뇨': { en: 'hematuria', mesh: 'urology' },
  '과민성방광': { en: 'overactive bladder OAB', mesh: 'urology' },
  '요실금': { en: 'urinary incontinence', mesh: 'urology' },
  '발기부전': { en: 'erectile dysfunction', mesh: 'urology' },
  '남성불임': { en: 'male infertility', mesh: 'urology' },
  '정계정맥류': { en: 'varicocele', mesh: 'urology' },
  '방광암': { en: 'bladder cancer', mesh: 'urology' },
  '신장암': { en: 'renal cell carcinoma kidney cancer', mesh: 'urology' },
  '요관': { en: 'ureter ureteral', mesh: 'urology' },
  '포경수술': { en: 'circumcision', mesh: 'urology' },
  '전립선염': { en: 'prostatitis', mesh: 'urology' },
  '야뇨증': { en: 'nocturnal enuresis nocturia', mesh: 'urology' },
  '비뇨기': { en: 'urological', mesh: 'urology' },

  // ── 정형외과 (Orthopedics) ──
  '무릎': { en: 'knee', mesh: 'orthopedics' },
  '무릎관절': { en: 'knee joint osteoarthritis', mesh: 'orthopedics' },
  '인공관절': { en: 'total joint replacement arthroplasty', mesh: 'orthopedics' },
  '슬관절': { en: 'knee arthroplasty', mesh: 'orthopedics' },
  '고관절': { en: 'hip joint replacement', mesh: 'orthopedics' },
  '십자인대': { en: 'anterior cruciate ligament ACL', mesh: 'orthopedics' },
  '반월상연골': { en: 'meniscus meniscal tear', mesh: 'orthopedics' },
  '연골손상': { en: 'cartilage injury chondral', mesh: 'orthopedics' },
  '회전근개': { en: 'rotator cuff tear', mesh: 'orthopedics' },
  '어깨': { en: 'shoulder', mesh: 'orthopedics' },
  '오십견': { en: 'frozen shoulder adhesive capsulitis', mesh: 'orthopedics' },
  '척추': { en: 'spine spinal', mesh: 'orthopedics' },
  '허리디스크': { en: 'lumbar disc herniation', mesh: 'orthopedics' },
  '목디스크': { en: 'cervical disc herniation', mesh: 'orthopedics' },
  '디스크': { en: 'disc herniation', mesh: 'orthopedics' },
  '척추관협착증': { en: 'spinal stenosis', mesh: 'orthopedics' },
  '골절': { en: 'fracture', mesh: 'orthopedics' },
  '손목터널증후군': { en: 'carpal tunnel syndrome', mesh: 'orthopedics' },
  '테니스엘보': { en: 'lateral epicondylitis tennis elbow', mesh: 'orthopedics' },
  '골다공증': { en: 'osteoporosis', mesh: 'orthopedics' },
  '관절염': { en: 'arthritis osteoarthritis', mesh: 'orthopedics' },
  '류마티스': { en: 'rheumatoid arthritis', mesh: 'orthopedics' },
  '족저근막염': { en: 'plantar fasciitis', mesh: 'orthopedics' },
  '아킬레스건': { en: 'achilles tendon', mesh: 'orthopedics' },
  '통풍': { en: 'gout', mesh: 'orthopedics' },
  '근막통증': { en: 'myofascial pain syndrome', mesh: 'orthopedics' },
  '정형외과': { en: 'orthopedic', mesh: 'orthopedics' },
}

const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

// ── 키워드 변환 ──

function translateKeyword(koreanTopic: string): { en: string; mesh: string } {
  // 정확히 매칭되는 키워드 찾기
  for (const [kr, mapping] of Object.entries(MEDICAL_KEYWORD_MAP)) {
    if (koreanTopic.includes(kr)) {
      return mapping
    }
  }
  // 매칭 안되면 원본 그대로 + MeSH 없이 일반 검색
  return { en: koreanTopic, mesh: '' }
}

// MeSH 필터 매핑
const MESH_FILTERS: Record<string, string> = {
  dental: 'dentistry[MeSH]',
  urology: 'urology[MeSH]',
  orthopedics: 'orthopedics[MeSH]',
}

// ── PubMed 검색 ──

export async function searchPubMed(
  topic: string,
  limit: number = 5
): Promise<PaperCitation[]> {
  const { en: englishTerm, mesh } = translateKeyword(topic)
  const meshFilter = mesh && MESH_FILTERS[mesh] ? ` AND ${MESH_FILTERS[mesh]}` : ''
  const query = `(${englishTerm}[TIAB])${meshFilter} AND ("last 10 years"[PDat])`

  const apiKey = process.env.PUBMED_API_KEY || ''

  // Step 1: esearch — PMID 목록 검색
  const searchParams = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmax: String(Math.min(limit, 10)),
    sort: 'relevance',
    retmode: 'json',
    tool: 'DentalBlog',
    email: 'dental-blog@app.local',
  })
  if (apiKey) searchParams.set('api_key', apiKey)

  const searchUrl = `${PUBMED_BASE}/esearch.fcgi?${searchParams.toString()}`
  const searchRes = await fetch(searchUrl)

  if (!searchRes.ok) {
    throw new Error(`PubMed esearch failed: ${searchRes.status}`)
  }

  const searchData = await searchRes.json()
  const pmids: string[] = searchData?.esearchresult?.idlist || []

  if (pmids.length === 0) {
    return []
  }

  // Rate limit: API key 없으면 500ms 대기
  if (!apiKey) {
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // Step 2: efetch — 상세 메타데이터 (XML)
  const fetchParams = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    rettype: 'abstract',
    retmode: 'xml',
    tool: 'DentalBlog',
    email: 'dental-blog@app.local',
  })
  if (apiKey) fetchParams.set('api_key', apiKey)

  const fetchUrl = `${PUBMED_BASE}/efetch.fcgi?${fetchParams.toString()}`
  const fetchRes = await fetch(fetchUrl)

  if (!fetchRes.ok) {
    throw new Error(`PubMed efetch failed: ${fetchRes.status}`)
  }

  const xml = await fetchRes.text()
  return parsePubMedXML(xml)
}

// ── XML 파싱 (regex 기반) ──

function parsePubMedXML(xml: string): PaperCitation[] {
  const papers: PaperCitation[] = []

  // <PubmedArticle> 블록 분리
  const articleBlocks = xml.split('<PubmedArticle>')

  for (let i = 1; i < articleBlocks.length; i++) {
    const block = articleBlocks[i]

    // PMID
    const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)
    const pmid = pmidMatch ? pmidMatch[1] : ''

    // Title
    const titleMatch = block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)
    let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    // Authors (최대 3명 + et al.)
    const authorMatches: string[] = []
    const authorRegex = /<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>[\s\S]*?<Initials>([\s\S]*?)<\/Initials>[\s\S]*?<\/Author>/g
    let authorMatch
    while ((authorMatch = authorRegex.exec(block)) !== null) {
      authorMatches.push(`${authorMatch[1].trim()} ${authorMatch[2].trim()}`)
      if (authorMatches.length >= 3) break
    }
    let authors = authorMatches.join(', ')
    // 3명 초과 시 et al.
    const totalAuthors = (block.match(/<Author[^>]*>/g) || []).length
    if (totalAuthors > 3) {
      authors += ', et al.'
    }

    // Journal
    const journalMatch = block.match(/<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/)
    const journal = journalMatch ? journalMatch[1].trim() : ''

    // Year
    const yearMatch = block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)
    const year = yearMatch ? parseInt(yearMatch[1], 10) : 0

    // DOI
    const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/)
    const doi = doiMatch ? doiMatch[1].trim() : undefined

    // Abstract
    const abstractMatch = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/)
    let abstract = abstractMatch ? abstractMatch[1].replace(/<[^>]+>/g, '').trim() : undefined
    if (abstract && abstract.length > 300) {
      abstract = abstract.substring(0, 300) + '...'
    }

    if (pmid && title && year) {
      papers.push({ pmid, title, authors, journal, year, doi, abstract })
    }
  }

  return papers
}
