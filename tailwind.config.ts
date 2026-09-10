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
      /**
       * Le quattro quote del cockpit, dal fondo alla superficie che galleggia.
       *
       * Non sono quattro colori scelti a occhio: sono **quattro distanze dallo
       * schermo**, e l'occhio le legge come profondita' anche senza ombre.
       * Percio' l'unico modo di dire "questo pannello sta sopra quell'altro" e'
       * salire di una quota, mai aggiungere un'ombra nera.
       *
       * Sono un filo blu, non grigi neutri: sotto le tinte dei ruoli — ambra,
       * smeraldo, ciano, rosa — un fondo neutro le fa sembrare sporche, mentre
       * uno leggermente freddo le tiene sature. E' l'unico motivo del blu.
       *
       * Ogni token porta `<alpha-value>`, quindi `bg-panel/80` funziona: le
       * superfici sfocate dell'asta sono quasi tutte traslucide, perche' il
       * `backdrop-blur` sotto e' cio' che le fa sembrare vetro invece che
       * cartone.
       */
      colors: {
        /** Il fondo della pagina. Sotto non c'e' niente. */
        canvas: 'rgb(11 15 23 / <alpha-value>)',
        /** Card e pannelli a piena altezza: la quota di lavoro. */
        panel: 'rgb(19 27 38 / <alpha-value>)',
        /** Superfici annidate dentro un pannello. */
        surface: 'rgb(22 32 46 / <alpha-value>)',
        /** Cio' che galleggia: popover, picker, campi a fuoco. */
        elevated: 'rgb(28 38 54 / <alpha-value>)',

        /**
         * I veli di bianco: sette nomi al posto di dodici alfa a mano.
         *
         * Le quote qui sopra dicono *quanto in alto* sta una superficie; questi
         * dicono *quanto forte* e' il filo che la chiude e il velo che la
         * riempie. Erano scritti a occhio ovunque — `white/[0.08]` cinquanta
         * volte, `white/10` altre quaranta, piu' 0.01, 0.015, 0.03, 0.04, 0.05,
         * 0.07, 0.12, 0.15, 0.25 — e nessuno sapeva piu' quale fosse quella
         * giusta, cosi' ogni componente nuovo ne inventava una in piu'.
         *
         * Tre fili e tre veli, piu' il bordo sotto il puntatore. L'alfa non e'
         * un parametro: se una superficie ha bisogno di una quota che non c'e',
         * il posto dove aggiungerla e' questo.
         */

        /** Filo tenue: divisori interni, tabelle, separatori di riga. */
        seam: 'rgb(255 255 255 / 0.05)',
        /** Filo standard: e' cio' che stacca un pannello, al posto dell'ombra. */
        hair: 'rgb(255 255 255 / 0.08)',
        /** Filo marcato: elemento scelto, riga attiva, campo compilato. */
        rim: 'rgb(255 255 255 / 0.12)',
        /** Il filo sotto il puntatore, l'unico che si accende all'hover. */
        edge: 'rgb(255 255 255 / 0.2)',

        /** Velo appena percettibile: fondo di una sezione dentro un pannello. */
        veil: 'rgb(255 255 255 / 0.02)',
        /** Velo di lavoro: campi, celle, superfici annidate. */
        film: 'rgb(255 255 255 / 0.04)',
        /** Velo pieno: chip, bottoni, la superficie in hover. */
        scrim: 'rgb(255 255 255 / 0.06)',
      },
      boxShadow: {
        'glow-amber': '0 0 0 1px rgb(245 158 11 / 0.25), 0 0 18px -6px rgb(245 158 11 / 0.55)',
        'glow-emerald': '0 0 0 1px rgb(16 185 129 / 0.25), 0 0 18px -6px rgb(16 185 129 / 0.55)',
        'glow-sky': '0 0 0 1px rgb(14 165 233 / 0.25), 0 0 18px -6px rgb(14 165 233 / 0.55)',
        'glow-rose': '0 0 0 1px rgb(244 63 94 / 0.25), 0 0 18px -6px rgb(244 63 94 / 0.55)',
        /**
         * Due sole ombre, e nessuna delle due e' una macchia nera.
         *
         * Su un fondo gia' scuro un'ombra opaca non stacca niente: annerisce e
         * basta. Quello che stacca e' il **filo di luce in alto** — il bordo
         * illuminato di una superficie fisica — piu' un alone largo e tenue che
         * suggerisce l'altezza senza disegnarla. Il nero resta, ma diffuso.
         */
        panel: '0 1px 0 0 rgb(255 255 255 / 0.05) inset, 0 8px 28px -14px rgb(0 0 0 / 0.55)',
        pop: '0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 18px 50px -22px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.08)',
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
