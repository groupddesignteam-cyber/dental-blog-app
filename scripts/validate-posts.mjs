// 후처리 파이프라인 검증 스크립트 (standalone, no TS imports)
import { readFileSync } from 'fs'

// ============================================================
// 동의어 사전 (data/synonyms.ts 복사)
// ============================================================
const SYNONYM_DICTIONARY = {
  '치아': ['이', '자연치', '영구치', '치'],
  '어금니': ['구치', '대구치', '구치부', '어금니 부위'],
  '앞니': ['전치', '절치', '전치부', '앞니 부위'],
  '잇몸': ['치은', '치주 조직', '잇몸 조직'],
  '치아 뿌리': ['치근', '근단부', '뿌리 부위'],
  '사랑니': ['제3대구치', '지치', '매복치'],
  '치료': ['시술', '처치', '진료', '치료 과정'],
  '신경치료': ['근관치료', '근관 처치', '신경 처치'],
  '수복': ['복원', '회복', '재건'],
  '통증': ['아픔', '불편감', '동통', '압통'],
  '염증': ['감염', '발적', '염증 반응'],
  '증상': ['양상', '소견', '징후'],
  '손상': ['파손', '결손', '파절', '마모'],
  '경우': ['상황', '케이스', '사례'],
  '부위': ['영역', '부분', '해당 위치'],
  '검사': ['검진', '진단', '평가', '확인'],
  '관리': ['유지', '케어', '사후 관리'],
  '중요': ['핵심적', '필수적', '주요한'],
  '필요': ['권장되는', '요구되는', '고려되는'],
}

// ============================================================
// 섹션 파싱
// ============================================================
function parseSections(content) {
  const lines = content.split('\n')
  let title = ''
  let introLines = []
  let bodyLines = []
  let conclusionLines = []
  let hashtagLines = []
  let disclaimerLines = []
  let phase = 'title'
  let foundFirstSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (phase === 'title') {
      if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
        title = trimmed.replace(/^#\s+/, '')
        phase = 'intro'
        continue
      }
      if (trimmed.length > 0) { title = trimmed; phase = 'intro'; continue }
      continue
    }

    if (trimmed.match(/^#[^\s#]+(\s+#[^\s#]+){2,}/)) {
      hashtagLines.push(line); phase = 'post'; continue
    }
    if (trimmed.startsWith('※')) { disclaimerLines.push(line); phase = 'post'; continue }
    if (phase === 'post') {
      if (trimmed.startsWith('#') && !trimmed.startsWith('## ')) hashtagLines.push(line)
      else if (trimmed.startsWith('※')) disclaimerLines.push(line)
      continue
    }

    if (trimmed.match(/^##\s*(마무리|결론|정리)/)) {
      phase = 'conclusion'; conclusionLines.push(line); continue
    }
    if (phase === 'conclusion') {
      if (trimmed === '---' && conclusionLines.length > 2) {
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0)
        if (nextNonEmpty && (nextNonEmpty.trim().startsWith('#') || nextNonEmpty.trim().startsWith('※'))) {
          phase = 'post'; continue
        }
      }
      conclusionLines.push(line); continue
    }

    if (phase === 'intro') {
      if (trimmed.startsWith('## ') || trimmed.startsWith('Q.') || (trimmed === '---' && !foundFirstSection && introLines.length > 2)) {
        phase = 'body'; foundFirstSection = true; bodyLines.push(line); continue
      }
      introLines.push(line); continue
    }
    if (phase === 'body') { bodyLines.push(line); continue }
  }

  // fallback: 결론 없으면 본론 끝에서 추출
  if (conclusionLines.length === 0 && bodyLines.length > 0) {
    let lastIdx = -1
    for (let k = bodyLines.length - 1; k >= 0; k--) {
      if (bodyLines[k].includes('이었습니다') || bodyLines[k].includes('감사합니다') || bodyLines[k].includes('권장합니다')) {
        lastIdx = k; break
      }
    }
    if (lastIdx > bodyLines.length * 0.7) {
      let cutStart = lastIdx
      for (let j = lastIdx - 1; j >= 0; j--) {
        if (bodyLines[j].trim().startsWith('## ')) { cutStart = j; break }
      }
      conclusionLines = bodyLines.splice(cutStart)
    }
  }

  return { title, intro: introLines.join('\n'), body: bodyLines.join('\n'), conclusion: conclusionLines.join('\n'), hashtags: hashtagLines.join('\n'), disclaimer: disclaimerLines.join('\n') }
}

function pureCharCount(text) {
  return text
    .replace(/📷\s*\[이미지[^\]]*\]/g, '')
    .replace(/\(출처:[^)]*\)/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__/g, '')
    .replace(/\*|_/g, '')
    .replace(/---+/g, '')
    .replace(/\s/g, '')
    .length
}

// ============================================================
// 검증 함수들
// ============================================================

function validateSectionChars(sections) {
  const intro = pureCharCount(sections.intro)
  const body = pureCharCount(sections.body)
  const conclusion = pureCharCount(sections.conclusion)
  const warnings = []

  if (intro < 200) warnings.push(`📏 서론 글자수 부족: ${intro}자 (권장 350~650)`)
  else if (intro > 800) warnings.push(`📏 서론 글자수 초과: ${intro}자 (권장 350~650)`)

  if (body < 1000) warnings.push(`📏 본론 글자수 부족: ${body}자 (권장 1200~1800)`)
  else if (body > 2200) warnings.push(`📏 본론 글자수 초과: ${body}자 (권장 1200~1800)`)

  if (conclusion < 150) warnings.push(`📏 결론 글자수 부족: ${conclusion}자 (권장 250~650)`)
  else if (conclusion > 800) warnings.push(`📏 결론 글자수 초과: ${conclusion}자 (권장 250~650)`)

  return { intro, body, conclusion, total: intro + body + conclusion, warnings }
}

function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function analyzeKeywordFrequency(content, sections, mainKeyword, subKeywords) {
  const warnings = []
  const mainRegex = new RegExp(escapeRegex(mainKeyword), 'g')
  const mainCount = (content.match(mainRegex) || []).length
  const titleCount = (sections.title.match(mainRegex) || []).length
  const introCount = (sections.intro.match(mainRegex) || []).length
  const bodyCount = (sections.body.match(mainRegex) || []).length
  const conclusionCount = (sections.conclusion.match(mainRegex) || []).length

  if (mainCount < 5) warnings.push(`🔑 메인키워드 "${mainKeyword}" 빈도 부족: ${mainCount}회 (권장 7~8회)`)
  else if (mainCount > 10) warnings.push(`🔑 메인키워드 "${mainKeyword}" 과다: ${mainCount}회 (권장 7~8회)`)

  if (titleCount < 1) warnings.push(`🔑 메인키워드 제목 배치 누락`)
  if (introCount < 1) warnings.push(`🔑 메인키워드 서론 배치 누락`)
  if (bodyCount < 3) warnings.push(`🔑 메인키워드 본론 배치 부족 (현재 ${bodyCount}회, 권장 4회)`)
  if (conclusionCount < 1) warnings.push(`🔑 메인키워드 결론 배치 누락`)

  const subCounts = {}
  for (const sub of subKeywords) {
    if (!sub) continue
    const subRegex = new RegExp(escapeRegex(sub), 'g')
    subCounts[sub] = (content.match(subRegex) || []).length
    if (subCounts[sub] > 8) warnings.push(`🔑 서브키워드 "${sub}" 과다: ${subCounts[sub]}회`)
  }

  return { mainKeyword, mainCount, subCounts, placement: { title: titleCount, intro: introCount, body: bodyCount, conclusion: conclusionCount }, warnings }
}

function validateWritingStyle(content, mode) {
  const warnings = []
  const sentences = content.split(/[.!?]\s|\n/).filter(s => s.trim().length > 5)

  const formalP = /(?:입니다|됩니다|있습니다|바랍니다|하였습니다|습니다|겠습니다|드립니다)[\s.\n]*$/
  const casualP = /(?:하죠|이죠|지죠|같죠|시죠|인데요|군요)[\s.\n]*$/
  const forbiddenP = /(?:해요|거든요|있어요|드려요|할게요|볼게요|줄게요)[\s.\n]*$/

  let formal = 0, casual = 0, forbidden = 0
  for (const s of sentences) {
    const t = s.trim()
    if (formalP.test(t)) formal++
    if (casualP.test(t)) casual++
    if (forbiddenP.test(t)) forbidden++
  }

  const total = formal + casual + forbidden || 1
  const formalPct = Math.round((formal / total) * 100)
  const casualPct = Math.round((casual / total) * 100)

  // 비유 카운트
  const metaphorPats = [/마치\s+.{2,20}처럼/g, /비유하자면/g, /유사합니다/g, /비슷한\s*(원리|것)/g, /쉽게\s*(말하면|표현하면|비유하면)/g]
  let metaphorCount = 0
  for (const p of metaphorPats) { const m = content.match(p); if (m) metaphorCount += m.length }

  // 임상 표현 카운트
  const clinicalPats = [/관찰됩니다/g, /확인됩니다/g, /시사하는/g, /소견/g, /양상/g, /진행된/g, /임상\s*사진/g]
  let clinicalCount = 0
  for (const p of clinicalPats) { const m = content.match(p); if (m) clinicalCount += m.length }

  if (mode === 'expert') {
    if (formalPct < 80) warnings.push(`🏥 임상모드 문어체 부족: ${formalPct}% (권장 90%+)`)
    if (casualPct > 15) warnings.push(`🏥 임상모드 구어체 과다: ${casualPct}%`)
    if (clinicalCount < 3) warnings.push(`🏥 임상 소견 표현 부족: ${clinicalCount}개 (권장 3+)`)
  } else if (mode === 'informative') {
    if (metaphorCount < 2) warnings.push(`📚 정보성 비유 부족: ${metaphorCount}개 (권장 3+)`)
    if (casualPct < 5 && formalPct > 95) warnings.push(`📚 정보성 톤 경직: ~하죠 비율 ${casualPct}%`)
  }

  if (forbidden > 0) warnings.push(`🚫 금지 어미 발견: ${forbidden}건`)

  return { mode, warnings, stats: { formalEndingPct: formalPct, casualEndingPct: casualPct, metaphorCount, clinicalPhraseCount: clinicalCount } }
}

function validateImageAlt(content) {
  const placeholders = content.match(/📷\s*\[이미지[^\]]*\]/g) || []
  const total = placeholders.length
  let withAlt = 0
  const withoutAlt = []
  for (const p of placeholders) {
    const m = p.match(/이미지\s*위치:\s*(.+?)\]/)
    if (m && m[1].trim().length >= 10) withAlt++
    else withoutAlt.push(p.substring(0, 50))
  }
  const warnings = []
  if (withoutAlt.length > 0) warnings.push(`🖼️ 이미지 설명 부족: ${withoutAlt.length}/${total}개`)
  return { total, withAlt, withoutAlt, warnings }
}

function checkSynonymNeeds(content, clinicName, region) {
  const excludeWords = [clinicName, region].filter(Boolean)
  const results = []
  for (const [word, synonyms] of Object.entries(SYNONYM_DICTIONARY)) {
    if (excludeWords.some(ex => ex.includes(word) || word.includes(ex))) continue
    const regex = new RegExp(escapeRegex(word), 'g')
    const matches = content.match(regex)
    if (matches && matches.length > 2) {
      results.push(`"${word}" ${matches.length}회 → 3회째부터 동의어 교체 대상 (${synonyms.slice(0, 2).join(', ')})`)
    }
  }
  return results
}

function validateTopicReflection(content, topic, treatment) {
  const warnings = []
  const words = topic.split(/[,\s/]+/).filter(w => w.length >= 2)
  for (const w of words) {
    if (!content.includes(w)) warnings.push(`📋 주제 키워드 "${w}" 미반영`)
  }
  if (treatment) {
    const tw = treatment.split(/[,\s/]+/).filter(w => w.length >= 2)
    if (tw.length > 0 && !tw.some(w => content.includes(w))) {
      warnings.push(`📋 치료 키워드 미반영: ${tw.join(', ')}`)
    }
  }
  return warnings
}

// ============================================================
// 메인
// ============================================================

const BASE = 'z:\\3. 바이럴팀\\6. 임상케이스\\G036_치과명작치과\\260205_치경부마모증 레진 수복'

const configs = [
  { file: `${BASE}\\v2_임상.txt`, mode: 'expert', label: '🏥 임상 포스팅' },
  { file: `${BASE}\\v2_정보성.txt`, mode: 'informative', label: '📚 정보성 포스팅' },
]

const mainKeyword = '원주 치경부마모증'
const subKeywords = ['레진 수복', '이차 우식', '간접치수복조', '치은 압배', '칫솔질 습관']

for (const cfg of configs) {
  console.log('\n' + '='.repeat(60))
  console.log(`  ${cfg.label}`)
  console.log('='.repeat(60))

  const content = readFileSync(cfg.file, 'utf-8')
  const sections = parseSections(content)

  // 1. 섹션 글자수
  const charResult = validateSectionChars(sections)
  console.log(`\n📏 섹션 글자수:`)
  console.log(`   서론: ${charResult.intro}자 | 본론: ${charResult.body}자 | 결론: ${charResult.conclusion}자 | 합계: ${charResult.total}자`)
  if (charResult.warnings.length > 0) charResult.warnings.forEach(w => console.log(`   ⚠️ ${w}`))
  else console.log(`   ✅ 섹션 글자수 적정`)

  // 2. 키워드 분석
  const kwResult = analyzeKeywordFrequency(content, sections, mainKeyword, subKeywords)
  console.log(`\n🔑 키워드 분석:`)
  console.log(`   메인 "${mainKeyword}": 총 ${kwResult.mainCount}회`)
  console.log(`   배치: 제목${kwResult.placement.title} / 서론${kwResult.placement.intro} / 본론${kwResult.placement.body} / 결론${kwResult.placement.conclusion}`)
  console.log(`   서브키워드:`)
  for (const [k, v] of Object.entries(kwResult.subCounts)) {
    console.log(`     - "${k}": ${v}회`)
  }
  if (kwResult.warnings.length > 0) kwResult.warnings.forEach(w => console.log(`   ⚠️ ${w}`))
  else console.log(`   ✅ 키워드 배치 적정`)

  // 3. 스타일 검증
  const styleResult = validateWritingStyle(content, cfg.mode)
  console.log(`\n✍️ 스타일 검증 (${cfg.mode}):`)
  console.log(`   문어체: ${styleResult.stats.formalEndingPct}% | 구어체: ${styleResult.stats.casualEndingPct}%`)
  console.log(`   비유: ${styleResult.stats.metaphorCount}개 | 임상소견: ${styleResult.stats.clinicalPhraseCount}개`)
  if (styleResult.warnings.length > 0) styleResult.warnings.forEach(w => console.log(`   ⚠️ ${w}`))
  else console.log(`   ✅ 스타일 적정`)

  // 4. 이미지 alt 검증
  const imgResult = validateImageAlt(content)
  console.log(`\n🖼️ 이미지 검증:`)
  console.log(`   전체: ${imgResult.total}개 | alt 텍스트 포함: ${imgResult.withAlt}개`)
  if (imgResult.warnings.length > 0) imgResult.warnings.forEach(w => console.log(`   ⚠️ ${w}`))
  else console.log(`   ✅ 이미지 alt 텍스트 적정`)

  // 5. 동의어 치환 대상
  const synResults = checkSynonymNeeds(content, '명작치과', '원주')
  console.log(`\n🔄 동의어 치환 대상:`)
  if (synResults.length > 0) synResults.forEach(r => console.log(`   - ${r}`))
  else console.log(`   ✅ 반복 단어 없음 (모두 2회 이하)`)

  // 6. 주제 반영
  const topicWarnings = validateTopicReflection(content, '치경부마모증 레진 수복', '레진 수복')
  console.log(`\n📋 주제 반영 검증:`)
  if (topicWarnings.length > 0) topicWarnings.forEach(w => console.log(`   ⚠️ ${w}`))
  else console.log(`   ✅ 주제 키워드 모두 반영`)
}

console.log('\n' + '='.repeat(60))
console.log('  비교 완료')
console.log('='.repeat(60))
