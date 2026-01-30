import { google } from 'googleapis'
import { Clinic, Post } from '@/types'

// Google Sheets API 인증
function getAuth() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return auth
}

function getSheets() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID

// ============================================
// Clinics (치과 프로필)
// ============================================

export async function getClinics(): Promise<Clinic[]> {
  try {
    const sheets = getSheets()
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'clinics!A2:E',
    })

    const rows = response.data.values || []
    return rows.map((row) => ({
      id: row[0] || '',
      name: row[1] || '',
      region: row[2] || '',
      doctorName: row[3] || '',
      createdAt: row[4] || '',
    }))
  } catch (error) {
    console.error('Failed to get clinics:', error)
    return []
  }
}

export async function addClinic(clinic: Omit<Clinic, 'id' | 'createdAt'>): Promise<Clinic | null> {
  try {
    const sheets = getSheets()
    const id = Date.now().toString()
    const createdAt = new Date().toISOString()

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'clinics!A:E',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[id, clinic.name, clinic.region, clinic.doctorName, createdAt]],
      },
    })

    return {
      id,
      ...clinic,
      createdAt,
    }
  } catch (error) {
    console.error('Failed to add clinic:', error)
    return null
  }
}

export async function deleteClinic(id: string): Promise<boolean> {
  try {
    const sheets = getSheets()

    // 먼저 해당 ID의 행 번호 찾기
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'clinics!A:A',
    })

    const rows = response.data.values || []
    const rowIndex = rows.findIndex((row) => row[0] === id)

    if (rowIndex === -1) return false

    // 행 삭제
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0, // clinics 시트의 ID (기본 0)
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1,
              },
            },
          },
        ],
      },
    })

    return true
  } catch (error) {
    console.error('Failed to delete clinic:', error)
    return false
  }
}

// ============================================
// Posts (생성된 글)
// ============================================

export async function getPosts(): Promise<Post[]> {
  try {
    const sheets = getSheets()
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'posts!A2:I',
    })

    const rows = response.data.values || []
    return rows.map((row) => ({
      id: row[0] || '',
      clinicId: row[1] || '',
      topic: row[2] || '',
      patientInfo: row[3] || '',
      treatment: row[4] || '',
      title: row[5] || '',
      content: row[6] || '',
      metadata: row[7] ? JSON.parse(row[7]) : {},
      createdAt: row[8] || '',
    })).reverse() // 최신순
  } catch (error) {
    console.error('Failed to get posts:', error)
    return []
  }
}

export async function addPost(post: Omit<Post, 'id' | 'createdAt'>): Promise<Post | null> {
  try {
    const sheets = getSheets()
    const id = Date.now().toString()
    const createdAt = new Date().toISOString()

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'posts!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            id,
            post.clinicId,
            post.topic,
            post.patientInfo,
            post.treatment,
            post.title,
            post.content,
            JSON.stringify(post.metadata),
            createdAt,
          ],
        ],
      },
    })

    return {
      id,
      ...post,
      createdAt,
    }
  } catch (error) {
    console.error('Failed to add post:', error)
    return null
  }
}

// ============================================
// 시트 초기화 (헤더 생성)
// ============================================

export async function initializeSheets(): Promise<void> {
  try {
    const sheets = getSheets()

    // clinics 시트 헤더
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'clinics!A1:E1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['id', 'name', 'region', 'doctorName', 'createdAt']],
      },
    })

    // posts 시트 헤더
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: 'posts!A1:I1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            'id',
            'clinicId',
            'topic',
            'patientInfo',
            'treatment',
            'title',
            'content',
            'metadata',
            'createdAt',
          ],
        ],
      },
    })

    console.log('Sheets initialized successfully')
  } catch (error) {
    console.error('Failed to initialize sheets:', error)
  }
}
