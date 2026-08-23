import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import type { Player, Role, Tag } from '../../domain/types';
import { parseCommand } from '../../domain/command';
import { isAmbiguous, searchInPhase } from '../../domain/search';
import { lineupStatus, makeLineupIndex } from '../../domain/lineup';
import { useAppStore } from '../../store/appStore';
import { LineupBadge } from '../player/LineupBadge';

/**
 * Command bar dell'asta (PRD §5.1).
 *
 * Un solo input, keyboard-only. Ogni riga di risultato porta con se' il badge
 * di formazione e la prima riga della nota: e' l'informazione che serve nei
 * cinque secondi della chiamata, e cercarla altrove costa piu' del tempo che
 * c'e'.
 *
 * Frecce per scegliere, Invio per confermare. Senza sigla mostra soltanto; con
 * la sigla assegna.
 */

const TAG_COLOR: Readonly<Record<Tag, string>> = {
  obiettivo: 'text-emerald-400',
  alternativa: 'text-sky-400',
  evita: 'text-red-400',
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
        setText("");
        setIndex(0);
        setFeedback(null);
        inputRef.current?.focus();
      },
    }),
    [],
  );
  useEffect(() => inputRef.current?.focus(), []);

  const abbrs = useMemo(() => new Set(teams.map((t) => t.abbr)), [teams]);
  const command = useMemo(() => parseCommand(text, abbrs), [text, abbrs]);

  const query = command.kind === 'error' || command.kind === 'empty' ? '' : command.query;
  const price = command.kind === 'evaluate' || command.kind === 'assign' ? command.price : null;

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

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setFeedback(null);
        }}
        onKeyDown={handleKey}
        placeholder={
          phase === null ? 'Asta completata' : 'dimarco 60 mrc — nome, prezzo, sigla'
        }
        spellCheck={false}
        autoComplete="off"
        className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-base text-neutral-100 outline-none focus:border-emerald-600"
      />

      {feedback !== null && (
        <p
          className={`px-1 text-xs ${
            feedback.kind === 'ok' ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {command.kind === 'error' && feedback === null && (
        <p className="px-1 text-xs text-amber-400">{command.detail}</p>
      )}

      <ul className="flex flex-col overflow-hidden rounded border border-neutral-800">
        {hits.map((hit, i) => {
          const note = noteByPlayer.get(hit.player.id) ?? null;
          const firstLine = note?.text.split('\n')[0] ?? '';
          return (
            <li key={hit.player.id}>
              <button
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setIndex(i)}
                onClick={() => setIndex(i)}
                className={`flex w-full flex-col gap-0.5 px-2 py-1.5 text-left ${
                  i === index ? 'bg-emerald-950' : 'hover:bg-neutral-900'
                }`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <span className="w-4 shrink-0 text-xs text-neutral-500">{hit.player.role}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-100">
                    {hit.player.name}
                  </span>
                  <span className="w-20 shrink-0 truncate text-xs text-neutral-500">
                    {hit.player.team}
                  </span>
                  <LineupBadge status={lineupStatus(hit.player.id, hit.player.team, lineupIndex)} />
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                    quot {hit.player.quot}
                  </span>
                  <span className="w-20 shrink-0 text-right text-xs">
                    {note?.tag != null && (
                      <span className={TAG_COLOR[note.tag]}>★{note.tag}</span>
                    )}
                  </span>
                </span>
                {firstLine !== '' && (
                  <span className="truncate pl-6 text-xs italic text-neutral-500">
                    “{firstLine}”
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {hits.length === 0 && query !== '' && (
          <li className="px-2 py-2 text-sm text-neutral-500">
            Nessun giocatore libero corrisponde a “{query}”.
          </li>
        )}
      </ul>

      {search.outOfPhase && (
        <p className="px-1 text-xs text-amber-400">
          Nessun {phase} corrisponde: questi sono di altri ruoli. Assegnarli e legittimo — serve a
          recuperare una chiamata persa — ma controlla il ruolo prima di confermare.
        </p>
      )}

      {ambiguous && (
        <p className="px-1 text-xs text-amber-400">
          Piu’ giocatori corrispondono: scegli con ↑ ↓ prima di confermare.
        </p>
      )}
    </div>
  );
});
