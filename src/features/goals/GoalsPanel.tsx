import { useEffect, useMemo, useRef, useState } from 'react';

import { isBlankMarkdown } from '../../domain/markdown';
import { sortedTargets } from '../../domain/objectives';
import { lineupStatus, makeLineupIndex } from '../../domain/lineup';
import { reduce } from '../../domain/reducer';
import { useAppStore } from '../../store/appStore';
import { CloseButton, SectionTitle } from '../../ui/primitives';
import { LineupBadge } from '../player/LineupBadge';
import { Markdown } from './Markdown';

/**
 * Obiettivi (PRD §5.3): testo libero di strategia e lista dei target.
 *
 * Ogni riga dice il badge di formazione e se il giocatore e' ancora libero o
 * gia' andato, e a chi. Si apre in overlay dall'asta con `o`.
 */

const TEXT_DEBOUNCE_MS = 400;

export interface GoalsPanelProps {
  readonly onClose?: () => void;
  readonly embedded?: boolean;
}

export function GoalsPanel({ onClose, embedded = false }: GoalsPanelProps): JSX.Element {
  const players = useAppStore((s) => s.players);
  const teams = useAppStore((s) => s.teams);
  const userData = useAppStore((s) => s.userData);
  const leagueConfig = useAppStore((s) => s.leagueConfig);
  const setObjectivesText = useAppStore((s) => s.setObjectivesText);
  const removeObjectiveTarget = useAppStore((s) => s.removeObjectiveTarget);
  const addObjectiveTarget = useAppStore((s) => s.addObjectiveTarget);

  const [draft, setDraft] = useState(userData.objectives.text);
  // Di default si legge; si passa alla scrittura cliccando il testo. Sotto
  // asta la strategia si apre per consultarla, non per riscriverla.
  const [editing, setEditing] = useState(isBlankMarkdown(userData.objectives.text));
  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);

  function flush(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      void setObjectivesText(pending.current);
      pending.current = null;
    }
  }
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleText(text: string): void {
    setDraft(text);
    pending.current = text;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, TEXT_DEBOUNCE_MS);
  }

  // La config dipende da listone e squadre: senza queste dipendenze un
  // re-import del listone lascerebbe la vista sui dati vecchi.
  const config = useMemo(() => leagueConfig(), [leagueConfig, players, teams]);
  const state = useMemo(() => reduce(userData.events, config), [userData.events, config]);
  const lineups = useMemo(() => makeLineupIndex(userData.lineups), [userData.lineups]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const targets = sortedTargets(userData);

  return (
    <div
      className={`flex min-h-0 flex-col gap-3 overflow-y-auto bg-zinc-950/80 p-4 backdrop-blur-xl ${
        embedded ? 'flex-1' : 'h-full w-[36rem] border-l border-white/[0.08]'
      }`}
    >
      <header className="flex items-center gap-2">
        <h2 className="text-base font-semibold tracking-tight text-zinc-100">Obiettivi</h2>
        {onClose !== undefined && (
          <span className="ml-auto">
            <CloseButton
              onClose={() => {
                flush();
                onClose();
              }}
            />
          </span>
        )}
      </header>

      <section className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SectionTitle>Strategia</SectionTitle>
          <button
            type="button"
            onClick={() => {
              if (editing) flush();
              setEditing(!editing);
            }}
            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
          >
            {editing ? 'anteprima' : 'modifica'}
          </button>
          {editing && (
            <span className="text-[11px] text-zinc-600">
              # titolo · - elenco · **grassetto** · *corsivo* · `codice`
            </span>
          )}
        </div>

        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => handleText(e.target.value)}
            onBlur={flush}
            rows={8}
            placeholder="# Piano asta&#10;&#10;Non spendere più di **300** sulla difesa.&#10;- un portiere titolare&#10;- due punte vere"
            className="rounded bg-white/[0.03] px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none ring-1 ring-zinc-800 placeholder:text-zinc-700 focus:ring-emerald-700"
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(true);
            }}
            className="min-h-[4rem] cursor-text rounded px-2 py-1.5 ring-1 ring-zinc-900 hover:ring-zinc-800"
          >
            {isBlankMarkdown(draft) ? (
              <span className="text-sm text-zinc-700">
                Nessuna nota di strategia. Clicca per scriverne una.
              </span>
            ) : (
              <Markdown text={draft} />
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">
          Target ({targets.length})
        </h3>

        {targets.length === 0 ? (
          <p className="text-sm text-zinc-600">
            Nessun target. Si aggiungono dalla scheda di un giocatore.
          </p>
        ) : (
          <ol>
            {targets.map((target, i) => {
              const player = byId.get(target.playerId);
              const owner = state.assignmentByPlayerId[target.playerId];
              const ownerTeam = owner ? teams.find((t) => t.id === owner.teamId) : null;
              return (
                <li
                  key={target.playerId}
                  className="flex items-center gap-2 border-t border-white/[0.06] py-1 text-sm"
                >
                  <span className="w-5 shrink-0 text-right text-xs num text-zinc-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-100">
                    {player?.name ?? `#${target.playerId}`}
                    <span className="ml-2 text-xs text-zinc-500">{player?.team}</span>
                  </span>
                  {player !== undefined && (
                    <LineupBadge status={lineupStatus(player.id, player.team, lineups)} compact />
                  )}
                  {owner === undefined ? (
                    <span className="w-24 shrink-0 text-right text-xs text-emerald-400">libero</span>
                  ) : (
                    <span className="w-24 shrink-0 text-right text-xs text-zinc-500">
                      {ownerTeam?.abbr.toUpperCase() ?? owner.teamId} · {owner.price}
                    </span>
                  )}
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      title="Alza la priorità"
                      onClick={() =>
                        void addObjectiveTarget(target.playerId, {
                          priority: target.priority - 1.5,
                          note: target.note,
                        })
                      }
                      className="rounded px-1 text-xs text-zinc-500 hover:bg-white/[0.06]"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      title="Abbassa la priorità"
                      onClick={() =>
                        void addObjectiveTarget(target.playerId, {
                          priority: target.priority + 1.5,
                          note: target.note,
                        })
                      }
                      className="rounded px-1 text-xs text-zinc-500 hover:bg-white/[0.06]"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeObjectiveTarget(target.playerId)}
                      className="rounded px-1 text-xs text-zinc-600 hover:bg-white/[0.06] hover:text-rose-300"
                    >
                      ×
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
