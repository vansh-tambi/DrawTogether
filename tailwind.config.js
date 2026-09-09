/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './client/index.html',
    './client/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Space Grotesk', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#F9F9F8',
        ink: '#1F1B2E',
        studio: {
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#5B4FE9',
          700: '#4C3DD8',
          800: '#3D2EB7',
          900: '#2F2196',
        },
      },
      boxShadow: {
        'glass': '0 20px 50px -10px rgba(0,0,0,0.08), 0 10px 20px -5px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
        'glass-hover': '0 25px 60px -10px rgba(0,0,0,0.12), 0 12px 24px -5px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
        'glass-sm': '0 8px 24px -4px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)',
      },
    },
  },
  plugins: [],
};
