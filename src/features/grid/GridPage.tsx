import { useMemo, useState } from 'react';
import { CalendarDays, Info, Sparkles, X } from 'lucide-react';

import type { Cell, Combo, Difficulty, GridMode } from '../../domain/calendar';
import {
  GRID_MODES,
  bestCombos,
  buildGrid,
  cellsOf,
  combine,
  keyPlayers,
  tally,
  teamAbbrs,
} from '../../domain/calendar';
import { CALENDAR_SEASON, CALENDAR_UPDATED_AT, FIXTURES } from '../../data/calendar';
import {
  DIFFICULTY_SOURCE,
  DIFFICULTY_UPDATED_AT,
  TEAM_DIFFICULTY,
} from '../../data/difficulty';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { InfoPopover, Kpi, SectionTitle } from '../../ui/primitives';
import { roleTheme } from '../../ui/roles';

/**
 * Griglia di alternanza (portieri e attaccanti).
 *
 * Risponde a una domanda sola: **se accoppio queste due squadre, quante
 * giornate comode mi restano?** Il portiere di riserva si compra per questo, e
 * la stessa griglia serve identica per il terzo attaccante.
 *
 * Tre pezzi, dall'alto: l'abbinamento che stai costruendo con il suo voto, i
 * migliori abbinamenti che il calendario permette, e la griglia intera dei venti
 * club. Cliccare una riga la aggiunge o la toglie dall'abbinamento: la griglia
 * e' anche il selettore, perche' la squadra la scegli guardando i colori.
 *
 * La difficolta' non e' calcolata qui: e' la classificazione di FantaLab in
 * `src/data/difficulty.ts` — facile, media o difficile per ogni club, un colore
 * per i portieri e uno per gli attaccanti — e non dipende dal campo. Con quella
 * tabella i conti di questa schermata combaciano con i loro: stessi facili,
 * stesse medie, stesso voto.
 */

/** Oltre quattro squadre l'abbinamento non si legge piu', e non si gioca. */
const MAX_TEAMS = 4;

const CONTROL =
  'rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-zinc-200 outline-none transition-colors hover:border-white/20 focus:border-emerald-500/50';

const MODE_LABEL: Readonly<Record<GridMode, string>> = {
  P: 'Portieri',
  A: 'Attaccanti',
};

/** Chi guarda la griglia in questa modalita'. */
const MODE_HINT: Readonly<Record<GridMode, string>> = {
  P: 'per il portiere che li affronta',
  A: "per l'attaccante che li affronta",
};

interface LevelStyle {
  readonly cell: string;
  readonly dot: string;
  readonly text: string;
}

const LEVEL_STYLE: Readonly<Record<Difficulty, LevelStyle>> = {
  facile: {
    cell: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    dot: 'bg-emerald-500',
    text: 'text-emerald-400',
  },
  media: {
    cell: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    dot: 'bg-amber-500',
    text: 'text-amber-400',
  },
  difficile: {
    cell: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
    dot: 'bg-rose-500',
    text: 'text-rose-400',
  },
};

type SortKey = 'voto' | 'alfabetico';

/** Le scelte sopravvivono al cambio di scheda, come i filtri degli svincolati. */
interface GridPrefs {
  mode: GridMode;
  selected: readonly string[];
  from: number;
  to: number;
  sort: SortKey;
}

/** La prima giornata ancora da giocare secondo il calendario scaricato. */
const FIRST_TO_PLAY =
  FIXTURES.filter((f) => !f.played).reduce<number | null>(
    (min, f) => (min === null || f.matchday < min ? f.matchday : min),
    null,
  ) ?? 1;

/**
 * Da dove si apre la griglia: **il turno dopo il prossimo**.
 *
 * Il prossimo si gioca fra pochi giorni e il portiere per quello ce l'hai gia';
 * la griglia serve a decidere gli acquisti, e il primo turno su cui una scelta
 * fatta oggi ha effetto e' quello dopo. E' anche il punto da cui parte FantaLab,
 * quindi i voti dei due strumenti si leggono affiancati senza spostare niente.
 */
const DEFAULT_FROM = Math.min(38, FIRST_TO_PLAY + 1);

let persisted: GridPrefs = {
  mode: 'P',
  selected: [],
  from: DEFAULT_FROM,
  to: 38,
  sort: 'voto',
};

export function GridPage(): JSX.Element {
  const players = useAppStore((s) => s.players);
  const [prefs, setPrefs] = useState<GridPrefs>(persisted);

  function update(patch: Partial<GridPrefs>): void {
    persisted = { ...persisted, ...patch };
    setPrefs(persisted);
  }

  const grid = useMemo(() => buildGrid(FIXTURES, TEAM_DIFFICULTY, prefs.mode), [prefs.mode]);

  const abbrs = useMemo(() => teamAbbrs(grid.teams), [grid.teams]);

  // L'intervallo si stringe da solo se il calendario cambia sotto i piedi.
  const from = Math.min(Math.max(1, prefs.from), 38);
  const to = Math.max(from, Math.min(prefs.to, 38));

  const selected = prefs.selected.filter((t) => grid.teams.includes(t));

  const combo = useMemo(
    () => (selected.length === 0 ? null : combine(grid, selected, from, to)),
    [grid, selected, from, to],
  );

  /**
   * Le righe con il voto che conta in quel momento.
   *
   * Senza abbinamento e' il voto del club da solo. **Con un abbinamento aperto
   * e' il voto che avresti aggiungendo quel club**, ed e' l'unico numero utile:
   * il calendario piu' comodo in assoluto non e' quello che si incastra meglio
   * col portiere che hai gia'. Cosi' l'ordinamento diventa la classifica dei
   * compagni migliori per la squadra che hai scelto.
   */
  const rows = useMemo(() => {
    const current = combo?.tally.score ?? 0;
    const withTally = grid.teams.map((team) => {
      const cells = cellsOf(grid, team, from, to);
      const solo = tally(cells);
      const inCombo = selected.includes(team);
      const result =
        combo === null
          ? solo
          : inCombo
            ? combo.tally
            : combine(grid, [...selected, team], from, to).tally;
      return { team, cells, solo, result, inCombo, gain: inCombo ? 0 : result.score - current };
    });

    if (prefs.sort === 'alfabetico') {
      return withTally.sort((a, b) => a.team.localeCompare(b.team, 'it'));
    }
    // I club dell'abbinamento restano in cima nell'ordine in cui li hai scelti:
    // sono il termine di paragone, e cercarli in mezzo alla classifica non ha
    // senso. Sotto, i candidati dal migliore al peggiore.
    return withTally.sort(
      (a, b) =>
        Number(b.inCombo) - Number(a.inCombo) ||
        (a.inCombo
          ? selected.indexOf(a.team) - selected.indexOf(b.team)
          : b.result.score - a.result.score ||
            b.solo.score - a.solo.score ||
            a.team.localeCompare(b.team, 'it')),
    );
  }, [grid, from, to, prefs.sort, selected, combo]);

  /** `giornata|squadra` delle partite che giocheresti davvero. */
  const pickedKeys = useMemo(
    () => new Set((combo?.picks ?? []).map((c) => `${c.matchday}|${c.team}`)),
    [combo],
  );

  const suggestions = useMemo(
    () => [...bestCombos(grid, 2, from, to, 3), ...bestCombos(grid, 3, from, to, 2)],
    [grid, from, to],
  );

  const matchdays = grid.matchdays.filter((d) => d >= from && d <= to);

  function toggleTeam(team: string): void {
    const next = selected.includes(team)
      ? selected.filter((t) => t !== team)
      : [...selected, team].slice(-MAX_TEAMS);
    update({ selected: next });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <header className="flex flex-wrap items-center gap-2">
        <SectionTitle icon={<CalendarDays size={12} />}>Griglia di alternanza</SectionTitle>
        <span className="num text-xs text-zinc-500">Serie A {CALENDAR_SEASON}</span>

        {/* Il reparto e' la scelta principale: sta prima di tutto e ha il suo colore. */}
        <div className="ml-auto flex gap-1">
          {GRID_MODES.map((mode) => {
            const theme = roleTheme(mode);
            const active = prefs.mode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => update({ mode })}
                className={cn(
                  'rounded-lg px-3 py-1 text-sm font-semibold transition-all',
                  active
                    ? cn(theme.chip, theme.glow)
                    : 'border border-white/[0.08] bg-white/[0.02] text-zinc-500 hover:text-zinc-300',
                )}
              >
                {MODE_LABEL[mode]}
              </button>
            );
          })}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-zinc-500">giornate</span>
        <select
          value={from}
          onChange={(e) => update({ from: Number(e.target.value), to })}
          aria-label="Prima giornata"
          className={cn(CONTROL, 'num')}
        >
          {grid.matchdays.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <span className="text-zinc-600">→</span>
        <select
          value={to}
          onChange={(e) => update({ to: Number(e.target.value) })}
          aria-label="Ultima giornata"
          className={cn(CONTROL, 'num')}
        >
          {grid.matchdays.filter((d) => d >= from).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <Preset label="tutte" onClick={() => update({ from: 1, to: 38 })} />
        {grid.nextMatchday !== null && (
          <>
            <Preset
              label="da giocare"
              onClick={() => update({ from: grid.nextMatchday ?? 1, to: 38 })}
            />
            <Preset
              label="prossime 5"
              onClick={() =>
                update({
                  from: DEFAULT_FROM,
                  to: Math.min(38, DEFAULT_FROM + 4),
                })
              }
            />
            <Preset
              label="prossime 10"
              onClick={() =>
                update({
                  from: DEFAULT_FROM,
                  to: Math.min(38, DEFAULT_FROM + 9),
                })
              }
            />
          </>
        )}

        <select
          value={prefs.sort}
          onChange={(e) => update({ sort: e.target.value as SortKey })}
          aria-label="Ordine delle righe"
          className={cn(CONTROL, 'ml-auto')}
        >
          <option value="voto">ordina per voto</option>
          <option value="alfabetico">ordina per nome</option>
        </select>

        <Legend mode={prefs.mode} />
      </div>

      {combo !== null ? (
        <ComboCard
          combo={combo}
          abbrs={abbrs}
          onRemove={(team) => update({ selected: selected.filter((t) => t !== team) })}
          onClear={() => update({ selected: [] })}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-white/[0.08] px-3 py-2 text-xs text-zinc-500">
          Clicca una squadra nella griglia per costruire un abbinamento: fino a {MAX_TEAMS}, e ogni
          giornata conta la partita piu&apos; comoda fra quelle scelte.
        </p>
      )}

      <section className="flex flex-col gap-1.5">
        <SectionTitle icon={<Sparkles size={12} />}>
          Migliori abbinamenti · giornate {from}-{to}
        </SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s.teams.join('|')}
              type="button"
              onClick={() => update({ selected: s.teams })}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5',
                'text-xs transition-colors hover:border-white/20 hover:bg-white/[0.05]',
                sameTeams(s.teams, selected) && 'border-emerald-500/40 bg-emerald-500/10',
              )}
            >
              <span className="font-medium text-zinc-200">
                {s.teams.map((t) => abbrs.get(t) ?? t).join(' + ')}
              </span>
              <span className="num font-semibold text-emerald-400">{s.tally.score}</span>
              <span className="num text-zinc-500">
                {s.tally.facile}F · {s.tally.media}M · {s.tally.difficile}D
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="min-h-0 overflow-x-auto rounded-xl border border-white/[0.08]">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 bg-zinc-950 px-2 py-1.5 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500"
              >
                squadra
              </th>
              <th
                scope="col"
                title={
                  combo === null
                    ? 'Voto del calendario di questo club'
                    : "Voto che avresti aggiungendo il club all'abbinamento"
                }
                className="sticky top-0 z-10 bg-zinc-950 px-1 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500"
              >
                {combo === null ? 'voto' : 'voto +'}
              </th>
              {matchdays.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className="num sticky top-0 z-10 bg-zinc-950 px-0 py-1.5 text-center text-[10px] font-normal text-zinc-500"
                >
                  {d}
                </th>
              ))}
              {/* Riempimento: assorbe la larghezza che avanza quando le giornate
                  sono poche, cosi' le caselle restano della stessa misura. */}
              <th scope="col" className="sticky top-0 z-10 w-full bg-zinc-950" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const picked = selected.includes(row.team);
              const key = keyPlayers(players, row.team, prefs.mode, 2);
              return (
                <tr key={row.team} className={cn(picked && 'bg-white/[0.04]')}>
                  <th scope="row" className="sticky left-0 z-10 bg-zinc-950 p-0 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => toggleTeam(row.team)}
                      aria-pressed={picked}
                      className={cn(
                        'flex w-44 items-center gap-2 border-b border-white/[0.04] px-2 py-1 text-left transition-colors',
                        picked ? 'bg-emerald-500/10' : 'hover:bg-white/[0.05]',
                      )}
                    >
                      <span
                        className={cn(
                          'num w-9 shrink-0 rounded px-1 py-0.5 text-center text-[11px] font-semibold',
                          picked
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white/[0.06] text-zinc-300',
                        )}
                      >
                        {abbrs.get(row.team)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-zinc-200">{row.team}</span>
                        <span className="block truncate text-[10px] text-zinc-500">
                          {key.map((p) => p.name).join(', ') || '—'}
                        </span>
                      </span>
                    </button>
                  </th>
                  <td className="num border-b border-white/[0.04] px-1 text-center font-semibold text-zinc-300">
                    <span className={cn(row.inCombo && 'text-emerald-300')}>{row.result.score}</span>
                    {combo !== null && !row.inCombo && (
                      <span
                        className={cn(
                          'ml-1 text-[10px] font-normal',
                          row.gain > 0 ? 'text-emerald-500' : 'text-zinc-600',
                        )}
                      >
                        {row.gain > 0 ? `+${row.gain}` : '—'}
                      </span>
                    )}
                  </td>
                  {row.cells.map((cell) => (
                    <GridCell
                      key={cell.matchday}
                      cell={cell}
                      abbrs={abbrs}
                      picked={pickedKeys.has(`${cell.matchday}|${cell.team}`)}
                      dimmed={selected.length > 0 && !picked}
                    />
                  ))}
                  <td className="border-b border-white/[0.04]" />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {grid.unknownTeams.length > 0 && (
        <p className="text-[11px] text-amber-400">
          Nel calendario ci sono club che il listone non conosce e la griglia salta:{' '}
          {grid.unknownTeams.join(', ')}.
        </p>
      )}

      <p className="text-[11px] text-zinc-600">
        Calendario ufficiale scaricato il {CALENDAR_UPDATED_AT}. Colori:{' '}
        {DIFFICULTY_SOURCE}, letti il {DIFFICULTY_UPDATED_AT}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Preset({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
    >
      {label}
    </button>
  );
}

function Legend({ mode }: { readonly mode: GridMode }): JSX.Element {
  return (
    <InfoPopover
      label="Come si legge la griglia"
      trigger={
        <span className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300">
          <Info size={12} />
          come si legge
        </span>
      }
    >
      <div className="flex flex-col gap-2 text-[11px] leading-relaxed text-zinc-300">
        <div className="flex gap-3">
          {(['facile', 'media', 'difficile'] as const).map((level) => (
            <span key={level} className="flex items-center gap-1">
              <span className={cn('h-2 w-2 rounded-full', LEVEL_STYLE[level].dot)} />
              {level}
            </span>
          ))}
        </div>
        <p>
          <span className="num rounded bg-white/[0.06] px-1 text-zinc-200">INT</span> maiuscolo e&apos;
          in casa, <span className="num rounded bg-white/[0.06] px-1 text-zinc-200">int</span>{' '}
          minuscolo e&apos; fuori.
        </p>
        <p>
          Il colore e&apos; quello dell&apos;avversario {MODE_HINT[mode]}, secondo la
          classificazione di FantaLab: e&apos; fissa per club e <strong>non cambia</strong> fra
          casa e fuori.
          Portieri e attaccanti hanno due colonne diverse — l&apos;Udinese e&apos; media per un
          portiere e facile per un attaccante.
        </p>
        <p className="text-zinc-500">
          Il voto e&apos; 100 meno il peso medio delle partite che giocheresti, contando 0 una
          facile, 50 una media e 100 una difficile: lo stesso conto di FantaLab.
        </p>
      </div>
    </InfoPopover>
  );
}

function GridCell({
  cell,
  abbrs,
  picked,
  dimmed,
}: {
  readonly cell: Cell;
  readonly abbrs: ReadonlyMap<string, string>;
  /** E&apos; la partita che schiereresti in questo abbinamento. */
  readonly picked: boolean;
  /** Riga fuori dall&apos;abbinamento: c&apos;e&apos;, ma non e&apos; la protagonista. */
  readonly dimmed: boolean;
}): JSX.Element {
  const abbr = abbrs.get(cell.opponent) ?? cell.opponent;
  const style = LEVEL_STYLE[cell.level];
  return (
    <td className="border-b border-white/[0.04] p-[1px]">
      <span
        title={`Giornata ${cell.matchday} · ${cell.opponent} ${cell.home ? 'in casa' : 'fuori'} · ${cell.level}${cell.played ? ' · giocata' : ''}`}
        className={cn(
          'num flex h-6 w-8 items-center justify-center rounded border text-[10px] font-semibold',
          style.cell,
          !cell.home && 'lowercase opacity-90',
          cell.played && 'opacity-40 grayscale',
          dimmed && !picked && 'opacity-40',
          picked && 'ring-1 ring-inset ring-white/70',
        )}
      >
        {cell.home ? abbr : abbr.toLowerCase()}
      </span>
    </td>
  );
}

function ComboCard({
  combo,
  abbrs,
  onRemove,
  onClear,
}: {
  readonly combo: Combo;
  readonly abbrs: ReadonlyMap<string, string>;
  readonly onRemove: (team: string) => void;
  readonly onClear: () => void;
}): JSX.Element {
  const { tally: t } = combo;
  return (
    <section className="glass flex flex-wrap items-center gap-3 rounded-xl p-3 shadow-panel">
      <div className="flex flex-wrap items-center gap-1.5">
        {combo.teams.map((team) => (
          <span
            key={team}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200"
          >
            <span className="num font-semibold">{abbrs.get(team) ?? team}</span>
            <span className="text-emerald-300/70">{team}</span>
            <button
              type="button"
              onClick={() => onRemove(team)}
              aria-label={`Togli ${team} dall'abbinamento`}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {combo.teams.length > 1 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
          >
            svuota
          </button>
        )}
      </div>

      <p className="w-full text-[11px] text-zinc-500 sm:w-auto sm:flex-1">
        In griglia le squadre sono ordinate per il <strong className="text-zinc-400">voto che
        otterresti aggiungendole</strong>: la prima e&apos; il compagno migliore per questo
        abbinamento.
      </p>

      <div className="ml-auto grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Kpi
          label="voto"
          value={t.score}
          tone="text-emerald-400"
          bar={t.score / 100}
          hint={`${t.matches} giornate`}
        />
        <Kpi label="facili" value={t.facile} tone={LEVEL_STYLE.facile.text} />
        <Kpi label="medie" value={t.media} tone={LEVEL_STYLE.media.text} />
        <Kpi label="difficili" value={t.difficile} tone={LEVEL_STYLE.difficile.text} />
        <Kpi label="in casa" value={t.home} />
        <Kpi label="fuori" value={t.away} />
      </div>
    </section>
  );
}

function sameTeams(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t) => b.includes(t));
}
