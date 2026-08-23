import { useEffect, useMemo, useRef, useState } from 'react';

import type { FantaTeam, Player } from '../../domain/types';
import type { LeagueState } from '../../domain/reducer';
import type { TeamBidStatus } from '../../domain/metrics';
import { bidStatusForAll, rivalsAbove } from '../../domain/metrics';
import { lineupPlacement, makeLineupIndex } from '../../domain/lineup';
import { useAppStore } from '../../store/appStore';
import { LineupBadge } from '../player/LineupBadge';

/**
 * Pannello di assegnazione (PRD §5.1).
 *
 * Nasce da come va davvero una chiamata: senti il nome, **cerchi se ti
 * interessa**, il rilancio sale, e solo alla fine sai a quanto e a chi. La
 * command bar da sola presuppone invece che tu conosca prezzo e acquirente
 * gia' mentre digiti.
 *
 * Percio' questo pannello non e' un overlay che copre e si chiude: sta fisso
 * accanto ai risultati e si riempie man mano. Appunti e formazione restano
 * sotto gli occhi mentre il prezzo sale, e i dodici riquadri delle squadre
 * fanno due lavori insieme — dicono chi puo' ancora rilanciare, e sono il
 * bottone con cui chiudi l'acquisto.
 *
 * La command bar resta intatta e piu' veloce: `dimarco 60 mrc` + Invio fa
 * tutto in una riga. I due si alimentano a vicenda.
 */

export interface AssignPanelProps {
  readonly player: Player | null;
  readonly state: LeagueState;
  readonly teams: readonly FantaTeam[];
  /** Prezzo corrente, condiviso con la command bar. */
  readonly price: number | null;
  readonly onPriceChange: (price: number | null) => void;
  /** Chiamata dopo un'assegnazione riuscita, per ripulire la barra. */
  readonly onAssigned: () => void;
}

export function AssignPanel({
  player,
  state,
  teams,
  price,
  onPriceChange,
  onAssigned,
}: AssignPanelProps): JSX.Element {
  const config = useAppStore((s) => s.leagueConfig);
  const userData = useAppStore((s) => s.userData);
  const assign = useAppStore((s) => s.assign);
  const notify = useAppStore((s) => s.notify);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => setError(null), [player?.id, price]);

  const league = config();
  const statuses = useMemo(
    () => bidStatusForAll(state, league, player?.role ?? 'P', price ?? 0),
    [state, league, player?.role, price],
  );
  const rivals = rivalsAbove(statuses, league, price ?? 0);
  const lineups = useMemo(() => makeLineupIndex(userData.lineups), [userData.lineups]);

  if (player === null) {
    return (
      <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-neutral-800 p-3">
        <h2 className="text-xs uppercase tracking-wide text-neutral-500">Partecipanti</h2>
        <TeamGrid statuses={statuses} teams={teams} onPick={null} price={null} />
        <p className="text-xs text-neutral-600">
          Cerca un giocatore nella barra per aprirlo qui e assegnarlo.
        </p>
      </aside>
    );
  }

  const placement = lineupPlacement(player.id, player.team, lineups);
  const note = userData.playerNotes.find((n) => n.playerId === player.id) ?? null;
  const lineup = lineups.get(player.team) ?? null;

  async function handleAssign(team: FantaTeam): Promise<void> {
    if (player === null) return;
    if (price === null || price < 1) {
      setError('Inserisci il prezzo pagato prima di assegnare.');
      priceRef.current?.focus();
      return;
    }

    setBusy(true);
    const outcome = await assign(player.id, team.id, price, player.role);
    setBusy(false);

    if (outcome.ok) {
      notify('ok', `${player.name} → ${team.name} per ${price}.`);
      onPriceChange(null);
      onAssigned();
    } else {
      setError(outcome.rejection.detail);
    }
  }

  return (
    <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-neutral-800 p-3">
      <header>
        <h2 className="text-lg font-semibold leading-tight text-neutral-100">{player.name}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          {player.role} · {player.team} · quot {player.quot} · fvm {player.fvm}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <LineupBadge status={placement.status} />
          {note?.tag != null && (
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-emerald-300">
              ★ {note.tag}
            </span>
          )}
        </div>
      </header>

      {note !== null && note.text.trim() !== '' && (
        <p className="rounded bg-neutral-900 px-2 py-1.5 text-xs italic text-neutral-300">
          “{note.text}”
        </p>
      )}

      {lineup !== null && (
        <section>
          <h3 className="text-[11px] uppercase tracking-wide text-neutral-500">
            {player.team} · {lineup.module}
          </h3>
          <ul className="mt-1 grid grid-cols-2 gap-x-3">
            {lineup.slots.map((slot) => {
              const mine = slot.candidates.includes(player.id);
              return (
                <li
                  key={slot.slotId}
                  className={`flex gap-1.5 text-[11px] ${mine ? 'text-emerald-300' : 'text-neutral-500'}`}
                >
                  <span className="w-7 shrink-0 text-neutral-600">{slot.roleLabel}</span>
                  <span className="truncate">
                    {slot.candidates.length === 0 ? '—' : slot.candidates.length > 1 ? '⚔' : ''}
                    {slot.candidates.length > 0 && <SlotNames ids={slot.candidates} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <label className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">Prezzo</span>
          <button
            type="button"
            onClick={() => onPriceChange(Math.max(1, (price ?? 1) - 1))}
            className="h-8 w-8 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            aria-label="Meno un credito"
          >
            −
          </button>
          <input
            ref={priceRef}
            type="number"
            min={1}
            value={price ?? ''}
            onChange={(e) => {
              const n = Number(e.target.value);
              onPriceChange(e.target.value === '' || !Number.isFinite(n) ? null : Math.trunc(n));
            }}
            placeholder="—"
            className="h-10 w-24 rounded border border-neutral-700 bg-neutral-900 text-center text-xl tabular-nums text-neutral-100 outline-none focus:border-emerald-600"
          />
          <button
            type="button"
            onClick={() => onPriceChange((price ?? 0) + 1)}
            className="h-8 w-8 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            aria-label="Piu' un credito"
          >
            +
          </button>
        </label>

        <p className="mt-1 text-[11px] text-neutral-500">
          {price === null ? (
            'Digita il prezzo, o scrivilo nella barra dopo il nome.'
          ) : rivals.length === 0 ? (
            <span className="text-emerald-400">A {price} nessuno può rilanciare.</span>
          ) : (
            <>
              A {price} possono rilanciare in <strong className="text-neutral-300">{rivals.length}</strong>:{' '}
              <span className="uppercase">
                {rivals
                  .map((r) => teams.find((t) => t.id === r.teamId)?.abbr ?? r.teamId)
                  .join(' ')}
              </span>
            </>
          )}
        </p>
      </section>

      <section>
        <h3 className="text-[11px] uppercase tracking-wide text-neutral-500">
          A chi è andato?
        </h3>
        <TeamGrid
          statuses={statuses}
          teams={teams}
          price={price}
          onPick={busy ? null : (team) => void handleAssign(team)}
        />
      </section>

      {error !== null && (
        <p className="rounded border border-red-900 bg-red-950/40 px-2 py-1.5 text-xs text-red-200">
          {error}
        </p>
      )}
    </aside>
  );
}

/** Nomi dei candidati di uno slot, separati da barra se in ballottaggio. */
function SlotNames({ ids }: { readonly ids: readonly number[] }): JSX.Element {
  const players = useAppStore((s) => s.players);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  return (
    <>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && <span className="text-amber-500"> / </span>}
          {byId.get(id)?.name ?? `#${id}`}
        </span>
      ))}
    </>
  );
}

/**
 * I dodici riquadri. Sono insieme la griglia informativa di §5.1 e i bottoni
 * di assegnazione: chi non puo' permettersi il prezzo corrente e' spento, e
 * dice perche'.
 */
function TeamGrid({
  statuses,
  teams,
  price,
  onPick,
}: {
  readonly statuses: readonly TeamBidStatus[];
  readonly teams: readonly FantaTeam[];
  readonly price: number | null;
  readonly onPick: ((team: FantaTeam) => void) | null;
}): JSX.Element {
  const byTeam = new Map(statuses.map((s) => [s.teamId, s]));

  return (
    <ul className="mt-1 grid grid-cols-2 gap-1.5">
      {teams.map((team) => {
        const status = byTeam.get(team.id);
        if (status === undefined) return null;

        const blocked = price !== null && !status.canAfford;
        const clickable = onPick !== null && !blocked;

        return (
          <li key={team.id}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onPick?.(team)}
              title={
                status.blockedBy === 'ROLE_FULL'
                  ? 'Ha già tutti gli slot di questo ruolo occupati'
                  : status.blockedBy === 'CREDITS'
                    ? `Può arrivare al massimo a ${status.maxBidAssoluto}`
                    : undefined
              }
              className={`w-full rounded border px-2 py-1.5 text-left transition-colors ${
                blocked
                  ? 'border-neutral-900 bg-neutral-950 text-neutral-700'
                  : team.isUser
                    ? 'border-emerald-800 bg-emerald-950/40 text-emerald-100 hover:border-emerald-500 hover:bg-emerald-900/50'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-200 hover:border-emerald-600 hover:bg-neutral-800'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="flex items-baseline justify-between gap-1">
                <span className="truncate text-xs font-semibold uppercase">{team.abbr}</span>
                <span className="shrink-0 text-sm tabular-nums">{status.credits}</span>
              </span>
              <span className="mt-0.5 flex items-baseline justify-between gap-1 text-[10px] text-neutral-500">
                <span className="truncate">{team.name}</span>
                <span className="shrink-0 tabular-nums">
                  {status.blockedBy === 'ROLE_FULL' ? 'pieno' : `max ${status.maxBidAssoluto}`}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
