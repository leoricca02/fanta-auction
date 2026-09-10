import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CornerDownLeft,
  Coins,
  Search,
  TriangleAlert,
  User,
  Users,
  Zap,
} from 'lucide-react';

import type { Command } from '../../domain/command';
import type { Player, Role, Tag } from '../../domain/types';
import { parseCommand } from '../../domain/command';
import { isAmbiguous, normalizeQuery, searchInPhase } from '../../domain/search';
import { makeLineupIndex } from '../../domain/lineup';
import { listFantaAvg } from '../../domain/player-stats';
import { STATS_SEASON } from '../../data/stats';
import { STATS_INDEX } from '../../data/stats-index';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { EASE, Kbd, RoleBadge } from '../../ui/primitives';
import { LineupPlacementBadge } from '../player/LineupBadge';

/**
 * Command bar dell'asta (PRD §5.1).
 *
 * Un solo input, keyboard-only. Ogni riga di risultato porta con se' il badge
 * di formazione e la prima riga della nota: e' l'informazione che serve nei
 * cinque secondi della chiamata, e cercarla altrove costa piu' del tempo che
 * c'e'.
 *
 * Le due cifre in coda alla riga sono, nell'ordine, la fantamedia della scorsa
 * stagione (in verde) e la QUOT. Il trattino al posto della fantamedia vuol
 * dire che in Serie A l'anno scorso non ha giocato — non che ha fatto zero.
 *
 * Frecce per scegliere, Invio per confermare. Senza sigla mostra soltanto; con
 * la sigla assegna.
 *
 * La barra si riprende il focus da qualunque punto della schermata con `Ctrl+K`
 * (`Cmd+K` su Mac) o `/`: dopo aver guardato le statistiche o il tabellone si
 * torna a digitare senza cercare il campo col mouse.
 */

const TAG_COLOR: Readonly<Record<Tag, string>> = {
  obiettivo: 'text-emerald-400',
  alternativa: 'text-sky-400',
  evita: 'text-rose-400',
};

export interface CommandBarHandle {
  focus: () => void;
  /** Svuota la barra: la chiama il pannello dopo un assegnazione riuscita. */
  clear: () => void;
}

export interface CommandBarProps {
  /** Ruolo della fase attiva: pre-filtra i candidati. `null` = asta finita. */
  readonly phase: Role | null;
  readonly assignedIds: ReadonlySet<number>;
  /** Giocatore evidenziato, per la scheda aperta con `?`. */
  readonly onHighlight: (player: Player | null) => void;
  readonly onPriceChange: (price: number | null) => void;
}

export const CommandBar = forwardRef<CommandBarHandle, CommandBarProps>(function CommandBar(
  { phase, assignedIds, onHighlight, onPriceChange },
  ref,
) {
  const players = useAppStore((s) => s.players);
  const teams = useAppStore((s) => s.teams);
  const userData = useAppStore((s) => s.userData);
  const assign = useAppStore((s) => s.assign);

  const [text, setText] = useState('');
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      clear: () => {
        setText('');
        setIndex(0);
        setFeedback(null);
        inputRef.current?.focus();
      },
    }),
    [],
  );
  useEffect(() => inputRef.current?.focus(), []);

  // Ctrl/Cmd+K da ovunque, `/` solo se non stai gia' scrivendo altrove.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!shortcut && (typing || event.key !== '/')) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const abbrs = useMemo(() => new Set(teams.map((t) => t.abbr)), [teams]);
  const command = useMemo(() => parseCommand(text, abbrs), [text, abbrs]);

  const query = command.kind === 'error' || command.kind === 'empty' ? '' : command.query;
  const price = command.kind === 'evaluate' || command.kind === 'assign' ? command.price : null;
  const abbr = command.kind === 'assign' ? command.abbr : null;

  const search = useMemo(
    () => searchInPhase(players, query, { phase, excludeIds: assignedIds, limit: 8 }),
    [players, query, phase, assignedIds],
  );
  const hits = search.hits;

  const ambiguous = isAmbiguous(hits);
  const selected = hits[Math.min(index, hits.length - 1)]?.player ?? null;

  const lineupIndex = useMemo(() => makeLineupIndex(userData.lineups), [userData.lineups]);
  const noteByPlayer = useMemo(
    () => new Map(userData.playerNotes.map((n) => [n.playerId, n])),
    [userData.playerNotes],
  );

  useEffect(() => setIndex(0), [query, phase]);
  useEffect(() => onHighlight(selected), [selected, onHighlight]);
  useEffect(() => onPriceChange(price), [price, onPriceChange]);

  async function confirm(): Promise<void> {
    if (command.kind === 'error') {
      setFeedback({ kind: 'error', text: command.detail });
      return;
    }
    if (command.kind !== 'assign') return;
    if (selected === null) {
      setFeedback({ kind: 'error', text: 'Nessun giocatore corrisponde a quello che hai scritto.' });
      return;
    }
    if (ambiguous) {
      setFeedback({
        kind: 'error',
        text: 'Piu’ giocatori corrispondono: scegli con le frecce, poi Invio.',
      });
      return;
    }

    // La sigla e' cio' che si digita; l'acquisto si aggancia all'id, che non
    // cambia se piu' avanti la squadra viene rinominata.
    const team = teams.find((t) => t.abbr === command.abbr);
    if (team === undefined) {
      setFeedback({ kind: 'error', text: `Sigla "${command.abbr}" non trovata in lega.` });
      return;
    }

    const outcome = await assign(selected.id, team.id, command.price, selected.role);
    if (outcome.ok) {
      setFeedback({
        kind: 'ok',
        text: `${selected.name} → ${team.name} per ${command.price}.`,
      });
      setText('');
      setIndex(0);
    } else {
      setFeedback({ kind: 'error', text: outcome.rejection.detail });
    }
  }

  function handleKey(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((i) => Math.min(i + 1, hits.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      void confirm();
    }
  }

  const ready = command.kind === 'assign' && selected !== null && !ambiguous;

  return (
    <div className="flex flex-col gap-1.5">
      {/*
        Il pannello dell'input.

        Il fuoco e' **indaco**, non verde, ed e' una distinzione voluta: in
        questa app il verde vuol dire "si puo' chiudere". Se il bordo si
        accendesse di verde solo perche' hai cliccato nella barra, il colore
        che conferma l'assegnazione varrebbe la meta'. L'indaco dice "sto
        scrivendo", il glow verde dice "Invio assegna": due fatti diversi,
        due colori diversi, e si vedono insieme sull'ultimo comando completo.
      */}
      <div
        className={cn(
          'group flex items-center gap-2.5 rounded-xl border border-hair bg-elevated/90 px-3 py-2.5 backdrop-blur-md transition-all duration-150',
          'focus-within:border-indigo-500/70 focus-within:ring-2 focus-within:ring-indigo-500/20',
          ready && 'focus-within:shadow-glow-emerald',
        )}
      >
        <Search size={16} className="shrink-0 text-zinc-500" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFeedback(null);
          }}
          onKeyDown={handleKey}
          placeholder={phase === null ? 'Asta completata' : 'dimarco 60 mrc — nome, prezzo, sigla'}
          spellCheck={false}
          autoComplete="off"
          aria-label="Cerca un giocatore e assegnalo"
          className="min-w-0 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-600"
        />

        <div className="flex shrink-0 items-center gap-1.5">
          {phase !== null && text === '' && (
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[11px] font-medium',
                roleTheme(phase).chip,
              )}
              title={`Fase ${roleTheme(phase).label}`}
            >
              fase {phase}
            </span>
          )}
          {/*
            Le scorciatoie mostrate sono solo quelle che esistono davvero: la
            barra non ascolta ne' Tab ne' Esc, e disegnare un tasto che non fa
            niente e' peggio che non disegnarlo.
          */}
          <span className="hidden items-center gap-1 sm:flex">
            {hits.length > 1 && (
              <Kbd>
                <ArrowUp size={9} />
                <ArrowDown size={9} />
              </Kbd>
            )}
            {ready ? (
              <Kbd>
                <CornerDownLeft size={10} />
              </Kbd>
            ) : (
              <Kbd>Ctrl K</Kbd>
            )}
          </span>
        </div>
      </div>

      <CommandPreview
        command={command}
        player={selected}
        ambiguous={ambiguous}
        teamName={abbr === null ? null : (teams.find((t) => t.abbr === abbr)?.name ?? null)}
        abbr={abbr}
      />

      <AnimatePresence initial={false}>
        {feedback !== null && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: EASE }}
            className={cn(
              'flex items-center gap-1.5 px-1 text-xs',
              feedback.kind === 'ok' ? 'text-emerald-400' : 'text-rose-400',
            )}
          >
            {feedback.kind === 'ok' ? <Check size={12} /> : <TriangleAlert size={12} />}
            {feedback.text}
          </motion.p>
        )}
      </AnimatePresence>

      {command.kind === 'error' && feedback === null && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-amber-400">
          <TriangleAlert size={12} />
          {command.detail}
        </p>
      )}

      <ul className="flex flex-col overflow-hidden rounded-xl border border-seam bg-surface/50">
        {hits.map((hit, i) => {
          const note = noteByPlayer.get(hit.player.id) ?? null;
          const firstLine = note?.text.split('\n')[0] ?? '';
          const active = i === index;
          return (
            <li key={hit.player.id} className="relative">
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setIndex(i)}
                onClick={() => setIndex(i)}
                className={cn(
                  'relative flex w-full flex-col gap-0.5 px-2.5 py-1.5 text-left transition-colors',
                  active ? 'bg-scrim' : 'hover:bg-film',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="hit-marker"
                    transition={{ duration: 0.18, ease: EASE }}
                    className={cn(
                      'absolute inset-y-0 left-0 w-0.5 rounded-full',
                      roleTheme(hit.player.role).bar,
                    )}
                  />
                )}
                <span className="flex items-center gap-2 text-sm">
                  <RoleBadge role={hit.player.role} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-zinc-100">
                    <Highlight text={hit.player.name} query={query} />
                  </span>
                  <span className="w-16 shrink-0 truncate text-xs uppercase tracking-wide text-zinc-500">
                    {hit.player.team}
                  </span>
                  <LineupPlacementBadge
                    playerId={hit.player.id}
                    team={hit.player.team}
                    lineups={lineupIndex}
                  />
                  <span
                    className="num w-12 shrink-0 text-right text-xs text-emerald-300/80"
                    title={`Fantamedia ${STATS_SEASON}`}
                  >
                    {listFantaAvg(hit.player.id, STATS_INDEX) ?? '—'}
                  </span>
                  <span className="num w-12 shrink-0 text-right text-xs text-zinc-400">
                    {hit.player.quot}
                  </span>
                  <span className="w-20 shrink-0 truncate text-right text-xs">
                    {note?.tag != null && (
                      <span className={TAG_COLOR[note.tag]}>★ {note.tag}</span>
                    )}
                  </span>
                </span>
                {firstLine !== '' && (
                  <span className="truncate pl-7 text-xs italic text-zinc-500">“{firstLine}”</span>
                )}
              </button>
            </li>
          );
        })}
        {hits.length === 0 && query !== '' && (
          <li className="px-3 py-3 text-sm text-zinc-500">
            Nessun giocatore libero corrisponde a “{query}”.
          </li>
        )}
      </ul>

      {search.outOfPhase && (
        <p className="flex items-start gap-1.5 px-1 text-xs text-amber-400">
          <TriangleAlert size={12} className="mt-0.5 shrink-0" />
          Nessun {phase} corrisponde: questi sono di altri ruoli. Assegnarli e legittimo — serve a
          recuperare una chiamata persa — ma controlla il ruolo prima di confermare.
        </p>
      )}

      {ambiguous && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-amber-400">
          <TriangleAlert size={12} />
          Piu’ giocatori corrispondono: scegli con <Kbd>↑</Kbd> <Kbd>↓</Kbd> prima di confermare.
        </p>
      )}
    </div>
  );
});

/**
 * La striscia di conferma del comando.
 *
 * Prima stava tutta dentro la barra, stretta fra il testo e la scorciatoia:
 * due pastiglie appiccicate a destra, lette per ultime o non lette affatto.
 * Ma il comando dell'asta e' irreversibile a meno di un annulla, e la domanda
 * dell'ultimo mezzo secondo prima di Invio e' sempre la stessa — **cosa sto
 * per fare, a chi, per quanto**.
 *
 * Quindi diventa una riga sua, sotto l'input, con i quattro pezzi nell'ordine
 * in cui li si controlla: azione, giocatore, prezzo, acquirente. I chip
 * mancanti non lasciano buchi: il comando cresce da sinistra mentre digiti, e
 * la riga si allunga fino a essere completa. Vederla piena *e'* la conferma.
 *
 * Legge `command`, non lo interpreta: il parsing resta tutto in
 * `parseCommand`, qui si disegna soltanto quello che ha gia' deciso.
 */
function CommandPreview({
  command,
  player,
  ambiguous,
  teamName,
  abbr,
}: {
  readonly command: Command;
  readonly player: Player | null;
  readonly ambiguous: boolean;
  readonly teamName: string | null;
  readonly abbr: string | null;
}): JSX.Element | null {
  // Con la sola ricerca non c'e' niente da confermare: la riga comparirebbe a
  // ogni lettera per dire "stai cercando", che si vede gia' dai risultati.
  if (command.kind !== 'evaluate' && command.kind !== 'assign') return null;

  const assigning = command.kind === 'assign';
  const price = command.price;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: EASE }}
      className="flex flex-wrap items-center gap-1.5 px-1"
    >
      <PreviewChip
        icon={assigning ? <Zap size={11} /> : <Users size={11} />}
        tone={assigning ? 'emerald' : 'sky'}
        label={assigning ? 'assegna' : 'valuta'}
      />

      <PreviewChip
        icon={<User size={11} />}
        tone={player === null || ambiguous ? 'muted' : 'plain'}
        label={
          player === null
            ? 'nessun giocatore'
            : ambiguous
              ? `${player.name} · da scegliere`
              : player.name
        }
      />

      <PreviewChip icon={<Coins size={11} />} tone="amber" label={`${price} cr`} mono />

      {assigning && (
        <PreviewChip
          icon={<CornerDownLeft size={11} />}
          tone="emerald"
          label={teamName ?? (abbr ?? '').toUpperCase()}
        />
      )}
    </motion.div>
  );
}

/** Tinte della striscia: soft, perche' e' conferma e non allarme. */
const CHIP_TONE = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  plain: 'border-hair bg-film text-zinc-200',
  muted: 'border-dashed border-hair bg-transparent text-zinc-600',
} as const;

function PreviewChip({
  icon,
  tone,
  label,
  mono = false,
}: {
  readonly icon: JSX.Element;
  readonly tone: keyof typeof CHIP_TONE;
  readonly label: string;
  readonly mono?: boolean;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex max-w-[14rem] items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium leading-none',
        CHIP_TONE[tone],
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className={cn('truncate', mono && 'num')}>{label}</span>
    </span>
  );
}

/**
 * Evidenzia nel nome il pezzo che corrisponde a quello che hai digitato.
 *
 * Il confronto ripiega accenti e maiuscole **carattere per carattere**, cosi'
 * gli indici del testo ripiegato valgono anche sul nome originale e il
 * grassetto cade dove deve: "muller" evidenzia "Müller".
 */
function Highlight({
  text,
  query,
}: {
  readonly text: string;
  readonly query: string;
}): JSX.Element {
  const needle = normalizeQuery(query);
  if (needle === '') return <>{text}</>;

  const folded = [...text]
    .map((ch) => {
      const stripped = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      return stripped.length === 1 ? stripped : ch.toLowerCase();
    })
    .join('');

  const at = folded.replace(/[^a-z0-9]/g, ' ').indexOf(needle);
  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-emerald-500/20 px-px text-emerald-200">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}
