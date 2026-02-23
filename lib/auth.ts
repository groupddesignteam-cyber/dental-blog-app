import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { createHash } from 'crypto'

const fallbackSecret = createHash('sha256')
  .update(process.env.NEXTAUTH_URL ?? 'https://dental-blog.vercel.app')
  .update('fallback-next-auth-secret')
  .digest('hex')

const fallbackAllowedUsers = 'blog:123456'

function parseAllowedUsers(raw: string): { email: string; password: string }[] {
  return raw
    .split(/[\n,]+/)
    .map((user) => user.trim())
    .filter(Boolean)
    .map((user) => {
      const separatorIndex = user.indexOf(':')
      if (separatorIndex < 0) {
        return null
      }

      const email = user.slice(0, separatorIndex).trim()
      const password = user.slice(separatorIndex + 1).trim()
      if (!email || !password) {
        return null
      }

      return { email, password }
    })
    .filter((user): user is { email: string; password: string } => user !== null)
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET ?? fallbackSecret,
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

        const allowedUsersRaw = process.env.ALLOWED_USERS?.trim() || fallbackAllowedUsers
        const users = parseAllowedUsers(allowedUsersRaw)
        const email = credentials.email.trim()
        const password = credentials.password

        const user = users.find((u) => u.email === email && u.password === password)

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
