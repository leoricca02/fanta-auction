import { describe, expect, it } from 'vitest';

import type { SeasonStats } from './player-stats';
import {
  formatAvg,
  formatPenalties,
  listFantaAvg,
  makeStatsIndex,
  statsOf,
} from './player-stats';
import type { Role } from './types';
import { SEASON_STATS } from '../data/stats';
import { realListone } from '../test/fixtures';

function s(id: number, over: Partial<SeasonStats> = {}): SeasonStats {
  return {
    id,
    name: `#${id}`,
    team: 'Inter',
    role: 'C',
    played: 30,
    avg: 6.5,
    fantaAvg: 7.25,
    goals: 5,
    assists: 3,
    conceded: 0,
    cleanSheets: null,
    goodGames: 15,
    penScored: 0,
    penTaken: 0,
    penSaved: 0,
    yellow: 2,
    red: 0,
    ...over,
  };
}

describe('makeStatsIndex', () => {
  it('aggancia per id', () => {
    const index = makeStatsIndex([s(1), s(2, { goals: 11 })]);
    expect(statsOf(2, index)?.goals).toBe(11);
  });

  it('non inventa niente per chi non c e', () => {
    expect(statsOf(999, makeStatsIndex([s(1)]))).toBeNull();
  });
});

describe('formattazione', () => {
  it('scrive le medie con la virgola e due decimali', () => {
    expect(formatAvg(6.5)).toBe('6,50');
    expect(formatAvg(10)).toBe('10,00');
    expect(formatAvg(4.937)).toBe('4,94');
  });

  it('scrive i rigori come segnati su calciati', () => {
    expect(formatPenalties(s(1, { penScored: 3, penTaken: 4 }))).toBe('3/4');
  });
});

describe('listFantaAvg', () => {
  it('da la fantamedia di chi ha giocato', () => {
    const index = makeStatsIndex([s(1, { fantaAvg: 8.25 })]);
    expect(listFantaAvg(1, index)).toBe('8,25');
  });

  it('tace su chi non ha statistiche', () => {
    expect(listFantaAvg(1, makeStatsIndex([]))).toBeNull();
  });

  /** Zero presenze non e' una fantamedia bassa: e' nessuna fantamedia. */
  it('tace su chi non ha mai preso un voto', () => {
    const index = makeStatsIndex([s(1, { played: 0, fantaAvg: 0, avg: 0 })]);
    expect(listFantaAvg(1, index)).toBeNull();
  });
});

/**
 * Il file e' generato da `scripts/build-stats.mjs`: questi test valgono per il
 * file committato adesso e falliscono se una rigenerazione porta a casa cifre
 * che non stanno in piedi.
 */
describe('src/data/stats.ts', () => {
  it('non ripete un id', () => {
    const ids = new Set(SEASON_STATS.map((r) => r.id));
    expect(ids.size).toBe(SEASON_STATS.length);
  });

  it('conta le porte inviolate solo ai portieri che hanno giocato', () => {
    for (const r of SEASON_STATS) {
      if (r.cleanSheets !== null) {
        expect(r.role, r.name).toBe('P');
        expect(r.cleanSheets, r.name).toBeLessThanOrEqual(r.played);
      }
      if (r.role === 'P' && r.played > 0) expect(r.cleanSheets, r.name).not.toBeNull();
    }
  });

  it('non segna piu rigori di quanti ne calcia', () => {
    for (const r of SEASON_STATS) {
      expect(r.penScored, r.name).toBeLessThanOrEqual(r.penTaken);
      expect(r.goals, r.name).toBeGreaterThanOrEqual(r.penScored);
    }
  });

  it('tiene le medie dentro la scala dei voti', () => {
    for (const r of SEASON_STATS) {
      if (r.played === 0) continue;
      expect(r.avg, r.name).toBeGreaterThan(0);
      expect(r.avg, r.name).toBeLessThanOrEqual(10);
      expect(r.played, r.name).toBeLessThanOrEqual(38);
    }
  });

  it('copre tutti i ruoli', () => {
    const roles = new Set<Role>(SEASON_STATS.map((r) => r.role));
    expect([...roles].sort()).toEqual(['A', 'C', 'D', 'P']);
  });

  /**
   * L'aggancio e' per id, quindi o regge per tutti o e' rotto per tutti: se
   * scendesse a poche decine vorrebbe dire che la fonte ha cambiato spazio di
   * id, non che il mercato e' stato movimentato.
   */
  it('aggancia la maggioranza del listone', () => {
    const index = makeStatsIndex(SEASON_STATS);
    const players = realListone();
    const hit = players.filter((p) => statsOf(p.id, index) !== null);
    expect(hit.length).toBeGreaterThan(players.length / 2);
  });

  it('non aggancia chi in Serie A non ha mai giocato', () => {
    const index = makeStatsIndex(SEASON_STATS);
    const players = realListone();
    // Nomi arrivati dall'estero nell'estate 2026: non hanno uno storico italiano.
    const newcomers = players.filter((p) => ['Stones', 'Kolo Muani'].includes(p.name));
    expect(newcomers.length).toBeGreaterThan(0);
    for (const p of newcomers) expect(statsOf(p.id, index), p.name).toBeNull();
  });
});
