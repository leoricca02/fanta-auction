import { describe, expect, it } from 'vitest';

import { addTarget, isTarget, nextPriority, removeTarget, sortedTargets } from './objectives';
import { computeFreeAgents, makeNoteIndex } from './free-agents';
import { initialLeagueState } from './reducer';
import { makeLeagueConfig } from './config';
import {
  makeObjectives,
  makePlayer,
  makePlayerNote,
  makeUserData,
} from '../test/fixtures';

const NOW = 1_760_000_000_000;
const LATER = NOW + 1000;

const CONFIG = makeLeagueConfig([
  makePlayer({ id: 1, role: 'A', quot: 30, team: 'Inter' }),
  makePlayer({ id: 2, role: 'A', quot: 25, team: 'Milan' }),
  makePlayer({ id: 3, role: 'D', quot: 12, team: 'Roma' }),
]);

describe('nextPriority', () => {
  it('parte da 1 su lista vuota', () => {
    expect(nextPriority([])).toBe(1);
  });

  it('accoda dopo la priorita piu alta in uso', () => {
    expect(nextPriority([{ playerId: 1, priority: 3, note: '' }])).toBe(4);
    expect(
      nextPriority([
        { playerId: 1, priority: 7, note: '' },
        { playerId: 2, priority: 2, note: '' },
      ]),
    ).toBe(8);
  });
});

describe('addTarget — il tag segue la lista, ma non la sovrascrive', () => {
  it('crea la nota col tag obiettivo se il giocatore non ne ha nessuna', () => {
    const data = addTarget(makeUserData(), 1, { note: 'prima scelta', now: NOW });

    expect(data.objectives.targets).toEqual([{ playerId: 1, priority: 1, note: 'prima scelta' }]);
    expect(data.playerNotes).toEqual([
      { playerId: 1, text: '', tag: 'obiettivo', archived: false, updatedAt: NOW },
    ]);
    expect(data.objectives.updatedAt).toBe(NOW);
  });

  it('imposta il tag su una nota esistente che non ne ha', () => {
    const before = makeUserData({
      playerNotes: [makePlayerNote(1, 'gioca sempre', null, false, 1)],
    });
    const after = addTarget(before, 1, { now: NOW });

    expect(after.playerNotes[0]).toEqual({
      playerId: 1,
      text: 'gioca sempre',
      tag: 'obiettivo',
      archived: false,
      updatedAt: NOW,
    });
  });

  it('NON sovrascrive un tag gia esistente', () => {
    for (const tag of ['alternativa', 'evita'] as const) {
      const before = makeUserData({
        playerNotes: [makePlayerNote(1, 'giudizio mio', tag, false, 1)],
      });
      const after = addTarget(before, 1, { now: NOW });

      expect(after.playerNotes[0]?.tag).toBe(tag);
      expect(after.playerNotes[0]?.updatedAt).toBe(1);
      expect(isTarget(after, 1)).toBe(true);
    }
  });

  it('non tocca la nota se il tag e gia obiettivo', () => {
    const before = makeUserData({
      playerNotes: [makePlayerNote(1, 'gia marcato', 'obiettivo', false, 1)],
    });
    const after = addTarget(before, 1, { now: NOW });
    expect(after.playerNotes[0]).toEqual(before.playerNotes[0]);
  });

  it('non tocca le note degli altri giocatori', () => {
    const before = makeUserData({
      playerNotes: [makePlayerNote(2, 'altro', 'evita', false, 1), makePlayerNote(3, 'terzo')],
    });
    const after = addTarget(before, 1, { now: NOW });
    expect(after.playerNotes.find((n) => n.playerId === 2)?.tag).toBe('evita');
    expect(after.playerNotes.find((n) => n.playerId === 3)?.tag).toBeNull();
    expect(after.playerNotes).toHaveLength(3);
  });

  it('accoda in fondo e assegna la priorita successiva', () => {
    let data = addTarget(makeUserData(), 1, { now: NOW });
    data = addTarget(data, 2, { now: NOW });
    data = addTarget(data, 3, { now: NOW });
    expect(data.objectives.targets.map((t) => [t.playerId, t.priority])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('accetta una priorita esplicita', () => {
    const data = addTarget(makeUserData(), 1, { priority: 42, now: NOW });
    expect(data.objectives.targets[0]?.priority).toBe(42);
  });

  it('su un target gia presente aggiorna la nota conservando posizione e priorita', () => {
    let data = addTarget(makeUserData(), 1, { note: 'prima', now: NOW });
    data = addTarget(data, 2, { now: NOW });
    data = addTarget(data, 1, { note: 'seconda', now: LATER });

    expect(data.objectives.targets).toEqual([
      { playerId: 1, priority: 1, note: 'seconda' },
      { playerId: 2, priority: 2, note: '' },
    ]);
    expect(data.objectives.updatedAt).toBe(LATER);
  });

  it('senza opzioni usa l orologio, nota vuota e priorita in coda', () => {
    const before = Date.now();
    const data = addTarget(makeUserData(), 1);
    const after = Date.now();

    expect(data.objectives.targets).toEqual([{ playerId: 1, priority: 1, note: '' }]);
    expect(data.objectives.updatedAt).toBeGreaterThanOrEqual(before);
    expect(data.objectives.updatedAt).toBeLessThanOrEqual(after);
    expect(data.playerNotes[0]?.updatedAt).toBe(data.objectives.updatedAt);
  });

  it('un secondo addTarget senza nota conserva quella gia scritta', () => {
    const first = addTarget(makeUserData(), 1, { note: 'la mia nota', now: NOW });
    const second = addTarget(first, 1, { now: LATER });
    expect(second.objectives.targets[0]?.note).toBe('la mia nota');
    expect(second.objectives.targets[0]?.priority).toBe(1);
  });

  it('imposta il tag sul giocatore giusto quando ci sono altre note senza tag', () => {
    const before = makeUserData({
      playerNotes: [
        makePlayerNote(2, 'altro senza tag', null, false, 1),
        makePlayerNote(1, 'il mio', null, false, 1),
        makePlayerNote(3, 'terzo senza tag', null, false, 1),
      ],
    });
    const after = addTarget(before, 1, { now: NOW });

    expect(after.playerNotes.find((n) => n.playerId === 1)?.tag).toBe('obiettivo');
    expect(after.playerNotes.find((n) => n.playerId === 2)).toEqual(before.playerNotes[0]);
    expect(after.playerNotes.find((n) => n.playerId === 3)).toEqual(before.playerNotes[2]);
  });

  it('non muta lo stato in ingresso', () => {
    const before = makeUserData({ objectives: makeObjectives('piano', [], 1) });
    const snapshot = JSON.parse(JSON.stringify(before)) as unknown;
    addTarget(before, 1, { now: NOW });
    expect(before).toEqual(snapshot);
  });

  it('conserva il testo libero degli obiettivi', () => {
    const before = makeUserData({ objectives: makeObjectives('la mia strategia', [], 1) });
    expect(addTarget(before, 1, { now: NOW }).objectives.text).toBe('la mia strategia');
  });

  it('il tag appena messo entra subito nei conteggi di §4.3', () => {
    const data = addTarget(makeUserData(), 1, { now: NOW });
    const free = computeFreeAgents(
      initialLeagueState(CONFIG),
      CONFIG,
      makeNoteIndex(data.playerNotes),
    );
    expect(free.targetCountByRole.A).toBe(1);
    expect(free.totalTargets).toBe(1);
  });

  it('un target su un giocatore marcato "evita" non gonfia il conteggio obiettivi', () => {
    const before = makeUserData({ playerNotes: [makePlayerNote(1, '', 'evita', false, 1)] });
    const data = addTarget(before, 1, { now: NOW });
    const free = computeFreeAgents(
      initialLeagueState(CONFIG),
      CONFIG,
      makeNoteIndex(data.playerNotes),
    );
    expect(free.totalTargets).toBe(0);
    expect(isTarget(data, 1)).toBe(true);
  });
});

describe('removeTarget — non tocca il tag', () => {
  it('toglie dalla lista e lascia il tag dov era', () => {
    const withTarget = addTarget(makeUserData(), 1, { note: 'x', now: NOW });
    expect(withTarget.playerNotes[0]?.tag).toBe('obiettivo');

    const after = removeTarget(withTarget, 1, LATER);
    expect(after.objectives.targets).toEqual([]);
    expect(after.playerNotes).toEqual(withTarget.playerNotes);
    expect(after.playerNotes[0]?.tag).toBe('obiettivo');
    expect(after.objectives.updatedAt).toBe(LATER);
  });

  it('lascia intatto anche un tag diverso da obiettivo', () => {
    const before = makeUserData({ playerNotes: [makePlayerNote(1, '', 'alternativa', false, 1)] });
    const after = removeTarget(addTarget(before, 1, { now: NOW }), 1, LATER);
    expect(after.playerNotes[0]?.tag).toBe('alternativa');
  });

  it('toglie solo il target richiesto', () => {
    let data = addTarget(makeUserData(), 1, { now: NOW });
    data = addTarget(data, 2, { now: NOW });
    data = addTarget(data, 3, { now: NOW });

    const after = removeTarget(data, 2, LATER);
    expect(after.objectives.targets.map((t) => t.playerId)).toEqual([1, 3]);
    expect(after.playerNotes).toHaveLength(3);
  });

  it('su un giocatore che non e target restituisce lo stesso oggetto', () => {
    const data = addTarget(makeUserData(), 1, { now: NOW });
    expect(removeTarget(data, 999, LATER)).toBe(data);
  });

  it('senza now usa l orologio', () => {
    const data = addTarget(makeUserData(), 1, { now: NOW });
    const before = Date.now();
    const after = removeTarget(data, 1);
    expect(after.objectives.updatedAt).toBeGreaterThanOrEqual(before);
    expect(after.objectives.updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it('non muta lo stato in ingresso', () => {
    const data = addTarget(makeUserData(), 1, { now: NOW });
    const snapshot = JSON.parse(JSON.stringify(data)) as unknown;
    removeTarget(data, 1, LATER);
    expect(data).toEqual(snapshot);
  });

  it('togliere e rimettere un target non duplica niente', () => {
    let data = addTarget(makeUserData(), 1, { note: 'prima', now: NOW });
    data = removeTarget(data, 1, LATER);
    data = addTarget(data, 1, { note: 'di nuovo', now: LATER });

    expect(data.objectives.targets).toEqual([{ playerId: 1, priority: 1, note: 'di nuovo' }]);
    expect(data.playerNotes).toHaveLength(1);
  });
});

describe('lettura della lista', () => {
  it('isTarget riconosce chi e in lista', () => {
    const data = addTarget(makeUserData(), 1, { now: NOW });
    expect(isTarget(data, 1)).toBe(true);
    expect(isTarget(data, 2)).toBe(false);
  });

  it('sortedTargets ordina per priorita, poi per id', () => {
    const data = makeUserData({
      objectives: makeObjectives(
        '',
        [
          { playerId: 3, priority: 2, note: '' },
          { playerId: 1, priority: 2, note: '' },
          { playerId: 2, priority: 1, note: '' },
        ],
        NOW,
      ),
    });
    expect(sortedTargets(data).map((t) => t.playerId)).toEqual([2, 1, 3]);
  });

  it('sortedTargets non muta la lista originale', () => {
    const data = makeUserData({
      objectives: makeObjectives(
        '',
        [
          { playerId: 3, priority: 2, note: '' },
          { playerId: 2, priority: 1, note: '' },
        ],
        NOW,
      ),
    });
    sortedTargets(data);
    expect(data.objectives.targets.map((t) => t.playerId)).toEqual([3, 2]);
  });
});
