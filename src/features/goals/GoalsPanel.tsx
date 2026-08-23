import { useEffect, useMemo, useRef, useState } from 'react';

import { sortedTargets } from '../../domain/objectives';
import { lineupStatus, makeLineupIndex } from '../../domain/lineup';
import { reduce } from '../../domain/reducer';
import { useAppStore } from '../../store/appStore';
import { LineupBadge } from '../player/LineupBadge';

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
      className={`flex min-h-0 flex-col gap-3 overflow-y-auto bg-neutral-950 p-4 ${
        embedded ? 'flex-1' : 'h-full w-[36rem] border-l border-neutral-800'
      }`}
    >
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Obiettivi</h2>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={() => {
              flush();
              onClose();
            }}
            className="ml-auto rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800"
          >
            Esc
          </button>
        )}
      </header>

      <label className="flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Strategia</span>
        <textarea
          value={draft}
          onChange={(e) => handleText(e.target.value)}
          onBlur={flush}
          rows={6}
          placeholder="Un portiere titolare, due punte da 100, non spendere più di 300 sul reparto..."
          className="rounded bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none ring-1 ring-neutral-800 placeholder:text-neutral-700 focus:ring-emerald-700"
        />
      </label>

      <section className="flex flex-col gap-1">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500">
          Target ({targets.length})
        </h3>

        {targets.length === 0 ? (
          <p className="text-sm text-neutral-600">
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
                  className="flex items-center gap-2 border-t border-neutral-900 py-1 text-sm"
                >
                  <span className="w-5 shrink-0 text-right text-xs tabular-nums text-neutral-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-neutral-100">
                    {player?.name ?? `#${target.playerId}`}
                    <span className="ml-2 text-xs text-neutral-500">{player?.team}</span>
                  </span>
                  {player !== undefined && (
                    <LineupBadge status={lineupStatus(player.id, player.team, lineups)} compact />
                  )}
                  {owner === undefined ? (
                    <span className="w-24 shrink-0 text-right text-xs text-emerald-400">libero</span>
                  ) : (
                    <span className="w-24 shrink-0 text-right text-xs text-neutral-500">
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
                      className="rounded px-1 text-xs text-neutral-500 hover:bg-neutral-800"
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
                      className="rounded px-1 text-xs text-neutral-500 hover:bg-neutral-800"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeObjectiveTarget(target.playerId)}
                      className="rounded px-1 text-xs text-neutral-600 hover:bg-neutral-800 hover:text-red-300"
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
