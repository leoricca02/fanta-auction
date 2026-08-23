import { useMemo, useState } from 'react';

import type { LineupStatus, Role } from '../../domain/types';
import { PHASE_ORDER } from '../../domain/types';
import { makePlayerIndex, reduce } from '../../domain/reducer';
import { makeLineupIndex } from '../../domain/lineup';
import { userTeam } from '../../domain/config';
import type { Deal, TeamSortKey, TeamStats } from '../../domain/stats';
import { compareTeamStats, computeAuctionStats } from '../../domain/stats';
import { useAppStore } from '../../store/appStore';

/**
 * L'asta in numeri — overlay `t`.
 *
 * Tutto quello che si vede qui e' misurato: prezzi battuti, slot occupati,
 * crediti residui, e gli stati di formazione inseriti a mano. Nessuna stima di
 * prezzo: quella e' morta con la 1.0 e non torna.
 *
 * Le tre domande a cui la schermata risponde, in quest'ordine:
 *
 *   1. **Il tavolo sta correndo o sta tenendo?** Il termometro confronta la
 *      quota di crediti bruciati con la quota di slot riempiti. Sopra 1 si
 *      sta pagando caro, e conviene aspettare; sotto 1 gli affari sono adesso.
 *   2. **Cosa stanno comprando?** Spesa per reparto, e soprattutto quanti dei
 *      giocatori gia' andati sono titolari secondo le tue formazioni. E' il
 *      dato che nessun altro al tavolo ha.
 *   3. **Chi mi puo' ancora battere?** La tabella per squadra, ordinabile:
 *      crediti residui, max bid, e crediti per slot ancora libero — la potenza
 *      di fuoco vera di chi ha 200 crediti e diciotto buchi da riempire.
 */

const STATUS_FILL: Readonly<Record<LineupStatus, string>> = {
  TITOLARE: 'bg-emerald-500',
  BALLOTTAGGIO: 'bg-amber-500',
  PANCHINA: 'bg-neutral-400',
  NON_INSERITO: 'bg-neutral-600',
};

const STATUS_LABEL: Readonly<Record<LineupStatus, string>> = {
  TITOLARE: 'titolari',
  BALLOTTAGGIO: 'ballottaggi',
  PANCHINA: 'panchina',
  NON_INSERITO: 'formazione non inserita',
};

const STATUS_ORDER: readonly LineupStatus[] = [
  'TITOLARE',
  'BALLOTTAGGIO',
  'PANCHINA',
  'NON_INSERITO',
];

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function credits(value: number): string {
  return Math.round(value).toLocaleString('it-IT');
}

function decimal(value: number, digits = 1): string {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/** Verdetto del termometro. Sotto i dieci acquisti il campione e' troppo corto. */
function heatVerdict(heat: number | null, slotsFilled: number): {
  readonly text: string;
  readonly tone: string;
} {
  if (heat === null) return { text: 'non ancora partita', tone: 'text-neutral-500' };
  if (slotsFilled < 10) return { text: 'troppo presto per dirlo', tone: 'text-neutral-400' };
  if (heat >= 1.15) return { text: 'si sta pagando caro', tone: 'text-amber-400' };
  if (heat <= 0.85) return { text: 'il tavolo tiene i crediti', tone: 'text-emerald-400' };
  return { text: 'andamento regolare', tone: 'text-neutral-300' };
}

export interface StatsPanelProps {
  readonly onClose?: () => void;
  readonly embedded?: boolean;
}

export function StatsPanel({ onClose, embedded = false }: StatsPanelProps): JSX.Element {
  const players = useAppStore((s) => s.players);
  const teams = useAppStore((s) => s.teams);
  const userData = useAppStore((s) => s.userData);
  const leagueConfig = useAppStore((s) => s.leagueConfig);

  const [sort, setSort] = useState<TeamSortKey>('perFreeSlot');

  const config = useMemo(() => leagueConfig(), [leagueConfig, players, teams]);
  const stats = useMemo(
    () =>
      computeAuctionStats({
        state: reduce(userData.events, config),
        config,
        players: makePlayerIndex(players),
        lineups: makeLineupIndex(userData.lineups),
        events: userData.events,
      }),
    [userData.events, userData.lineups, config, players],
  );

  const me = useMemo(() => {
    try {
      return userTeam(config);
    } catch {
      return null;
    }
  }, [config]);

  const rows = useMemo(() => [...stats.teams].sort(compareTeamStats(sort)), [stats.teams, sort]);
  const nameById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.abbr.toUpperCase()])),
    [teams],
  );

  const { market, pace, mix } = stats;
  const verdict = heatVerdict(market.heatIndex, market.slotsFilled);

  return (
    <div
      className={`flex flex-col gap-4 overflow-y-auto bg-neutral-950 p-4 ${
        embedded ? 'min-h-0 flex-1' : 'h-full w-[68rem] max-w-full border-l border-neutral-800'
      }`}
    >
      <header className="flex items-baseline gap-3">
        <h2 className="text-base font-semibold text-neutral-100">L&apos;asta in numeri</h2>
        <span className="text-xs text-neutral-500">
          {market.slotsFilled} di {market.totalSlots} slot assegnati
        </span>
        {onClose !== undefined && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
          >
            Esc
          </button>
        )}
      </header>

      {stats.empty ? (
        <p className="rounded border border-dashed border-neutral-800 px-4 py-10 text-center text-sm text-neutral-500">
          Nessuna assegnazione ancora. Le statistiche compaiono dal primo colpo battuto.
        </p>
      ) : (
        <>
          {/* 1 — le cinque cifre che decidono se rilanci adesso o aspetti. */}
          <section className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Tile
              label="termometro del tavolo"
              value={market.heatIndex === null ? '—' : `${decimal(market.heatIndex, 2)}×`}
              hint={verdict.text}
              tone={verdict.tone}
              title="Quota di crediti spesi divisa per la quota di slot riempiti. Sopra 1 il tavolo sta correndo."
            />
            <Tile
              label="crediti bruciati"
              value={pct(market.spentShare)}
              hint={`${credits(market.creditsSpent)} di ${credits(market.totalCredits)}`}
              bar={market.spentShare}
            />
            <Tile
              label="slot riempiti"
              value={pct(market.filledShare)}
              hint={`${market.slotsFilled} di ${market.totalSlots}`}
              bar={market.filledShare}
            />
            <Tile
              label="prezzo medio"
              value={credits(market.avgPrice)}
              hint={`restano ${decimal(market.residualPerSlot)} per slot libero`}
              title="Media pagata finora, e quanto vale in media uno slot da qui alla fine."
            />
            <Tile
              label="ritmo"
              value={pace.perMinute === null ? '—' : `${decimal(pace.perMinute)}/min`}
              hint={
                pace.projectedEndTs === null
                  ? `${pace.assignments} chiamate`
                  : `fine stimata ~${clock(pace.projectedEndTs)}`
              }
              title="Chiamate al minuto tenute finora. La fine stimata e' l'unica proiezione della schermata."
            />
          </section>

          {/* 2 — dove vanno i crediti, reparto per reparto. */}
          <section className="rounded border border-neutral-800 p-3">
            <h3 className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">
              Dove vanno i crediti
            </h3>
            <ul className="flex flex-col gap-1.5">
              {stats.byRole.map((role) => (
                <li key={role.role} className="flex items-center gap-2 text-xs">
                  <span className="w-4 shrink-0 font-semibold text-neutral-400">{role.role}</span>
                  <span className="w-16 shrink-0 tabular-nums text-neutral-500">
                    {role.filled}/{role.totalSlots}
                  </span>
                  <span
                    className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-neutral-900"
                    title={`${credits(role.spent)} crediti — ${pct(role.shareOfSpend)} della spesa di lega`}
                  >
                    <span
                      className="block h-full rounded-sm bg-emerald-500"
                      style={{ width: `${Math.max(role.shareOfSpend * 100, role.spent > 0 ? 2 : 0)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-neutral-300">
                    {credits(role.spent)} cr
                  </span>
                  <span className="w-20 shrink-0 text-right tabular-nums text-neutral-500">
                    media {credits(role.avgPrice)}
                  </span>
                  <span className="w-44 shrink-0 truncate text-right text-neutral-500">
                    {role.top === null ? '—' : `top ${role.top.name} ${role.top.price}`}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 3 — il dato che nessun altro al tavolo ha. */}
          <section className="rounded border border-neutral-800 p-3">
            <h3 className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
              Che roba e&apos; uscita finora
            </h3>
            <p className="mb-2 text-xs text-neutral-400">
              <strong className="text-emerald-400">{pct(mix.starterShare)}</strong> dei giocatori
              gia&apos; andati e&apos; titolare nelle formazioni che hai compilato.
            </p>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden">
              {STATUS_ORDER.map((status) =>
                mix[status] === 0 ? null : (
                  <span
                    key={status}
                    className={`h-full rounded-sm ${STATUS_FILL[status]}`}
                    style={{ width: `${(mix[status] / mix.assigned) * 100}%` }}
                    title={`${mix[status]} ${STATUS_LABEL[status]}`}
                  />
                ),
              )}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-400">
              {STATUS_ORDER.map((status) => (
                <li key={status} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-sm ${STATUS_FILL[status]}`} />
                  <span className="tabular-nums text-neutral-200">{mix[status]}</span>
                  {STATUS_LABEL[status]}
                </li>
              ))}
            </ul>
          </section>

          {/* 4 — le due classifiche che raccontano il tavolo. */}
          <section className="grid gap-3 md:grid-cols-2">
            <DealList
              title="Colpi piu' cari"
              deals={stats.topDeals}
              nameById={nameById}
              render={(d) => `${credits(d.price)} cr`}
            />
            <DealList
              title="Pagati piu' sopra quotazione"
              hint="prezzo diviso QUOT. — due numeri battuti, nessuna valutazione"
              deals={stats.topOverQuot}
              nameById={nameById}
              render={(d) => `${decimal(d.overQuot, 1)}× quot`}
            />
          </section>

          {/* 5 — chi mi puo' ancora battere. */}
          <section className="rounded border border-neutral-800">
            <h3 className="border-b border-neutral-800 px-3 py-2 text-[11px] uppercase tracking-wide text-neutral-500">
              Squadra per squadra — clicca una colonna per ordinare
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-neutral-500">
                  <tr>
                    <SortableTh label="sigla" sortKey="teamId" sort={sort} onSort={setSort} left />
                    <SortableTh label="crediti" sortKey="credits" sort={sort} onSort={setSort} />
                    <SortableTh label="max bid" sortKey="maxBid" sort={sort} onSort={setSort} />
                    <SortableTh
                      label="per slot"
                      sortKey="perFreeSlot"
                      sort={sort}
                      onSort={setSort}
                      title="Crediti residui divisi per gli slot ancora liberi: quanto puo' mettere in media su ogni buco."
                    />
                    <SortableTh label="speso" sortKey="spent" sort={sort} onSort={setSort} />
                    <SortableTh label="slot" sortKey="slotsFilled" sort={sort} onSort={setSort} />
                    <SortableTh label="medio" sortKey="avgPrice" sort={sort} onSort={setSort} />
                    <SortableTh
                      label="titolari"
                      sortKey="starterShare"
                      sort={sort}
                      onSort={setSort}
                      title="Quota di titolari fra gli acquisti di cui conosci la formazione."
                    />
                    <th className="px-2 py-1.5 text-left font-normal">reparti</th>
                    <th className="px-2 py-1.5 text-left font-normal">colpo piu&apos; caro</th>
                    <th className="px-2 py-1.5 text-left font-normal">club</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((team) => (
                    <TeamRow
                      key={team.teamId}
                      team={team}
                      label={nameById.get(team.teamId) ?? team.teamId}
                      mine={me?.id === team.teamId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface TileProps {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly tone?: string;
  readonly bar?: number;
  readonly title?: string;
}

function Tile({ label, value, hint, tone, bar, title }: TileProps): JSX.Element {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 p-3" title={title}>
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums text-neutral-100">{value}</div>
      {bar !== undefined && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-sm bg-neutral-800">
          <div
            className="h-full rounded-sm bg-emerald-500"
            style={{ width: `${Math.min(bar * 100, 100)}%` }}
          />
        </div>
      )}
      <div className={`mt-1 text-[11px] ${tone ?? 'text-neutral-500'}`}>{hint}</div>
    </div>
  );
}

interface DealListProps {
  readonly title: string;
  readonly hint?: string;
  readonly deals: readonly Deal[];
  readonly nameById: ReadonlyMap<string, string>;
  readonly render: (deal: Deal) => string;
}

function DealList({ title, hint, deals, nameById, render }: DealListProps): JSX.Element {
  return (
    <div className="rounded border border-neutral-800 p-3">
      <h3 className="text-[11px] uppercase tracking-wide text-neutral-500">{title}</h3>
      {hint !== undefined && <p className="mb-1 text-[10px] text-neutral-600">{hint}</p>}
      <ol className="mt-1 flex flex-col gap-1">
        {deals.map((deal) => (
          <li key={deal.playerId} className="flex items-baseline gap-2 text-xs">
            <span className="w-4 shrink-0 text-neutral-600">{deal.role}</span>
            <span className="min-w-0 flex-1 truncate text-neutral-100">{deal.name}</span>
            <span className="shrink-0 text-neutral-600">{deal.club}</span>
            <span className="w-10 shrink-0 text-right text-neutral-400">
              {nameById.get(deal.teamId) ?? deal.teamId}
            </span>
            <span className="w-20 shrink-0 text-right tabular-nums text-neutral-200">
              {render(deal)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

interface SortableThProps {
  readonly label: string;
  readonly sortKey: TeamSortKey;
  readonly sort: TeamSortKey;
  readonly onSort: (key: TeamSortKey) => void;
  readonly left?: boolean;
  readonly title?: string;
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  left = false,
  title,
}: SortableThProps): JSX.Element {
  const active = sort === sortKey;
  return (
    <th className={`font-normal ${left ? 'text-left' : 'text-right'}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={title}
        className={`w-full px-2 py-1.5 ${left ? 'text-left' : 'text-right'} ${
          active ? 'text-neutral-100 underline' : 'hover:text-neutral-300'
        }`}
      >
        {label}
      </button>
    </th>
  );
}

interface TeamRowProps {
  readonly team: TeamStats;
  readonly label: string;
  readonly mine: boolean;
}

function TeamRow({ team, label, mine }: TeamRowProps): JSX.Element {
  return (
    <tr
      className={`border-t border-neutral-900 hover:bg-neutral-900/60 ${
        mine ? 'bg-emerald-950/30' : ''
      }`}
    >
      <td className="px-2 py-1.5 font-medium text-neutral-100">
        {label}
        {mine && <span className="ml-1 text-[10px] text-emerald-500">tu</span>}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-100">
        {credits(team.credits)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-300">
        {credits(team.maxBid)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-300">
        {team.slotsFree === 0 ? 'piena' : decimal(team.perFreeSlot)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-400">
        {credits(team.spent)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-400">
        {team.slotsFilled}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-neutral-400">
        {team.slotsFilled === 0 ? '—' : credits(team.avgPrice)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {team.mix.assigned === 0 ? (
          <span className="text-neutral-600">—</span>
        ) : (
          <span className="text-emerald-400">{pct(team.mix.starterShare)}</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <span className="flex items-center gap-1 text-[10px] text-neutral-500">
          {PHASE_ORDER.map((role: Role) => (
            <span key={role} className="tabular-nums" title={`${role}: ${team.filledByRole[role]}`}>
              {team.filledByRole[role]}
            </span>
          ))}
        </span>
      </td>
      <td className="max-w-[12rem] truncate px-2 py-1.5 text-neutral-400">
        {team.priciest === null
          ? '—'
          : `${team.priciest.name} ${credits(team.priciest.price)}`}
      </td>
      <td className="px-2 py-1.5 text-neutral-500">
        {team.topClub === null ? '—' : `${team.topClub.club} ×${team.topClub.count}`}
      </td>
    </tr>
  );
}
