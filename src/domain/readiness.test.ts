import { describe, expect, it } from 'vitest';

import {
  clubsInListone,
  computeReadiness,
  describeAge,
  rolesTooThin,
  type ReadinessInput,
} from './readiness';
import type { Check, CheckLevel } from './readiness';
import { makeLineup, makeObjectives, makePlayer, makePlayerNote, makeSlot } from '../test/fixtures';
import { emptyObjectives } from './backup';
import { realListone } from '../test/fixtures';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const INTER = [
  makePlayer({ id: 1, role: 'P', quot: 10, name: 'Sommer', team: 'Inter' }),
  makePlayer({ id: 2, role: 'D', quot: 20, name: 'Dimarco', team: 'Inter' }),
];
const MILAN = [
  makePlayer({ id: 3, role: 'P', quot: 9, name: 'Maignan', team: 'Milan' }),
  makePlayer({ id: 4, role: 'C', quot: 25, name: 'Fofana', team: 'Milan' }),
];

/** Lega pronta: tutto a posto, cosi' ogni test rompe una cosa sola. */
function input(patch: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    players: [...INTER, ...MILAN],
    teamsConfigured: 12,
    hasUserTeam: true,
    lineups: [
      makeLineup('Inter', [makeSlot('P1', [1]), makeSlot('D1', [2])]),
      makeLineup('Milan', [makeSlot('P1', [3]), makeSlot('C1', [4])]),
    ],
    notes: [makePlayerNote(2, 'spinge sempre')],
    objectives: makeObjectives('piano', [{ playerId: 2, priority: 1, note: 'max 60' }]),
    lastBackupAt: NOW - 3600_000,
    now: NOW,
    ...patch,
  };
}

function check(id: string, patch: Partial<ReadinessInput> = {}): Check {
  const found = computeReadiness(input(patch)).checks.find((c) => c.id === id);
  if (found === undefined) throw new Error(`Voce "${id}" assente dalla checklist.`);
  return found;
}

function levels(patch: Partial<ReadinessInput> = {}): Record<string, CheckLevel> {
  const out: Record<string, CheckLevel> = {};
  for (const c of computeReadiness(input(patch)).checks) out[c.id] = c.level;
  return out;
}

describe('lega pronta', () => {
  it('nessuna voce da fare, e nessuna azione suggerita', () => {
    const readiness = computeReadiness(input());
    expect(readiness.ready).toBe(true);
    expect(readiness.done).toBe(readiness.total);
    expect(readiness.checks.every((c) => c.action === '')).toBe(true);
    expect(readiness.missingLineups).toEqual([]);
    expect(readiness.incompleteLineups).toEqual([]);
  });

  it('la checklist ha sempre le sei voci, in ordine stabile', () => {
    expect(computeReadiness(input()).checks.map((c) => c.id)).toEqual([
      'listone',
      'partecipanti',
      'formazioni',
      'obiettivi',
      'appunti',
      'backup',
    ]);
  });
});

describe('listone', () => {
  it('senza giocatori e da fare, e trascina le formazioni', () => {
    const l = levels({ players: [], lineups: [] });
    expect(l['listone']).toBe('todo');
    expect(l['formazioni']).toBe('todo');
    expect(check('formazioni', { players: [], lineups: [] }).detail).toContain('Senza listone');
  });

  it('conta giocatori e club', () => {
    expect(check('listone').detail).toBe('4 giocatori, 2 club.');
  });
});

describe('partecipanti', () => {
  it('serve la squadra dell utente, non basta averle create', () => {
    expect(check('partecipanti', { hasUserTeam: false }).level).toBe('todo');
    expect(check('partecipanti', { hasUserTeam: false }).detail).toContain('nessuna marcata');
  });

  it('una lega di una squadra sola non e una lega', () => {
    expect(check('partecipanti', { teamsConfigured: 1 }).level).toBe('todo');
  });
});

describe('formazioni — la voce che vale i giorni di lavoro', () => {
  it('elenca per nome i club senza formazione', () => {
    const readiness = computeReadiness(input({ lineups: [] }));
    expect(readiness.missingLineups).toEqual(['Inter', 'Milan']);
    const formazioni = readiness.checks.find((c) => c.id === 'formazioni') as Check;
    expect(formazioni.level).toBe('todo');
    expect(formazioni.action).toContain('Inter, Milan');
  });

  it('una formazione creata ma vuota conta come mancante', () => {
    const vuota = [makeLineup('Inter', [makeSlot('P1', []), makeSlot('D1', [])])];
    expect(computeReadiness(input({ lineups: vuota })).missingLineups).toEqual(['Inter', 'Milan']);
  });

  it('sotto soglia e un avviso, non un blocco', () => {
    // Inter: 1 slot pieno su 3 = 33%.
    const parziale = [
      makeLineup('Inter', [makeSlot('P1', [1]), makeSlot('D1', []), makeSlot('D2', [])]),
      makeLineup('Milan', [makeSlot('P1', [3])]),
    ];
    const readiness = computeReadiness(input({ lineups: parziale }));
    expect(readiness.incompleteLineups).toEqual(['Inter']);
    expect(readiness.ready).toBe(true);
    const formazioni = readiness.checks.find((c) => c.id === 'formazioni') as Check;
    expect(formazioni.level).toBe('warn');
    expect(formazioni.detail).toContain('sotto il 70%');
    expect(formazioni.action).toContain('Da finire: Inter');
  });

  it('la soglia si puo spostare', () => {
    const parziale = [
      makeLineup('Inter', [makeSlot('P1', [1]), makeSlot('D1', [])]),
      makeLineup('Milan', [makeSlot('P1', [3])]),
    ];
    expect(
      computeReadiness(input({ lineups: parziale, lineupThreshold: 0.4 })).incompleteLineups,
    ).toEqual([]);
  });
});

describe('obiettivi', () => {
  it('nessun target e un avviso', () => {
    const c = check('obiettivi', { objectives: emptyObjectives() });
    expect(c.level).toBe('warn');
    expect(c.detail).toBe('Nessun target in lista.');
  });

  it('un target senza nota, ne sua ne del giocatore, va segnalato', () => {
    const c = check('obiettivi', {
      objectives: makeObjectives('', [{ playerId: 4, priority: 1, note: '   ' }]),
      notes: [],
    });
    expect(c.level).toBe('warn');
    expect(c.detail).toBe('1 target, 1 senza nota.');
  });

  it('la nota del giocatore basta: non serve ripeterla nel target', () => {
    const c = check('obiettivi', {
      objectives: makeObjectives('', [{ playerId: 2, priority: 1, note: '' }]),
      notes: [makePlayerNote(2, 'rigorista')],
    });
    expect(c.level).toBe('ok');
    expect(c.detail).toBe('1 target, 0 senza nota.');
  });

  it('due target si dicono al plurale', () => {
    const c = check('obiettivi', {
      objectives: makeObjectives('', [
        { playerId: 2, priority: 1, note: 'a' },
        { playerId: 4, priority: 2, note: 'b' },
      ]),
    });
    expect(c.detail).toBe('2 target, 0 senza nota.');
  });
});

describe('appunti', () => {
  it('nessun appunto e un avviso', () => {
    expect(check('appunti', { notes: [] }).level).toBe('warn');
  });

  it('le note archiviate e quelle vuote non contano', () => {
    const c = check('appunti', {
      notes: [makePlayerNote(2, 'vecchia', null, true), makePlayerNote(4, '   ')],
    });
    expect(c.level).toBe('warn');
    expect(c.detail).toBe('Nessun appunto scritto.');
  });

  it('conta al singolare e al plurale', () => {
    expect(check('appunti').detail).toBe('1 giocatore annotato.');
    expect(
      check('appunti', { notes: [makePlayerNote(2, 'a'), makePlayerNote(4, 'b')] }).detail,
    ).toBe('2 giocatori annotati.');
  });
});

describe('backup — il rischio numero uno', () => {
  it('mai scaricato blocca la checklist', () => {
    const c = check('backup', { lastBackupAt: null });
    expect(c.level).toBe('todo');
    expect(computeReadiness(input({ lastBackupAt: null })).ready).toBe(false);
  });

  it('di oggi va bene, di ieri avvisa, di una settimana blocca', () => {
    expect(check('backup').level).toBe('ok');
    expect(check('backup', { lastBackupAt: NOW - 2 * DAY }).level).toBe('warn');
    expect(check('backup', { lastBackupAt: NOW - 8 * DAY }).level).toBe('todo');
  });

  it('dice quanto e vecchio in parole', () => {
    expect(check('backup', { lastBackupAt: NOW - 2 * DAY }).detail).toBe('Ultimo 2 giorni fa.');
    expect(check('backup', { lastBackupAt: NOW - DAY - 1000 }).detail).toBe('Ultimo ieri.');
  });
});

describe('eta in parole', () => {
  it('oggi, ieri, e il resto in giorni', () => {
    expect(describeAge(0)).toBe('oggi');
    expect(describeAge(3600_000)).toBe('oggi');
    expect(describeAge(DAY + 1)).toBe('ieri');
    expect(describeAge(9 * DAY)).toBe('9 giorni fa');
  });
});

describe('utilita sul listone', () => {
  it('elenca i club in ordine alfabetico, senza ripetizioni', () => {
    expect(clubsInListone([...MILAN, ...INTER])).toEqual(['Inter', 'Milan']);
    expect(clubsInListone([])).toEqual([]);
  });

  it('segnala i ruoli in cui il listone non basta a riempire la lega', () => {
    const magro = rolesTooThin([...INTER, ...MILAN], { P: 1, D: 1, C: 1, A: 1 }, 12);
    expect(magro).toEqual(['P', 'D', 'C', 'A']);

    const bastante = rolesTooThin([...INTER, ...MILAN], { P: 1, D: 1, C: 1, A: 0 }, 2);
    expect(bastante).toEqual(['D', 'C']);
  });

  it('sul listone vero i quattro reparti bastano per dodici squadre', () => {
    expect(rolesTooThin(realListone(), { P: 3, D: 8, C: 8, A: 6 }, 12)).toEqual([]);
  });
});
