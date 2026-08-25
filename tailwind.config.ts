import type { Config } from 'tailwindcss';

/**
 * Design system della dashboard (dark-only).
 *
 * Tre cose vivono qui e da nessun'altra parte: i font, i glow di ruolo e le
 * keyframe del feedback. Tutto il resto e' Tailwind di serie: se un colore si
 * puo' scrivere con una utility standard, non diventa un token.
 *
 * I glow sono nominati per ruolo (P/D/C/A) e non per colore d'uso, perche' il
 * loro significato all'asta e' il reparto: `shadow-glow-amber` su un portiere
 * si legge prima dell'etichetta.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        canvas: '#09090b',
        surface: 'rgb(24 24 27 / <alpha-value>)',
      },
      boxShadow: {
        'glow-amber': '0 0 0 1px rgb(245 158 11 / 0.25), 0 0 18px -6px rgb(245 158 11 / 0.55)',
        'glow-emerald': '0 0 0 1px rgb(16 185 129 / 0.25), 0 0 18px -6px rgb(16 185 129 / 0.55)',
        'glow-sky': '0 0 0 1px rgb(14 165 233 / 0.25), 0 0 18px -6px rgb(14 165 233 / 0.55)',
        'glow-rose': '0 0 0 1px rgb(244 63 94 / 0.25), 0 0 18px -6px rgb(244 63 94 / 0.55)',
        panel: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 8px 30px -12px rgb(0 0 0 / 0.8)',
        pop: '0 20px 60px -20px rgb(0 0 0 / 0.9), 0 0 0 1px rgb(255 255 255 / 0.06)',
      },
      keyframes: {
        'flash-ok': {
          '0%': { boxShadow: '0 0 0 0 rgb(16 185 129 / 0.55)' },
          '70%': { boxShadow: '0 0 0 10px rgb(16 185 129 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(16 185 129 / 0)' },
        },
        'flash-err': {
          '0%': { boxShadow: '0 0 0 0 rgb(244 63 94 / 0.55)' },
          '70%': { boxShadow: '0 0 0 10px rgb(244 63 94 / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(244 63 94 / 0)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.95) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'flash-ok': 'flash-ok 900ms ease-out',
        'flash-err': 'flash-err 900ms ease-out',
        'fade-up': 'fade-up 160ms ease-out',
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
