import type { Config } from 'tailwindcss'

/**
 * Design tokens are lifted verbatim from the PALTAS portal palette so the
 * React build is pixel-consistent with the original dashboard.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: '#0A0E1A', 2: '#0d1424' },
        panel:   { DEFAULT: 'rgba(18,26,45,.72)', 2: 'rgba(15,22,38,.6)' },
        stroke:  { DEFAULT: 'rgba(255,255,255,.07)', 2: 'rgba(255,255,255,.12)' },
        teal:    { DEFAULT: '#00E5C8', dim: '#0bb9a6' },
        ink:     { DEFAULT: '#eaf1f8', 2: '#c7d3e6' },
        muted:   { DEFAULT: '#8a99b0', 2: '#5f6f88' },
        ok:      '#22c98b',
        warn:    '#f0b429',
        danger:  '#f2495c',
        info:    '#3b82f6',
        violet:  '#a99bff',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      backgroundImage: {
        brand: 'linear-gradient(135deg,#00E5C8 0%,#2ea6ff 100%)',
      },
      keyframes: {
        fade:  { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        blink: { '0%,60%,100%': { opacity: '.25' }, '30%': { opacity: '1' } },
      },
      animation: { fade: 'fade .22s ease', blink: 'blink 1.2s infinite' },
    },
  },
  plugins: [],
} satisfies Config
