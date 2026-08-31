/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Source Serif 4"', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#F3F4F6',
        surface: {
          DEFAULT: '#FFFFFF',
          raised: '#FAFBFC',
          muted: '#EBEDF0',
        },
        ink: {
          DEFAULT: '#14161C',
          muted: '#5C6570',
          soft: '#8B939E',
        },
        line: '#D8DCE2',
        action: {
          DEFAULT: '#1B4D3E',
          hover: '#143D31',
          soft: '#E4F0EB',
        },
        finance: {
          income: '#1B6B3A',
          incomeSoft: '#E6F4EC',
          expense: '#A32D2D',
          expenseSoft: '#F8E8E8',
          saving: '#1E4D7B',
          savingSoft: '#E5EEF6',
          warning: '#9A6700',
          warningSoft: '#F7F0DE',
        },
      },
      boxShadow: {
        panel: '0 1px 2px rgb(20 22 28 / 0.04)',
        floating: '0 12px 40px rgb(20 22 28 / 0.12)',
        card: '0 1px 2px rgb(20 22 28 / 0.04)',
        'card-hover': '0 4px 16px rgb(20 22 28 / 0.08)',
      },
      borderRadius: {
        control: '0.5rem',
        panel: '0.75rem',
      },
      maxWidth: {
        content: '72rem',
        narrow: '40rem',
      },
      spacing: {
        page: 'var(--space-page)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
