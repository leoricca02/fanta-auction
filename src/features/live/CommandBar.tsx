import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CornerDownLeft, Search, TriangleAlert } from 'lucide-react';

import type { Player, Role, Tag } from '../../domain/types';
import { parseCommand } from '../../domain/command';
import { isAmbiguous, normalizeQuery, searchInPhase } from '../../domain/search';
import { lineupStatus, makeLineupIndex } from '../../domain/lineup';
import { listFantaAvg } from '../../domain/player-stats';
import { STATS_SEASON } from '../../data/stats';
import { STATS_INDEX } from '../../data/stats-index';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { EASE, Kbd, RoleBadge } from '../../ui/primitives';
import { LineupBadge } from '../player/LineupBadge';

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
      {/* Pill: icona, input, e a destra lo stato di cio' che hai gia' digitato. */}
      <div
        className={cn(
          'group flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-zinc-900/60 px-3 py-2.5 backdrop-blur-xl transition-all',
          'focus-within:border-emerald-500/40 focus-within:bg-zinc-900/80',
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
          {price !== null && (
            <span className="num rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-xs font-semibold text-zinc-200">
              {price} cr
            </span>
          )}
          {abbr !== null && (
            <span className="max-w-[10rem] truncate rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-xs font-semibold text-emerald-300">
              {teams.find((t) => t.abbr === abbr)?.name ?? abbr.toUpperCase()}
            </span>
          )}
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
          <span className="hidden items-center gap-1 sm:flex">
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

      <ul className="flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-900/40">
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
                  active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
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
                  <LineupBadge
                    status={lineupStatus(hit.player.id, hit.player.team, lineupIndex)}
                    compact
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
