import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary:  'var(--bg-primary)',
          surface:  'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover:    'var(--bg-hover)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover:   'var(--accent-hover)',
          subtle:  'var(--accent-subtle)',
        },
        alarm: {
          critical: 'var(--alarm-critical)',
          major:    'var(--alarm-major)',
          minor:    'var(--alarm-minor)',
          warning:  'var(--alarm-warning)',
          ok:       'var(--alarm-ok)',
        },
        tech: {
          '5g':  'var(--tech-5g)',
          '4g':  'var(--tech-4g)',
          '3g':  'var(--tech-3g)',
          '2g':  'var(--tech-2g)',
          'b2b': 'var(--tech-b2b)',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
