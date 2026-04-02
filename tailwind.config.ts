import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        bg: {
          base:    'var(--bg-base)',
          surface: 'var(--bg-surface)',
          overlay: 'var(--bg-overlay)',
          subtle:  'var(--bg-subtle)',
          muted:   'var(--bg-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          bright:  'var(--accent-bright)',
          dim:     'var(--accent-dim)',
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
        border: {
          DEFAULT: 'var(--border)',
          strong:  'var(--border-strong)',
          accent:  'var(--border-accent)',
        },
        text: {
          primary:   'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted:     'var(--text-muted)',
        },
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
      },
      boxShadow: {
        sm:   'var(--shadow-sm)',
        md:   'var(--shadow-md)',
        lg:   'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
    },
  },
  plugins: [],
}

export default config
