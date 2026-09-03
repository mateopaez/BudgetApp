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
        // CSS vars keep hex in the cascade (Tailwind hex tokens compile to rgb()).
        canvas: 'var(--color-canvas)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          raised: 'var(--color-surface-raised)',
          muted: 'var(--color-surface-muted)',
          muted40: 'var(--color-surface-muted-40)',
          muted50: 'var(--color-surface-muted-50)',
          muted60: 'var(--color-surface-muted-60)',
          muted70: 'var(--color-surface-muted-70)',
        },
        ink: {
          DEFAULT: 'var(--color-ink)',
          muted: 'var(--color-muted)',
          soft: 'var(--color-ink-soft)',
          scrim: 'var(--color-ink-scrim)',
          faint: 'var(--color-ink-faint)',
        },
        line: 'var(--color-border)',
        action: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          soft: 'var(--color-primary-soft)',
          soft30: 'var(--color-primary-soft-30)',
          soft40: 'var(--color-primary-soft-40)',
          soft50: 'var(--color-primary-soft-50)',
          soft60: 'var(--color-primary-soft-60)',
          a20: 'var(--color-primary-a20)',
          a30: 'var(--color-primary-a30)',
          a40: 'var(--color-primary-a40)',
          a50: 'var(--color-primary-a50)',
          a60: 'var(--color-primary-a60)',
        },
        finance: {
          income: 'var(--color-income)',
          incomeSoft: 'var(--color-income-soft)',
          expense: 'var(--color-expense)',
          expenseSoft: 'var(--color-expense-soft)',
          expenseA20: 'var(--color-expense-a20)',
          expenseA25: 'var(--color-expense-a25)',
          saving: 'var(--color-saving)',
          savingSoft: 'var(--color-saving-soft)',
          warning: 'var(--color-warning)',
          warningSoft: 'var(--color-warning-soft)',
          warningA25: 'var(--color-warning-a25)',
        },
      },
      boxShadow: {
        panel: '0 1px 2px var(--color-ink-faint)',
        floating: '0 12px 40px var(--color-shadow-12)',
        card: '0 1px 2px var(--color-ink-faint)',
        'card-hover': '0 4px 16px var(--color-shadow-08)',
      },
      ringColor: {
        DEFAULT: 'var(--color-primary-a50)',
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
