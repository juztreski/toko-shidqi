/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#d9701a',
          50: '#fef3e7',
          100: '#fde8d0',
          200: '#fad1a3',
          300: '#f6b06b',
          400: '#f18d3a',
          500: '#d9701a',
          600: '#c45d15',
          700: '#a04613',
          800: '#813915',
          900: '#693013',
        },
        cream: {
          50: '#fdfbf7',
          100: '#faf5eb',
          200: '#f3e9d6',
          300: '#e9d8b5',
          400: '#dfc48a',
          500: '#d2ab5e',
          600: '#c29245',
          700: '#a27336',
          800: '#845d30',
          900: '#6d4c2a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}