import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Minus, Plus, Quote, TriangleAlert, Users } from 'lucide-react';

import type { FantaTeam, Player } from '../../domain/types';
import { PHASE_ORDER } from '../../domain/types';
import type { LeagueState } from '../../domain/reducer';
import { teamState } from '../../domain/reducer';
import type { TeamBidStatus } from '../../domain/metrics';
import { bidStatusForAll, rivalsAbove } from '../../domain/metrics';
import { lineupPlacement, makeLineupIndex } from '../../domain/lineup';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { EASE, RoleBadge, SectionTitle } from '../../ui/primitives';
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

  const shell =
    'flex w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/[0.08] bg-zinc-950/60 p-3 backdrop-blur-xl';

  if (player === null) {
    return (
      <aside className={shell}>
        <SectionTitle icon={<Users size={12} />}>Partecipanti</SectionTitle>
        <TeamGrid statuses={statuses} teams={teams} state={state} onPick={null} price={null} />
        <p className="text-xs text-zinc-600">
          Cerca un giocatore nella barra per aprirlo qui e assegnarlo.
        </p>
      </aside>
    );
  }

  const placement = lineupPlacement(player.id, player.team, lineups);
  const note = userData.playerNotes.find((n) => n.playerId === player.id) ?? null;
  const lineup = lineups.get(player.team) ?? null;
  const theme = roleTheme(player.role);

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
    <aside className={shell}>
      <motion.header
        key={player.id}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="flex items-start gap-2.5"
      >
        <RoleBadge role={player.role} size="lg" glow />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold leading-tight tracking-tight text-zinc-100">
            {player.name}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500">
            <span className="uppercase tracking-wide text-zinc-400">{player.team}</span>
            <span className="text-zinc-700">·</span>
            <span className="num">quot {player.quot}</span>
            <span className="text-zinc-700">·</span>
            <span className="num">fvm {player.fvm}</span>
          </p>
        </div>
      </motion.header>

      <div className="flex flex-wrap items-center gap-1.5">
        <LineupBadge status={placement.status} />
        {note?.tag != null && (
          <span
            className={cn(
              'rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
              note.tag === 'obiettivo'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : note.tag === 'alternativa'
                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                  : 'border-rose-500/30 bg-rose-500/10 text-rose-300',
            )}
          >
            ★ {note.tag}
          </span>
        )}
      </div>

      {note !== null && note.text.trim() !== '' && (
        <p className="flex gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-xs italic leading-snug text-zinc-300">
          <Quote size={11} className="mt-0.5 shrink-0 text-zinc-600" />
          {note.text}
        </p>
      )}

      {lineup !== null && (
        <section className="flex flex-col gap-1">
          <SectionTitle right={<span className="num text-[11px] text-zinc-500">{lineup.module}</span>}>
            {player.team}
          </SectionTitle>
          <ul className="grid grid-cols-2 gap-x-3">
            {lineup.slots.map((slot) => {
              const mine = slot.candidates.includes(player.id);
              return (
                <li
                  key={slot.slotId}
                  className={cn(
                    'flex gap-1.5 text-[11px]',
                    mine ? 'font-medium text-emerald-300' : 'text-zinc-500',
                  )}
                >
                  <span className="w-7 shrink-0 uppercase text-zinc-600">{slot.roleLabel}</span>
                  <span className="truncate">
                    {slot.candidates.length === 0 ? '—' : slot.candidates.length > 1 ? '⚔ ' : ''}
                    {slot.candidates.length > 0 && <SlotNames ids={slot.candidates} />}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Il prezzo: la cifra piu' grande del pannello, in mono tabellare. */}
      <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-2.5">
        <label className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-zinc-500">
            <Coins size={12} />
            Prezzo
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <StepButton label="Meno un credito" onClick={() => onPriceChange(Math.max(1, (price ?? 1) - 1))}>
              <Minus size={14} />
            </StepButton>
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
              className={cn(
                'num no-spin h-11 w-24 rounded-lg border border-white/[0.08] bg-zinc-900/80 text-center text-2xl font-bold text-zinc-100 outline-none transition-all',
                'focus:border-emerald-500/50 focus:shadow-glow-emerald',
              )}
            />
            <StepButton label="Piu' un credito" onClick={() => onPriceChange((price ?? 0) + 1)}>
              <Plus size={14} />
            </StepButton>
          </div>
        </label>

        <p className="mt-2 text-[11px] leading-snug text-zinc-500">
          {price === null ? (
            'Digita il prezzo, o scrivilo nella barra dopo il nome.'
          ) : rivals.length === 0 ? (
            <span className="font-medium text-emerald-400">
              A {price} nessuno può rilanciare.
            </span>
          ) : (
            <>
              A <span className="num text-zinc-300">{price}</span> possono rilanciare in{' '}
              <strong className="num text-zinc-200">{rivals.length}</strong>:{' '}
              <span className="font-medium uppercase tracking-wide text-zinc-400">
                {rivals
                  .map((r) => teams.find((t) => t.id === r.teamId)?.abbr ?? r.teamId)
                  .join(' ')}
              </span>
            </>
          )}
        </p>
      </section>

      <section className="flex flex-col gap-1">
        <SectionTitle icon={<Users size={12} />}>A chi è andato?</SectionTitle>
        <TeamGrid
          statuses={statuses}
          teams={teams}
          state={state}
          price={price}
          role={player.role}
          onPick={busy ? null : (team) => void handleAssign(team)}
        />
      </section>

      <AnimatePresence>
        {error !== null && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: EASE }}
            className="flex animate-flash-err items-start gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-200"
          >
            <TriangleAlert size={13} className="mt-0.5 shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <span className="sr-only" aria-live="polite">
        {theme.label}
      </span>
    </aside>
  );
}

function StepButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-400 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-zinc-100"
    >
      {children}
    </button>
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
 *
 * Ogni riquadro porta anche i quattro reparti come barrette colorate: la rosa
 * di un avversario si legge senza aprire niente, e il ruolo pieno si vede
 * prima ancora di leggere "pieno".
 */
function TeamGrid({
  statuses,
  teams,
  state,
  price,
  role,
  onPick,
}: {
  readonly statuses: readonly TeamBidStatus[];
  readonly teams: readonly FantaTeam[];
  readonly state: LeagueState;
  readonly price: number | null;
  readonly role?: Player['role'] | undefined;
  readonly onPick: ((team: FantaTeam) => void) | null;
}): JSX.Element {
  const byTeam = new Map(statuses.map((s) => [s.teamId, s]));

  return (
    <ul className="grid grid-cols-2 gap-1.5">
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
              className={cn(
                'w-full rounded-lg border px-2 py-1.5 text-left transition-all',
                blocked
                  ? 'border-white/[0.04] bg-transparent text-zinc-700 opacity-60'
                  : team.isUser
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-500/60 hover:bg-emerald-500/15'
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-200 hover:border-emerald-500/40 hover:bg-white/[0.06]',
                clickable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <span className="flex items-baseline justify-between gap-1">
                <span className="truncate text-xs font-semibold uppercase tracking-wide">
                  {team.abbr}
                </span>
                <span
                  className={cn(
                    'num shrink-0 text-base font-bold',
                    blocked ? 'text-zinc-700' : 'text-zinc-100',
                  )}
                >
                  {status.credits}
                </span>
              </span>
              <span className="mt-0.5 flex items-baseline justify-between gap-1 text-[10px] text-zinc-500">
                <span className="truncate">{team.name}</span>
                <span className="num shrink-0">
                  {status.blockedBy === 'ROLE_FULL' ? 'pieno' : `max ${status.maxBidAssoluto}`}
                </span>
              </span>
              <RoleSlots state={state} teamId={team.id} highlight={role} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Quattro barrette, una per reparto: quanto della rosa e' gia' fatta. */
export function RoleSlots({
  state,
  teamId,
  highlight,
  className,
}: {
  readonly state: LeagueState;
  readonly teamId: string;
  readonly highlight?: Player['role'] | undefined;
  readonly className?: string | undefined;
}): JSX.Element {
  const t = teamState(state, teamId);
  return (
    <span className={cn('mt-1.5 flex gap-1', className)}>
      {PHASE_ORDER.map((r) => {
        const filled = t.slotsFilledByRole[r];
        const total = filled + t.slotsFreeByRole[r];
        const ratio = total === 0 ? 0 : filled / total;
        return (
          <span
            key={r}
            title={`${r}: ${filled}/${total}`}
            className={cn(
              'h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]',
              highlight === r && 'ring-1 ring-white/20',
            )}
          >
            <span
              className={cn('block h-full rounded-full', roleTheme(r).bar)}
              style={{ width: `${ratio * 100}%` }}
            />
          </span>
        );
      })}
    </span>
  );
}
