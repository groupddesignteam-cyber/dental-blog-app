import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0fbf5',
          100: '#dcf7e3',
          200: '#b9ecc7',
          300: '#86db9e',
          400: '#4ec273',
          500: '#03C75A', // Naver Brand Green
          600: '#02a348',
          700: '#06813b',
          800: '#0b6632',
          900: '#0c532d',
        },
      },
    },
  },
  plugins: [],
}

export default config
