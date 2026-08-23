import { beforeEach, describe, expect, it } from 'vitest';

import {
  activePhase,
  residualPool,
  residualSlotsByRole,
  totalResidualSlots,
  unassignedByRole,
} from './pool';
import { initialLeagueState, reduce } from './reducer';
import { makeLeagueConfig } from './config';
import {
  makeEvent,
  makePlayer,
  makeRoster,
  makeTinyConfig,
  realConfig,
  resetEventCounter,
} from '../test/fixtures';

beforeEach(() => resetEventCounter());

describe('pool residuo — inizio asta sul listone reale', () => {
  const config = realConfig();
  const pool = residualPool(initialLeagueState(config), config);

  it('parte con 300 slot liberi ripartiti come N_r', () => {
    expect(pool.slotsByRole).toEqual({ P: 36, D: 96, C: 96, A: 72 });
    expect(pool.totalSlots).toBe(300);
    expect(totalResidualSlots(pool.slotsByRole)).toBe(300);
  });

  it('il pool residuo e l unione dei top N_r per ruolo e somma S = 2844', () => {
    expect(pool.byRole.P).toHaveLength(36);
    expect(pool.byRole.D).toHaveLength(96);
    expect(pool.byRole.C).toHaveLength(96);
    expect(pool.byRole.A).toHaveLength(72);
    expect(pool.ids.size).toBe(300);
    expect(pool.quotSum).toBe(2844);
  });

  it('unassignedByRole contiene tutti i 516 giocatori, ordinati per QUOT. desc', () => {
    const total =
      pool.unassignedByRole.P.length +
      pool.unassignedByRole.D.length +
      pool.unassignedByRole.C.length +
      pool.unassignedByRole.A.length;
    expect(total).toBe(516);
    for (const role of ['P', 'D', 'C', 'A'] as const) {
      const quots = pool.unassignedByRole[role].map((p) => p.quot);
      expect([...quots].sort((a, b) => b - a)).toEqual(quots);
    }
  });

  it('la fase attiva a inizio asta e P', () => {
    expect(activePhase(pool)).toBe('P');
  });
});

describe('pool residuo — durante e a fine asta', () => {
  const players = [
    ...makeRoster('P', 4, 10, 100),
    ...makeRoster('D', 4, 20, 200),
    ...makeRoster('C', 4, 30, 300),
    ...makeRoster('A', 4, 40, 400),
  ];
  const config = makeTinyConfig({ players, teamCount: 2, creditsPerTeam: 200 });

  it('toglie dal pool i giocatori assegnati e decrementa gli slot', () => {
    const state = reduce([makeEvent({ playerId: 100, teamId: 't1', price: 5, phase: 'P' })], config);
    const pool = residualPool(state, config);
    expect(pool.slotsByRole.P).toBe(1);
    expect(pool.byRole.P.map((p) => p.id)).toEqual([101]);
    expect(pool.ids.has(100)).toBe(false);
    expect(pool.unassignedByRole.P).toHaveLength(3);
    expect(activePhase(pool)).toBe('P');
  });

  it('passa alla fase successiva quando il ruolo e chiuso', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 100, teamId: 't1', price: 5, phase: 'P' }),
        makeEvent({ playerId: 101, teamId: 't2', price: 5, phase: 'P' }),
      ],
      config,
    );
    const pool = residualPool(state, config);
    expect(pool.slotsByRole.P).toBe(0);
    expect(pool.byRole.P).toEqual([]);
    expect(activePhase(pool)).toBe('D');
  });

  it('a fase terminata il pool del ruolo e vuoto ma i giocatori restano non assegnati', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 100, teamId: 't1', price: 5, phase: 'P' }),
        makeEvent({ playerId: 101, teamId: 't2', price: 5, phase: 'P' }),
      ],
      config,
    );
    const pool = residualPool(state, config);
    expect(pool.byRole.P).toEqual([]);
    expect(pool.unassignedByRole.P).toHaveLength(2);
  });

  it('ad asta finita non c e piu fase attiva', () => {
    const events = [
      makeEvent({ playerId: 100, teamId: 't1', price: 5, phase: 'P' }),
      makeEvent({ playerId: 101, teamId: 't2', price: 5, phase: 'P' }),
      makeEvent({ playerId: 200, teamId: 't1', price: 5, phase: 'D' }),
      makeEvent({ playerId: 201, teamId: 't2', price: 5, phase: 'D' }),
      makeEvent({ playerId: 300, teamId: 't1', price: 5, phase: 'C' }),
      makeEvent({ playerId: 301, teamId: 't2', price: 5, phase: 'C' }),
      makeEvent({ playerId: 400, teamId: 't1', price: 5, phase: 'A' }),
      makeEvent({ playerId: 401, teamId: 't2', price: 5, phase: 'A' }),
    ];
    const pool = residualPool(reduce(events, config), config);
    expect(pool.totalSlots).toBe(0);
    expect(pool.quotSum).toBe(0);
    expect(activePhase(pool)).toBeNull();
  });

  it('il pool si ferma agli slot residui anche con molti giocatori liberi', () => {
    const many = makeTinyConfig({
      players: makeRoster('A', 50, 60, 900),
      teamCount: 2,
      slotsByRole: { P: 0, D: 0, C: 0, A: 2 },
    });
    const pool = residualPool(initialLeagueState(many), many);
    expect(pool.slotsByRole.A).toBe(4);
    expect(pool.byRole.A).toHaveLength(4);
    expect(pool.unassignedByRole.A).toHaveLength(50);
  });

  it('il pool si ferma ai giocatori disponibili se sono meno degli slot', () => {
    const few = makeTinyConfig({
      players: makeRoster('A', 2, 60, 900),
      teamCount: 2,
      slotsByRole: { P: 0, D: 0, C: 0, A: 3 },
    });
    const pool = residualPool(initialLeagueState(few), few);
    expect(pool.slotsByRole.A).toBe(6);
    expect(pool.byRole.A).toHaveLength(2);
  });
});

describe('pool residuo — robustezza', () => {
  it('ignora le squadre di config assenti dallo stato', () => {
    const players = [makePlayer({ id: 1, role: 'A', quot: 5 })];
    const twoTeams = makeTinyConfig({ players, teamCount: 2 });
    const threeTeams = makeTinyConfig({ players, teamCount: 3 });
    // Stato costruito su 2 squadre, letto con una config che ne dichiara 3.
    const slots = residualSlotsByRole(initialLeagueState(twoTeams), threeTeams);
    expect(slots.A).toBe(2);
  });

  it('unassignedByRole restituisce tutti i ruoli, anche vuoti', () => {
    const config = makeTinyConfig({ players: [makePlayer({ id: 1, role: 'A', quot: 5 })] });
    const byRole = unassignedByRole(initialLeagueState(config), config);
    expect(byRole.P).toEqual([]);
    expect(byRole.A).toHaveLength(1);
  });

  it('un listone vuoto produce un pool vuoto', () => {
    const config = makeLeagueConfig([]);
    const pool = residualPool(initialLeagueState(config), config);
    expect(pool.quotSum).toBe(0);
    expect(pool.ids.size).toBe(0);
    expect(pool.totalSlots).toBe(300);
    expect(activePhase(pool)).toBe('P');
  });
});
