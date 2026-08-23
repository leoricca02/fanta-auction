import { beforeEach, describe, expect, it } from 'vitest';

import type { AssignmentEvent } from './types';
import {
  initialLeagueState,
  lastActiveEvent,
  lastUndoneEvent,
  makePlayerIndex,
  maxBidAssoluto,
  redoEvent,
  reduce,
  resolveAssignment,
  teamState,
  undoAll,
  undoEvent,
  validateAssignment,
} from './reducer';
import { makeLeagueConfig } from './config';
import {
  makeEvent,
  makePlayer,
  makeTinyConfig,
  realConfig,
  resetEventCounter,
} from '../test/fixtures';
import { payScaledByQuot, runAuction } from '../test/replay';

beforeEach(() => resetEventCounter());

/** Lega minima: 2 squadre, 100 crediti, 1 slot per ruolo. */
function tiny() {
  const players = [
    makePlayer({ id: 1, role: 'P', quot: 5 }),
    makePlayer({ id: 2, role: 'P', quot: 4 }),
    makePlayer({ id: 3, role: 'D', quot: 9 }),
    makePlayer({ id: 4, role: 'D', quot: 8 }),
    makePlayer({ id: 5, role: 'C', quot: 7 }),
    makePlayer({ id: 6, role: 'A', quot: 6 }),
  ];
  return makeTinyConfig({ players });
}

describe('stato iniziale', () => {
  it('parte con crediti pieni e tutti gli slot liberi', () => {
    const config = makeLeagueConfig([]);
    const state = initialLeagueState(config);
    expect(Object.keys(state.teamsById)).toHaveLength(12);
    const leo = teamState(state, 'leo');
    expect(leo.credits).toBe(800);
    expect(leo.spent).toBe(0);
    expect(leo.slotsFree).toBe(25);
    expect(leo.slotsFilled).toBe(0);
    expect(leo.slotsFreeByRole).toEqual({ P: 3, D: 8, C: 8, A: 6 });
    expect(leo.slotsFilledByRole).toEqual({ P: 0, D: 0, C: 0, A: 0 });
    expect(state.creditsSpent).toBe(0);
    expect(state.slotsFilled).toBe(0);
  });

  it('reduce di un log vuoto e lo stato iniziale', () => {
    const config = makeLeagueConfig([]);
    expect(reduce([], config)).toEqual(initialLeagueState(config));
  });

  it('teamState fallisce su una squadra inesistente', () => {
    expect(() => teamState(initialLeagueState(makeLeagueConfig([])), 'nessuno')).toThrowError(
      /Squadra "nessuno" non presente/,
    );
  });
});

describe('assegnazione singola', () => {
  const config = tiny();

  it('decrementa i crediti e occupa lo slot del ruolo', () => {
    const state = reduce([makeEvent({ playerId: 3, teamId: 't01', price: 30, phase: 'D' })], config);
    const t1 = teamState(state, 't01');
    expect(t1.credits).toBe(70);
    expect(t1.spent).toBe(30);
    expect(t1.slotsFilledByRole).toEqual({ P: 0, D: 1, C: 0, A: 0 });
    expect(t1.slotsFreeByRole).toEqual({ P: 1, D: 0, C: 1, A: 1 });
    expect(t1.slotsFilled).toBe(1);
    expect(t1.slotsFree).toBe(3);
    expect(t1.roster).toEqual([{ playerId: 3, role: 'D', price: 30, eventId: 'e1' }]);
  });

  it('non tocca le altre squadre', () => {
    const state = reduce([makeEvent({ playerId: 3, teamId: 't01', price: 30, phase: 'D' })], config);
    const t2 = teamState(state, 't02');
    expect(t2.credits).toBe(100);
    expect(t2.slotsFree).toBe(4);
  });

  it('aggiorna i totali di lega di §4.7', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 3, teamId: 't01', price: 30, phase: 'D' }),
        makeEvent({ playerId: 4, teamId: 't02', price: 20, phase: 'D' }),
      ],
      config,
    );
    expect(state.creditsSpent).toBe(50);
    expect(state.slotsFilled).toBe(2);
    expect(state.appliedEventIds).toEqual(['e1', 'e2']);
  });

  it('indicizza il proprietario del giocatore', () => {
    const state = reduce([makeEvent({ playerId: 3, teamId: 't01', price: 30, phase: 'D' })], config);
    expect(state.assignmentByPlayerId[3]).toEqual({
      playerId: 3,
      role: 'D',
      price: 30,
      eventId: 'e1',
      teamId: 't01',
    });
    expect(state.assignmentByPlayerId[4]).toBeUndefined();
  });
});

describe('undo e redo', () => {
  const config = tiny();

  function log(): AssignmentEvent[] {
    return [
      makeEvent({ id: 'a', playerId: 3, teamId: 't01', price: 30, phase: 'D' }),
      makeEvent({ id: 'b', playerId: 5, teamId: 't01', price: 20, phase: 'C' }),
      makeEvent({ id: 'c', playerId: 6, teamId: 't01', price: 10, phase: 'A' }),
    ];
  }

  it('annulla un evento che NON e in ultima posizione', () => {
    const undone = undoEvent(log(), 'a');
    expect(undone).toHaveLength(3);
    expect(undone.find((e) => e.id === 'a')?.undone).toBe(true);

    const state = reduce(undone, config);
    const t1 = teamState(state, 't01');
    expect(t1.credits).toBe(70); // 100 - 20 - 10, i 30 di "a" tornano indietro
    expect(t1.slotsFilledByRole).toEqual({ P: 0, D: 0, C: 1, A: 1 });
    expect(state.assignmentByPlayerId[3]).toBeUndefined();
    expect(state.assignmentByPlayerId[5]).toBeDefined();
    expect(state.appliedEventIds).toEqual(['b', 'c']);
    expect(state.rejections).toEqual([]);
  });

  it('non e un hard delete: l evento resta nel log', () => {
    const undone = undoEvent(log(), 'b');
    expect(undone.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(undone.filter((e) => e.undone)).toHaveLength(1);
  });

  it('non muta il log di partenza', () => {
    const original = log();
    undoEvent(original, 'a');
    expect(original.every((e) => !e.undone)).toBe(true);
  });

  it('redo ripristina lo stato precedente all undo', () => {
    const before = reduce(log(), config);
    const after = reduce(redoEvent(undoEvent(log(), 'a'), 'a'), config);
    expect(after).toEqual(before);
  });

  it('undo di piu eventi e redo selettivo', () => {
    let events = undoEvent(log(), 'a');
    events = undoEvent(events, 'c');
    expect(teamState(reduce(events, config), 't01').credits).toBe(80);
    events = redoEvent(events, 'c');
    expect(teamState(reduce(events, config), 't01').credits).toBe(70);
  });

  it('undo su un id inesistente non cambia nulla', () => {
    const events = log();
    expect(undoEvent(events, 'zzz')).toEqual(events);
    expect(redoEvent(events, 'zzz')).toEqual(events);
  });

  it('libera il giocatore per una riassegnazione a un altra squadra', () => {
    const events = [
      ...undoEvent(log(), 'a'),
      makeEvent({ id: 'd', playerId: 3, teamId: 't02', price: 44, phase: 'D' }),
    ];
    const state = reduce(events, config);
    expect(state.assignmentByPlayerId[3]?.teamId).toBe('t02');
    expect(teamState(state, 't02').credits).toBe(56);
  });

  it('undoAll annulla tutto restando un soft delete', () => {
    const events = undoAll(log());
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.undone)).toBe(true);

    const state = reduce(events, config);
    expect(teamState(state, 't01').credits).toBe(100);
    expect(state.slotsFilled).toBe(0);
    expect(state.rejections).toEqual([]);

    // Reversibile uno per uno, come ogni altro annullamento.
    expect(teamState(reduce(redoEvent(events, 'b'), config), 't01').credits).toBe(80);
  });

  it('undoAll non tocca gli eventi gia annullati e non muta il log', () => {
    const events = undoEvent(log(), 'a');
    const before = JSON.parse(JSON.stringify(events)) as unknown;
    const result = undoAll(events);
    expect(events).toEqual(before);
    expect(result.find((e) => e.id === 'a')).toBe(events.find((e) => e.id === 'a'));
    expect(undoAll([])).toEqual([]);
  });

  it('lastActiveEvent e lastUndoneEvent guidano Ctrl+Z e Ctrl+Shift+Z', () => {
    expect(lastActiveEvent(log())?.id).toBe('c');
    expect(lastUndoneEvent(log())).toBeNull();
    const undone = undoEvent(log(), 'c');
    expect(lastActiveEvent(undone)?.id).toBe('b');
    expect(lastUndoneEvent(undone)?.id).toBe('c');
    expect(lastActiveEvent([])).toBeNull();
    expect(lastUndoneEvent([])).toBeNull();
  });
});

describe('rifiuti', () => {
  const config = tiny();

  it('rifiuta la doppia assegnazione dello stesso giocatore', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 3, teamId: 't01', price: 30, phase: 'D' }),
        makeEvent({ playerId: 3, teamId: 't02', price: 40, phase: 'D' }),
      ],
      config,
    );
    expect(state.rejections).toHaveLength(1);
    expect(state.rejections[0]?.reason).toBe('PLAYER_ALREADY_ASSIGNED');
    expect(state.rejections[0]?.detail).toMatch(/gia. assegnato a "t01" per 30/);
    expect(teamState(state, 't02').credits).toBe(100);
    expect(state.slotsFilled).toBe(1);
  });

  it('rifiuta l assegnazione su un ruolo con slot gia pieni', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 3, teamId: 't01', price: 10, phase: 'D' }),
        makeEvent({ playerId: 4, teamId: 't01', price: 10, phase: 'D' }),
      ],
      config,
    );
    expect(state.rejections[0]?.reason).toBe('ROLE_SLOTS_FULL');
    expect(state.rejections[0]?.detail).toMatch(/tutti gli slot D occupati/);
    expect(teamState(state, 't01').slotsFilledByRole.D).toBe(1);
  });

  it('rifiuta il prezzo che porterebbe i crediti sotto il floor di 1 per slot', () => {
    // 100 crediti, 4 slot liberi: il tetto e 100 - (4 - 1) = 97.
    const state = reduce([makeEvent({ playerId: 3, teamId: 't01', price: 98, phase: 'D' })], config);
    expect(state.rejections[0]?.reason).toBe('INSUFFICIENT_CREDITS');
    expect(state.rejections[0]?.detail).toMatch(/lasciano al massimo 97/);
    expect(teamState(state, 't01').credits).toBe(100);
  });

  it('accetta esattamente il tetto e lascia 1 credito per slot', () => {
    const state = reduce([makeEvent({ playerId: 3, teamId: 't01', price: 97, phase: 'D' })], config);
    expect(state.rejections).toEqual([]);
    const t1 = teamState(state, 't01');
    expect(t1.credits).toBe(3);
    expect(t1.slotsFree).toBe(3);
    expect(maxBidAssoluto(t1)).toBe(1);
  });

  it('il floor regge fino all ultimo slot', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 3, teamId: 't01', price: 97, phase: 'D' }),
        makeEvent({ playerId: 1, teamId: 't01', price: 1, phase: 'P' }),
        makeEvent({ playerId: 5, teamId: 't01', price: 1, phase: 'C' }),
        makeEvent({ playerId: 6, teamId: 't01', price: 1, phase: 'A' }),
      ],
      config,
    );
    expect(state.rejections).toEqual([]);
    const t1 = teamState(state, 't01');
    expect(t1.credits).toBe(0);
    expect(t1.slotsFree).toBe(0);
    expect(maxBidAssoluto(t1)).toBe(0);
  });

  it('rifiuta un giocatore fuori listone', () => {
    const state = reduce([makeEvent({ playerId: 999, teamId: 't01', price: 5, phase: 'D' })], config);
    expect(state.rejections[0]?.reason).toBe('UNKNOWN_PLAYER');
    expect(state.rejections[0]?.detail).toMatch(/#999 non presente nel listone/);
  });

  it('rifiuta una squadra inesistente', () => {
    const state = reduce([makeEvent({ playerId: 3, teamId: 'x', price: 5, phase: 'D' })], config);
    expect(state.rejections[0]?.reason).toBe('UNKNOWN_TEAM');
  });

  it('rifiuta prezzi non interi, nulli o negativi', () => {
    for (const price of [0, -3, 2.5, Number.NaN]) {
      const state = reduce([makeEvent({ playerId: 3, teamId: 't01', price, phase: 'D' })], config);
      expect(state.rejections[0]?.reason).toBe('INVALID_PRICE');
    }
  });

  it('rifiuta la fase incoerente col ruolo del giocatore', () => {
    const state = reduce([makeEvent({ playerId: 3, teamId: 't01', price: 5, phase: 'C' })], config);
    expect(state.rejections[0]?.reason).toBe('PHASE_MISMATCH');
    expect(state.rejections[0]?.detail).toMatch(/di ruolo D ma l'evento dichiara fase C/);
  });

  it('rifiuta un id evento duplicato', () => {
    const state = reduce(
      [
        makeEvent({ id: 'dup', playerId: 3, teamId: 't01', price: 5, phase: 'D' }),
        makeEvent({ id: 'dup', playerId: 4, teamId: 't02', price: 5, phase: 'D' }),
      ],
      config,
    );
    expect(state.rejections[0]?.reason).toBe('DUPLICATE_EVENT_ID');
  });

  it('un evento rifiutato non ferma quelli successivi', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 999, teamId: 't01', price: 5, phase: 'D' }),
        makeEvent({ playerId: 3, teamId: 't01', price: 5, phase: 'D' }),
      ],
      config,
    );
    expect(state.rejections).toHaveLength(1);
    expect(state.slotsFilled).toBe(1);
  });

  it('un evento annullato non finisce tra i rifiuti', () => {
    const state = reduce(
      [makeEvent({ playerId: 999, teamId: 't01', price: 5, phase: 'D', undone: true })],
      config,
    );
    expect(state.rejections).toEqual([]);
  });
});

describe('validateAssignment / resolveAssignment', () => {
  const config = tiny();
  const index = makePlayerIndex(config.players);

  it('restituisce null su evento valido e la ragione su evento invalido', () => {
    const state = initialLeagueState(config);
    const ok = makeEvent({ playerId: 3, teamId: 't01', price: 30, phase: 'D' });
    expect(validateAssignment(state, ok, index)).toBeNull();

    const ko = makeEvent({ playerId: 3, teamId: 't01', price: 999, phase: 'D' });
    expect(validateAssignment(state, ko, index)?.reason).toBe('INSUFFICIENT_CREDITS');
  });

  it('risolve giocatore e squadra quando l evento e valido', () => {
    const state = initialLeagueState(config);
    const resolution = resolveAssignment(
      state,
      makeEvent({ playerId: 5, teamId: 't02', price: 12, phase: 'C' }),
      index,
    );
    expect(resolution.ok).toBe(true);
    if (resolution.ok) {
      expect(resolution.player.id).toBe(5);
      expect(resolution.team.teamId).toBe('t02');
    }
  });
});

describe('maxBidAssoluto', () => {
  it('e crediti meno gli slot rimanenti oltre a quello che si sta riempiendo', () => {
    const config = makeLeagueConfig([]);
    const state = initialLeagueState(config);
    expect(maxBidAssoluto(teamState(state, 'leo'))).toBe(800 - 24);
  });

  it('vale 0 a rosa completa', () => {
    const config = makeTinyConfig({
      players: [makePlayer({ id: 1, role: 'P', quot: 3 })],
      teamCount: 1,
      creditsPerTeam: 50,
      slotsByRole: { P: 1, D: 0, C: 0, A: 0 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't01', price: 20, phase: 'P' })], config);
    const t1 = teamState(state, 't01');
    expect(t1.slotsFree).toBe(0);
    expect(maxBidAssoluto(t1)).toBe(0);
  });
});

describe('replay di 300 eventi sul listone reale', () => {
  const config = realConfig();
  const { events } = runAuction({ config, priceFor: payScaledByQuot(3) });

  it('genera esattamente 300 assegnazioni', () => {
    expect(events).toHaveLength(300);
  });

  it('ripiegato da zero produce 12 rose da 25 senza rifiuti', () => {
    const state = reduce(events, config);
    expect(state.rejections).toEqual([]);
    expect(state.slotsFilled).toBe(300);
    expect(state.appliedEventIds).toHaveLength(300);

    const teams = config.teams.map((t) => teamState(state, t.id));
    expect(teams).toHaveLength(12);
    for (const t of teams) {
      expect(t.slotsFilled).toBe(25);
      expect(t.slotsFree).toBe(0);
      expect(t.roster).toHaveLength(25);
      expect(t.slotsFilledByRole).toEqual({ P: 3, D: 8, C: 8, A: 6 });
      expect(t.credits).toBeGreaterThanOrEqual(0);
      expect(t.credits + t.spent).toBe(800);
    }
  });

  it('conserva i crediti di lega', () => {
    const state = reduce(events, config);
    const spent = config.teams.reduce((acc, t) => acc + teamState(state, t.id).spent, 0);
    expect(spent).toBe(state.creditsSpent);
    expect(state.creditsSpent).toBeLessThanOrEqual(9600);
  });

  it('non assegna due volte lo stesso giocatore', () => {
    const state = reduce(events, config);
    expect(Object.keys(state.assignmentByPlayerId)).toHaveLength(300);
    expect(new Set(events.map((e) => e.playerId)).size).toBe(300);
  });

  it('e deterministico: due pieghe dello stesso log danno lo stesso stato', () => {
    expect(reduce(events, config)).toEqual(reduce(events, config));
  });

  it('annullare un evento a meta log toglie solo quell acquisto', () => {
    const target = events[150] as AssignmentEvent;
    const state = reduce(undoEvent(events, target.id), config);
    expect(state.slotsFilled).toBe(299);
    expect(state.rejections).toEqual([]);
    expect(state.assignmentByPlayerId[target.playerId]).toBeUndefined();
    const t = teamState(state, target.teamId);
    expect(t.slotsFilled).toBe(24);
    expect(t.spent).toBe(800 - t.credits);
  });
});
