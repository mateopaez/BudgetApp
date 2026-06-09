/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        midnight: {
          DEFAULT: '#1a0b2e',
          50: '#f8f7fc',
          100: '#f0edf8',
          200: '#e2ddf0',
          800: '#2d1b4e',
          900: '#1a0b2e',
          950: '#0f0619',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(26 11 46 / 0.06), 0 1px 2px -1px rgb(26 11 46 / 0.06)',
        'card-hover': '0 4px 12px 0 rgb(26 11 46 / 0.1)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
