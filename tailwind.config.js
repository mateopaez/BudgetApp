/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F4EF',
        surface: {
          DEFAULT: '#FFFFFF',
          raised: '#FFFCF7',
          muted: '#F1EDE6',
        },
        ink: {
          DEFAULT: '#14211F',
          muted: '#66736F',
          soft: '#8A9791',
        },
        line: '#DED8CE',
        action: {
          DEFAULT: '#0F766E',
          hover: '#115E59',
          soft: '#CCFBF1',
        },
        finance: {
          income: '#15803D',
          incomeSoft: '#DCFCE7',
          expense: '#B42318',
          expenseSoft: '#FEE4E2',
          saving: '#0369A1',
          savingSoft: '#E0F2FE',
          warning: '#B45309',
          warningSoft: '#FEF3C7',
        },
      },
      boxShadow: {
        panel: '0 8px 30px rgb(20 33 31 / 0.06)',
        floating: '0 18px 56px rgb(20 33 31 / 0.14)',
        card: '0 8px 30px rgb(20 33 31 / 0.06)',
        'card-hover': '0 14px 42px rgb(20 33 31 / 0.1)',
      },
      borderRadius: {
        panel: '1.5rem',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
