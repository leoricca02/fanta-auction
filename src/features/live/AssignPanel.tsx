import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Coins, Minus, Plus, Quote, TriangleAlert, Users, Wand2 } from 'lucide-react';

import type { FantaTeam, Player } from '../../domain/types';
import { PHASE_ORDER } from '../../domain/types';
import type { LeagueState } from '../../domain/reducer';
import { teamState } from '../../domain/reducer';
import type { TeamBidStatus } from '../../domain/metrics';
import { bidStatusForAll, rivalsAbove } from '../../domain/metrics';
import { lineupPlacement, makeLineupIndex } from '../../domain/lineup';
import {
  MIN_SAMPLE,
  dynamicPrice,
  isMovementRole,
  makeExpectationIndex,
  marketRates,
} from '../../domain/valuation';
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
    'flex w-96 shrink-0 flex-col gap-3 overflow-y-auto border-l border-hair bg-panel/70 p-3 backdrop-blur-xl';

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
        <LineupBadge
          status={placement.status}
          rank={placement.ballotRank}
          rankOf={placement.ballotSize}
        />
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
        <p className="flex gap-1.5 rounded-lg border border-seam bg-film px-2.5 py-2 text-xs italic leading-snug text-zinc-300">
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

      <DynamicPriceHint player={player} state={state} price={price} onUse={onPriceChange} />

      {/* Il prezzo: la cifra piu' grande del pannello, in mono tabellare. */}
      <section className="rounded-xl border border-hair bg-veil p-2.5">
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
                'num no-spin h-11 w-24 rounded-lg border border-hair bg-elevated/80 text-center text-2xl font-bold tracking-tight text-white outline-none transition-all duration-150',
                'focus:border-emerald-500/50 focus:shadow-glow-emerald',
              )}
            />
            <StepButton label="Piu' un credito" onClick={() => onPriceChange((price ?? 0) + 1)}>
              <Plus size={14} />
            </StepButton>
          </div>
        </label>

        {/*
          Rilanci rapidi. All'asta il prezzo non sale di uno: sale a scatti,
          e quattro pressioni del +1 sono quattro occasioni di perdere il
          conto mentre il banditore va avanti. I salti sono quelli che si
          sentono chiamare davvero.
        */}
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">rilancia</span>
          {QUICK_RAISES.map((step) => (
            <QuickRaise
              key={step}
              step={step}
              onClick={() => onPriceChange((price ?? 0) + step)}
            />
          ))}
        </div>

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
              <span className="font-medium text-zinc-400">
                {rivals
                  .map((r) => teams.find((t) => t.id === r.teamId)?.name ?? r.teamId)
                  .join(', ')}
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

/**
 * Il prezzo dinamico (§5.5) sopra la casella del prezzo.
 *
 * E' il posto in cui serve: mentre il rilancio sale si guarda qui, non nella
 * scheda. Compare **solo se hai valutato quel giocatore** — su un nome che non
 * hai valutato non c'e' niente da dire, e una riga vuota su ogni chiamata
 * sarebbe rumore in mezzo alla cosa piu' densa dello schermo.
 *
 * Quando hai gia' battuto una cifra, mostra anche di quanto la stai
 * superando. E' la domanda da cui e' nata la feature: se penso che questo
 * faccia i numeri di uno pagato 60, perche' sto scrivendo 90?
 */
function DynamicPriceHint({
  player,
  state,
  price,
  onUse,
}: {
  readonly player: Player;
  readonly state: LeagueState;
  readonly price: number | null;
  readonly onUse: (price: number) => void;
}): JSX.Element | null {
  const userData = useAppStore((s) => s.userData);
  const enabled = useAppStore((s) => s.expectationsEnabled);
  const expectations = useMemo(
    () => makeExpectationIndex(userData.expectations),
    [userData.expectations],
  );
  const rates = useMemo(() => marketRates(state, expectations), [state, expectations]);

  if (!enabled || !isMovementRole(player.role)) return null;
  if (!expectations.has(player.id)) return null;

  const quote = dynamicPrice(player, expectations, rates);

  if (quote === null) {
    return (
      <p className="rounded-lg border border-dashed border-hair px-2.5 py-1.5 text-[11px] leading-snug text-zinc-500">
        Valutato, ma nel reparto {player.role} non è ancora stata battuta nessuna asta di un
        giocatore che hai valutato: il prezzo consigliato esce da lì.
      </p>
    );
  }

  /*
    Provvisorio: il prezzo c'e' gia', ma poggia su una o due aste. Sulla
    simulazione il primo tasso dei centrocampisti e' uscito fra 0,62 e 6,00
    contro 1,54 di fine asta — un consiglio anche quadruplo, e proprio sui
    primi nomi grossi. Quindi il numero si mostra, ma in tono minore: niente
    cifra grande verde, niente bacchetta che lo scrive nella casella, e il
    campione scritto a parole. Un numero da tenere d'occhio, non da seguire.
  */
  if (quote.provisional) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-rim bg-veil px-2.5 py-1.5">
        <span className="shrink-0 whitespace-nowrap text-[10px] uppercase tracking-wider text-zinc-600">
          provvisorio
        </span>
        <span className="num text-base font-semibold leading-none text-zinc-300">
          {quote.price}
        </span>
        <span className="ml-auto text-right text-[10px] leading-tight text-zinc-600">
          su {quote.sample === 1 ? 'una sola asta' : `${quote.sample} aste`} {player.role}
          <br />
          si assesta al {MIN_SAMPLE}° colpo
        </span>
      </div>
    );
  }

  const over = price !== null && price > quote.price ? price / quote.price - 1 : null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-1.5">
      <span className="shrink-0 whitespace-nowrap text-[10px] uppercase tracking-wider text-zinc-500">
        consigliato
      </span>
      <span className="num text-xl font-bold leading-none text-emerald-300">{quote.price}</span>

      {over !== null && (
        <span className="num rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
          +{Math.round(over * 100)}%
        </span>
      )}

      <span className="num ml-auto text-right text-[10px] leading-tight text-zinc-600">
        V {quote.value.toFixed(1)} · tasso {quote.rate.toFixed(2)}
        <br />
        su {quote.sample} aste {player.role}
      </span>

      <button
        type="button"
        onClick={() => onUse(quote.price)}
        title="Scrivi il consigliato nella casella del prezzo"
        className="focus-ring shrink-0 rounded-md border border-emerald-500/30 p-1 text-emerald-300/80 transition-colors hover:bg-emerald-500/15 hover:text-emerald-200"
      >
        <Wand2 size={12} />
      </button>
    </div>
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
      className={cn(
        'focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hair',
        'bg-gradient-to-b from-scrim to-veil text-zinc-400',
        'transition-all duration-150 hover:border-edge hover:text-zinc-100 hover:shadow-[0_0_12px_-4px_rgb(16_185_129_/_0.5)]',
        'active:scale-95',
      )}
    >
      {children}
    </button>
  );
}

/** I salti che si sentono chiamare davvero: +1 lo fa gia' il bottone accanto. */
const QUICK_RAISES = [5, 10, 25] as const;

function QuickRaise({
  step,
  onClick,
}: {
  readonly step: number;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Aggiungi ${step} crediti`}
      className={cn(
        'num focus-ring rounded-md border border-hair bg-gradient-to-b from-scrim to-veil',
        'px-2 py-0.5 text-[11px] font-semibold text-zinc-400',
        'transition-all duration-150 hover:border-emerald-500/40 hover:text-emerald-300',
        'active:scale-95',
      )}
    >
      +{step}
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
  // Prima del primo colpo battuto tutti hanno il budget intero: dodici barre
  // piene non dicono niente. Dal primo in poi il confronto e' l'informazione,
  // e allora la barra c'e' per tutti — anche per chi non ha ancora speso,
  // altrimenti la griglia si legge a macchie invece che a colpo d'occhio.
  const started = Object.keys(state.assignmentByPlayerId).length > 0;

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
                'focus-ring w-full rounded-lg border px-2 py-1.5 text-left transition-all duration-100',
                // Chiudere l'acquisto e' l'azione piu' pesante della schermata:
                // deve rispondere sotto il dito, non solo cambiare colore.
                clickable && 'active:scale-[0.98]',
                blocked
                  ? 'border-seam bg-transparent text-zinc-700 opacity-60'
                  : team.isUser
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:border-emerald-500/60 hover:bg-emerald-500/15'
                    : 'border-hair bg-veil text-zinc-200 hover:border-emerald-500/40 hover:bg-scrim',
                clickable ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <span className="flex items-baseline justify-between gap-1">
                <span className="truncate text-xs font-semibold" title={team.name}>
                  {team.name}
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
              <span className="mt-0.5 flex items-baseline justify-end gap-1 text-[10px] text-zinc-500">
                <span className="num shrink-0">
                  {status.blockedBy === 'ROLE_FULL' ? 'pieno' : `max ${status.maxBidAssoluto}`}
                </span>
              </span>
              {started && <BudgetBar state={state} teamId={team.id} dimmed={blocked} />}
              <RoleSlots state={state} teamId={team.id} highlight={role} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Quanto budget e' rimasto a quella squadra, come frazione di quello iniziale.
 *
 * La cifra dei crediti sopra dice **quanto ha**; questa barra dice **a che
 * punto e'**, ed e' un'altra domanda. Trecento crediti residui sono tanti a
 * meta' asta e sono un problema alla fine, e il numero da solo non distingue
 * i due casi: la barra si', perche' e' relativa al punto di partenza.
 *
 * Il colore e' la soglia oltre la quale il comportamento al tavolo cambia:
 * sopra meta' budget si rilancia, sotto si sceglie, sotto il 15% si tira
 * avanti a 1 credito. Chi e' fuori gioco a questo prezzo la porta spenta,
 * perche' il riquadro e' gia' spento e due segnali di "no" sono uno di troppo.
 *
 * Chi la mostra e quando lo decide `TeamGrid`: qui si disegna e basta.
 */
function BudgetBar({
  state,
  teamId,
  dimmed,
}: {
  readonly state: LeagueState;
  readonly teamId: string;
  readonly dimmed: boolean;
}): JSX.Element | null {
  const t = teamState(state, teamId);
  const budget = t.credits + t.spent;
  if (budget === 0) return null;

  const share = t.credits / budget;
  const fill = dimmed
    ? 'bg-zinc-700'
    : share > 0.5
      ? 'bg-emerald-500'
      : share > 0.15
        ? 'bg-amber-500'
        : 'bg-rose-500';

  return (
    <span
      className="mt-1 flex h-1 w-full overflow-hidden rounded-full bg-scrim"
      title={`${t.credits} di ${budget} crediti (${Math.round(share * 100)}%)`}
    >
      <span
        className={cn('h-full rounded-full transition-[width] duration-300', fill)}
        style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
      />
    </span>
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
              'h-1 flex-1 overflow-hidden rounded-full bg-scrim',
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
