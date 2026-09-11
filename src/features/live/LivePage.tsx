import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  History,
  IdCard,
  Redo2,
  RotateCcw,
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
import { EASE, EmptyState, Kbd, Meter, MicroLabel, SectionTitle, SlideOver } from '../../ui/primitives';
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
        {/*
          La colonna non scorre piu' tutta insieme: scorre solo la lista dei
          reparti, dentro `MyRoster`. Crediti residui e max bid sono la cifra
          che si guarda mentre si rilancia, e scrollavano via appena si andava
          a cercare un nome in fondo agli attaccanti.
        */}
        {me !== null && (
          <section className="flex min-h-0 w-72 shrink-0 flex-col gap-3 overflow-hidden border-r border-hair bg-veil p-3">
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
            <ResetAuctionButton logged={userData.events.length} active={state.appliedEventIds.length} />
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
      className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-hair bg-veil px-2.5 py-1.5 text-xs text-zinc-300 transition-all duration-100 hover:border-edge hover:bg-scrim hover:text-zinc-100 active:scale-[0.98]"
    >
      <span className="text-zinc-500">{icon}</span>
      {label}
      <Kbd>{hint}</Kbd>
    </button>
  );
}

/**
 * Azzera l'asta senza uscire dall'asta.
 *
 * Serve alle prove a vuoto: si batte mezza fase per prendere la mano, e poi
 * si vuole ripartire puliti senza andare a cercare il bottone in Impostazioni.
 *
 * **Cancella l'event log**, non lo annulla. E' l'opposto dell'undo che sta
 * ovunque nell'app, ed e' voluto: dopo una prova, i colpi annullati non sono
 * storia di niente, e "Ultime assegnazioni" piena di righe barrate della
 * sessione precedente e' rumore che sopravvive al gesto che doveva toglierlo.
 * Per il click di troppo sotto asta ci sono `Ctrl Z` e l'annulla riga per
 * riga, che restano soft e restano l'attrezzo giusto.
 *
 * Conta gli eventi nel log, non le assegnazioni attive: annullati a mano uno
 * per uno restano da cancellare, e con `active` a zero il bottone sarebbe
 * sparito lasciandoli li'. Chiede conferma perche' da qui si torna indietro
 * solo da un backup.
 */
function ResetAuctionButton({
  logged,
  active,
}: {
  readonly logged: number;
  readonly active: number;
}): JSX.Element | null {
  const clearAuctionLog = useAppStore((s) => s.clearAuctionLog);
  const [arming, setArming] = useState(false);

  // Il log svuotato mentre la conferma e' aperta la lascerebbe aperta su un
  // tabellone gia' vuoto.
  useEffect(() => {
    if (logged === 0) setArming(false);
  }, [logged]);

  if (logged === 0) return null;

  if (!arming) {
    return (
      <button
        type="button"
        onClick={() => setArming(true)}
        title={`Cancella i ${logged} colpi registrati finora e riparte da zero`}
        className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-2.5 py-1.5 text-xs text-amber-200/90 transition-all duration-100 hover:border-amber-500/50 hover:bg-amber-500/[0.12] hover:text-amber-100 active:scale-[0.98]"
      >
        <RotateCcw size={13} />
        Azzera asta
        <span className="num text-amber-200/50">{logged}</span>
      </button>
    );
  }

  // `basis-full` porta la conferma su una riga tutta sua, allineata a destra
  // sotto il bottone che l'ha aperta. Senza, il testo manda a capo la riga dei
  // bottoni e la conferma ricompare all'estremita' opposta dello schermo,
  // lontano dal punto in cui hai appena cliccato.
  return (
    <span className="flex basis-full items-center justify-end gap-1.5 text-xs text-amber-100">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/[0.1] px-2.5 py-1.5">
      Cancellare {logged} colpi dal log{active > 0 ? `, ${active} ancora attivi` : ''}? Non si
      ripristinano.
      <button
        type="button"
        onClick={() => {
          void clearAuctionLog();
          setArming(false);
        }}
        className="focus-ring rounded-md bg-amber-600 px-2 py-0.5 text-xs font-medium text-white transition-colors hover:bg-amber-500"
      >
        Sì, azzera
      </button>
      <button
        type="button"
        onClick={() => setArming(false)}
        className="focus-ring rounded-md border border-edge px-2 py-0.5 text-xs text-zinc-300 transition-colors hover:bg-scrim"
      >
        No
      </button>
      </span>
    </span>
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
          ? 'border-hair bg-veil text-zinc-400'
          : 'animate-flash-err border-rose-500/30 bg-rose-500/10 text-rose-200',
      )}
    >
      <span className="flex items-center gap-1.5">
        <MicroLabel>fase</MicroLabel>
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

      {/*
        I crediti del tavolo sono la sola cifra della barra che cambia una
        decisione mentre si batte: quanto e' gia' uscito dice se il prezzo che
        stai per fare e' caro o e' il mercato. Sta un grado sopra tutto il
        resto — corpo piu' grande, semibold, allineato alla base del
        denominatore — perche' a colpo d'occhio si legga quella e non le altre.
      */}
      <span className="flex min-w-[10rem] items-baseline gap-2">
        <MicroLabel>crediti</MicroLabel>
        <span className="num text-base font-semibold leading-none text-zinc-100">
          {creditsSpent}
        </span>
        <span className="num text-[11px] leading-none text-zinc-600">/ {totalCredits}</span>
        <Meter
          value={totalCredits === 0 ? 0 : creditsSpent / totalCredits}
          className="w-16 self-center"
          fill="bg-emerald-500"
        />
      </span>

      {/* Gli slot sono contorno: si riempiono da soli, non si contrattano. */}
      <span className="flex min-w-[8rem] items-center gap-2">
        <MicroLabel>slot</MicroLabel>
        <span className="num text-[11px] text-zinc-300">{slotsFilled}</span>
        <span className="num text-[11px] text-zinc-600">/ {totalSlots}</span>
        <Meter
          value={totalSlots === 0 ? 0 : slotsFilled / totalSlots}
          className="w-16"
          fill="bg-zinc-400"
        />
      </span>

      <span className="flex items-center gap-2">
        <MicroLabel>liberi</MicroLabel>
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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div
        className={cn(
          'shrink-0 rounded-xl border p-3 transition-colors',
          tight
            ? 'border-amber-500/30 bg-amber-500/[0.07]'
            : 'border-hair bg-veil',
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
          <MicroLabel>crediti</MicroLabel>
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

      {/*
        I quattro reparti scorrono qui dentro. A rosa piena sono venticinque
        righe piu' quattro intestazioni: senza un contenitore suo, la lista
        spingeva fuori dalla colonna il riquadro dei crediti qui sopra.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
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
                      className="flex justify-between gap-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-film"
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
  /*
    Il log completo, dal piu' recente al primo colpo.

    Prima si fermava agli ultimi otto: sotto asta la nona riga serviva per
    ricordare a che prezzo era andato un nome, e non c'era modo di tornarci.
    La lista adesso scorre — vedi sotto — e tenere tutto qui e' anche l'unico
    modo di annullare un colpo vecchio senza cercarlo altrove.
  */
  const recent = [...events].reverse();

  /*
    L'ultimo colpo battuto si accende per un istante.

    All'asta si guarda il banditore, non lo schermo: quando si torna a guardare
    bisogna sapere in mezzo secondo **se il colpo e' entrato**. Il messaggio in
    cima lo dice a parole, ma passa e si perde; l'anello sulla riga dice dove
    e' finito, e resta il tempo di essere visto con la coda dell'occhio.

    Si spegne da solo dopo un secondo e mezzo: un anello permanente
    diventerebbe parte dell'arredamento e smetterebbe di significare "adesso".
  */
  const newestId = recent[0]?.id ?? null;
  const [flashId, setFlashId] = useState<string | null>(null);
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (newestId === null || newestId === seen.current) return;
    // Al primo render la lista esiste gia': lampeggiare sarebbe una bugia.
    const first = seen.current === null;
    seen.current = newestId;
    if (first) return;
    setFlashId(newestId);
    const timer = window.setTimeout(() => setFlashId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [newestId]);

  if (recent.length === 0) {
    return (
      <EmptyState
        icon={<History size={22} />}
        title="Nessuna assegnazione registrata"
        hint="Batti il primo colpo dalla barra: nome, prezzo, sigla. Da qui potrai annullarlo."
      />
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <SectionTitle icon={<History size={12} />}>Ultime assegnazioni</SectionTitle>
      {/*
        Altezza fissa da otto righe, poi scorre: la lista non deve crescere
        fino a spingere fuori schermo la barra dei comandi, che e' l'unica cosa
        che sotto asta deve restare sempre dov'e'. `overflow-y-auto` taglia
        anche gli angoli arrotondati, quindi l'`overflow-hidden` di prima non
        serve piu'.
      */}
      <ul className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-seam">
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
                'relative flex items-center gap-2 px-2 py-1 text-xs transition-all duration-200 hover:bg-film',
                event.undone ? 'text-zinc-600 line-through opacity-60' : 'text-zinc-300',
                event.id === flashId &&
                  'animate-pulse bg-emerald-500/10 ring-2 ring-inset ring-emerald-500/50',
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
                className="focus-ring inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 no-underline transition-all duration-150 hover:bg-scrim hover:text-zinc-200 active:scale-[0.98]"
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
