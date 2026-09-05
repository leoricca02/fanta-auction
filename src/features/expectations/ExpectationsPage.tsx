import { useMemo, useState } from 'react';
import { Coins, Eraser, ListFilter, Search, SearchX, Wand2 } from 'lucide-react';

import type { Expectation, Player } from '../../domain/types';
import { compareByFvmDesc } from '../../domain/free-agents';
import { reduce } from '../../domain/reducer';
import { normalizeQuery } from '../../domain/search';
import type { MovementRole } from '../../domain/valuation';
import {
  MOVEMENT_ROLES,
  dynamicPrice,
  makeExpectationIndex,
  marketRates,
  valueOf,
} from '../../domain/valuation';
import { statsOf } from '../../domain/player-stats';
import { STATS_INDEX } from '../../data/stats-index';
import { STATS_SEASON } from '../../data/stats';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { EmptyState, InfoPopover, SectionTitle } from '../../ui/primitives';

/**
 * Aspettative (§5.5) — la schermata dove si compilano in blocco.
 *
 * La scheda giocatore ne valuta uno per volta, ed e' quello che serve sotto
 * asta. Qui invece se ne riempiono quaranta di fila la sera prima: una riga per
 * giocatore, cinque caselle, Tab che scorre, e il valore che si aggiorna mentre
 * batti.
 *
 * **Solo giocatori di movimento**, un reparto alla volta. I portieri non ci
 * sono: la loro asta si gioca su porte inviolate e titolarita', e questa
 * formula direbbe una cosa falsa su di loro.
 *
 * L'ordine e' `FVM/1000` decrescente — i nomi che conteranno stanno in alto,
 * e si smette di compilare quando si e' scesi abbastanza. Il default e' mostrare
 * i primi 60 del reparto: sono piu' dei 12 titolari che il tavolo si contende
 * davvero, e restano pochi abbastanza da finirli in una sera.
 */

type Filter = 'tutti' | 'valutati' | 'da-valutare';

/** Quanti nomi si vedono senza premere "mostra tutti". */
const HEAD_COUNT = 60;

const FIELDS = [
  { key: 'matches', label: 'pres' },
  { key: 'goals', label: 'gol' },
  { key: 'assists', label: 'assist' },
  { key: 'yellows', label: 'gialli' },
  { key: 'reds', label: 'rossi' },
] as const satisfies readonly {
  readonly key: keyof Omit<Expectation, 'playerId' | 'updatedAt'>;
  readonly label: string;
}[];

type FieldKey = (typeof FIELDS)[number]['key'];

export function ExpectationsPage(): JSX.Element {
  const players = useAppStore((s) => s.players);
  const userData = useAppStore((s) => s.userData);
  const leagueConfig = useAppStore((s) => s.leagueConfig);

  const [role, setRole] = useState<MovementRole>('D');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('tutti');
  const [showAll, setShowAll] = useState(false);

  const expectations = useMemo(
    () => makeExpectationIndex(userData.expectations),
    [userData.expectations],
  );
  const state = useMemo(
    () => reduce(userData.events, leagueConfig()),
    [userData.events, leagueConfig],
  );
  const rates = useMemo(() => marketRates(state, expectations), [state, expectations]);

  const ofRole = useMemo(
    () => players.filter((p) => p.role === role).sort(compareByFvmDesc),
    [players, role],
  );

  const needle = normalizeQuery(query);
  const filtered = ofRole.filter((player) => {
    if (needle !== '' && !player.searchKey.includes(needle)) return false;
    const has = expectations.has(player.id);
    if (filter === 'valutati') return has;
    if (filter === 'da-valutare') return !has;
    return true;
  });

  // La ricerca mostra sempre tutto quello che trova: chi cerca un nome sa gia'
  // chi vuole, e "mostra tutti" in mezzo sarebbe solo un ostacolo.
  const capped = showAll || needle !== '' || filter === 'valutati';
  const shown = capped ? filtered : filtered.slice(0, HEAD_COUNT);

  const countByRole = useMemo(() => {
    const out: Record<MovementRole, number> = { D: 0, C: 0, A: 0 };
    for (const e of userData.expectations) {
      const player = players.find((p) => p.id === e.playerId);
      if (player !== undefined && player.role !== 'P') out[player.role] += 1;
    }
    return out;
  }, [userData.expectations, players]);

  if (players.length === 0) {
    return (
      <div className="p-8 text-sm text-zinc-400">
        Carica prima il listone da <strong className="text-zinc-200">Impostazioni</strong>.
      </div>
    );
  }

  const rate = rates[role];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.08] bg-white/[0.01] px-3 py-2">
        <div className="flex items-center gap-1">
          {MOVEMENT_ROLES.map((r) => {
            const theme = roleTheme(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRole(r);
                  setShowAll(false);
                }}
                className={cn(
                  'focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all',
                  role === r
                    ? theme.chip
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200',
                )}
              >
                {theme.label}
                <span className="num opacity-70">{countByRole[r]}</span>
              </button>
            );
          })}
        </div>

        <label className="relative flex min-w-[12rem] flex-1 items-center">
          <Search size={13} className="absolute left-2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="cerca un nome…"
            className="field w-full py-1 pl-7 pr-2 text-sm"
          />
        </label>

        <div className="flex items-center gap-1 text-xs">
          <ListFilter size={13} className="text-zinc-600" />
          {(['tutti', 'da-valutare', 'valutati'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'focus-ring rounded-md px-2 py-1 transition-colors',
                filter === f
                  ? 'bg-white/[0.08] text-zinc-100'
                  : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300',
              )}
            >
              {f === 'da-valutare' ? 'da valutare' : f}
            </button>
          ))}
        </div>

        <span className="num ml-auto text-[11px] text-zinc-500">
          {rate.rate === null ? (
            <>reparto {role}: nessun tasso ancora</>
          ) : (
            <>
              tasso {role} <span className="text-zinc-300">{rate.rate.toFixed(2)}</span> su{' '}
              {rate.sample} aste
            </>
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <SectionTitle icon={<Coins size={12} />}>
          Aspettative 2026/27
          <InfoPopover
            label="A cosa servono le aspettative"
            trigger={
              <span className="ml-1.5 inline-flex cursor-help text-zinc-600 hover:text-zinc-300">
                ?
              </span>
            }
          >
            <p className="leading-snug">
              Scrivi quanto pensi che ognuno faccia quest&apos;anno. Diventa un valore con i bonus e
              malus del fantacalcio; il prezzo consigliato è quel valore per quanto il tuo tavolo
              sta pagando un punto in questo reparto.
            </p>
            <p className="mt-1.5 leading-snug text-zinc-500">
              Non serve compilarli tutti: bastano i nomi che ti interessano davvero. Chi resta
              vuoto non avrà prezzo dinamico, ed è il caso normale.
            </p>
          </InfoPopover>
        </SectionTitle>

        {shown.length === 0 ? (
          <EmptyState
            icon={<SearchX size={22} />}
            title="Nessun giocatore"
            hint={
              filter === 'valutati'
                ? `Non hai ancora valutato nessun ${roleTheme(role).label.toLowerCase()}. Togli il filtro e comincia dai primi della lista.`
                : 'Nessun nome corrisponde alla ricerca.'
            }
          />
        ) : (
          /*
            Larghezza ferma a 56rem: su uno schermo largo una tabella a tutta
            pagina lascia mezzo metro di vuoto fra il nome e le caselle, e
            l'occhio perde la riga mentre attraversa. Qui i cinque campi
            restano a fianco del nome.
          */
          <table className="mt-1 w-full max-w-[56rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-600">
                <th className="sticky top-0 z-10 bg-panel/95 py-1 pl-1 text-left font-medium backdrop-blur">
                  giocatore
                </th>
                <th className="sticky top-0 z-10 w-24 bg-panel/95 py-1 text-left font-medium backdrop-blur">
                  club
                </th>
                {FIELDS.map((f) => (
                  <th
                    key={f.key}
                    className="sticky top-0 z-10 w-14 bg-panel/95 py-1 text-center font-medium backdrop-blur"
                  >
                    {f.label}
                  </th>
                ))}
                <th className="sticky top-0 z-10 w-16 bg-panel/95 py-1 pl-6 text-right font-medium backdrop-blur">
                  valore
                </th>
                <th className="sticky top-0 z-10 w-20 bg-panel/95 py-1 pr-1 text-right font-medium backdrop-blur">
                  prezzo
                </th>
                <th className="sticky top-0 z-10 w-14 bg-panel/95 backdrop-blur" />
              </tr>
            </thead>
            <tbody>
              {shown.map((player) => (
                <Row
                  key={player.id}
                  player={player}
                  role={role}
                  expectation={expectations.get(player.id) ?? null}
                  price={dynamicPrice(player, expectations, rates)?.price ?? null}
                  taken={state.assignmentByPlayerId[player.id] !== undefined}
                />
              ))}
            </tbody>
          </table>
        )}

        {!capped && filtered.length > shown.length && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="focus-ring mt-2 w-full max-w-[56rem] rounded-lg border border-white/[0.08] py-1.5 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
          >
            Mostra tutti gli altri {filtered.length - shown.length}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Una riga.
 *
 * Tiene la bozza sua: mentre cancelli "12" per scrivere "9" la casella passa
 * da vuota, e un numero non sa rappresentare il vuoto. Si scrive su `blur` e
 * su Invio invece che a ogni battuta — qui si compila di fila, e una scrittura
 * per tasto sarebbe una raffica su IndexedDB per niente.
 */
function Row({
  player,
  role,
  expectation,
  price,
  taken,
}: {
  readonly player: Player;
  readonly role: MovementRole;
  readonly expectation: Expectation | null;
  readonly price: number | null;
  readonly taken: boolean;
}): JSX.Element {
  const setExpectation = useAppStore((s) => s.setExpectation);
  const clearExpectation = useAppStore((s) => s.clearExpectation);

  const [draft, setDraft] = useState<Record<FieldKey, string>>(() => toDraft(expectation));
  const stats = statsOf(player.id, STATS_INDEX);
  const value = expectation === null ? null : valueOf(expectation, role);

  function save(next: Record<FieldKey, string>): void {
    const empty = FIELDS.every((f) => next[f.key].trim() === '');
    if (empty) {
      // Svuotare tutte le caselle e' come dire "non l'ho valutato": la riga
      // sparisce invece di restare a zero, che sarebbe un giudizio.
      if (expectation !== null) void clearExpectation(player.id);
      return;
    }
    void setExpectation(player.id, {
      matches: readField(next.matches),
      goals: readField(next.goals),
      assists: readField(next.assists),
      yellows: readField(next.yellows),
      reds: readField(next.reds),
    });
  }

  function seed(): void {
    if (stats === null) return;
    const next: Record<FieldKey, string> = {
      matches: String(stats.played),
      goals: String(stats.goals),
      assists: String(stats.assists),
      yellows: String(stats.yellow),
      reds: String(stats.red),
    };
    setDraft(next);
    save(next);
  }

  return (
    <tr className={cn('group transition-colors hover:bg-white/[0.03]', taken && 'opacity-45')}>
      <td className="max-w-0 truncate py-0.5 pl-1 pr-2">
        <span className={cn('text-zinc-200', taken && 'line-through')}>{player.name}</span>
      </td>
      <td className="truncate py-0.5 pr-2 text-[11px] uppercase text-zinc-600">{player.team}</td>

      {FIELDS.map((field) => (
        <td key={field.key} className="px-0.5 py-0.5">
          <input
            inputMode="numeric"
            value={draft[field.key]}
            aria-label={`${player.name} ${field.label}`}
            onChange={(e) => {
              const clean = e.target.value.replace(/[^\d]/g, '').slice(0, 3);
              setDraft((d) => ({ ...d, [field.key]: clean }));
            }}
            onBlur={() => save(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="field num w-full px-1 py-0.5 text-center text-xs"
          />
        </td>
      ))}

      <td className="num py-0.5 pl-6 pr-1 text-right text-xs text-zinc-400">
        {value === null ? <span className="text-zinc-700">—</span> : value.toFixed(1)}
      </td>
      <td className="num py-0.5 pr-1 text-right">
        {price === null ? (
          <span className="text-zinc-700">—</span>
        ) : (
          <span className="font-semibold text-emerald-400">{price}</span>
        )}
      </td>

      <td className="py-0.5 pr-1 text-right">
        <span className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {stats !== null && (
            <button
              type="button"
              onClick={seed}
              title={`Riempi con le cifre vere del ${STATS_SEASON}`}
              className="focus-ring rounded p-1 text-zinc-600 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
            >
              <Wand2 size={12} />
            </button>
          )}
          {expectation !== null && (
            <button
              type="button"
              onClick={() => {
                setDraft(toDraft(null));
                void clearExpectation(player.id);
              }}
              title="Togli l'aspettativa"
              className="focus-ring rounded p-1 text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
            >
              <Eraser size={12} />
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

function toDraft(expectation: Expectation | null): Record<FieldKey, string> {
  if (expectation === null) {
    return { matches: '', goals: '', assists: '', yellows: '', reds: '' };
  }
  return {
    matches: String(expectation.matches),
    goals: String(expectation.goals),
    assists: String(expectation.assists),
    yellows: String(expectation.yellows),
    reds: String(expectation.reds),
  };
}

/** Casella vuota vale zero: si sta scrivendo un conteggio, e il vuoto e' nessuno. */
function readField(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
