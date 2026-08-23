import type { LineupStatus } from '../../domain/types';

/**
 * Badge di §4.1. Compare inline nei risultati di ricerca dell'asta (§5.1) e
 * nella scheda giocatore, quindi deve leggersi in un colpo d'occhio.
 */

const STYLE: Readonly<Record<LineupStatus, string>> = {
  TITOLARE: 'bg-emerald-900/70 text-emerald-200',
  BALLOTTAGGIO: 'bg-amber-900/70 text-amber-200',
  PANCHINA: 'bg-neutral-800 text-neutral-400',
  NON_INSERITO: 'bg-neutral-900 text-neutral-600 border border-dashed border-neutral-700',
};

const LABEL: Readonly<Record<LineupStatus, string>> = {
  TITOLARE: 'TITOLARE',
  BALLOTTAGGIO: 'BALLOTTAGGIO',
  PANCHINA: 'PANCHINA',
  NON_INSERITO: 'non inserita',
};

export interface LineupBadgeProps {
  readonly status: LineupStatus;
  readonly compact?: boolean;
}

export function LineupBadge({ status, compact = false }: LineupBadgeProps): JSX.Element {
  return (
    <span
      className={`inline-block shrink-0 rounded px-1.5 py-0.5 font-medium ${
        compact ? 'text-[10px]' : 'text-[11px]'
      } ${STYLE[status]}`}
      title={
        status === 'NON_INSERITO'
          ? 'La formazione di questa squadra non e’ ancora stata compilata'
          : undefined
      }
    >
      {LABEL[status]}
    </span>
  );
}
