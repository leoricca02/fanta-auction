import { describe, expect, it } from 'vitest';

import type { SeasonStats } from './player-stats';
import { makeStatsIndex } from './player-stats';
import type { Highlight } from './highlights';
import {
  METRICS,
  highlightsOf,
  makeRankIndex,
  playerHighlights,
  rankLabel,
  rankingsOf,
} from './highlights';
import type { AdvancedStats } from './advanced-stats';
import { makeAdvancedIndex } from './advanced-stats';
import { SEASON_STATS } from '../data/stats';
import { ADVANCED_STATS } from '../data/advanced-stats';

/** Nessuna statistica avanzata: la maggior parte dei test non ne ha bisogno. */
const NO_ADV = makeAdvancedIndex([]);

function adv(id: number, over: Partial<AdvancedStats> = {}): AdvancedStats {
  return {
    id,
    slug: `p-${id}`,
    minutes: 2700,
    appearances: 30,
    interceptions: 20,
    tackles: 30,
    fouls: 20,
    aerialDuelsWon: 20,
    yellow: 3,
    saves: 0,
    ...over,
  };
}

function s(id: number, over: Partial<SeasonStats> = {}): SeasonStats {
  return {
    id,
    name: `#${id}`,
    team: 'Inter',
    role: 'D',
    played: 30,
    avg: 6,
    fantaAvg: 6,
    goals: 0,
    assists: 0,
    conceded: 0,
    cleanSheets: null,
    goodGames: 10,
    penScored: 0,
    penTaken: 0,
    penSaved: 0,
    yellow: 0,
    red: 0,
    ...over,
  };
}

/** Il rank del giocatore per una metrica, o `null` se non e' in classifica. */
function rankOf(rows: readonly SeasonStats[], id: number, key: string): number | null {
  const row = rows.find((r) => r.id === id);
  if (row === undefined) return null;
  const found = rankingsOf(row, makeRankIndex(rows, NO_ADV), NO_ADV).find((h) => h.metric.key === key);
  return found?.rank ?? null;
}

describe('rankingsOf', () => {
  it('classifica dentro il ruolo, non sul totale', () => {
    const rows = [
      s(1, { role: 'D', avg: 6.5 }),
      s(2, { role: 'C', avg: 7 }),
      s(3, { role: 'C', avg: 6.9 }),
    ];
    // Il centrocampista da 7 non sposta il difensore, che nel suo ruolo e' solo.
    expect(rankOf(rows, 1, 'avg')).toBe(1);
    expect(rankOf(rows, 3, 'avg')).toBe(2);
  });

  it('i pari merito condividono la posizione', () => {
    const rows = [s(1, { avg: 7 }), s(2, { avg: 7 }), s(3, { avg: 6 })];
    expect(rankOf(rows, 1, 'avg')).toBe(1);
    expect(rankOf(rows, 2, 'avg')).toBe(1);
    // Due primi, poi il terzo e' terzo: e' la classifica sportiva.
    expect(rankOf(rows, 3, 'avg')).toBe(3);
  });

  it('sui malus il primo e quello che ne ha meno', () => {
    const rows = [s(1, { yellow: 9 }), s(2, { yellow: 1 }), s(3, { yellow: 4 })];
    expect(rankOf(rows, 2, 'yellow')).toBe(1);
    expect(rankOf(rows, 3, 'yellow')).toBe(2);
    expect(rankOf(rows, 1, 'yellow')).toBe(3);
  });

  it('chi non ha giocato resta fuori dal pool', () => {
    const rows = [s(1, { played: 0, avg: 0 }), s(2, { avg: 6.5 }), s(3, { avg: 6.4 })];
    expect(rankingsOf(rows[0] as SeasonStats, makeRankIndex(rows, NO_ADV), NO_ADV)).toEqual([]);
    // E non gonfia il pool degli altri.
    const her = rankingsOf(rows[2] as SeasonStats, makeRankIndex(rows, NO_ADV), NO_ADV);
    expect(her.find((h) => h.metric.key === 'avg')?.pool).toBe(2);
  });

  it('le partite sufficienti sconosciute non diventano uno zero', () => {
    const rows = [s(1, { goodGames: null }), s(2, { goodGames: 20 })];
    const ranks = makeRankIndex(rows, NO_ADV);
    const found = rankingsOf(rows[0] as SeasonStats, ranks, NO_ADV).find((h) => h.metric.key === 'goodGames');
    expect(found).toBeUndefined();
    // Il trasferito non e' l'ultimo della classifica: non c'e' proprio.
    expect(
      rankingsOf(rows[1] as SeasonStats, ranks, NO_ADV).find((h) => h.metric.key === 'goodGames')?.pool,
    ).toBe(1);
  });

  it('le metriche da portiere restano ai portieri', () => {
    const rows = [s(1, { role: 'P', cleanSheets: 12, conceded: 30 }), s(2, { role: 'D' })];
    const ranks = makeRankIndex(rows, NO_ADV);
    const keys = (row: SeasonStats): readonly string[] =>
      rankingsOf(row, ranks, NO_ADV).map((h) => h.metric.key);
    expect(keys(rows[0] as SeasonStats)).toContain('cleanSheets');
    expect(keys(rows[1] as SeasonStats)).not.toContain('cleanSheets');
    // E i gol non finiscono fra i pregi di un portiere.
    expect(keys(rows[0] as SeasonStats)).not.toContain('goals');
  });
});

describe('highlightsOf', () => {
  const pool = [
    s(1, { avg: 7, fantaAvg: 7.5, goals: 6, assists: 4, yellow: 0, goodGames: 25, played: 35 }),
    s(2, { avg: 5.8, fantaAvg: 5.5, goals: 0, assists: 0, yellow: 12, goodGames: 3, played: 20 }),
    s(3, { avg: 6.2, fantaAvg: 6.3, goals: 2, assists: 1, yellow: 5, goodGames: 12, played: 28 }),
  ];

  it('i pregi sono i migliori, i difetti i peggiori, e non si ripetono', () => {
    // Primo nei gol, ultimo nei cartellini: un pregio e un difetto veri.
    const mixed = [
      s(1, { goals: 9, yellow: 12, avg: 6.4, fantaAvg: 6.9, goodGames: 18 }),
      s(2, { goals: 4, yellow: 1, avg: 6.1, fantaAvg: 6.2, goodGames: 12 }),
      s(3, { goals: 0, yellow: 0, avg: 5.9, fantaAvg: 5.8, goodGames: 6 }),
    ];
    const { strengths, weaknesses } = highlightsOf(mixed[0] as SeasonStats, makeRankIndex(mixed, NO_ADV), NO_ADV);
    const keys = (hs: readonly Highlight[]): readonly string[] => hs.map((h) => h.metric.key);
    expect(strengths.length).toBeGreaterThan(0);
    expect(weaknesses.length).toBeGreaterThan(0);
    for (const key of keys(strengths)) expect(keys(weaknesses)).not.toContain(key);
    // Ordine: i pregi dal migliore, i difetti dal peggiore.
    expect(strengths[0]?.share).toBeGreaterThanOrEqual(strengths.at(-1)?.share ?? 1);
    expect(weaknesses[0]?.share).toBeLessThanOrEqual(weaknesses.at(-1)?.share ?? 0);
  });

  it('il migliore del ruolo non ha punti deboli inventati', () => {
    // Primo o secondo in tutto: la colonna dei difetti resta vuota invece di
    // spacciare per debolezza un terzo posto.
    const { strengths, weaknesses } = highlightsOf(pool[0] as SeasonStats, makeRankIndex(pool, NO_ADV), NO_ADV);
    expect(strengths.length).toBeGreaterThan(0);
    expect(weaknesses).toEqual([]);
  });

  it('chi e sotto la meta del ruolo non ha punti di forza inventati', () => {
    const { strengths, weaknesses } = highlightsOf(pool[1] as SeasonStats, makeRankIndex(pool, NO_ADV), NO_ADV);
    expect(strengths).toEqual([]);
    expect(weaknesses.length).toBeGreaterThan(0);
  });

  it('con poche classifiche non mette la stessa voce di qua e di la', () => {
    // Un portiere solo al mondo: sta a meta' di ogni classifica di se stesso.
    const only = [s(9, { role: 'P', cleanSheets: 10, conceded: 20, played: 30 })];
    const { strengths, weaknesses } = highlightsOf(only[0] as SeasonStats, makeRankIndex(only, NO_ADV), NO_ADV);
    const shared = strengths.filter((h) => weaknesses.some((w) => w.metric.key === h.metric.key));
    expect(shared).toEqual([]);
    expect(strengths.length + weaknesses.length).toBeLessThanOrEqual(
      METRICS.filter((m) => m.roles.includes('P')).length,
    );
  });

  it('chi non ha statistiche non ha ne pregi ne difetti', () => {
    const index = makeStatsIndex(pool);
    const ranks = makeRankIndex(pool, NO_ADV);
    expect(playerHighlights(999, index, ranks, NO_ADV)).toBeNull();
    const benched = makeStatsIndex([s(7, { played: 0 })]);
    expect(playerHighlights(7, benched, ranks, NO_ADV)).toBeNull();
  });
});

describe('rankLabel', () => {
  it('dice il ruolo al plurale', () => {
    const rows = [s(1, { role: 'D' })];
    const h = rankingsOf(rows[0] as SeasonStats, makeRankIndex(rows, NO_ADV), NO_ADV)[0] as Highlight;
    expect(rankLabel(h, 'D')).toBe('1° tra i difensori');
    expect(rankLabel(h, 'A')).toBe('1° tra gli attaccanti');
  });
});

/**
 * La prova che la formula e' quella di FantaLAB e non una che le somiglia.
 *
 * Sulla scheda di Hermoso (D, Roma) FantaLAB pubblica, sulla stagione 2025/26,
 * media voto 12°, % partite con voto >= 6.5 16° e fantamedia 19° fra i
 * difensori. Con pool = tutti i difensori con almeno una presenza e i pari
 * merito che condividono la posizione, escono le stesse tre cifre.
 *
 * Se questo test cade dopo una rigenerazione delle statistiche non e' un
 * allarme: e' cambiata la stagione sotto. Va riletto, non silenziato.
 */
describe('metriche di campo (Sofascore)', () => {
  const rows = [
    s(1, { role: 'D' }),
    s(2, { role: 'D' }),
    s(3, { role: 'D' }),
  ];

  it('entrano in classifica solo con i minuti sufficienti', () => {
    const index = makeAdvancedIndex([
      adv(1, { interceptions: 40 }),
      adv(2, { interceptions: 10 }),
      // Un tempo solo: 5 anticipi in 45 minuti farebbero primo un fantasma.
      adv(3, { interceptions: 5, minutes: 45, appearances: 1 }),
    ]);
    const ranks = makeRankIndex(rows, index);
    const keys = (r: SeasonStats): readonly string[] =>
      rankingsOf(r, ranks, index).map((h) => h.metric.key);

    expect(keys(rows[0] as SeasonStats)).toContain('interceptions');
    expect(keys(rows[2] as SeasonStats)).not.toContain('interceptions');
    // E chi e' fuori non gonfia il pool di chi e' dentro.
    const found = rankingsOf(rows[0] as SeasonStats, ranks, index).find(
      (h) => h.metric.key === 'interceptions',
    );
    expect(found?.pool).toBe(2);
    expect(found?.rank).toBe(1);
  });

  it('contano ogni 90 minuti, non a partita', () => {
    // Stessa intensita', meta' del tempo: sono pari merito.
    const index = makeAdvancedIndex([
      adv(1, { interceptions: 30, minutes: 2700 }),
      adv(2, { interceptions: 15, minutes: 1350 }),
      adv(3, { interceptions: 10, minutes: 2700 }),
    ]);
    const ranks = makeRankIndex(rows, index);
    const rankOfKey = (r: SeasonStats): number | undefined =>
      rankingsOf(r, ranks, index).find((h) => h.metric.key === 'interceptions')?.rank;
    expect(rankOfKey(rows[0] as SeasonStats)).toBe(1);
    expect(rankOfKey(rows[1] as SeasonStats)).toBe(1);
    expect(rankOfKey(rows[2] as SeasonStats)).toBe(3);
  });

  it('i falli sono un malus, e chi ne fa meno e primo', () => {
    const index = makeAdvancedIndex([adv(1, { fouls: 5 }), adv(2, { fouls: 60 })]);
    const ranks = makeRankIndex(rows, index);
    const rankOfKey = (r: SeasonStats, key: string): number | undefined =>
      rankingsOf(r, ranks, index).find((h) => h.metric.key === key)?.rank;
    expect(rankOfKey(rows[0] as SeasonStats, 'fouls')).toBe(1);
    expect(rankOfKey(rows[1] as SeasonStats, 'fouls')).toBe(2);
  });

  it('anticipi e contrasti restano a chi difende di mestiere', () => {
    const keeper = s(9, { role: 'P' });
    const striker = s(8, { role: 'A' });
    const all = [...rows, keeper, striker];
    const index = makeAdvancedIndex([adv(1), adv(2), adv(3), adv(8), adv(9)]);
    const ranks = makeRankIndex(all, index);
    const keys = (r: SeasonStats): readonly string[] =>
      rankingsOf(r, ranks, index).map((h) => h.metric.key);

    expect(keys(rows[0] as SeasonStats)).toContain('interceptions');
    // Un attaccante ultimo nei contrasti non ha un difetto, ha un altro lavoro.
    expect(keys(striker)).not.toContain('interceptions');
    expect(keys(striker)).not.toContain('tackles');
    // I duelli aerei invece contano anche per lui, e i falli per tutti.
    expect(keys(striker)).toContain('aerialDuels');
    expect(keys(striker)).toContain('fouls');
    // Il portiere non ha nessuna voce di campo.
    for (const key of ['interceptions', 'tackles', 'aerialDuels', 'fouls', 'saves']) {
      expect(keys(keeper)).not.toContain(key);
    }
  });

  it('chi non ha dati avanzati non ha quelle voci, e non e ultimo', () => {
    const index = makeAdvancedIndex([adv(1), adv(2)]);
    const ranks = makeRankIndex(rows, index);
    const third = rankingsOf(rows[2] as SeasonStats, ranks, index);
    expect(third.some((h) => h.metric.key === 'tackles')).toBe(false);
    expect(third.some((h) => h.metric.key === 'avg')).toBe(true);
  });
});

const ADVANCED_INDEX_TEST = makeAdvancedIndex(ADVANCED_STATS);

describe('confronto con FantaLAB, Hermoso 2025/26', () => {
  const HERMOSO = 4807;

  it('riproduce le posizioni pubblicate', () => {
    expect(rankOf(SEASON_STATS, HERMOSO, 'avg')).toBe(12);
    expect(rankOf(SEASON_STATS, HERMOSO, 'goodGames')).toBe(16);
    expect(rankOf(SEASON_STATS, HERMOSO, 'fantaAvg')).toBe(19);
  });

  it('il pool dei difensori conta tutti quelli con una presenza', () => {
    const row = SEASON_STATS.find((r) => r.id === HERMOSO) as SeasonStats;
    const found = rankingsOf(row, makeRankIndex(SEASON_STATS, ADVANCED_INDEX_TEST), NO_ADV).find((h) => h.metric.key === 'avg');
    expect(found?.pool).toBe(196);
  });
});
