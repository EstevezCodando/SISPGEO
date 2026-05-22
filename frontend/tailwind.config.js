/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        army: {
          50: '#f0f4f8',
          100: '#d9e3ed',
          500: '#3a6186',
          700: '#1a3a5c',
          900: '#0d1f33',
        },
      },
    },
  },
  plugins: [],
}
