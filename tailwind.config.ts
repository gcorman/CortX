import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        cortx: {
          bg: '#0F172A',
          surface: '#1E293B',
          elevated: '#334155',
          border: '#475569',
          'text-primary': '#F8FAFC',
          'text-secondary': '#94A3B8',
          accent: '#0D9488',
          'accent-light': '#14B8A6',
          cta: '#F97316',
          success: '#22C55E',
          error: '#EF4444',
          warning: '#F59E0B'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'Consolas', 'monospace']
      },
      borderRadius: {
        card: '8px',
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
