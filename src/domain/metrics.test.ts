import { beforeEach, describe, expect, it } from 'vitest';

import {
  ceilingsForAll,
  computeLeagueMetrics,
  computeReconciliation,
  maxBidAssoluto,
} from './metrics';
import { initialLeagueState, reduce, teamState } from './reducer';
import { makeNoteIndex } from './free-agents';
import { makeLeagueConfig } from './config';
import {
  makeEvent,
  makePlayer,
  makePlayerNote,
  makeRoster,
  makeTinyConfig,
  realConfig,
  resetEventCounter,
} from '../test/fixtures';
import { payScaledByQuot, runAuction } from '../test/replay';

beforeEach(() => resetEventCounter());

// ---------------------------------------------------------------------------
// §4.2
// ---------------------------------------------------------------------------

describe('§4.2 — max bid assoluto', () => {
  const config = realConfig();

  it('a inizio asta tutti i 12 partecipanti hanno lo stesso tetto', () => {
    const ceilings = ceilingsForAll(initialLeagueState(config), config);
    expect(ceilings).toHaveLength(12);
    for (const c of ceilings) {
      expect(c.credits).toBe(800);
      expect(c.slotsFree).toBe(25);
      expect(c.maxBidAssoluto).toBe(776);
    }
  });

  it('e calcolato per tutti, non solo per l utente', () => {
    const portiere = config.players.find((p) => p.role === 'P');
    expect(portiere).toBeDefined();
    const state = reduce(
      [makeEvent({ playerId: portiere?.id ?? 0, teamId: 'sq2', price: 100, phase: 'P' })],
      config,
    );
    const ceilings = ceilingsForAll(state, config);
    const sq2 = ceilings.find((c) => c.teamId === 'sq2');
    expect(sq2?.credits).toBe(700);
    expect(sq2?.slotsFree).toBe(24);
    expect(sq2?.maxBidAssoluto).toBe(677);
    expect(ceilings.find((c) => c.teamId === 'leo')?.maxBidAssoluto).toBe(776);
  });

  it('scende a 0 quando la rosa e completa', () => {
    const tiny = makeTinyConfig({
      players: [makePlayer({ id: 1, role: 'P', quot: 3 })],
      teamCount: 1,
      creditsPerTeam: 50,
      slotsByRole: { P: 1, D: 0, C: 0, A: 0 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't01', price: 10, phase: 'P' })], tiny);
    expect(ceilingsForAll(state, tiny)[0]?.maxBidAssoluto).toBe(0);
    expect(maxBidAssoluto(teamState(state, 't01'))).toBe(0);
  });

  it('non legge quot ne fvm: e aritmetica pura sui crediti', () => {
    const cheap = makeTinyConfig({
      players: [makePlayer({ id: 1, role: 'A', quot: 1, fvm: 1 })],
      teamCount: 1,
      creditsPerTeam: 60,
      slotsByRole: { P: 0, D: 0, C: 0, A: 3 },
    });
    const dear = makeTinyConfig({
      players: [makePlayer({ id: 1, role: 'A', quot: 35, fvm: 296 })],
      teamCount: 1,
      creditsPerTeam: 60,
      slotsByRole: { P: 0, D: 0, C: 0, A: 3 },
    });
    const a = ceilingsForAll(initialLeagueState(cheap), cheap)[0]?.maxBidAssoluto;
    const b = ceilingsForAll(initialLeagueState(dear), dear)[0]?.maxBidAssoluto;
    expect(a).toBe(58);
    expect(b).toBe(58);
  });
});

// ---------------------------------------------------------------------------
// §4.4
// ---------------------------------------------------------------------------

describe('§4.4 — riconciliazione', () => {
  const config = realConfig();

  it('a inizio asta: 0 spesi, 0 slot, tutto disponibile', () => {
    expect(computeReconciliation(initialLeagueState(config), config)).toEqual({
      creditsSpent: 0,
      creditsRemaining: 9600,
      totalCredits: 9600,
      slotsFilled: 0,
      slotsRemaining: 300,
      totalSlots: 300,
      consistent: true,
    });
  });

  it('somma spesa e slot su tutta la lega', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 2764, teamId: 'leo', price: 120, phase: 'A' }),
        makeEvent({ playerId: 5585, teamId: 'sq2', price: 90, phase: 'A' }),
      ],
      config,
    );
    const r = computeReconciliation(state, config);
    expect(r.creditsSpent).toBe(210);
    expect(r.creditsRemaining).toBe(9390);
    expect(r.slotsFilled).toBe(2);
    expect(r.slotsRemaining).toBe(298);
    expect(r.consistent).toBe(true);
  });

  it('ad asta completa gli slot sono 300 e i crediti residui non negativi', () => {
    const { finalState } = runAuction({ config, priceFor: payScaledByQuot(3) });
    const r = computeReconciliation(finalState, config);
    expect(r.slotsFilled).toBe(300);
    expect(r.slotsRemaining).toBe(0);
    expect(r.creditsRemaining).toBeGreaterThanOrEqual(0);
    expect(r.consistent).toBe(true);
  });

  it('segnala incoerenza se i crediti residui scendono sotto gli slot residui', () => {
    const tiny = makeTinyConfig({
      players: makeRoster('A', 4, 30, 1),
      teamCount: 1,
      creditsPerTeam: 10,
      slotsByRole: { P: 0, D: 0, C: 0, A: 2 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't01', price: 9, phase: 'A' })], tiny);
    expect(computeReconciliation(state, tiny).consistent).toBe(true);

    // Uno stato "sporco", come se arrivasse da un log manomesso.
    const broken = { ...state, creditsSpent: 10, slotsFilled: 1 };
    expect(computeReconciliation(broken, tiny).consistent).toBe(false);
  });

  it('segnala incoerenza se gli slot occupati superano quelli di lega', () => {
    const state = { ...initialLeagueState(config), slotsFilled: 301, creditsSpent: 0 };
    expect(computeReconciliation(state, config).consistent).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vista aggregata
// ---------------------------------------------------------------------------

describe('computeLeagueMetrics', () => {
  const config = realConfig();

  it('mette insieme svincolati, tetti e riconciliazione', () => {
    const m = computeLeagueMetrics(initialLeagueState(config), config);
    expect(m.freeAgents.total).toBe(516);
    expect(m.freeAgents.slotsFree).toBe(300);
    expect(m.ceilings).toHaveLength(12);
    expect(m.reconciliation.totalCredits).toBe(9600);
  });

  it('propaga le note ai conteggi degli obiettivi', () => {
    const targets = config.players
      .filter((p) => p.role === 'A')
      .slice(0, 4)
      .map((p) => makePlayerNote(p.id, 'preso di mira', 'obiettivo'));
    const m = computeLeagueMetrics(
      initialLeagueState(config),
      config,
      makeNoteIndex(targets),
    );
    expect(m.freeAgents.targetCountByRole.A).toBe(4);
    expect(m.freeAgents.totalTargets).toBe(4);
  });

  it('funziona anche su una lega senza listone', () => {
    const empty = makeLeagueConfig([]);
    const m = computeLeagueMetrics(initialLeagueState(empty), empty);
    expect(m.freeAgents.total).toBe(0);
    expect(m.reconciliation.slotsRemaining).toBe(300);
  });
});
