/**
 * 줄바꿈 포맷터 (44 byte per line)
 * EUC-KR 기준: 한글 = 2byte, ASCII = 1byte
 * 44 bytes = 한글 약 22자 / 영문+숫자 약 44자
 */

// 문자의 EUC-KR 바이트 수 계산 (근사)
function getCharByteLength(char: string): number {
  const code = char.charCodeAt(0)
  // 한글 범위 (가-힣) = 2 bytes
  if (code >= 0xAC00 && code <= 0xD7AF) return 2
  // 한글 자모 (ㄱ-ㅎ, ㅏ-ㅣ) = 2 bytes
  if (code >= 0x3130 && code <= 0x318F) return 2
  // 한자 = 2 bytes
  if (code >= 0x4E00 && code <= 0x9FFF) return 2
  // 전각 문자 = 2 bytes
  if (code >= 0xFF01 && code <= 0xFF60) return 2
  // 이모지/특수문자 (BMP 밖) = 2 bytes
  if (code > 0x7F) return 2
  // ASCII = 1 byte
  return 1
}

// 문자열의 EUC-KR 바이트 길이 계산
export function getByteLength(str: string): number {
  let bytes = 0
  for (const char of str) {
    bytes += getCharByteLength(char)
  }
  return bytes
}

// 44 byte 기준으로 줄바꿈 삽입
export function formatLineBreaks(content: string, maxBytes: number = 44): string {
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // 줄바꿈 대상에서 제외하는 줄들
    if (
      trimmed === '' ||
      trimmed.startsWith('#') ||       // 마크다운 헤더
      trimmed.startsWith('---') ||     // 구분선
      trimmed.startsWith('※') ||       // 부작용 고지
      trimmed.startsWith('📷') ||      // 이미지 플레이스홀더
      trimmed.startsWith('Q.') ||      // Q&A 블록
      trimmed.startsWith('A.') ||      // Q&A 블록
      trimmed.startsWith('(출처:') ||  // 출처 표기
      /^#[^\s#]/.test(trimmed)         // 해시태그
    ) {
      result.push(line)
      continue
    }

    // 이미 maxBytes 이하인 줄은 그대로
    if (getByteLength(trimmed) <= maxBytes) {
      result.push(line)
      continue
    }

    // 긴 줄: 단어/문자 단위로 분할
    let currentLine = ''
    let currentBytes = 0

    // 띄어쓰기 기준으로 먼저 분리 시도
    const words = trimmed.split(/(\s+)/)

    for (const word of words) {
      const wordBytes = getByteLength(word)

      if (currentBytes + wordBytes > maxBytes && currentLine.length > 0) {
        // 현재 줄 저장
        result.push(currentLine.trimEnd())
        currentLine = word.trimStart()
        currentBytes = getByteLength(currentLine)
      } else {
        currentLine += word
        currentBytes += wordBytes
      }
    }

    // 마지막 줄 저장
    if (currentLine.trim()) {
      result.push(currentLine.trimEnd())
    }
  }

  return result.join('\n')
}
