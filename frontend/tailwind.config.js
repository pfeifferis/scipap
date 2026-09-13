/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#36abf7',
          500: '#0c8fe9',
          600: '#0271c7',
          700: '#035aa1',
          800: '#074c84',
          900: '#0c406e',
          950: '#082949',
        },
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { 
            boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.9), 0 0 20px 4px rgba(245, 158, 11, 0.45)',
            backgroundColor: 'rgba(251, 191, 36, 0.35)'
          },
          '50%': { 
            boxShadow: '0 0 0 4px rgba(245, 158, 11, 1), 0 0 35px 8px rgba(245, 158, 11, 0.7)',
            backgroundColor: 'rgba(251, 191, 36, 0.55)'
          },
        }
      },
      animation: {
        'highlight-pulse': 'glowPulse 1.8s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
