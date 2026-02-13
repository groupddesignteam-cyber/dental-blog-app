/**
 * PubMed E-utilities 클라이언트
 * - 한국어 치과 키워드 → 영문 PubMed 쿼리 변환
 * - esearch (검색) + efetch (상세) 2단계
 * - regex 기반 XML 파싱 (외부 라이브러리 없음)
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

// ── 한→영 치과 키워드 매핑 ──

const DENTAL_KEYWORD_MAP: Record<string, string> = {
  '임플란트': 'dental implant',
  '신경치료': 'root canal treatment endodontics',
  '충치': 'dental caries',
  '사랑니': 'wisdom tooth third molar',
  '치아교정': 'orthodontic treatment',
  '교정': 'orthodontic treatment',
  '스케일링': 'dental scaling periodontal',
  '치주치료': 'periodontal treatment',
  '치주': 'periodontal',
  '보철': 'dental prosthesis crown',
  '라미네이트': 'dental veneer laminate',
  '치아미백': 'tooth whitening bleaching',
  '미백': 'tooth whitening bleaching',
  '소아치과': 'pediatric dentistry',
  '발치': 'tooth extraction',
  '잇몸치료': 'gingival treatment periodontitis',
  '잇몸': 'gingival periodontal',
  '턱관절': 'temporomandibular joint TMJ',
  '골이식': 'bone graft dental',
  '상악동거상술': 'sinus lift augmentation',
  '치아크랙': 'cracked tooth fracture',
  '크랙': 'cracked tooth fracture',
  '지르코니아': 'zirconia dental ceramic',
  '브릿지': 'dental bridge fixed partial denture',
  '틀니': 'denture removable prosthesis',
  '레진': 'composite resin restoration',
  '뼈이식': 'bone graft dental',
  '치아': 'dental tooth',
  '어금니': 'molar tooth',
}

const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

// ── 키워드 변환 ──

function translateKeyword(koreanTopic: string): string {
  // 정확히 매칭되는 키워드 찾기
  for (const [kr, en] of Object.entries(DENTAL_KEYWORD_MAP)) {
    if (koreanTopic.includes(kr)) {
      return en
    }
  }
  // 매칭 안되면 원본 그대로 (PubMed가 일부 한국어 인덱싱)
  return koreanTopic
}

// ── PubMed 검색 ──

export async function searchPubMed(
  topic: string,
  limit: number = 5
): Promise<PaperCitation[]> {
  const englishTerm = translateKeyword(topic)
  const query = `(${englishTerm}[TIAB]) AND dental[MeSH] AND ("last 10 years"[PDat])`

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
