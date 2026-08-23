import { beforeEach, describe, expect, it } from 'vitest';

import {
  QUOT_CHANGE_THRESHOLD_PCT,
  applyListoneChange,
  assessImpact,
  blockingReason,
  diffListone,
  planListoneImport,
  planTouchesUserData,
} from './listone-diff';
import { initialLeagueState, reduce } from './reducer';
import { lineupStatus, makeLineupIndex } from './lineup';
import type { Player } from './types';
import {
  makeEvent,
  makeLineup,
  makeObjectives,
  makePlayer,
  makePlayerNote,
  makeSlot,
  makeTinyConfig,
  makeUserData,
  realConfig,
  realListone,
  resetEventCounter,
} from '../test/fixtures';

beforeEach(() => resetEventCounter());

const NOW = 1_760_000_000_000;

function p(id: number, team = 'Inter', quot = 20): Player {
  return makePlayer({ id, role: 'D', quot, team, name: `P${id}` });
}

// ---------------------------------------------------------------------------
// diffListone
// ---------------------------------------------------------------------------

describe('§2 — diff fra due listoni', () => {
  it('riconosce nuovi, usciti e confermati', () => {
    const before = [p(1), p(2), p(3)];
    const after = [p(2), p(3), p(4)];
    const diff = diffListone(before, after);

    expect(diff.added.map((x) => x.id)).toEqual([4]);
    expect(diff.removed.map((x) => x.id)).toEqual([1]);
    expect(diff.kept).toBe(2);
  });

  it('riconosce il cambio squadra e porta il club nuovo', () => {
    const diff = diffListone([p(1, 'Inter')], [p(1, 'Milan')]);
    expect(diff.teamChanged).toEqual([
      { player: expect.objectContaining({ id: 1, team: 'Milan' }), from: 'Inter', to: 'Milan' },
    ]);
  });

  it('segnala le quotazioni oltre la soglia, e solo quelle', () => {
    const before = [p(1, 'Inter', 20), p(2, 'Inter', 20), p(3, 'Inter', 20)];
    const after = [
      p(1, 'Inter', 25), // +25%: sopra soglia
      p(2, 'Inter', 23), // +15%: rumore
      p(3, 'Inter', 15), // -25%: sopra soglia
    ];
    const diff = diffListone(before, after);
    expect(diff.quotChanged.map((c) => c.player.id)).toEqual([1, 3]);
    expect(diff.quotChanged[0]?.deltaPct).toBeCloseTo(25, 6);
    expect(diff.quotChanged[1]?.deltaPct).toBeCloseTo(-25, 6);
  });

  it('la soglia e inclusiva', () => {
    expect(QUOT_CHANGE_THRESHOLD_PCT).toBe(20);
    const esatta = diffListone([p(1, 'Inter', 10)], [p(1, 'Inter', 12)]);
    expect(esatta.quotChanged).toHaveLength(1);
    const sotto = diffListone([p(1, 'Inter', 100)], [p(1, 'Inter', 119)]);
    expect(sotto.quotChanged).toEqual([]);
  });

  it('una quotazione che parte da zero non divide per zero', () => {
    expect(diffListone([p(1, 'Inter', 0)], [p(1, 'Inter', 5)]).quotChanged[0]?.deltaPct).toBe(100);
    expect(diffListone([p(1, 'Inter', 0)], [p(1, 'Inter', 0)]).quotChanged).toEqual([]);
  });

  it('un giocatore puo cambiare squadra e quotazione insieme', () => {
    const diff = diffListone([p(1, 'Inter', 10)], [p(1, 'Milan', 20)]);
    expect(diff.teamChanged).toHaveLength(1);
    expect(diff.quotChanged).toHaveLength(1);
  });

  it('due listoni identici non producono niente', () => {
    const listone = realListone();
    const diff = diffListone(listone, listone);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.teamChanged).toEqual([]);
    expect(diff.quotChanged).toEqual([]);
    expect(diff.kept).toBe(516);
  });

  it('il primo import e tutto nuovo', () => {
    const diff = diffListone([], realListone());
    expect(diff.added).toHaveLength(516);
    expect(diff.removed).toEqual([]);
    expect(diff.kept).toBe(0);
  });

  it('un listone svuotato e tutto uscito', () => {
    const diff = diffListone(realListone(), []);
    expect(diff.removed).toHaveLength(516);
    expect(diff.added).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// assessImpact
// ---------------------------------------------------------------------------

describe('§2 — impatto sui dati utente', () => {
  const data = makeUserData({
    playerNotes: [
      makePlayerNote(1, 'gioca sempre', null, false, NOW),
      makePlayerNote(2, '', 'evita', false, NOW),
      makePlayerNote(3, '   ', null, false, NOW),
    ],
    objectives: makeObjectives('piano', [{ playerId: 4, priority: 1, note: '' }], NOW),
    lineups: [
      makeLineup('Inter', [makeSlot('D1', [5]), makeSlot('D2', [6, 7])], '4-3-3', NOW),
    ],
  });

  it('dice perche un uscito ti riguarda', () => {
    const diff = diffListone([p(1), p(2), p(3), p(4), p(5)], []);
    const impact = assessImpact(diff, data);

    const byId = new Map(impact.removedWithData.map((a) => [a.player.id, a.reasons]));
    expect(byId.get(1)).toEqual(['nota']);
    expect(byId.get(2)).toEqual(['tag']);
    expect(byId.get(4)).toEqual(['obiettivo']);
    expect(byId.get(5)).toEqual(['formazione']);
    // Il 3 ha una nota fatta di soli spazi: non e' lavoro da segnalare.
    expect(byId.has(3)).toBe(false);
  });

  it('accumula piu ragioni sullo stesso giocatore', () => {
    const ricco = makeUserData({
      playerNotes: [makePlayerNote(5, 'titolare', 'obiettivo', false, NOW)],
      objectives: makeObjectives('', [{ playerId: 5, priority: 1, note: '' }], NOW),
      lineups: [makeLineup('Inter', [makeSlot('D1', [5])], '4-3-3', NOW)],
    });
    const impact = assessImpact(diffListone([p(5)], []), ricco);
    expect(impact.removedWithData[0]?.reasons).toEqual([
      'nota',
      'tag',
      'obiettivo',
      'formazione',
    ]);
  });

  it('conta gli usciti anche quando non ti riguardano', () => {
    const impact = assessImpact(diffListone([p(90), p(91)], []), data);
    expect(impact.removedCount).toBe(2);
    expect(impact.removedWithData).toEqual([]);
  });

  it('segnala chi cambia squadra restando schierato nel vecchio club', () => {
    const diff = diffListone([p(5, 'Inter')], [p(5, 'Milan')]);
    const impact = assessImpact(diff, data);
    expect(impact.teamChangedInLineup).toHaveLength(1);
    expect(impact.teamChangedInLineup[0]?.from).toBe('Inter');
    expect(impact.lineupsTouched).toEqual(['Inter']);
  });

  it('ignora chi cambia squadra ma non e schierato', () => {
    const diff = diffListone([p(99, 'Inter')], [p(99, 'Milan')]);
    expect(assessImpact(diff, data).teamChangedInLineup).toEqual([]);
  });

  it('conta gli slot che resteranno vuoti, non quelli che si assottigliano', () => {
    // D1 ha solo il 5 e resta vuoto; D2 ha 6 e 7, e perdendo il 6 resta pieno.
    const impact = assessImpact(diffListone([p(5), p(6)], []), data);
    expect(impact.slotsEmptied).toBe(1);
    expect(impact.lineupsTouched).toEqual(['Inter']);
  });

  it('senza dati utente l impatto e vuoto', () => {
    const impact = assessImpact(diffListone([p(1), p(2)], []), makeUserData());
    expect(impact.removedWithData).toEqual([]);
    expect(impact.lineupsTouched).toEqual([]);
    expect(impact.slotsEmptied).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// blockingReason
// ---------------------------------------------------------------------------

describe('§2 — blocco ad asta iniziata', () => {
  const config = makeTinyConfig({
    players: [makePlayer({ id: 1, role: 'P', quot: 5 })],
    teamCount: 2,
  });

  it('a log vuoto non blocca', () => {
    expect(blockingReason(initialLeagueState(config))).toBeNull();
  });

  it('una sola assegnazione attiva blocca', () => {
    const state = reduce(
      [makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P' })],
      config,
    );
    expect(blockingReason(state)).toEqual({ reason: 'ACTIVE_ASSIGNMENTS', count: 1 });
  });

  it('un evento annullato non blocca: non e piu attivo', () => {
    const state = reduce(
      [makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P', undone: true })],
      config,
    );
    expect(blockingReason(state)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyListoneChange
// ---------------------------------------------------------------------------

describe('§2 — applicazione: archivia, non cancella', () => {
  const data = makeUserData({
    playerNotes: [
      makePlayerNote(1, 'nota importante', 'obiettivo', false, NOW),
      makePlayerNote(2, 'resta', 'evita', false, NOW),
    ],
    objectives: makeObjectives('il mio piano', [{ playerId: 1, priority: 1, note: 'x' }], NOW),
    lineups: [
      makeLineup('Inter', [makeSlot('D1', [1]), makeSlot('D2', [2, 3])], '4-3-3', NOW),
    ],
  });

  function apply(before: Player[], after: Player[]) {
    const diff = diffListone(before, after);
    return applyListoneChange(data, diff, assessImpact(diff, data), NOW + 1000);
  }

  it('archivia la nota di chi esce, senza perdere testo ne tag', () => {
    const next = apply([p(1), p(2)], [p(2)]);
    const nota = next.playerNotes.find((n) => n.playerId === 1);
    expect(nota).toMatchObject({
      text: 'nota importante',
      tag: 'obiettivo',
      archived: true,
      updatedAt: NOW + 1000,
    });
  });

  it('non tocca le note di chi resta', () => {
    const next = apply([p(1), p(2)], [p(2)]);
    expect(next.playerNotes.find((n) => n.playerId === 2)).toEqual(data.playerNotes[1]);
  });

  it('toglie gli usciti dalle formazioni, dove sarebbero id fantasma', () => {
    const next = apply([p(1), p(2), p(3)], [p(2), p(3)]);
    const inter = next.lineups[0];
    expect(inter?.slots.find((s) => s.slotId === 'D1')?.candidates).toEqual([]);
    expect(inter?.slots.find((s) => s.slotId === 'D2')?.candidates).toEqual([2, 3]);
    expect(inter?.updatedAt).toBe(NOW + 1000);
  });

  it('toglie dal vecchio club chi ha cambiato squadra', () => {
    const next = apply([p(2, 'Inter')], [p(2, 'Milan')]);
    expect(next.lineups[0]?.slots.find((s) => s.slotId === 'D2')?.candidates).toEqual([3]);
  });

  it('non tocca obiettivi ne testo libero: sono il tuo piano, non il listone', () => {
    const next = apply([p(1), p(2)], [p(2)]);
    expect(next.objectives).toEqual(data.objectives);
  });

  it('non muta i dati in ingresso', () => {
    const snapshot = JSON.parse(JSON.stringify(data)) as unknown;
    apply([p(1), p(2)], []);
    expect(data).toEqual(snapshot);
  });

  it('un import senza cambiamenti lascia tutto identico', () => {
    const next = apply([p(1), p(2), p(3)], [p(1), p(2), p(3)]);
    expect(next).toEqual(data);
  });

  it('non riarchivia una nota gia archiviata', () => {
    const conArchiviata = makeUserData({
      playerNotes: [makePlayerNote(1, 'vecchia', null, true, NOW)],
    });
    const diff = diffListone([p(1)], []);
    const next = applyListoneChange(
      conArchiviata,
      diff,
      assessImpact(diff, conArchiviata),
      NOW + 1000,
    );
    expect(next.playerNotes[0]?.updatedAt).toBe(NOW);
  });

  it('dopo la pulizia lo stato di formazione non mente piu', () => {
    const next = apply([p(1), p(2), p(3)], [p(2), p(3)]);
    const index = makeLineupIndex(next.lineups);
    // Il giocatore 1 e' uscito: non risulta piu' titolare di uno slot vuoto.
    expect(lineupStatus(1, 'Inter', index)).toBe('PANCHINA');
    expect(lineupStatus(2, 'Inter', index)).toBe('BALLOTTAGGIO');
  });
});

// ---------------------------------------------------------------------------
// planListoneImport
// ---------------------------------------------------------------------------

describe('§2 — piano di import', () => {
  const config = realConfig();

  it('il primo import e dichiarato tale e non blocca', () => {
    const plan = planListoneImport({
      current: [],
      next: realListone(),
      data: makeUserData(),
      state: initialLeagueState(config),
      now: NOW,
    });
    expect(plan.firstImport).toBe(true);
    expect(plan.blocked).toBeNull();
    expect(plan.diff.added).toHaveLength(516);
    expect(planTouchesUserData(plan)).toBe(false);
  });

  it('blocca se ci sono assegnazioni attive', () => {
    const lautaro = config.players.find((x) => x.name === 'Martinez L.') as Player;
    const state = reduce(
      [makeEvent({ playerId: lautaro.id, teamId: 'leo', price: 100, phase: 'A' })],
      config,
    );
    const plan = planListoneImport({
      current: realListone(),
      next: realListone(),
      data: makeUserData(),
      state,
      now: NOW,
    });
    expect(plan.blocked).toEqual({ reason: 'ACTIVE_ASSIGNMENTS', count: 1 });
  });

  it('planTouchesUserData distingue un import innocuo da uno che ti costa lavoro', () => {
    const data = makeUserData({
      lineups: [makeLineup('Inter', [makeSlot('D1', [1])], '4-3-3', NOW)],
    });
    const state = initialLeagueState(config);

    const innocuo = planListoneImport({
      current: [p(1), p(2)],
      next: [p(1), p(2), p(3)],
      data,
      state,
      now: NOW,
    });
    expect(planTouchesUserData(innocuo)).toBe(false);

    const costoso = planListoneImport({
      current: [p(1), p(2)],
      next: [p(2)],
      data,
      state,
      now: NOW,
    });
    expect(planTouchesUserData(costoso)).toBe(true);
    expect(costoso.impact.slotsEmptied).toBe(1);
  });

  it('senza now usa l orologio', () => {
    const data = makeUserData({ playerNotes: [makePlayerNote(1, 'x', null, false, 1)] });
    const before = Date.now();
    const plan = planListoneImport({
      current: [p(1)],
      next: [],
      data,
      state: initialLeagueState(config),
    });
    const archiviata = plan.nextUserData.playerNotes[0];
    expect(archiviata?.archived).toBe(true);
    expect(archiviata?.updatedAt).toBeGreaterThanOrEqual(before);
    expect(archiviata?.updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it('nextUserData e pronto da persistere', () => {
    const data = makeUserData({
      playerNotes: [makePlayerNote(1, 'studio', 'obiettivo', false, NOW)],
      lineups: [makeLineup('Inter', [makeSlot('D1', [1])], '4-3-3', NOW)],
    });
    const plan = planListoneImport({
      current: [p(1)],
      next: [],
      data,
      state: initialLeagueState(config),
      now: NOW + 5,
    });
    expect(plan.nextUserData.playerNotes[0]?.archived).toBe(true);
    expect(plan.nextUserData.lineups[0]?.slots[0]?.candidates).toEqual([]);
  });
});
