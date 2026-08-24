/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F4EF',
        surface: '#FFFFFF',
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
        // Back-compat while feature templates are migrated.
        brand: {
          50: '#ECFDF5',
          100: '#CCFBF1',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0F766E',
          700: '#115E59',
          800: '#134E4A',
          900: '#14211F',
          950: '#0B1715',
        },
        midnight: {
          DEFAULT: '#14211F',
          50: '#F7F4EF',
          100: '#EFE8DC',
          200: '#DED8CE',
          800: '#25312F',
          900: '#14211F',
          950: '#0B1715',
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
