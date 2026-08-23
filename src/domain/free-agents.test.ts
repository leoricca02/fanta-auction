import { beforeEach, describe, expect, it } from 'vitest';

import {
  activePhase,
  compareByFvmDesc,
  compareByQuotDesc,
  computeFreeAgents,
  groupByRole,
  leagueSlotsFreeByRole,
  makeNoteIndex,
  playersOfTeam,
  sortByQuotDesc,
  tagOf,
} from './free-agents';
import { initialLeagueState, reduce } from './reducer';
import { makeLeagueConfig } from './config';
import { PHASE_ORDER } from './types';
import type { Player, Role } from './types';
import {
  makeEvent,
  makePlayer,
  makePlayerNote,
  makeRoster,
  makeTinyConfig,
  realConfig,
  realListone,
  resetEventCounter,
} from '../test/fixtures';

beforeEach(() => resetEventCounter());

function p(id: number, role: Role, quot: number, fvm = quot * 10, team = 'Test FC'): Player {
  return makePlayer({ id, role, quot, fvm, team });
}

// ---------------------------------------------------------------------------
// Ordinamenti (superstiti di pricing.ts: qui restano solo ordinamento e filtro)
// ---------------------------------------------------------------------------

describe('ordinamenti sulle colonne grezze', () => {
  it('QUOT. desc, poi FVM desc, poi id asc', () => {
    const a = p(5, 'D', 10, 50);
    const b = p(3, 'D', 10, 50);
    const c = p(9, 'D', 10, 80);
    const d = p(1, 'D', 12, 10);
    expect(sortByQuotDesc([a, b, c, d]).map((x) => x.id)).toEqual([1, 9, 3, 5]);
    expect(compareByQuotDesc(d, a)).toBeLessThan(0);
    expect(compareByQuotDesc(c, a)).toBeLessThan(0);
    expect(compareByQuotDesc(b, a)).toBeLessThan(0);
    expect(compareByQuotDesc(a, a)).toBe(0);
  });

  it('non muta l array di input', () => {
    const input = [p(1, 'D', 1), p(2, 'D', 9)];
    sortByQuotDesc(input);
    expect(input.map((x) => x.id)).toEqual([1, 2]);
  });

  it('il tiebreak rende l ordine stabile: 39 portieri a QUOT.=1 nel file reale', () => {
    const portieri = groupByRole(realListone()).P;
    expect(portieri.filter((x) => x.quot === 1).length).toBeGreaterThan(3);
    const first = sortByQuotDesc(portieri).map((x) => x.id);
    const second = sortByQuotDesc([...portieri].reverse()).map((x) => x.id);
    expect(first).toEqual(second);
  });

  it('compareByFvmDesc ordina per FVM, poi QUOT., poi id', () => {
    const a = p(5, 'D', 10, 50);
    const b = p(3, 'D', 12, 50);
    const c = p(9, 'D', 1, 80);
    expect([a, b, c].sort(compareByFvmDesc).map((x) => x.id)).toEqual([9, 3, 5]);
    expect(compareByFvmDesc(a, p(5, 'D', 10, 50))).toBe(0);
  });

  it('groupByRole raccoglie tutti i ruoli, anche vuoti', () => {
    expect(groupByRole([])).toEqual({ P: [], D: [], C: [], A: [] });
    expect(groupByRole([p(1, 'A', 3), p(2, 'A', 4)]).A).toHaveLength(2);
  });
});

describe('playersOfTeam — picker dell editor formazioni (§5.2)', () => {
  const players = realListone();

  it('mostra solo i giocatori del club, ordinati per QUOT. desc', () => {
    const inter = playersOfTeam(players, 'Inter');
    expect(inter.length).toBeGreaterThan(10);
    expect(inter.every((x) => x.team === 'Inter')).toBe(true);
    const quots = inter.map((x) => x.quot);
    expect([...quots].sort((a, b) => b - a)).toEqual(quots);
  });

  it('pre-filtra per ruolo compatibile', () => {
    const difensori = playersOfTeam(players, 'Inter', ['D']);
    expect(difensori.length).toBeGreaterThan(0);
    expect(difensori.every((x) => x.role === 'D')).toBe(true);

    const centro = playersOfTeam(players, 'Inter', ['D', 'C']);
    expect(centro.length).toBeGreaterThan(difensori.length);
    expect(centro.every((x) => x.role === 'D' || x.role === 'C')).toBe(true);
  });

  it('restituisce vuoto su un club inesistente', () => {
    expect(playersOfTeam(players, 'Real Madrid')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Note e tag
// ---------------------------------------------------------------------------

describe('indice delle note', () => {
  it('trova il tag per playerId e restituisce null se manca', () => {
    const notes = makeNoteIndex([
      makePlayerNote(1, 'titolare sicuro', 'obiettivo'),
      makePlayerNote(2, 'da evitare', 'evita'),
      makePlayerNote(3, 'nessun tag'),
    ]);
    expect(tagOf(1, notes)).toBe('obiettivo');
    expect(tagOf(2, notes)).toBe('evita');
    expect(tagOf(3, notes)).toBeNull();
    expect(tagOf(99, notes)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §4.3 — Svincolati
// ---------------------------------------------------------------------------

describe('§4.3 — svincolati, inizio asta sul listone reale', () => {
  const config = realConfig();
  const free = computeFreeAgents(initialLeagueState(config), config);

  it('sono tutti e 516, ripartiti come §2', () => {
    expect(free.total).toBe(516);
    expect(free.countByRole).toEqual({ P: 63, D: 181, C: 184, A: 88 });
  });

  it('gli slot liberi in lega sono 300, ripartiti per ruolo', () => {
    expect(free.slotsFreeByRole).toEqual({ P: 36, D: 96, C: 96, A: 72 });
    expect(free.slotsFree).toBe(300);
  });

  it('ogni lista e ordinata per QUOT. desc', () => {
    for (const role of PHASE_ORDER) {
      const quots = free.byRole[role].map((x) => x.quot);
      expect([...quots].sort((a, b) => b - a)).toEqual(quots);
    }
  });

  it('senza note non ci sono obiettivi', () => {
    expect(free.totalTargets).toBe(0);
    expect(free.targetCountByRole).toEqual({ P: 0, D: 0, C: 0, A: 0 });
  });

  it('la fase attiva a inizio asta e P', () => {
    expect(activePhase(free.slotsFreeByRole)).toBe('P');
  });
});

describe('§4.3 — conteggio degli obiettivi', () => {
  const config = realConfig();

  it('conta per ruolo solo i tag obiettivo, ignorando gli altri', () => {
    const attaccanti = config.players.filter((x) => x.role === 'A').slice(0, 5);
    const difensori = config.players.filter((x) => x.role === 'D').slice(0, 2);
    const notes = makeNoteIndex([
      ...attaccanti.map((x) => makePlayerNote(x.id, '', 'obiettivo')),
      ...difensori.map((x) => makePlayerNote(x.id, '', 'alternativa')),
    ]);
    const free = computeFreeAgents(initialLeagueState(config), config, notes);
    expect(free.targetCountByRole).toEqual({ P: 0, D: 0, C: 0, A: 5 });
    expect(free.totalTargets).toBe(5);
  });

  it('un obiettivo assegnato esce dal conteggio', () => {
    const target = config.players.find((x) => x.role === 'P') as Player;
    const notes = makeNoteIndex([makePlayerNote(target.id, '', 'obiettivo')]);

    const before = computeFreeAgents(initialLeagueState(config), config, notes);
    expect(before.targetCountByRole.P).toBe(1);

    const state = reduce(
      [makeEvent({ playerId: target.id, teamId: 'sq2', price: 20, phase: 'P' })],
      config,
    );
    const after = computeFreeAgents(state, config, notes);
    expect(after.targetCountByRole.P).toBe(0);
    expect(after.countByRole.P).toBe(62);
    expect(after.total).toBe(515);
  });
});

describe('§4.3 — svincolati durante e a fine asta', () => {
  const players = [
    ...makeRoster('P', 4, 10, 100),
    ...makeRoster('D', 4, 20, 200),
    ...makeRoster('C', 4, 30, 300),
    ...makeRoster('A', 4, 40, 400),
  ];
  const config = makeTinyConfig({ players, teamCount: 2, creditsPerTeam: 200 });

  it('toglie dagli svincolati i giocatori assegnati', () => {
    const state = reduce([makeEvent({ playerId: 100, teamId: 't01', price: 5, phase: 'P' })], config);
    const free = computeFreeAgents(state, config);
    expect(free.byRole.P.map((x) => x.id)).toEqual([101, 102, 103]);
    expect(free.slotsFreeByRole.P).toBe(1);
  });

  it('un giocatore la cui assegnazione e annullata torna svincolato', () => {
    const events = [makeEvent({ id: 'x', playerId: 100, teamId: 't01', price: 5, phase: 'P' })];
    const undone = events.map((e) => ({ ...e, undone: true }));
    expect(computeFreeAgents(reduce(events, config), config).countByRole.P).toBe(3);
    expect(computeFreeAgents(reduce(undone, config), config).countByRole.P).toBe(4);
  });

  it('passa alla fase successiva quando il ruolo e chiuso', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 100, teamId: 't01', price: 5, phase: 'P' }),
        makeEvent({ playerId: 101, teamId: 't02', price: 5, phase: 'P' }),
      ],
      config,
    );
    const free = computeFreeAgents(state, config);
    expect(free.slotsFreeByRole.P).toBe(0);
    // Gli slot P sono chiusi ma due portieri restano svincolati: sono cose diverse.
    expect(free.countByRole.P).toBe(2);
    expect(activePhase(free.slotsFreeByRole)).toBe('D');
  });

  it('ad asta finita non c e piu fase attiva', () => {
    const events = [
      makeEvent({ playerId: 100, teamId: 't01', price: 5, phase: 'P' }),
      makeEvent({ playerId: 101, teamId: 't02', price: 5, phase: 'P' }),
      makeEvent({ playerId: 200, teamId: 't01', price: 5, phase: 'D' }),
      makeEvent({ playerId: 201, teamId: 't02', price: 5, phase: 'D' }),
      makeEvent({ playerId: 300, teamId: 't01', price: 5, phase: 'C' }),
      makeEvent({ playerId: 301, teamId: 't02', price: 5, phase: 'C' }),
      makeEvent({ playerId: 400, teamId: 't01', price: 5, phase: 'A' }),
      makeEvent({ playerId: 401, teamId: 't02', price: 5, phase: 'A' }),
    ];
    const free = computeFreeAgents(reduce(events, config), config);
    expect(free.slotsFree).toBe(0);
    expect(activePhase(free.slotsFreeByRole)).toBeNull();
    expect(free.total).toBe(8);
  });
});

describe('§4.3 — robustezza', () => {
  it('ignora le squadre di config assenti dallo stato', () => {
    const players = [makePlayer({ id: 1, role: 'A', quot: 5 })];
    const twoTeams = makeTinyConfig({ players, teamCount: 2 });
    const threeTeams = makeTinyConfig({ players, teamCount: 3 });
    // Stato costruito su 2 squadre, letto con una config che ne dichiara 3.
    expect(leagueSlotsFreeByRole(initialLeagueState(twoTeams), threeTeams).A).toBe(2);
  });

  it('un listone vuoto produce zero svincolati ma gli slot restano liberi', () => {
    const config = makeLeagueConfig([]);
    const free = computeFreeAgents(initialLeagueState(config), config);
    expect(free.total).toBe(0);
    expect(free.byRole).toEqual({ P: [], D: [], C: [], A: [] });
    expect(free.slotsFree).toBe(300);
    expect(activePhase(free.slotsFreeByRole)).toBe('P');
  });

  it('activePhase salta i ruoli gia chiusi', () => {
    expect(activePhase({ P: 0, D: 0, C: 3, A: 1 })).toBe('C');
    expect(activePhase({ P: 0, D: 0, C: 0, A: 1 })).toBe('A');
    expect(activePhase({ P: 0, D: 0, C: 0, A: 0 })).toBeNull();
  });
});
