import { CircleDashed, ShieldCheck, Sofa, TriangleAlert } from 'lucide-react';

import type { LineupStatus } from '../../domain/types';
import { cn } from '../../ui/cn';

/**
 * Badge di §4.1. Compare inline nei risultati di ricerca dell'asta (§5.1) e
 * nella scheda giocatore, quindi deve leggersi in un colpo d'occhio.
 *
 * L'icona precede l'etichetta perche' e' quella che si vede per prima quando
 * lo sguardo scorre una colonna: verde scudo = titolare, triangolo ambra =
 * ballottaggio, e non serve leggere niente.
 */

const STYLE: Readonly<Record<LineupStatus, string>> = {
  TITOLARE: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
  BALLOTTAGGIO: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
  PANCHINA: 'bg-white/[0.04] text-zinc-400 border border-white/[0.08]',
  NON_INSERITO: 'bg-transparent text-zinc-600 border border-dashed border-zinc-700',
};

const ICON: Readonly<Record<LineupStatus, typeof ShieldCheck>> = {
  TITOLARE: ShieldCheck,
  BALLOTTAGGIO: TriangleAlert,
  PANCHINA: Sofa,
  NON_INSERITO: CircleDashed,
};

const LABEL: Readonly<Record<LineupStatus, string>> = {
  TITOLARE: 'TITOLARE',
  BALLOTTAGGIO: 'BALLOTTAGGIO',
  PANCHINA: 'PANCHINA',
  NON_INSERITO: 'non inserita',
};

const SHORT: Readonly<Record<LineupStatus, string>> = {
  TITOLARE: 'TIT',
  BALLOTTAGGIO: 'BALL',
  PANCHINA: 'PAN',
  NON_INSERITO: '—',
};

export interface LineupBadgeProps {
  readonly status: LineupStatus;
  readonly compact?: boolean;
}

export function LineupBadge({ status, compact = false }: LineupBadgeProps): JSX.Element {
  const Icon = ICON[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-medium leading-none',
        compact ? 'text-[10px]' : 'text-[11px]',
        STYLE[status],
      )}
      title={
        status === 'NON_INSERITO'
          ? 'La formazione di questa squadra non e’ ancora stata compilata'
          : LABEL[status]
      }
    >
      <Icon size={compact ? 10 : 11} className="shrink-0" />
      {compact ? SHORT[status] : LABEL[status]}
    </span>
  );
}
