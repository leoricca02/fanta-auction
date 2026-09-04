import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  History,
  IdCard,
  Redo2,
  Target,
  TriangleAlert,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react';

import type { Player, Role } from '../../domain/types';
import { PHASE_ORDER } from '../../domain/types';
import { makePlayerIndex, maxBidAssoluto, reduce, teamState } from '../../domain/reducer';
import { activePhase, computeFreeAgents, makeNoteIndex } from '../../domain/free-agents';
import { computeReconciliation } from '../../domain/metrics';
import { userTeam } from '../../domain/config';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { EASE, Kbd, Meter, SectionTitle, SlideOver } from '../../ui/primitives';
import { PlayerCard } from '../player/PlayerCard';
import { FreeAgentsPanel } from '../free/FreeAgentsPanel';
import { GoalsPanel } from '../goals/GoalsPanel';
import { StatsPanel } from './StatsPanel';
import type { CommandBarHandle } from './CommandBar';
import { CommandBar } from './CommandBar';
import { AssignPanel } from './AssignPanel';

/**
 * Schermata dell'asta (PRD §5.1), tre zone.
 *
 * Sinistra dominante: la tua rosa. Centro: command bar e watchlist della fase.
 * Destra densa: i dodici partecipanti con crediti e max bid assoluto — la
 * risposta a "chi puo' ancora battermi".
 *
 * Overlay da tastiera: `?` scheda del giocatore evidenziato, `o` obiettivi,
 * `s` svincolati, `t` statistiche dell'asta, `Esc` chiude e il focus torna alla
 * barra col testo intatto. Ognuno ha anche il suo bottone: all'asta si sta con
 * tastiera **e** mouse, e obbligare a ricordare una lettera non e' un servizio.
 */

type Overlay = 'card' | 'goals' | 'free' | 'stats' | null;

export function LivePage(): JSX.Element {
  const players = useAppStore((s) => s.players);
  const teams = useAppStore((s) => s.teams);
  const userData = useAppStore((s) => s.userData);
  const leagueConfig = useAppStore((s) => s.leagueConfig);
  const undoLast = useAppStore((s) => s.undoLast);
  const redoLast = useAppStore((s) => s.redoLast);

  const [overlay, setOverlay] = useState<Overlay>(null);
  const [highlighted, setHighlighted] = useState<Player | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const barRef = useRef<CommandBarHandle>(null);

  const config = useMemo(
    () => leagueConfig(),
    // La config dipende da listone e squadre, non dall'event log.
    [leagueConfig, players, teams],
  );

  const state = useMemo(() => reduce(userData.events, config), [userData.events, config]);
  const playerIndex = useMemo(() => makePlayerIndex(players), [players]);
  const notes = useMemo(() => makeNoteIndex(userData.playerNotes), [userData.playerNotes]);

  const free = useMemo(() => computeFreeAgents(state, config, notes), [state, config, notes]);
  const phase = activePhase(free.slotsFreeByRole);
  const reconciliation = useMemo(() => computeReconciliation(state, config), [state, config]);

  const assignedIds = useMemo(
    () => new Set(Object.keys(state.assignmentByPlayerId).map(Number)),
    [state.assignmentByPlayerId],
  );

  const me = useMemo(() => {
    try {
      return userTeam(config);
    } catch {
      return null;
    }
  }, [config]);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
    barRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if (event.key === 'Escape') {
        closeOverlay();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void (event.shiftKey ? redoLast() : undoLast());
        return;
      }
      // Le scorciatoie a lettera non devono scattare mentre digiti un nome:
      // l'unica che passa sempre e' `?`, che non fa parte di nessun nome.
      if (event.key === '?') {
        event.preventDefault();
        setOverlay('card');
        return;
      }
      if (typing) return;
      if (event.key === 'o') setOverlay('goals');
      if (event.key === 's') setOverlay('free');
      if (event.key === 't') setOverlay('stats');
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeOverlay, undoLast, redoLast]);

  if (players.length === 0) {
    return (
      <div className="p-8 text-sm text-zinc-400">
        Carica prima il listone da <strong className="text-zinc-200">Impostazioni</strong>.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReconciliationBar
        creditsSpent={reconciliation.creditsSpent}
        totalCredits={reconciliation.totalCredits}
        slotsFilled={reconciliation.slotsFilled}
        totalSlots={reconciliation.totalSlots}
        phase={phase}
        free={free.countByRole}
        targets={free.targetCountByRole}
        consistent={reconciliation.consistent}
      />

      <div className="flex min-h-0 flex-1">
        {me !== null && (
          <section className="flex min-h-0 w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/[0.08] bg-white/[0.01] p-3">
            <SectionTitle icon={<Wallet size={12} />}>La tua rosa</SectionTitle>
            <MyRoster teamId={me.id} state={state} players={playerIndex} />
          </section>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <CommandBar
            ref={barRef}
            phase={phase}
            assignedIds={assignedIds}
            onHighlight={setHighlighted}
            onPriceChange={setCurrentPrice}
          />

          <nav className="flex flex-wrap items-center gap-1.5">
            <OverlayButton
              label="Scheda"
              hint="?"
              icon={<IdCard size={13} />}
              onClick={() => setOverlay('card')}
            />
            <OverlayButton
              label="Obiettivi"
              hint="o"
              icon={<Target size={13} />}
              onClick={() => setOverlay('goals')}
            />
            <OverlayButton
              label="Svincolati"
              hint="s"
              icon={<Users size={13} />}
              onClick={() => setOverlay('free')}
            />
            <OverlayButton
              label="Statistiche"
              hint="t"
              icon={<BarChart3 size={13} />}
              onClick={() => setOverlay('stats')}
            />
            <span className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Kbd>Ctrl Z</Kbd> annulla
              <Kbd>Ctrl ⇧ Z</Kbd> ripristina
            </span>
          </nav>

          <RecentEvents />
        </section>

        <AssignPanel
          player={highlighted}
          state={state}
          teams={teams}
          price={currentPrice}
          onPriceChange={setCurrentPrice}
          onAssigned={() => barRef.current?.clear()}
        />
      </div>

      <SlideOver open={overlay === 'card' && highlighted !== null} onClose={closeOverlay}>
        {highlighted !== null && <PlayerCard player={highlighted} onClose={closeOverlay} />}
      </SlideOver>
      <SlideOver open={overlay === 'goals'} onClose={closeOverlay}>
        <GoalsPanel onClose={closeOverlay} />
      </SlideOver>
      <SlideOver open={overlay === 'free'} onClose={closeOverlay}>
        <FreeAgentsPanel onClose={closeOverlay} />
      </SlideOver>
      <SlideOver open={overlay === 'stats'} onClose={closeOverlay}>
        <StatsPanel onClose={closeOverlay} />
      </SlideOver>
    </div>
  );
}

/** Ogni overlay ha un bottone oltre alla lettera: mouse e tastiera pari grado. */
function OverlayButton({
  label,
  hint,
  icon,
  onClick,
}: {
  readonly label: string;
  readonly hint: string;
  readonly icon: React.ReactNode;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100"
    >
      <span className="text-zinc-500">{icon}</span>
      {label}
      <Kbd>{hint}</Kbd>
    </button>
  );
}

function ReconciliationBar({
  creditsSpent,
  totalCredits,
  slotsFilled,
  totalSlots,
  phase,
  free,
  targets,
  consistent,
}: {
  readonly creditsSpent: number;
  readonly totalCredits: number;
  readonly slotsFilled: number;
  readonly totalSlots: number;
  readonly phase: Role | null;
  readonly free: Readonly<Record<string, number>>;
  readonly targets: Readonly<Record<string, number>>;
  readonly consistent: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1.5 border-b px-3 py-2 text-xs',
        consistent
          ? 'border-white/[0.08] bg-white/[0.01] text-zinc-400'
          : 'animate-flash-err border-rose-500/30 bg-rose-500/10 text-rose-200',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="text-zinc-500">Fase</span>
        {phase === null ? (
          <span className="font-semibold text-zinc-100">conclusa</span>
        ) : (
          <span
            className={cn(
              'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
              roleTheme(phase).chip,
            )}
          >
            {phase} · {roleTheme(phase).label}
          </span>
        )}
      </span>

      <span className="flex min-w-[9rem] items-center gap-2">
        <span className="text-zinc-500">crediti</span>
        <span className="num text-zinc-100">{creditsSpent}</span>
        <span className="num text-zinc-600">/ {totalCredits}</span>
        <Meter
          value={totalCredits === 0 ? 0 : creditsSpent / totalCredits}
          className="w-16"
          fill="bg-emerald-500"
        />
      </span>

      <span className="flex min-w-[9rem] items-center gap-2">
        <span className="text-zinc-500">slot</span>
        <span className="num text-zinc-100">{slotsFilled}</span>
        <span className="num text-zinc-600">/ {totalSlots}</span>
        <Meter
          value={totalSlots === 0 ? 0 : slotsFilled / totalSlots}
          className="w-16"
          fill="bg-zinc-400"
        />
      </span>

      <span className="flex items-center gap-2">
        <span className="text-zinc-500">liberi</span>
        {PHASE_ORDER.map((role) => (
          <span
            key={role}
            className={cn(
              'num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]',
              roleTheme(role).chip,
            )}
            title={`${roleTheme(role).label}: ${free[role]} svincolati`}
          >
            {role} {free[role]}
            {(targets[role] ?? 0) > 0 && (
              <span className="text-emerald-300">★{targets[role]}</span>
            )}
          </span>
        ))}
      </span>

      {!consistent && (
        <span className="flex items-center gap-1.5 font-medium">
          <TriangleAlert size={13} />
          conti incoerenti — controlla il tabellone
        </span>
      )}
    </div>
  );
}

function MyRoster({
  teamId,
  state,
  players,
}: {
  readonly teamId: string;
  readonly state: ReturnType<typeof reduce>;
  readonly players: ReturnType<typeof makePlayerIndex>;
}): JSX.Element {
  const t = teamState(state, teamId);
  const maxBid = maxBidAssoluto(t);
  /**
   * Soglia di sicurezza: ogni slot ancora vuoto costa almeno un credito, e
   * quello che avanza oltre quel minimo e' l'unica cifra con cui puoi davvero
   * rilanciare. Quando il margine scende sotto un credito per slot vuoto la
   * rosa si chiude da sola, anche se i crediti non sono finiti: e' il momento
   * in cui conviene saperlo, non quello in cui arrivi a zero.
   */
  const cushion = t.credits - t.slotsFree;
  const tight = t.slotsFree > 0 && cushion <= t.slotsFree;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'rounded-xl border p-3 transition-colors',
          tight
            ? 'border-amber-500/30 bg-amber-500/[0.07]'
            : 'border-white/[0.08] bg-white/[0.02]',
        )}
      >
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'num text-3xl font-bold leading-none',
              tight ? 'text-amber-300' : 'text-emerald-400',
            )}
          >
            {t.credits}
          </span>
          <span className="text-xs text-zinc-500">crediti</span>
        </div>
        <div className="num mt-1 flex items-center gap-2 text-[11px] text-zinc-500">
          <span>{t.slotsFree} slot liberi</span>
          <span className="text-zinc-700">·</span>
          <span>max bid {maxBid}</span>
        </div>
        {tight && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-amber-300/90">
            <TriangleAlert size={12} className="mt-px shrink-0" />
            Ti resta poco oltre il minimo di 1 credito per slot: da qui in avanti puoi rilanciare
            su pochi nomi.
          </p>
        )}
      </div>

      {PHASE_ORDER.map((role) => {
        const filled = t.slotsFilledByRole[role];
        const total = filled + t.slotsFreeByRole[role];
        const theme = roleTheme(role);
        return (
          <div key={role}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold',
                  theme.chip,
                )}
              >
                {role}
              </span>
              <span className="num text-[11px] text-zinc-500">
                {filled}/{total}
              </span>
              <Meter
                value={total === 0 ? 0 : filled / total}
                fill={theme.bar}
                className="ml-auto w-16"
              />
            </div>
            <ul className="mt-1 flex flex-col">
              {t.roster
                .filter((entry) => entry.role === role)
                .map((entry) => (
                  <li
                    key={entry.playerId}
                    className="flex justify-between gap-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 truncate text-zinc-200">
                      {players.get(entry.playerId)?.name ?? `#${entry.playerId}`}
                    </span>
                    <span className="num shrink-0 text-zinc-500">{entry.price}</span>
                  </li>
                ))}
              {filled === 0 && <li className="px-1 text-sm text-zinc-700">—</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function RecentEvents(): JSX.Element {
  const players = useAppStore((s) => s.players);
  const teams = useAppStore((s) => s.teams);
  const events = useAppStore((s) => s.userData.events);
  const undoAssignment = useAppStore((s) => s.undoAssignment);
  const redoAssignment = useAppStore((s) => s.redoAssignment);

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const recent = [...events].slice(-8).reverse();

  if (recent.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-zinc-600">
        Nessuna assegnazione registrata.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle icon={<History size={12} />}>Ultime assegnazioni</SectionTitle>
      <ul className="flex flex-col overflow-hidden rounded-lg border border-white/[0.06]">
        <AnimatePresence initial={false}>
          {recent.map((event) => (
            <motion.li
              key={event.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className={cn(
                'flex items-center gap-2 px-2 py-1 text-xs transition-colors hover:bg-white/[0.03]',
                event.undone ? 'text-zinc-600 line-through opacity-60' : 'text-zinc-300',
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {byId.get(event.playerId)?.name ?? `#${event.playerId}`}
              </span>
              <span className="w-28 shrink-0 truncate text-[11px] font-medium text-zinc-500">
                {teams.find((t) => t.id === event.teamId)?.name ?? event.teamId}
              </span>
              <span className="num w-10 shrink-0 text-right text-zinc-200">{event.price}</span>
              <button
                type="button"
                onClick={() =>
                  void (event.undone ? redoAssignment(event.id) : undoAssignment(event.id))
                }
                title={event.undone ? 'Ripristina' : 'Annulla'}
                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 no-underline transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                {event.undone ? <Redo2 size={11} /> : <Undo2 size={11} />}
                {event.undone ? 'ripristina' : 'annulla'}
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
