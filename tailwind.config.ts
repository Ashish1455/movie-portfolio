import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // mapped to CSS custom properties so themes swap at runtime
        base:       'var(--c-bg)',
        surface:    'var(--c-surface)',
        card:       'var(--c-card)',
        ink:        'var(--c-text)',
        muted:      'var(--c-muted)',
        subtle:     'var(--c-subtle)',
        edge:       'var(--c-border)',
        brand:      'var(--c-accent)',
        'brand-h':  'var(--c-accent-h)',
        star:       'var(--c-star)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
