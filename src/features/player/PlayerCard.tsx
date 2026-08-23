import { useEffect, useMemo, useRef, useState } from 'react';

import type { Player, Tag } from '../../domain/types';
import { TAGS } from '../../domain/types';
import { lineupPlacement, makeLineupIndex } from '../../domain/lineup';
import { isTarget } from '../../domain/objectives';
import { useAppStore } from '../../store/appStore';
import { LineupBadge } from './LineupBadge';

/**
 * Scheda giocatore (PRD §5.1).
 *
 * Un solo pannello con tutto quello che serve nei cinque secondi della
 * chiamata: nota editabile inline, tag, formazione completa della sua squadra
 * con lo slot del giocatore evidenziato e i ballottaggi, nota della squadra.
 *
 * Vive qui, fuori da /features/live, perche' M3 la riusa nell'overlay `?`.
 */

const TAG_STYLE: Readonly<Record<Tag, string>> = {
  obiettivo: 'bg-emerald-700 text-white',
  alternativa: 'bg-sky-800 text-white',
  evita: 'bg-red-900 text-red-100',
};

/**
 * §5.1 chiede la nota "salvata a ogni battuta", cioe' senza un tasto Salva.
 * Il debounce accorpa le battute ravvicinate in una sola scrittura; quello che
 * hai digitato viene comunque persistito all'uscita dal campo e allo smontaggio,
 * quindi non esiste una battuta che possa andare persa.
 */
const NOTE_DEBOUNCE_MS = 250;

export interface PlayerCardProps {
  readonly player: Player;
  readonly onClose: () => void;
}

export function PlayerCard({ player, onClose }: PlayerCardProps): JSX.Element {
  const players = useAppStore((s) => s.players);
  const userData = useAppStore((s) => s.userData);
  const setPlayerNote = useAppStore((s) => s.setPlayerNote);
  const saveTeamNote = useAppStore((s) => s.saveTeamNote);
  const addObjectiveTarget = useAppStore((s) => s.addObjectiveTarget);
  const removeObjectiveTarget = useAppStore((s) => s.removeObjectiveTarget);

  const note = userData.playerNotes.find((n) => n.playerId === player.id) ?? null;
  const teamNote = userData.teamNotes.find((n) => n.teamCode === player.team)?.text ?? '';

  const [draft, setDraft] = useState(note?.text ?? '');
  const [teamDraft, setTeamDraft] = useState(teamNote);
  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(note?.text ?? '');
    setTeamDraft(teamNote);
    noteRef.current?.focus();
    // Il giocatore cambia solo se la scheda viene riaperta su un altro nome.
  }, [player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Scrive subito quello che e' in attesa e annulla il timer. */
  function flush(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      void setPlayerNote(player.id, { text: pending.current });
      pending.current = null;
    }
  }

  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNote(text: string): void {
    setDraft(text);
    pending.current = text;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, NOTE_DEBOUNCE_MS);
  }

  const lineupIndex = useMemo(() => makeLineupIndex(userData.lineups), [userData.lineups]);
  const placement = lineupPlacement(player.id, player.team, lineupIndex);
  const lineup = lineupIndex.get(player.team) ?? null;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const target = isTarget(userData, player.id);
  const activeSlots = new Set(placement.slots.map((s) => s.slotId));

  return (
    <div
      className="flex h-full w-[28rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          flush();
          onClose();
        }
      }}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-neutral-100">{player.name}</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {player.role} · {player.team} · quot {player.quot} · fvm {player.fvm} · under{' '}
            {player.under}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            flush();
            onClose();
          }}
          className="shrink-0 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800"
          aria-label="Chiudi la scheda"
        >
          Esc
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <LineupBadge status={placement.status} />
        {placement.duplicated && (
          <span className="rounded bg-red-900/60 px-1.5 py-0.5 text-[11px] text-red-200">
            in {placement.slots.length} slot
          </span>
        )}
      </div>

      <section className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Tag</span>
        <div className="flex gap-1">
          {TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() =>
                void setPlayerNote(player.id, { tag: note?.tag === tag ? null : tag })
              }
              className={`rounded px-2 py-1 text-xs ${
                note?.tag === tag
                  ? TAG_STYLE[tag]
                  : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Nota</span>
        <textarea
          ref={noteRef}
          value={draft}
          onChange={(e) => handleNote(e.target.value)}
          onBlur={flush}
          rows={4}
          placeholder="Rigorista, spinge sempre, rientra dopo la sosta..."
          className="rounded bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 placeholder:text-neutral-700 focus:ring-emerald-700"
        />
      </section>

      <section>
        <button
          type="button"
          onClick={() =>
            void (target ? removeObjectiveTarget(player.id) : addObjectiveTarget(player.id))
          }
          className={`w-full rounded px-3 py-1.5 text-sm ${
            target
              ? 'border border-emerald-700 text-emerald-300 hover:bg-neutral-900'
              : 'bg-emerald-700 text-white hover:bg-emerald-600'
          }`}
        >
          {target ? 'Togli dagli obiettivi' : 'Aggiungi agli obiettivi'}
        </button>
        {!target && note?.tag !== null && note?.tag !== undefined && (
          <p className="mt-1 text-[11px] text-neutral-500">
            Il tag “{note.tag}” resta com’e’: aggiungere agli obiettivi non lo sovrascrive.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          Formazione {player.team}
        </span>
        {lineup === null ? (
          <p className="text-sm text-neutral-600">Non ancora compilata.</p>
        ) : (
          <ol className="flex flex-col gap-0.5">
            {lineup.slots.map((slot) => (
              <li
                key={slot.slotId}
                className={`flex items-baseline gap-2 rounded px-1.5 py-0.5 text-xs ${
                  activeSlots.has(slot.slotId) ? 'bg-emerald-950/60' : ''
                }`}
              >
                <span className="w-9 shrink-0 text-neutral-500">{slot.roleLabel}</span>
                <span className="flex-1 truncate">
                  {slot.candidates.length === 0 ? (
                    <span className="text-neutral-700">—</span>
                  ) : (
                    slot.candidates.map((id, i) => (
                      <span key={id}>
                        {i > 0 && <span className="text-amber-500"> / </span>}
                        <span
                          className={
                            id === player.id ? 'font-semibold text-emerald-300' : 'text-neutral-300'
                          }
                        >
                          {byId.get(id)?.name ?? `#${id}`}
                        </span>
                      </span>
                    ))
                  )}
                </span>
                {slot.note !== '' && (
                  <span className="shrink-0 text-[10px] text-neutral-500">{slot.note}</span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          Nota squadra {player.team}
        </span>
        <textarea
          value={teamDraft}
          onChange={(e) => setTeamDraft(e.target.value)}
          onBlur={() => {
            if (teamDraft !== teamNote) void saveTeamNote(player.team, teamDraft);
          }}
          rows={2}
          placeholder="Come gioca, chi e’ in dubbio..."
          className="rounded bg-neutral-900 px-2 py-1.5 text-sm text-neutral-300 outline-none ring-1 ring-neutral-800 placeholder:text-neutral-700 focus:ring-emerald-700"
        />
      </section>
    </div>
  );
}
