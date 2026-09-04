import type { Player } from './types';

/**
 * Griglia di alternanza: quanto e' comodo il calendario di una squadra, e cosa
 * succede se ne accoppi due o tre e ogni giornata schieri quella che gioca
 * meglio.
 *
 * Il giudizio sulle partite **non si calcola qui**: viene dalla classificazione
 * di FantaLab in `src/data/difficulty.ts`, dove ogni club e' facile, medio o
 * difficile da affrontare — un colore per i portieri e uno per gli attaccanti.
 * Non dipende dal campo: la stessa squadra vale uguale in casa e fuori, e le
 * loro griglie lo confermano casella per casella.
 *
 * Questo modulo fa quindi solo aritmetica sul calendario ufficiale: incrocia le
 * partite con quei colori, conta, e trova gli abbinamenti migliori.
 */

/** Una partita del calendario. Combacia con `src/data/calendar.ts`. */
export interface Fixture {
  /** 1..38. */
  readonly matchday: number;
  /** Club di casa, con il nome del listone. */
  readonly home: string;
  readonly away: string;
  /** ISO `YYYY-MM-DD`. */
  readonly date: string;
  /** `true` se si e' gia' giocata al momento dello scarico. */
  readonly played: boolean;
}

/** Il reparto che guarda la griglia. */
export type GridMode = 'P' | 'A';

export const GRID_MODES = ['P', 'A'] as const satisfies readonly GridMode[];

export type Difficulty = 'facile' | 'media' | 'difficile';

export const DIFFICULTIES = [
  'facile',
  'media',
  'difficile',
] as const satisfies readonly Difficulty[];

/** La riga della tabella: un club e i suoi due colori. */
export interface TeamDifficulty {
  /** Club con il nome del listone. */
  readonly team: string;
  /** Quanto e' dura per il **portiere** che lo affronta. */
  readonly P: Difficulty;
  /** Quanto e' dura per l'**attaccante** che lo affronta. */
  readonly A: Difficulty;
}

/**
 * Il peso di una partita, 0-100.
 *
 * Zero, cinquanta, cento: sono tre livelli, non una scala continua, e la media
 * di questi tre pesi e' esattamente il conto che fa FantaLab — 29 facili, 8
 * medie e 1 difficile su 38 giornate danno 87, il numero che stampa la loro
 * griglia sullo stesso abbinamento.
 */
export const DIFFICULTY_WEIGHT: Readonly<Record<Difficulty, number>> = {
  facile: 0,
  media: 50,
  difficile: 100,
};

/** Club -> i suoi due colori. */
export type DifficultyIndex = ReadonlyMap<string, TeamDifficulty>;

export function makeDifficultyIndex(table: readonly TeamDifficulty[]): DifficultyIndex {
  return new Map(table.map((row) => [row.team, row]));
}

/** Il colore di un avversario per il reparto guardato. */
export function difficultyOf(
  opponent: string,
  mode: GridMode,
  index: DifficultyIndex,
): Difficulty | null {
  const row = index.get(opponent);
  return row === undefined ? null : row[mode];
}

// ---------------------------------------------------------------------------
// La griglia
// ---------------------------------------------------------------------------

/** Una casella: la partita di una squadra in una giornata. */
export interface Cell {
  readonly matchday: number;
  readonly team: string;
  readonly opponent: string;
  /** `true` se la gioca in casa. */
  readonly home: boolean;
  readonly date: string;
  readonly played: boolean;
  readonly level: Difficulty;
  /** `DIFFICULTY_WEIGHT[level]`, portato dietro per non ricalcolarlo. */
  readonly weight: number;
}

export interface Grid {
  readonly mode: GridMode;
  /** I club classificati **e** presenti nel calendario, in ordine alfabetico. */
  readonly teams: readonly string[];
  /** Club -> le sue partite, una per giornata, in ordine. */
  readonly rows: ReadonlyMap<string, readonly Cell[]>;
  /** Le giornate presenti, in ordine. */
  readonly matchdays: readonly number[];
  /** La prima giornata non ancora giocata, o `null` a campionato finito. */
  readonly nextMatchday: number | null;
  /** Club del calendario che la tabella non classifica: la griglia li salta. */
  readonly unknownTeams: readonly string[];
}

/**
 * Costruisce la griglia intera: ogni club, ogni giornata, gia' colorata.
 *
 * Un club che la tabella non conosce — una neopromossa arrivata dopo l'ultima
 * lettura, un nome scritto diverso — non viene indovinato: esce da
 * `unknownTeams` e la UI lo dice. Meglio una griglia a diciannove righe
 * dichiarata che venti righe di cui una inventata.
 */
export function buildGrid(
  fixtures: readonly Fixture[],
  table: readonly TeamDifficulty[],
  mode: GridMode,
): Grid {
  const index = makeDifficultyIndex(table);
  const calendarTeams = [...new Set(fixtures.flatMap((f) => [f.home, f.away]))];
  const unknownTeams = calendarTeams.filter((t) => !index.has(t)).sort();
  const teams = calendarTeams
    .filter((t) => index.has(t))
    .sort((a, b) => a.localeCompare(b, 'it'));

  const rows = new Map<string, Cell[]>(teams.map((t) => [t, []]));
  for (const fixture of fixtures) {
    for (const home of [true, false]) {
      const team = home ? fixture.home : fixture.away;
      const opponent = home ? fixture.away : fixture.home;
      const level = difficultyOf(opponent, mode, index);
      if (level === null || !index.has(team)) continue;
      rows.get(team)?.push({
        matchday: fixture.matchday,
        team,
        opponent,
        home,
        date: fixture.date,
        played: fixture.played,
        level,
        weight: DIFFICULTY_WEIGHT[level],
      });
    }
  }
  for (const cells of rows.values()) cells.sort((a, b) => a.matchday - b.matchday);

  const matchdays = [...new Set(fixtures.map((f) => f.matchday))].sort((a, b) => a - b);
  const notPlayed = fixtures.filter((f) => !f.played).map((f) => f.matchday);

  return {
    mode,
    teams,
    rows,
    matchdays,
    nextMatchday: notPlayed.length === 0 ? null : Math.min(...notPlayed),
    unknownTeams,
  };
}

const NO_CELLS: readonly Cell[] = [];

/** Le partite di un club nell'intervallo di giornate, estremi inclusi. */
export function cellsOf(grid: Grid, team: string, from: number, to: number): readonly Cell[] {
  const cells = grid.rows.get(team) ?? NO_CELLS;
  return cells.filter((c) => c.matchday >= from && c.matchday <= to);
}

// ---------------------------------------------------------------------------
// Conti e abbinamenti
// ---------------------------------------------------------------------------

/** Il riepilogo di un insieme di partite. */
export interface Tally {
  readonly facile: number;
  readonly media: number;
  readonly difficile: number;
  readonly home: number;
  readonly away: number;
  readonly matches: number;
  /**
   * Voto del calendario, 0-100: `100 - peso medio`. Cento vuol dire ogni
   * giornata contro una squadra facile.
   */
  readonly score: number;
}

export function tally(cells: readonly Cell[]): Tally {
  let facile = 0;
  let media = 0;
  let difficile = 0;
  let home = 0;
  let weight = 0;
  for (const c of cells) {
    if (c.level === 'facile') facile += 1;
    else if (c.level === 'media') media += 1;
    else difficile += 1;
    if (c.home) home += 1;
    weight += c.weight;
  }
  return {
    facile,
    media,
    difficile,
    home,
    away: cells.length - home,
    matches: cells.length,
    score: cells.length === 0 ? 0 : Math.round(100 - weight / cells.length),
  };
}

/**
 * Un abbinamento: due o piu' club e la partita che giocheresti ogni giornata.
 *
 * `picks[i]` e' la casella piu' comoda fra quelle dei club scelti in quella
 * giornata — l'alternanza vera, quella per cui compri il secondo portiere.
 */
export interface Combo {
  readonly teams: readonly string[];
  readonly picks: readonly Cell[];
  readonly tally: Tally;
}

/**
 * L'abbinamento di `teams` sulle giornate `from..to`.
 *
 * I colori sono tre, quindi il pareggio e' la regola e non l'eccezione: due
 * squadre facili nella stessa giornata capitano di continuo. A parita' vince
 * l'ordine in cui i club sono stati scelti — il primo che hai messo e' quello
 * che consideri titolare, e non c'e' motivo di scomodarlo per una partita che
 * vale identica.
 */
export function combine(grid: Grid, teams: readonly string[], from: number, to: number): Combo {
  const picks: Cell[] = [];
  for (const matchday of grid.matchdays) {
    if (matchday < from || matchday > to) continue;
    let best: Cell | null = null;
    for (const team of teams) {
      const cell = (grid.rows.get(team) ?? NO_CELLS).find((c) => c.matchday === matchday);
      if (cell === undefined) continue;
      if (best === null || cell.weight < best.weight) best = cell;
    }
    if (best !== null) picks.push(best);
  }
  return { teams: [...teams], picks, tally: tally(picks) };
}

/** Tutte le combinazioni di `size` elementi, in ordine di indice. */
function combinations<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0 || size > items.length) return [];
  const out: T[][] = [];
  const current: T[] = [];
  const walk = (start: number): void => {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      const item = items[i];
      if (item === undefined) continue;
      current.push(item);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

/**
 * I migliori abbinamenti di `size` club sulle giornate scelte.
 *
 * Enumera tutte le combinazioni — 190 coppie, 1140 terne — perche' a questi
 * numeri l'esaustivo costa meno di qualunque euristica e non sbaglia mai.
 * L'ordine e' per voto, e a parita' vince chi ha piu' partite facili.
 */
export function bestCombos(
  grid: Grid,
  size: number,
  from: number,
  to: number,
  limit: number,
): readonly Combo[] {
  return combinations(grid.teams, size)
    .map((teams) => combine(grid, teams, from, to))
    .sort((a, b) => b.tally.score - a.tally.score || b.tally.facile - a.tally.facile)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Etichette
// ---------------------------------------------------------------------------

/**
 * Sigle di tre lettere, univoche fra i club dati.
 *
 * Tre lettere bastano per i venti club di questa Serie A; se un anno due club
 * collidono la sigla si allunga invece di mentire.
 */
export function teamAbbrs(teams: readonly string[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  const used = new Map<string, number>();
  for (const team of teams) {
    let abbr = team.slice(0, 3).toUpperCase();
    let length = 3;
    while (used.has(abbr) && length < team.length) {
      length += 1;
      abbr = team.slice(0, length).toUpperCase();
    }
    used.set(abbr, (used.get(abbr) ?? 0) + 1);
    out.set(team, abbr);
  }
  return out;
}

/** Il portiere (o l'attaccante) piu' caro del club: chi la griglia riguarda. */
export function keyPlayers(
  players: readonly Player[],
  team: string,
  mode: GridMode,
  count: number,
): readonly Player[] {
  return players
    .filter((p) => p.team === team && p.role === mode)
    .sort((a, b) => b.fvm - a.fvm || b.quot - a.quot)
    .slice(0, count);
}
