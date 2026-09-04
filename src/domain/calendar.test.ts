import { describe, expect, it } from 'vitest';

import type { Cell, Fixture, GridMode, TeamDifficulty } from './calendar';
import {
  DIFFICULTIES,
  DIFFICULTY_WEIGHT,
  bestCombos,
  buildGrid,
  cellsOf,
  combine,
  difficultyOf,
  keyPlayers,
  makeDifficultyIndex,
  tally,
  teamAbbrs,
} from './calendar';
import { CALENDAR_TEAMS, FIXTURES } from '../data/calendar';
import { TEAM_DIFFICULTY } from '../data/difficulty';
import { realListone } from '../test/fixtures';

/** Due squadre, andata e ritorno: il piu' piccolo campionato possibile. */
const TWO: readonly Fixture[] = [
  { matchday: 1, home: 'Forte', away: 'Debole', date: '2026-08-22', played: true },
  { matchday: 2, home: 'Debole', away: 'Forte', date: '2026-08-29', played: false },
];

const TWO_TABLE: readonly TeamDifficulty[] = [
  { team: 'Forte', P: 'difficile', A: 'difficile' },
  { team: 'Debole', P: 'facile', A: 'media' },
];

describe('difficultyOf', () => {
  const index = makeDifficultyIndex(TWO_TABLE);

  it('legge il colore del reparto chiesto', () => {
    expect(difficultyOf('Debole', 'P', index)).toBe('facile');
    expect(difficultyOf('Debole', 'A', index)).toBe('media');
  });

  it('non inventa un colore per chi non e in tabella', () => {
    expect(difficultyOf('Fantasma', 'P', index)).toBeNull();
  });
});

describe('DIFFICULTY_WEIGHT', () => {
  it('copre i tre livelli, zero cinquanta cento', () => {
    expect(DIFFICULTIES.map((d) => DIFFICULTY_WEIGHT[d])).toEqual([0, 50, 100]);
  });
});

describe('tabella di difficolta', () => {
  it('classifica esattamente i venti club del calendario, senza doppioni', () => {
    const teams = TEAM_DIFFICULTY.map((t) => t.team).sort();
    expect(teams).toEqual([...CALENDAR_TEAMS].sort());
    expect(new Set(teams).size).toBe(teams.length);
  });

  it('usa solo i tre livelli previsti', () => {
    for (const row of TEAM_DIFFICULTY) {
      expect(DIFFICULTIES).toContain(row.P);
      expect(DIFFICULTIES).toContain(row.A);
    }
  });
});

describe('buildGrid', () => {
  it('da a ogni club una casella per giornata, ordinate', () => {
    const grid = buildGrid(TWO, TWO_TABLE, 'P');
    expect(grid.teams).toEqual(['Debole', 'Forte']);
    expect(grid.rows.get('Forte')?.map((c) => c.matchday)).toEqual([1, 2]);
    expect(grid.rows.get('Forte')?.map((c) => c.opponent)).toEqual(['Debole', 'Debole']);
    expect(grid.rows.get('Debole')?.map((c) => c.home)).toEqual([false, true]);
  });

  it('colora la casella con il livello dellavversario, non del padrone di casa', () => {
    const grid = buildGrid(TWO, TWO_TABLE, 'P');
    expect(grid.rows.get('Forte')?.[0]?.level).toBe('facile');
    expect(grid.rows.get('Debole')?.[0]?.level).toBe('difficile');
  });

  it('lo stesso avversario vale uguale in casa e fuori', () => {
    const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');
    for (const team of grid.teams) {
      const byOpponent = new Map<string, string>();
      for (const cell of grid.rows.get(team) ?? []) {
        const seen = byOpponent.get(cell.opponent);
        if (seen !== undefined) expect(cell.level).toBe(seen);
        byOpponent.set(cell.opponent, cell.level);
      }
    }
  });

  it('dichiara i club del calendario che la tabella non classifica', () => {
    const extra: Fixture[] = [
      ...TWO,
      { matchday: 3, home: 'Fantasma', away: 'Forte', date: '2026-09-12', played: false },
    ];
    const grid = buildGrid(extra, TWO_TABLE, 'P');
    expect(grid.unknownTeams).toEqual(['Fantasma']);
    expect(grid.teams).not.toContain('Fantasma');
    // E la giornata del fantasma non entra nella riga di chi lo affronta.
    expect(grid.rows.get('Forte')?.length).toBe(2);
  });

  it('trova la prima giornata da giocare', () => {
    expect(buildGrid(TWO, TWO_TABLE, 'P').nextMatchday).toBe(2);
    const finished = TWO.map((f) => ({ ...f, played: true }));
    expect(buildGrid(finished, TWO_TABLE, 'P').nextMatchday).toBeNull();
  });

  it('sul calendario vero: venti righe da 38 partite, meta in casa', () => {
    const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');
    expect(grid.teams.length).toBe(20);
    expect(grid.unknownTeams).toEqual([]);
    for (const team of grid.teams) {
      const cells = grid.rows.get(team) ?? [];
      expect(cells.length).toBe(38);
      expect(cells.filter((c) => c.home).length).toBe(19);
      expect(new Set(cells.map((c) => c.matchday)).size).toBe(38);
      expect(cells.some((c) => c.opponent === team)).toBe(false);
    }
  });

  it('i due reparti differiscono dove la tabella li distingue', () => {
    const portieri = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');
    const attaccanti = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'A');
    const level = (grid: typeof portieri, team: string, opponent: string): string | undefined =>
      (grid.rows.get(team) ?? []).find((c) => c.opponent === opponent)?.level;
    // Udinese: media per i portieri, facile per gli attaccanti.
    expect(level(portieri, 'Inter', 'Udinese')).toBe('media');
    expect(level(attaccanti, 'Inter', 'Udinese')).toBe('facile');
    // L'Inter resta difficile per tutti e due.
    expect(level(portieri, 'Udinese', 'Inter')).toBe('difficile');
    expect(level(attaccanti, 'Udinese', 'Inter')).toBe('difficile');
  });
});

describe('cellsOf', () => {
  it('taglia sullintervallo, estremi inclusi', () => {
    const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');
    const cells = cellsOf(grid, 'Inter', 5, 9);
    expect(cells.map((c) => c.matchday)).toEqual([5, 6, 7, 8, 9]);
    expect(cellsOf(grid, 'Nessuno', 1, 38)).toEqual([]);
  });
});

describe('tally', () => {
  const cell = (over: Partial<Cell>): Cell => ({
    matchday: 1,
    team: 'A',
    opponent: 'B',
    home: true,
    date: '2026-08-22',
    played: false,
    level: 'media',
    weight: 50,
    ...over,
  });

  it('conta livelli, campo e partite', () => {
    const t = tally([
      cell({ level: 'facile', weight: 0, home: true }),
      cell({ level: 'difficile', weight: 100, home: false }),
    ]);
    expect(t).toMatchObject({ facile: 1, media: 0, difficile: 1, home: 1, away: 1, matches: 2 });
  });

  it('il voto e cento meno il peso medio', () => {
    // Il conto di FantaLab: 29 facili, 8 medie e 1 difficile fanno 87.
    const cells = [
      ...Array.from({ length: 29 }, () => cell({ level: 'facile' as const, weight: 0 })),
      ...Array.from({ length: 8 }, () => cell({ level: 'media' as const, weight: 50 })),
      cell({ level: 'difficile', weight: 100 }),
    ];
    expect(tally(cells).score).toBe(87);
  });

  it('su zero partite non divide per zero', () => {
    expect(tally([]).score).toBe(0);
  });
});

describe('combine', () => {
  it('ogni giornata prende la partita piu comoda fra i club scelti', () => {
    const grid = buildGrid(TWO, TWO_TABLE, 'P');
    const combo = combine(grid, ['Forte', 'Debole'], 1, 2);
    expect(combo.picks.map((c) => c.team)).toEqual(['Forte', 'Forte']);
    expect(combo.picks.every((c) => c.level === 'facile')).toBe(true);
  });

  it('a parita di livello resta il primo club scelto', () => {
    const table: TeamDifficulty[] = [
      { team: 'Uno', P: 'facile', A: 'facile' },
      { team: 'Due', P: 'facile', A: 'facile' },
      { team: 'Tre', P: 'facile', A: 'facile' },
    ];
    const fixtures: Fixture[] = [
      { matchday: 1, home: 'Uno', away: 'Tre', date: '2026-08-22', played: false },
      { matchday: 1, home: 'Due', away: 'Tre', date: '2026-08-22', played: false },
    ];
    const grid = buildGrid(fixtures, table, 'P');
    expect(combine(grid, ['Due', 'Uno'], 1, 1).picks[0]?.team).toBe('Due');
    expect(combine(grid, ['Uno', 'Due'], 1, 1).picks[0]?.team).toBe('Uno');
  });

  it('un club solo e labbinamento di se stesso', () => {
    const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');
    const solo = combine(grid, ['Inter'], 1, 38);
    expect(solo.tally.matches).toBe(38);
    expect(solo.picks.every((c) => c.team === 'Inter')).toBe(true);
  });

  it('aggiungere un club non puo peggiorare il voto', () => {
    const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');
    const solo = combine(grid, ['Lecce'], 1, 38).tally.score;
    const pair = combine(grid, ['Lecce', 'Milan'], 1, 38).tally.score;
    expect(pair).toBeGreaterThanOrEqual(solo);
  });

  it('rispetta lintervallo di giornate', () => {
    const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'A');
    const combo = combine(grid, ['Roma', 'Napoli'], 10, 15);
    expect(combo.tally.matches).toBe(6);
    expect(combo.picks.map((c) => c.matchday)).toEqual([10, 11, 12, 13, 14, 15]);
  });
});

/**
 * Ancore di regressione: gli stessi abbinamenti letti sulla griglia di FantaLab
 * il 2026-09-02. Se un giorno questi voti cambiano senza che sia cambiata la
 * tabella o il calendario, e' il conto che si e' rotto.
 */
describe('gli stessi numeri di FantaLab', () => {
  const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');

  it('Genoa + Udinese, giornate 1-38 -> 87', () => {
    expect(combine(grid, ['Genoa', 'Udinese'], 1, 38).tally.score).toBe(87);
  });

  it('Frosinone + Genoa, giornate 3-38 -> 86', () => {
    expect(combine(grid, ['Frosinone', 'Genoa'], 3, 38).tally.score).toBe(86);
  });

  it('Genoa + Parma + Udinese, giornate 1-38 -> 99', () => {
    expect(combine(grid, ['Genoa', 'Parma', 'Udinese'], 1, 38).tally.score).toBe(99);
  });

  it('Atalanta + Bologna, giornate 1-38 -> 83, con 26 facili 11 medie 1 difficile', () => {
    const t = combine(grid, ['Atalanta', 'Bologna'], 1, 38).tally;
    expect(t.score).toBe(83);
    expect([t.facile, t.media, t.difficile]).toEqual([26, 11, 1]);
  });
});

describe('bestCombos', () => {
  const grid = buildGrid(FIXTURES, TEAM_DIFFICULTY, 'P');

  it('ordina per voto e non ripete un club dentro la stessa coppia', () => {
    const combos = bestCombos(grid, 2, 1, 38, 3);
    expect(combos.length).toBe(3);
    for (const combo of combos) expect(new Set(combo.teams).size).toBe(2);
    expect(combos[0]?.tally.score).toBeGreaterThanOrEqual(combos[1]?.tally.score ?? 0);
  });

  it('la migliore coppia batte qualunque coppia scelta a caso', () => {
    const best = bestCombos(grid, 2, 1, 38, 1)[0];
    const any = combine(grid, ['Cagliari', 'Lecce'], 1, 38);
    expect(best?.tally.score).toBeGreaterThanOrEqual(any.tally.score);
  });

  it('la migliore terna non e peggio della migliore coppia', () => {
    const pair = bestCombos(grid, 2, 1, 38, 1)[0]?.tally.score ?? 0;
    const trio = bestCombos(grid, 3, 1, 38, 1)[0]?.tally.score ?? 0;
    expect(trio).toBeGreaterThanOrEqual(pair);
  });
});

describe('teamAbbrs', () => {
  it('tre lettere maiuscole, una per club', () => {
    const abbrs = teamAbbrs(CALENDAR_TEAMS);
    expect(abbrs.get('Atalanta')).toBe('ATA');
    expect(abbrs.get('Juventus')).toBe('JUV');
    expect(new Set(abbrs.values()).size).toBe(CALENDAR_TEAMS.length);
  });

  it('allunga la sigla invece di sovrapporre due club', () => {
    const abbrs = teamAbbrs(['Milan', 'Milanello']);
    expect(abbrs.get('Milan')).toBe('MIL');
    expect(abbrs.get('Milanello')).toBe('MILA');
  });
});

describe('keyPlayers', () => {
  it('da i piu cari del ruolo che la griglia riguarda', () => {
    const players = realListone();
    const modes: readonly GridMode[] = ['P', 'A'];
    for (const mode of modes) {
      const key = keyPlayers(players, 'Inter', mode, 2);
      expect(key.length).toBe(2);
      expect(key.every((p) => p.role === mode && p.team === 'Inter')).toBe(true);
      expect(key[0]?.fvm).toBeGreaterThanOrEqual(key[1]?.fvm ?? 0);
    }
  });
});
