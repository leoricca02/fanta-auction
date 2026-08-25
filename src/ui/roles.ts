import type { Role } from '../domain/types';

/**
 * Palette dei ruoli, unica sorgente in tutta l'interfaccia.
 *
 * All'asta il reparto e' la prima informazione che l'occhio cerca, prima del
 * nome: percio' ogni ruolo ha un colore fisso e ad alto contrasto, e quel
 * colore non viene mai riusato per significare altro.
 *
 *   P  ambra/oro     D  smeraldo     C  ciano     A  rosa
 *
 * Ogni voce porta le varianti gia' composte perche' i componenti non debbano
 * concatenare stringhe a mano: `chip` per i badge, `text` per il solo colore,
 * `bar`/`dot` per gli indicatori pieni, `glow` per l'alone della card.
 */
export interface RoleTheme {
  /** Etichetta estesa, per i title e le intestazioni. */
  readonly label: string;
  /** Solo colore del testo. */
  readonly text: string;
  /** Badge completo: testo, fondo traslucido, bordo. */
  readonly chip: string;
  /** Fondo pieno, per barre e pallini di stato. */
  readonly bar: string;
  /** Ombra colorata per la card del ruolo. */
  readonly glow: string;
  /** Anello di focus/selezione. */
  readonly ring: string;
}

export const ROLE_THEME: Readonly<Record<Role, RoleTheme>> = {
  P: {
    label: 'Portiere',
    text: 'text-amber-400',
    chip: 'text-amber-400 bg-amber-500/10 border border-amber-500/30',
    bar: 'bg-amber-500',
    glow: 'shadow-glow-amber',
    ring: 'ring-amber-500/40',
  },
  D: {
    label: 'Difensore',
    text: 'text-emerald-400',
    chip: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/30',
    bar: 'bg-emerald-500',
    glow: 'shadow-glow-emerald',
    ring: 'ring-emerald-500/40',
  },
  C: {
    label: 'Centrocampista',
    text: 'text-sky-400',
    chip: 'text-sky-400 bg-sky-500/10 border border-sky-500/30',
    bar: 'bg-sky-500',
    glow: 'shadow-glow-sky',
    ring: 'ring-sky-500/40',
  },
  A: {
    label: 'Attaccante',
    text: 'text-rose-400',
    chip: 'text-rose-400 bg-rose-500/10 border border-rose-500/30',
    bar: 'bg-rose-500',
    glow: 'shadow-glow-rose',
    ring: 'ring-rose-500/40',
  },
};

export function roleTheme(role: Role): RoleTheme {
  return ROLE_THEME[role];
}
