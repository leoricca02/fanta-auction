import { useMemo, useState } from 'react';
import { ArrowDown, Eye, EyeOff, Search, Users } from 'lucide-react';

import type { Player, Role, Tag } from '../../domain/types';
import { PHASE_ORDER, TAGS } from '../../domain/types';
import { compareByFvmDesc, compareByQuotDesc, makeNoteIndex } from '../../domain/free-agents';
import { lineupStatus, makeLineupIndex } from '../../domain/lineup';
import { reduce } from '../../domain/reducer';
import { normalizeQuery } from '../../domain/search';
import type { Tier } from '../../domain/tiers';
import { TIER_ORDER, compareByTier, makeTierIndex, tierOf } from '../../domain/tiers';
import { TIER_BLOCKS } from '../../data/tiers';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { CloseButton, SectionTitle } from '../../ui/primitives';
import { LineupBadge } from '../player/LineupBadge';
import { PlayerCard } from '../player/PlayerCard';
import { TierBadge } from '../player/TierBadge';

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
 *
 * **I presi.** Di norma spariscono: sono rumore, e il senso della schermata e'
 * chi resta. Ma a meta' asta serve anche il contrario — "chi ha preso Kean?" —
 * quindi un interruttore li rimette in tabella spenti e barrati, con la sigla
 * di chi li ha presi e il prezzo battuto. Spenti, non nascosti: l'occhio li
 * salta scorrendo, e li trova quando li cerca.
 */

/** Ogni tag ha il suo segno: la stellina uguale per tutti non diceva niente. */
const TAG_STYLE: Readonly<Record<Tag, { readonly mark: string; readonly cls: string }>> = {
  obiettivo: { mark: '★', cls: 'text-emerald-400' },
  alternativa: { mark: '◇', cls: 'text-sky-400' },
  evita: { mark: '⨯', cls: 'text-rose-400' },
};

type SortKey = 'quot' | 'fvm' | 'name' | 'team' | 'status' | 'tier';

/** Il filtro fascia ha un terzo stato: chi la guida non nomina affatto. */
type TierFilter = Tier | 'tutte' | 'senza';

/** I filtri sopravvivono alla chiusura dell'overlay (§5.4). */
interface Filters {
  role: Role;
  query: string;
  team: string;
  tag: Tag | 'tutti';
  status: string;
  tier: TierFilter;
  onlyWithNote: boolean;
  showTaken: boolean;
  minQuot: number;
  sort: SortKey;
}

let persistedFilters: Filters = {
  role: 'P',
  query: '',
  team: 'tutte',
  tag: 'tutti',
  status: 'tutti',
  tier: 'tutte',
  onlyWithNote: false,
  showTaken: false,
  minQuot: 0,
  sort: 'quot',
};

const STATUSES = ['tutti', 'TITOLARE', 'BALLOTTAGGIO', 'PANCHINA', 'NON_INSERITO'] as const;

/** Stile comune dei controlli di filtro: un solo posto da cambiare. */
const CONTROL =
  'rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-zinc-200 outline-none transition-colors hover:border-white/20 focus:border-emerald-500/50';

export interface FreeAgentsPanelProps {
  readonly onClose?: () => void;
  /** In pagina intera invece che in overlay. */
  readonly embedded?: boolean;
}

export function FreeAgentsPanel({ onClose, embedded = false }: FreeAgentsPanelProps): JSX.Element {
  const players = useAppStore((s) => s.players);
  const teams = useAppStore((s) => s.teams);
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
  // Dato derivato dal listone, non dato utente: si ricalcola solo se il listone cambia.
  const tiers = useMemo(() => makeTierIndex(players, TIER_BLOCKS), [players]);

  const abbrById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.abbr.toUpperCase()])),
    [teams],
  );

  const teamCodes = useMemo(
    () => [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b, 'it')),
    [players],
  );

  const rows = useMemo(() => {
    const query = normalizeQuery(filters.query);
    const pool = players.filter(
      (p) =>
        p.role === filters.role &&
        (filters.showTaken || state.assignmentByPlayerId[p.id] === undefined),
    );

    const filtered = pool.filter((p) => {
      if (query !== '' && !p.searchKey.includes(query)) return false;
      if (filters.team !== 'tutte' && p.team !== filters.team) return false;
      if (p.quot < filters.minQuot) return false;
      const note = notes.get(p.id);
      if (filters.tag !== 'tutti' && note?.tag !== filters.tag) return false;
      if (filters.onlyWithNote && (note?.text ?? '') === '') return false;
      if (filters.status !== 'tutti' && lineupStatus(p.id, p.team, lineups) !== filters.status) {
        return false;
      }
      if (filters.tier !== 'tutte') {
        const tier = tierOf(p.id, tiers);
        if (filters.tier === 'senza' ? tier !== null : tier !== filters.tier) return false;
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
      tier: compareByTier(tiers, compareByQuotDesc),
    };
    return [...filtered].sort(sorters[filters.sort]);
  }, [players, state, notes, lineups, tiers, filters]);

  const freeCount = rows.filter((p) => state.assignmentByPlayerId[p.id] === undefined).length;

  const cardPlayer = useMemo(
    () => (cardPlayerId === null ? null : (players.find((p) => p.id === cardPlayerId) ?? null)),
    [cardPlayerId, players],
  );

  return (
    // La scheda vive accanto alla tabella, non sopra: aprirla non deve nascondere
    // la riga da cui sei partito ne' i filtri che hai appena messo.
    <div className={cn('flex max-w-full', embedded ? 'min-h-0 flex-1' : 'h-full')}>
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2.5 bg-zinc-950/80 p-3 backdrop-blur-xl',
          embedded ? 'min-h-0 flex-1' : 'h-full w-[46rem] border-l border-white/[0.08]',
        )}
      >
        <header className="flex items-center gap-2">
          <SectionTitle icon={<Users size={12} />}>Svincolati</SectionTitle>
          <span className="num text-xs text-zinc-500">
            {freeCount} liberi
            {filters.showTaken && rows.length > freeCount && (
              <span className="text-zinc-600"> · {rows.length - freeCount} presi</span>
            )}
          </span>
          {onClose !== undefined && (
            <span className="ml-auto">
              <CloseButton onClose={onClose} />
            </span>
          )}
        </header>

        {/* I quattro reparti, colorati: il ruolo attivo si vede senza leggere. */}
        <div className="flex gap-1">
          {PHASE_ORDER.map((role) => {
            const theme = roleTheme(role);
            const active = filters.role === role;
            return (
              <button
                key={role}
                type="button"
                onClick={() => update({ role })}
                title={theme.label}
                className={cn(
                  'rounded-lg px-3.5 py-1 text-sm font-semibold transition-all',
                  active
                    ? cn(theme.chip, theme.glow)
                    : 'border border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-zinc-300',
                )}
              >
                {role}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <div className="relative">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              value={filters.query}
              onChange={(e) => update({ query: e.target.value })}
              placeholder="nome"
              className={cn(CONTROL, 'w-36 pl-6 text-zinc-100 placeholder:text-zinc-600')}
            />
          </div>
          <select
            value={filters.team}
            onChange={(e) => update({ team: e.target.value })}
            className={CONTROL}
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
            className={CONTROL}
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
            className={CONTROL}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'tutti' ? 'ogni stato' : s}
              </option>
            ))}
          </select>
          <select
            value={filters.tier}
            onChange={(e) => update({ tier: e.target.value as TierFilter })}
            className={CONTROL}
          >
            <option value="tutte">ogni fascia</option>
            {TIER_ORDER.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="senza">senza fascia</option>
          </select>
          <label className="flex items-center gap-1 text-zinc-400">
            quot ≥
            <input
              type="number"
              min={0}
              value={filters.minQuot}
              onChange={(e) => update({ minQuot: Number(e.target.value) || 0 })}
              className={cn(CONTROL, 'num no-spin w-14 text-zinc-100')}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-zinc-400">
            <input
              type="checkbox"
              checked={filters.onlyWithNote}
              onChange={(e) => update({ onlyWithNote: e.target.checked })}
              className="accent-emerald-500"
            />
            solo con nota
          </label>
          <button
            type="button"
            onClick={() => update({ showTaken: !filters.showTaken })}
            aria-pressed={filters.showTaken}
            title="Rimette in tabella i giocatori gia' assegnati, spenti e barrati"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors',
              filters.showTaken
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-zinc-300',
            )}
          >
            {filters.showTaken ? <Eye size={12} /> : <EyeOff size={12} />}
            presi
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/[0.06]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-950/95 text-zinc-500 backdrop-blur">
              <tr className="border-b border-white/[0.08]">
                {(
                  [
                    ['name', 'nome'],
                    ['team', 'squadra'],
                    ['status', 'formazione'],
                    ['tier', 'fascia'],
                    ['quot', 'quot'],
                    ['fvm', 'fvm'],
                  ] as const
                ).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => update({ sort: key })}
                    title="Ordina per questa colonna"
                    className={cn(
                      'cursor-pointer px-2 py-1.5 text-left font-normal transition-colors hover:text-zinc-300',
                      filters.sort === key && 'text-zinc-200',
                      (key === 'quot' || key === 'fvm') && 'text-right',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5',
                        (key === 'quot' || key === 'fvm') && 'flex-row-reverse',
                      )}
                    >
                      {label}
                      {filters.sort === key && <ArrowDown size={10} className="text-zinc-500" />}
                    </span>
                  </th>
                ))}
                <th className="px-2 py-1.5 text-left font-normal">nota</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const note = notes.get(p.id);
                const owner = state.assignmentByPlayerId[p.id];
                const taken = owner !== undefined;
                const tier = tierOf(p.id, tiers);
                return (
                  <tr
                    key={p.id}
                    onClick={() => setCardPlayerId(p.id)}
                    title={
                      taken
                        ? `Preso da ${abbrById.get(owner.teamId) ?? owner.teamId} per ${owner.price}`
                        : 'Apri la scheda'
                    }
                    className={cn(
                      'cursor-pointer border-t border-white/[0.04] transition-colors hover:bg-white/[0.03]',
                      taken && 'text-zinc-500 opacity-[0.35]',
                    )}
                  >
                    <td
                      className={cn(
                        'max-w-[10rem] truncate px-2 py-1 text-zinc-100',
                        taken && 'text-zinc-500 line-through',
                      )}
                    >
                      {p.name}
                    </td>
                    <td className="truncate px-2 py-1 uppercase tracking-wide text-zinc-500">
                      {p.team}
                    </td>
                    <td className="px-2 py-1">
                      {taken ? (
                        <span className="num text-[10px] uppercase text-zinc-500">
                          {abbrById.get(owner.teamId) ?? owner.teamId} · {owner.price}
                        </span>
                      ) : (
                        <LineupBadge status={lineupStatus(p.id, p.team, lineups)} compact />
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {tier === null ? null : <TierBadge tier={tier} compact />}
                    </td>
                    <td className="num px-2 py-1 text-right text-zinc-300">{p.quot}</td>
                    <td className="num px-2 py-1 text-right text-zinc-500">{p.fvm}</td>
                    <td
                      className="max-w-[14rem] truncate px-2 py-1 text-zinc-500"
                      title={note?.text ?? ''}
                    >
                      {note?.tag != null && (
                        <span className={cn('mr-1', TAG_STYLE[note.tag].cls)} title={note.tag}>
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
                  <td colSpan={7} className="px-2 py-6 text-center text-zinc-600">
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
