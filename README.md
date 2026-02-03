# 🦷 치과 블로그 글 작성기

의료광고법 100% 준수 + 네이버 SEO 최적화 치과 블로그 글 자동 작성 웹앱

## 기능

- ✍️ **AI 글 생성**: Claude API를 활용한 블로그 글 자동 작성
- ✅ **의료광고법 준수**: 금지어 자동 필터링, 부작용 고지 자동 삽입
- 🔍 **네이버 SEO 최적화**: 스마트블록 대응, 키워드 배치 최적화
- 📋 **히스토리 관리**: 생성된 글 저장 및 재사용
- 🏥 **치과 프로필**: 여러 치과 정보 관리

## 기술 스택

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **AI**: Claude API
- **Auth**: NextAuth.js
- **DB**: Google Sheets API
- **Deploy**: Vercel

## 설치 및 실행

### 1. 의존성 설치

\`\`\`bash
cd dental-blog-app
npm install
\`\`\`

### 2. 환경변수 설정

\`.env.example\`을 \`.env.local\`로 복사하고 값을 입력하세요:

\`\`\`bash
cp .env.example .env.local
\`\`\`

\`\`\`env
# NextAuth
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000

# 허용 사용자 (이메일:비밀번호)
ALLOWED_USERS=admin@example.com:password123

# Claude API
ANTHROPIC_API_KEY=your-api-key

# Google Sheets
GOOGLE_SHEETS_ID=your-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
\`\`\`

### 3. Google Sheets 설정

1. [Google Cloud Console](https://console.cloud.google.com)에서 프로젝트 생성
2. Google Sheets API 활성화
3. 서비스 계정 생성 및 JSON 키 다운로드
4. 새 Google Sheets 생성 후 다음 시트 추가:
   - \`clinics\` (A1에 헤더: id, name, region, doctorName, createdAt)
   - \`posts\` (A1에 헤더: id, clinicId, topic, patientInfo, treatment, title, content, metadata, createdAt)
5. 서비스 계정 이메일에 편집 권한 부여

### 4. 개발 서버 실행

\`\`\`bash
npm run dev
\`\`\`

http://localhost:3000 에서 확인

## Vercel 배포

### 1. GitHub에 코드 푸시

\`\`\`bash
git init
git add .
git commit -m "Initial commit"
git remote add origin your-repo-url
git push -u origin main
\`\`\`

### 2. Vercel 연동

1. [Vercel](https://vercel.com)에서 GitHub 저장소 연결
2. 환경변수 설정 (Settings > Environment Variables)
3. Deploy 클릭

### 환경변수 (Vercel)

| 변수명 | 설명 |
|--------|------|
| \`NEXTAUTH_SECRET\` | 랜덤 문자열 (32자 이상) |
| \`NEXTAUTH_URL\` | 배포된 URL (예: https://your-app.vercel.app) |
| \`ALLOWED_USERS\` | 허용 사용자 목록 (email:password,email:password) |
| \`ANTHROPIC_API_KEY\` | Claude API 키 |
| \`GOOGLE_SHEETS_ID\` | Google Sheets ID |
| \`GOOGLE_SERVICE_ACCOUNT_EMAIL\` | 서비스 계정 이메일 |
| \`GOOGLE_PRIVATE_KEY\` | 서비스 계정 비공개 키 |

## 사용 방법

1. 로그인 (환경변수에 설정한 계정 사용)
2. 치과 정보 입력 (치과명, 지역, 원장님 이름)
3. 글 정보 입력 (주제, 환자 정보, 치료 내용)
4. "글 생성하기" 클릭
5. 생성된 글 확인 및 복사

## 라이선스

MIT
