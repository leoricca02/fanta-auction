import { useMemo, useState } from 'react';

import type { Player, Role, Tag } from '../../domain/types';
import { PHASE_ORDER, TAGS } from '../../domain/types';
import { compareByFvmDesc, compareByQuotDesc, makeNoteIndex } from '../../domain/free-agents';
import { lineupStatus, makeLineupIndex } from '../../domain/lineup';
import { reduce } from '../../domain/reducer';
import { normalizeQuery } from '../../domain/search';
import { useAppStore } from '../../store/appStore';
import { LineupBadge } from '../player/LineupBadge';
import { PlayerCard } from '../player/PlayerCard';

/**
 * Svincolati (PRD §5.4).
 *
 * Tabella di chi non e' ancora stato assegnato, divisa per ruolo, ordinabile e
 * filtrabile. Si apre anche in overlay dall'asta con `s`, e i filtri restano
 * fra un'apertura e l'altra perche' vivono in un modulo, non nel componente.
 *
 * L'ordine di default e' `QUOT.` decrescente — il listone, non l'alfabeto — e
 * ogni riga porta con se' tag e nota: la tabella deve bastare da sola, senza
 * aprire nient'altro. Quando invece serve tutto, la riga e' cliccabile e apre
 * la scheda: all'asta si sta con tastiera **e** mouse.
 */

/** Ogni tag ha il suo segno: la stellina uguale per tutti non diceva niente. */
const TAG_STYLE: Readonly<Record<Tag, { readonly mark: string; readonly cls: string }>> = {
  obiettivo: { mark: '★', cls: 'text-emerald-400' },
  alternativa: { mark: '◇', cls: 'text-sky-400' },
  evita: { mark: '⨯', cls: 'text-rose-400' },
};

type SortKey = 'quot' | 'fvm' | 'name' | 'team' | 'status';

/** I filtri sopravvivono alla chiusura dell'overlay (§5.4). */
interface Filters {
  role: Role;
  query: string;
  team: string;
  tag: Tag | 'tutti';
  status: string;
  onlyWithNote: boolean;
  minQuot: number;
  sort: SortKey;
}

let persistedFilters: Filters = {
  role: 'P',
  query: '',
  team: 'tutte',
  tag: 'tutti',
  status: 'tutti',
  onlyWithNote: false,
  minQuot: 0,
  sort: 'quot',
};

const STATUSES = ['tutti', 'TITOLARE', 'BALLOTTAGGIO', 'PANCHINA', 'NON_INSERITO'] as const;

export interface FreeAgentsPanelProps {
  readonly onClose?: () => void;
  /** In pagina intera invece che in overlay. */
  readonly embedded?: boolean;
}

export function FreeAgentsPanel({ onClose, embedded = false }: FreeAgentsPanelProps): JSX.Element {
  const players = useAppStore((s) => s.players);
  const userData = useAppStore((s) => s.userData);
  const leagueConfig = useAppStore((s) => s.leagueConfig);

  const [filters, setFilters] = useState<Filters>(persistedFilters);
  const [cardPlayerId, setCardPlayerId] = useState<number | null>(null);
  function update(patch: Partial<Filters>): void {
    const next = { ...filters, ...patch };
    persistedFilters = next;
    setFilters(next);
  }

  // La config dipende da listone e squadre: senza queste dipendenze un
  // re-import del listone lascerebbe la vista sui dati vecchi.
  const config = useMemo(() => leagueConfig(), [leagueConfig, players]);
  const state = useMemo(() => reduce(userData.events, config), [userData.events, config]);
  const notes = useMemo(() => makeNoteIndex(userData.playerNotes), [userData.playerNotes]);
  const lineups = useMemo(() => makeLineupIndex(userData.lineups), [userData.lineups]);

  const teamCodes = useMemo(
    () => [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b, 'it')),
    [players],
  );

  const rows = useMemo(() => {
    const query = normalizeQuery(filters.query);
    const free = players.filter(
      (p) => p.role === filters.role && state.assignmentByPlayerId[p.id] === undefined,
    );

    const filtered = free.filter((p) => {
      if (query !== '' && !p.searchKey.includes(query)) return false;
      if (filters.team !== 'tutte' && p.team !== filters.team) return false;
      if (p.quot < filters.minQuot) return false;
      const note = notes.get(p.id);
      if (filters.tag !== 'tutti' && note?.tag !== filters.tag) return false;
      if (filters.onlyWithNote && (note?.text ?? '') === '') return false;
      if (filters.status !== 'tutti' && lineupStatus(p.id, p.team, lineups) !== filters.status) {
        return false;
      }
      return true;
    });

    const sorters: Readonly<Record<SortKey, (a: Player, b: Player) => number>> = {
      quot: compareByQuotDesc,
      fvm: compareByFvmDesc,
      name: (a, b) => a.name.localeCompare(b.name, 'it'),
      team: (a, b) => a.team.localeCompare(b.team, 'it') || compareByQuotDesc(a, b),
      status: (a, b) =>
        lineupStatus(a.id, a.team, lineups).localeCompare(lineupStatus(b.id, b.team, lineups)) ||
        compareByQuotDesc(a, b),
    };
    return [...filtered].sort(sorters[filters.sort]);
  }, [players, state, notes, lineups, filters]);

  const cardPlayer = useMemo(
    () => (cardPlayerId === null ? null : (players.find((p) => p.id === cardPlayerId) ?? null)),
    [cardPlayerId, players],
  );

  return (
    // La scheda vive accanto alla tabella, non sopra: aprirla non deve nascondere
    // la riga da cui sei partito ne' i filtri che hai appena messo.
    <div className={`flex max-w-full ${embedded ? 'min-h-0 flex-1' : 'h-full'}`}>
      <div
        className={`flex min-w-0 flex-col gap-2 bg-neutral-950 p-3 ${
          embedded ? 'min-h-0 flex-1' : 'h-full w-[46rem] border-l border-neutral-800'
        }`}
      >
      <header className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-neutral-100">Svincolati</h2>
        <span className="text-xs tabular-nums text-neutral-500">{rows.length} giocatori</span>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800"
          >
            Esc
          </button>
        )}
      </header>

      <div className="flex gap-1">
        {PHASE_ORDER.map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => update({ role })}
            className={`rounded px-3 py-1 text-sm ${
              filters.role === role
                ? 'bg-neutral-800 text-neutral-100'
                : 'text-neutral-500 hover:bg-neutral-900'
            }`}
          >
            {role}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          value={filters.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder="nome"
          className="w-32 rounded bg-neutral-900 px-2 py-1 text-neutral-100 outline-none ring-1 ring-neutral-800"
        />
        <select
          value={filters.team}
          onChange={(e) => update({ team: e.target.value })}
          className="rounded bg-neutral-900 px-1 py-1 text-neutral-200"
        >
          <option value="tutte">tutte le squadre</option>
          {teamCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <select
          value={filters.tag}
          onChange={(e) => update({ tag: e.target.value as Tag | 'tutti' })}
          className="rounded bg-neutral-900 px-1 py-1 text-neutral-200"
        >
          <option value="tutti">ogni tag</option>
          {TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <select
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
          className="rounded bg-neutral-900 px-1 py-1 text-neutral-200"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'tutti' ? 'ogni stato' : s}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-neutral-400">
          quot ≥
          <input
            type="number"
            min={0}
            value={filters.minQuot}
            onChange={(e) => update({ minQuot: Number(e.target.value) || 0 })}
            className="w-14 rounded bg-neutral-900 px-1 py-1 text-neutral-100 outline-none ring-1 ring-neutral-800"
          />
        </label>
        <label className="flex items-center gap-1 text-neutral-400">
          <input
            type="checkbox"
            checked={filters.onlyWithNote}
            onChange={(e) => update({ onlyWithNote: e.target.checked })}
          />
          solo con nota
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-neutral-950 text-neutral-500">
            <tr>
              {(
                [
                  ['name', 'nome'],
                  ['team', 'squadra'],
                  ['status', 'formazione'],
                  ['quot', 'quot'],
                  ['fvm', 'fvm'],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => update({ sort: key })}
                  title="Ordina per questa colonna"
                  className={`cursor-pointer py-1 text-left font-normal hover:text-neutral-300 ${
                    filters.sort === key ? 'text-neutral-200' : ''
                  } ${key === 'quot' || key === 'fvm' ? 'text-right' : ''}`}
                >
                  {label}
                  {filters.sort === key && <span className="ml-0.5 text-neutral-500">↓</span>}
                </th>
              ))}
              <th className="text-left font-normal">nota</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const note = notes.get(p.id);
              return (
                <tr
                  key={p.id}
                  onClick={() => setCardPlayerId(p.id)}
                  title="Apri la scheda"
                  className="cursor-pointer border-t border-neutral-900 hover:bg-neutral-900"
                >
                  <td className="max-w-[10rem] truncate py-1 text-neutral-100">{p.name}</td>
                  <td className="truncate py-1 text-neutral-500">{p.team}</td>
                  <td className="py-1">
                    <LineupBadge status={lineupStatus(p.id, p.team, lineups)} compact />
                  </td>
                  <td className="py-1 text-right tabular-nums text-neutral-300">{p.quot}</td>
                  <td className="py-1 text-right tabular-nums text-neutral-500">{p.fvm}</td>
                  <td
                    className="max-w-[14rem] truncate py-1 text-neutral-500"
                    title={note?.text ?? ''}
                  >
                    {note?.tag != null && (
                      <span className={`mr-1 ${TAG_STYLE[note.tag].cls}`} title={note.tag}>
                        {TAG_STYLE[note.tag].mark}
                      </span>
                    )}
                    {note?.text ?? ''}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-neutral-600">
                  Nessuno svincolato con questi filtri.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {cardPlayer !== null && (
        <PlayerCard key={cardPlayer.id} player={cardPlayer} onClose={() => setCardPlayerId(null)} />
      )}
    </div>
  );
}
