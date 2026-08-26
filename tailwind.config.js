/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#050505',
        surface: {
          DEFAULT: '#0D0D0D',
          card: '#121212',
          hover: '#171717',
          active: '#222222',
          border: '#262626',
        },
        yellow: {
          DEFAULT: '#FFD600',
          hover: '#FFE033',
          muted: 'rgba(255, 214, 0, 0.15)',
          glow: 'rgba(255, 214, 0, 0.3)',
        },
        primary: {
          DEFAULT: '#FFD600',
          foreground: '#050505',
        },
        brand: {
          black: '#050505',
          charcoal: '#0D0D0D',
          yellow: '#FFD600',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'yellow-glow': '0 0 25px -5px rgba(255, 214, 0, 0.25)',
        'yellow-sm': '0 0 10px rgba(255, 214, 0, 0.2)',
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};
