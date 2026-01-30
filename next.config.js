/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Vercel 배포 시 자동으로 NEXTAUTH_URL 설정
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  },
}

module.exports = nextConfig
