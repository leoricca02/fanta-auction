import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Player } from '../../domain/types';
import { PHASE_ORDER } from '../../domain/types';
import { makePlayerIndex, maxBidAssoluto, reduce, teamState } from '../../domain/reducer';
import { activePhase, computeFreeAgents, makeNoteIndex } from '../../domain/free-agents';
import { computeReconciliation } from '../../domain/metrics';
import { userTeam } from '../../domain/config';
import { useAppStore } from '../../store/appStore';
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
      <div className="p-8 text-sm text-neutral-400">
        Carica prima il listone da <strong className="text-neutral-200">Impostazioni</strong>.
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
          <section className="flex min-h-0 w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r border-neutral-800 p-3">
            <h2 className="text-xs uppercase tracking-wide text-neutral-500">
              {teamState(state, me.id).teamId} — la tua rosa
            </h2>
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

          <nav className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <OverlayButton label="Scheda" hint="?" onClick={() => setOverlay('card')} />
            <OverlayButton label="Obiettivi" hint="o" onClick={() => setOverlay('goals')} />
            <OverlayButton label="Svincolati" hint="s" onClick={() => setOverlay('free')} />
            <OverlayButton label="Statistiche" hint="t" onClick={() => setOverlay('stats')} />
            <span className="ml-1 text-neutral-600">
              <kbd>Ctrl+Z</kbd> annulla · <kbd>Ctrl+Shift+Z</kbd> ripristina
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

      {overlay === 'card' && highlighted !== null && (
        <OverlayShell onClose={closeOverlay}>
          <PlayerCard player={highlighted} onClose={closeOverlay} />
        </OverlayShell>
      )}
      {overlay === 'goals' && (
        <OverlayShell onClose={closeOverlay}>
          <GoalsPanel onClose={closeOverlay} />
        </OverlayShell>
      )}
      {overlay === 'free' && (
        <OverlayShell onClose={closeOverlay}>
          <FreeAgentsPanel onClose={closeOverlay} />
        </OverlayShell>
      )}
      {overlay === 'stats' && (
        <OverlayShell onClose={closeOverlay}>
          <StatsPanel onClose={closeOverlay} />
        </OverlayShell>
      )}
    </div>
  );
}

/** Ogni overlay ha un bottone oltre alla lettera: mouse e tastiera pari grado. */
function OverlayButton({
  label,
  hint,
  onClick,
}: {
  readonly label: string;
  readonly hint: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-100"
    >
      {label} <kbd className="text-neutral-500">{hint}</kbd>
    </button>
  );
}

function OverlayShell({
  children,
  onClose,
}: {
  readonly children: React.ReactNode;
  readonly onClose: () => void;
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-30 flex items-stretch justify-end bg-black/70"
      onClick={onClose}
    >
      <div
        className="flex max-h-full"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        {children}
      </div>
    </div>
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
  readonly phase: string | null;
  readonly free: Readonly<Record<string, number>>;
  readonly targets: Readonly<Record<string, number>>;
  readonly consistent: boolean;
}): JSX.Element {
  return (
    <div
      className={`flex shrink-0 flex-wrap items-center gap-4 border-b px-3 py-1.5 text-xs ${
        consistent ? 'border-neutral-800 text-neutral-400' : 'border-red-800 bg-red-950/40 text-red-200'
      }`}
    >
      <span>
        Fase <strong className="text-neutral-100">{phase ?? 'conclusa'}</strong>
      </span>
      <span className="tabular-nums">
        crediti <strong className="text-neutral-100">{creditsSpent}</strong> / {totalCredits}
      </span>
      <span className="tabular-nums">
        slot <strong className="text-neutral-100">{slotsFilled}</strong> / {totalSlots}
      </span>
      <span className="text-neutral-500">
        liberi:{' '}
        {PHASE_ORDER.map((role) => (
          <span key={role} className="mr-2 tabular-nums">
            {role} {free[role]}
            {(targets[role] ?? 0) > 0 && (
              <span className="text-emerald-400"> ({targets[role]}★)</span>
            )}
          </span>
        ))}
      </span>
      {!consistent && <span className="font-medium">conti incoerenti — controlla il tabellone</span>}
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
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm tabular-nums text-neutral-300">
        <strong className="text-2xl text-emerald-400">{t.credits}</strong> crediti ·{' '}
        {t.slotsFree} slot liberi · max {maxBidAssoluto(t)}
      </p>
      {PHASE_ORDER.map((role) => (
        <div key={role}>
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">
            {role} {t.slotsFilledByRole[role]}/{t.slotsFilledByRole[role] + t.slotsFreeByRole[role]}
          </p>
          <ul className="mt-0.5">
            {t.roster
              .filter((entry) => entry.role === role)
              .map((entry) => (
                <li key={entry.playerId} className="flex justify-between gap-2 text-sm">
                  <span className="truncate text-neutral-200">
                    {players.get(entry.playerId)?.name ?? `#${entry.playerId}`}
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-500">{entry.price}</span>
                </li>
              ))}
            {t.slotsFilledByRole[role] === 0 && <li className="text-sm text-neutral-700">—</li>}
          </ul>
        </div>
      ))}
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
    return <p className="text-xs text-neutral-600">Nessuna assegnazione registrata.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-[11px] uppercase tracking-wide text-neutral-500">Ultime assegnazioni</h3>
      <ul className="flex flex-col">
        {recent.map((event) => (
          <li
            key={event.id}
            className={`flex items-center gap-2 py-0.5 text-xs ${
              event.undone ? 'text-neutral-600 line-through' : 'text-neutral-300'
            }`}
          >
            <span className="min-w-0 flex-1 truncate">
              {byId.get(event.playerId)?.name ?? `#${event.playerId}`}
            </span>
            <span className="w-10 shrink-0 uppercase text-neutral-500">
              {teams.find((t) => t.id === event.teamId)?.abbr ?? event.teamId}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums">{event.price}</span>
            <button
              type="button"
              onClick={() =>
                void (event.undone ? redoAssignment(event.id) : undoAssignment(event.id))
              }
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
            >
              {event.undone ? 'ripristina' : 'annulla'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
