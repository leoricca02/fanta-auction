import { useMemo } from 'react';
import { Crosshair } from 'lucide-react';

import type { Player } from '../../domain/types';
import type { SetPiece } from '../../domain/specialists';
import { SET_PIECES, hierarchyOf, makeHierarchyIndex } from '../../domain/specialists';
import { SPECIALISTS_UPDATED_AT, SPECIALIST_BLOCKS } from '../../data/specialists';
import { cn } from '../../ui/cn';
import { SectionTitle } from '../../ui/primitives';

/**
 * I piazzati del club, accanto alla formazione.
 *
 * Nella scheda del giocatore la stessa gerarchia si apre da un badge, ma li'
 * risponde a "questo qui, che posto ha". Qui la domanda e' l'opposta e viene
 * prima: **compilando la formazione**, chi di questi undici calcia. E' l'unico
 * momento in cui si guardano tutti insieme, ed e' il momento in cui serve.
 *
 * Si ferma al terzo per lo stesso motivo della scheda: oltre il terzo la
 * gerarchia e' teorica. Chi non e' piu' in quella rosa resta scritto e barrato,
 * perche' sapere che il primo rigorista se n'e' andato **e'** l'informazione:
 * vuol dire che i rigori sono di chi viene dopo.
 */

/** Oltre il terzo la gerarchia della fonte non descrive piu' niente di vero. */
const SHOWN = 3;

const KIND_LABEL: Readonly<Record<SetPiece, string>> = {
  rigori: 'rigori',
  punizioni: 'punizioni',
  corner: 'corner',
};

export interface SetPiecePanelProps {
  readonly teamCode: string;
  /** Il listone intero: le gerarchie si agganciano dentro la rosa del club. */
  readonly players: readonly Player[];
  readonly onOpenCard: (playerId: number) => void;
}

export function SetPiecePanel({
  teamCode,
  players,
  onOpenCard,
}: SetPiecePanelProps): JSX.Element | null {
  const hierarchy = useMemo(() => makeHierarchyIndex(players, SPECIALIST_BLOCKS), [players]);
  const rows = SET_PIECES.map((kind) => ({
    kind,
    slots: hierarchyOf(teamCode, kind, hierarchy).slice(0, SHOWN),
  })).filter((row) => row.slots.length > 0);

  // Nessun blocco per questo club: la fonte non lo copre, e una scatola vuota
  // direbbe "non ci sono tiratori" invece di "non lo sappiamo".
  if (rows.length === 0) return null;

  return (
    <section className="mt-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
      <div className="flex items-baseline gap-2">
        <SectionTitle icon={<Crosshair size={12} />}>Piazzati</SectionTitle>
        <span className="ml-auto text-[10px] text-zinc-600">
          guida SosFanta, {SPECIALISTS_UPDATED_AT}
        </span>
      </div>

      <dl className="mt-1.5 flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.kind} className="flex items-baseline gap-2 text-xs">
            <dt className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">
              {KIND_LABEL[row.kind]}
            </dt>
            <dd className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              {row.slots.map((slot, i) => {
                const picked = slot.player;
                return (
                  <span key={`${slot.rank}-${slot.name}`} className="flex items-baseline gap-1.5">
                    {i > 0 && <span className="text-zinc-700">·</span>}
                    {picked === null ? (
                      <span
                        className="text-zinc-600 line-through"
                        title="Non e' piu' in questa rosa: i piazzati sono di chi viene dopo"
                      >
                        {slot.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenCard(picked.id)}
                        className={cn(
                          'rounded px-0.5 transition-colors hover:bg-white/[0.06]',
                          slot.rank === 1
                            ? 'font-semibold text-emerald-300'
                            : 'text-zinc-300 hover:text-zinc-100',
                        )}
                      >
                        {picked.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
