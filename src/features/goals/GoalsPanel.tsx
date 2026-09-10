import { useEffect, useMemo, useRef, useState } from 'react';
import { Target } from 'lucide-react';

import { isBlankMarkdown } from '../../domain/markdown';
import { sortedTargets } from '../../domain/objectives';
import { makeLineupIndex } from '../../domain/lineup';
import { reduce } from '../../domain/reducer';
import { useAppStore } from '../../store/appStore';
import { CloseButton, EmptyState, SectionTitle } from '../../ui/primitives';
import { LineupPlacementBadge } from '../player/LineupBadge';
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
      className={`flex min-h-0 flex-col gap-3 overflow-y-auto bg-panel/80 p-4 backdrop-blur-xl ${
        embedded ? 'flex-1' : 'h-full w-[36rem] border-l border-hair'
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
            className="rounded px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-scrim hover:text-zinc-300"
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
            className="field px-2 py-1.5 font-mono text-xs"
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => setEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(true);
            }}
            className="min-h-[4rem] cursor-text rounded px-2 py-1.5 ring-1 ring-white/5 transition-colors duration-150 hover:ring-white/15"
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
          <EmptyState
            icon={<Target size={22} />}
            title="Nessun obiettivo in lista"
            hint={
              <>
                Apri la scheda di un giocatore e premi <strong className="text-slate-400">Aggiungi
                agli obiettivi</strong>: qui li riordini per priorita’.
              </>
            }
          />
        ) : (
          <ol className="divide-y divide-seam">
            {/* Stessa densita' della tabella svincolati: divisori appena
                percettibili invece di bordi pieni, e la riga sotto il puntatore
                che si accende invece di uno sfondo fisso per tutte. */}
            {targets.map((target, i) => {
              const player = byId.get(target.playerId);
              const owner = state.assignmentByPlayerId[target.playerId];
              const ownerTeam = owner ? teams.find((t) => t.id === owner.teamId) : null;
              return (
                <li
                  key={target.playerId}
                  className="group flex items-center gap-2 rounded px-1 py-1 text-sm transition-colors duration-100 even:bg-veil hover:bg-indigo-500/[0.06]"
                >
                  <span className="w-5 shrink-0 text-right text-xs num text-zinc-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-100">
                    {player?.name ?? `#${target.playerId}`}
                    {player !== undefined && (
                      <span className="ml-2 rounded border border-hair bg-film px-1.5 py-0.5 text-[11px] font-normal text-slate-400">
                        {player.team}
                      </span>
                    )}
                  </span>
                  {player !== undefined && (
                    <LineupPlacementBadge
                      playerId={player.id}
                      team={player.team}
                      lineups={lineups}
                    />
                  )}
                  {owner === undefined ? (
                    <span className="w-24 shrink-0 text-right text-xs text-emerald-400">libero</span>
                  ) : (
                    <span className="w-24 shrink-0 text-right text-xs text-zinc-500">
                      {ownerTeam?.abbr.toUpperCase() ?? owner.teamId} · {owner.price}
                    </span>
                  )}
                  {/* Riordino e rimozione: azioni di riga, non di elenco.
                      A riposo sono spente, cosi' la colonna resta leggibile;
                      sulla riga sotto il puntatore diventano piene. */}
                  <div className="flex shrink-0 gap-0.5 opacity-40 transition-opacity duration-100 group-hover:opacity-100">
                    <button
                      type="button"
                      title="Alza la priorità"
                      onClick={() =>
                        void addObjectiveTarget(target.playerId, {
                          priority: target.priority - 1.5,
                          note: target.note,
                        })
                      }
                      className="focus-ring rounded px-1 text-xs text-zinc-400 transition-colors duration-150 hover:bg-scrim hover:text-zinc-100"
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
                      className="focus-ring rounded px-1 text-xs text-zinc-400 transition-colors duration-150 hover:bg-scrim hover:text-zinc-100"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeObjectiveTarget(target.playerId)}
                      className="focus-ring rounded px-1 text-xs text-zinc-500 transition-colors duration-150 hover:bg-rose-500/15 hover:text-rose-300"
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
