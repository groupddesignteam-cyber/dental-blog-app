import NextAuth, { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // 환경변수에서 허용된 사용자 목록 가져오기
        const allowedUsers = process.env.ALLOWED_USERS || ''
        const users = allowedUsers.split(',').map((user) => {
          const [email, password] = user.trim().split(':')
          return { email, password }
        })

        // 사용자 확인
        const user = users.find(
          (u) =>
            u.email === credentials.email && u.password === credentials.password
        )

        if (user) {
          return {
            id: user.email,
            email: user.email,
            name: user.email.split('@')[0],
          }
        }

        return null
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
