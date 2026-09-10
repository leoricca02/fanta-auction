import { CircleDashed, ShieldCheck, Sofa, TriangleAlert } from 'lucide-react';

import { lineupPlacement, type LineupIndex } from '../../domain/lineup';
import type { LineupStatus } from '../../domain/types';
import { cn } from '../../ui/cn';

/**
 * Badge di §4.1. Compare inline nei risultati di ricerca dell'asta (§5.1) e
 * nella scheda giocatore, quindi deve leggersi in un colpo d'occhio.
 *
 * L'icona precede l'etichetta perche' e' quella che si vede per prima quando
 * lo sguardo scorre una colonna: verde scudo = titolare, triangolo ambra =
 * ballottaggio, e non serve leggere niente.
 *
 * Sul ballottaggio l'etichetta da sola non basta: primo e terzo nome dello
 * stesso slot valgono soldi diversi, perche' l'ordine dei candidati e' la
 * scommessa che l'utente ha gia' fatto su chi scende in campo. Il badge porta
 * quindi la posizione (`1°`, `2°`, ...) attaccata alla parola.
 */

/**
 * Stessa finitura satinata delle fasce, perche' i due badge stanno fianco a
 * fianco: se uno e' piatto e l'altro no, quello piatto sembra disabilitato.
 * Lo scarto del gradiente segue lo stato — pieno sul titolare, appena
 * accennato sulla panchina, nullo su chi non ha formazione.
 */
const STYLE: Readonly<Record<LineupStatus, string>> = {
  TITOLARE:
    'bg-gradient-to-br from-emerald-400/20 to-emerald-600/10 text-emerald-300 border border-emerald-400/40',
  BALLOTTAGGIO:
    'bg-gradient-to-br from-amber-400/20 to-amber-600/10 text-amber-300 border border-amber-400/40',
  PANCHINA: 'bg-gradient-to-br from-scrim to-film text-zinc-400 border border-hair',
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

/** Come si legge un ballottaggio a voce, per il `title`. */
const ORDINAL_WORD: readonly string[] = [
  'Primo',
  'Secondo',
  'Terzo',
  'Quarto',
  'Quinto',
  'Sesto',
];

function ballotTitle(rank: number, size: number | null): string {
  const word = ORDINAL_WORD[rank - 1] ?? `${rank}°`;
  const total = size === null ? '' : ` su ${size}`;
  const gloss =
    rank === 1
      ? 'il primo nome dello slot, il piu’ probabile in campo'
      : 'dietro al primo nome dello slot';
  return `${word} nel ballottaggio${total} — ${gloss}`;
}

export interface LineupBadgeProps {
  readonly status: LineupStatus;
  /**
   * Posizione nel ballottaggio, 1-based (`LineupPlacement.ballotRank`).
   * Ignorata se lo stato non e' `BALLOTTAGGIO`.
   */
  readonly rank?: number | null;
  /** Quanti si contendono lo slot (`LineupPlacement.ballotSize`). Solo per il `title`. */
  readonly rankOf?: number | null;
  readonly compact?: boolean;
}

export function LineupBadge({
  status,
  rank = null,
  rankOf = null,
  compact = false,
}: LineupBadgeProps): JSX.Element {
  const Icon = ICON[status];
  const ballotRank = status === 'BALLOTTAGGIO' && rank !== null && rank > 0 ? rank : null;
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
          : ballotRank !== null
            ? ballotTitle(ballotRank, rankOf)
            : LABEL[status]
      }
    >
      <Icon size={compact ? 10 : 11} className="shrink-0" />
      {compact ? SHORT[status] : LABEL[status]}
      {/* Il numero e' l'unica cosa che distingue due ballottaggi identici:
          tabellare e a pieno contrasto, cosi' salta fuori dall'etichetta
          senza dover allargare il badge. */}
      {ballotRank !== null && (
        <span className={cn('num font-bold', compact ? 'text-[10px]' : 'text-[11px]')}>
          {ballotRank}°
        </span>
      )}
    </span>
  );
}

/**
 * Il badge per gli elenchi — ricerca dell'asta, svincolati, obiettivi — che
 * hanno il giocatore e l'indice ma non il placement gia' calcolato. Evita che
 * ogni chiamante si ricordi da solo di passare la posizione nel ballottaggio:
 * dimenticarla si vede solo come un numero mancante, e nessuno se ne accorge.
 */
export function LineupPlacementBadge({
  playerId,
  team,
  lineups,
  compact = true,
}: {
  readonly playerId: number;
  readonly team: string;
  readonly lineups: LineupIndex;
  readonly compact?: boolean;
}): JSX.Element {
  const placement = lineupPlacement(playerId, team, lineups);
  return (
    <LineupBadge
      status={placement.status}
      rank={placement.ballotRank}
      rankOf={placement.ballotSize}
      compact={compact}
    />
  );
}
