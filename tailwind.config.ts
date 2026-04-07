import type { Config } from 'tailwindcss'

// Reference a CSS variable with Tailwind opacity modifier support
const v = (name: string): string => `rgb(var(${name}) / <alpha-value>)`

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        cortx: {
          bg:               v('--cortx-bg'),
          surface:          v('--cortx-surface'),
          elevated:         v('--cortx-elevated'),
          border:           v('--cortx-border'),
          'text-primary':   v('--cortx-text-primary'),
          'text-secondary': v('--cortx-text-secondary'),
          accent:           v('--cortx-accent'),
          'accent-light':   v('--cortx-accent-light'),
          cta:              v('--cortx-cta'),
          success:          v('--cortx-success'),
          error:            v('--cortx-error'),
          warning:          v('--cortx-warning')
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'Consolas', 'monospace']
      },
      borderRadius: {
        card:  '8px',
        input: '6px',
        panel: '12px'
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }]
      }
    }
  },
  plugins: []
}

export default config
