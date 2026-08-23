import { beforeEach, describe, expect, it } from 'vitest';

import {
  AGGRESSIVENESS_MIN_SAMPLE,
  SCARCITY_ALERT_THRESHOLD,
  aggressivenessForAll,
  ceilingsForAll,
  computeAggressiveness,
  computeLeagueMetrics,
  computePhaseInflation,
  computeReconciliation,
  computeScarcity,
  maxBidRagionevole,
  residualPlannedShares,
  scarcityByRole,
} from './metrics';
import { initialLeagueState, makePlayerIndex, reduce, teamState } from './reducer';
import { residualPool } from './pool';
import { computePricingModel } from './pricing';
import { DEFAULT_SLOTS_BY_ROLE, makeLeagueConfig, makeTeams } from './config';
import type { ByRole, Role } from './types';
import {
  makeEvent,
  makePlayer,
  makeRoster,
  findPlayer,
  makeTinyConfig,
  realBuilt,
  realConfig,
  resetEventCounter,
} from '../test/fixtures';
import { payExpected, runAuction } from '../test/replay';

beforeEach(() => resetEventCounter());

const MARGINALE: ByRole<number> = { P: 3, D: 13, C: 16, A: 10 };

// ---------------------------------------------------------------------------
// §4.3
// ---------------------------------------------------------------------------

describe('§4.3 — max bid assoluto', () => {
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
    const state = reduce(
      [makeEvent({ playerId: config.players[0]?.id ?? 0, teamId: 'sq2', price: 100, phase: 'P' })],
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
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 10, phase: 'P' })], tiny);
    expect(ceilingsForAll(state, tiny)[0]?.maxBidAssoluto).toBe(0);
  });
});

describe('§4.3 — max bid ragionevole', () => {
  const config = realConfig();

  it('riserva solo le fasi future, non quella corrente', () => {
    const leo = teamState(initialLeagueState(config), 'leo');
    // In fase P riserva D, C, A: 8*13 + 8*16 + 6*10 = 104 + 128 + 60 = 292.
    expect(maxBidRagionevole(leo, 'P', MARGINALE)).toBe(800 - 292);
    // In fase C riserva solo A: 6*10 = 60.
    expect(maxBidRagionevole(leo, 'C', MARGINALE)).toBe(800 - 60);
  });

  it('nell ultima fase coincide con i crediti disponibili', () => {
    const leo = teamState(initialLeagueState(config), 'leo');
    expect(maxBidRagionevole(leo, 'A', MARGINALE)).toBe(800);
  });

  it('tiene conto degli slot gia riempiti nelle fasi future', () => {
    const state = reduce(
      [
        makeEvent({ playerId: 2764, teamId: 'leo', price: 100, phase: 'A' }),
        makeEvent({ playerId: 5585, teamId: 'leo', price: 100, phase: 'A' }),
      ],
      config,
    );
    const leo = teamState(state, 'leo');
    expect(leo.slotsFreeByRole.A).toBe(4);
    expect(maxBidRagionevole(leo, 'C', MARGINALE)).toBe(600 - 4 * 10);
  });

  it('puo essere negativo se i crediti non bastano per le fasi future', () => {
    const tiny = makeTinyConfig({
      players: makeRoster('P', 4, 10, 1).concat(makeRoster('A', 4, 10, 10)),
      teamCount: 2,
      creditsPerTeam: 20,
      slotsByRole: { P: 1, D: 0, C: 0, A: 1 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 18, phase: 'P' })], tiny);
    const t1 = teamState(state, 't1');
    expect(t1.credits).toBe(2);
    expect(maxBidRagionevole(t1, 'P', { P: 0, D: 0, C: 0, A: 10 })).toBe(-8);
  });
});

// ---------------------------------------------------------------------------
// §4.4
// ---------------------------------------------------------------------------

describe('§4.4 — scarcity della fase attiva', () => {
  const config = realConfig();
  const pool = residualPool(initialLeagueState(config), config);

  it('riproduce i rapporti pool/slot di §2.1 a inizio asta', () => {
    const s = scarcityByRole(pool);
    expect(s.P.poolResiduo).toBe(63);
    expect(s.D.poolResiduo).toBe(181);
    expect(s.C.poolResiduo).toBe(184);
    expect(s.A.poolResiduo).toBe(88);
    expect(s.P.slotResidui).toBe(36);
    expect(Number((1 / (s.P.pressione ?? 0)).toFixed(2))).toBe(1.75);
    expect(Number((1 / (s.D.pressione ?? 0)).toFixed(2))).toBe(1.89);
    expect(Number((1 / (s.C.pressione ?? 0)).toFixed(2))).toBe(1.92);
    expect(Number((1 / (s.A.pressione ?? 0)).toFixed(2))).toBe(1.22);
  });

  it('la fase A e in alert fin dal primo secondo dell asta', () => {
    const s = scarcityByRole(pool);
    // 72 slot su 88 attaccanti: pressione 0.818, sopra la soglia di §4.4.
    // Non e un caso limite, e la condizione di partenza del ruolo A.
    for (const role of ['P', 'D', 'C'] as const) {
      expect(s[role].pressione).toBeLessThan(SCARCITY_ALERT_THRESHOLD);
      expect(s[role].alert).toBe(false);
    }
    expect(s.A.pressione).toBeCloseTo(72 / 88, 12);
    expect(s.A.pressione).toBeGreaterThan(SCARCITY_ALERT_THRESHOLD);
    expect(s.A.alert).toBe(true);
  });

  it('la fase A e la piu tesa, come dice §2.1', () => {
    const s = scarcityByRole(pool);
    expect(s.A.pressione).toBeGreaterThan(s.C.pressione ?? 0);
    expect(s.A.pressione).toBeGreaterThan(s.D.pressione ?? 0);
  });

  it('la soglia tier restringe il pool considerato', () => {
    const all = computeScarcity(pool, 'A');
    const topTwo = computeScarcity(pool, 'A', { maxTier: 2 });
    expect(topTwo.poolResiduo).toBeLessThan(all.poolResiduo);
    expect(topTwo.slotResidui).toBe(all.slotResidui);
    expect(topTwo.pressione).toBeGreaterThan(all.pressione ?? 0);
    expect(topTwo.alert).toBe(true);
  });

  it('alza l alert oltre 0.8', () => {
    const tiny = makeTinyConfig({
      players: makeRoster('A', 5, 30, 1),
      teamCount: 2,
      slotsByRole: { P: 0, D: 0, C: 0, A: 2 },
    });
    const p = residualPool(initialLeagueState(tiny), tiny);
    const s = computeScarcity(p, 'A');
    expect(s.slotResidui).toBe(4);
    expect(s.poolResiduo).toBe(5);
    expect(s.pressione).toBe(0.8);
    expect(s.alert).toBe(false); // la soglia e' stretta: 0.8 non basta

    const tighter = makeTinyConfig({
      players: makeRoster('A', 4, 30, 1),
      teamCount: 2,
      slotsByRole: { P: 0, D: 0, C: 0, A: 2 },
    });
    const s2 = computeScarcity(residualPool(initialLeagueState(tighter), tighter), 'A');
    expect(s2.pressione).toBe(1);
    expect(s2.alert).toBe(true);
  });

  it('con pool vuoto la pressione e null e l alert dipende dagli slot', () => {
    const empty = makeTinyConfig({
      players: makeRoster('A', 1, 5, 1),
      teamCount: 1,
      slotsByRole: { P: 1, D: 0, C: 0, A: 1 },
    });
    const p = residualPool(initialLeagueState(empty), empty);
    const noPlayers = computeScarcity(p, 'P');
    expect(noPlayers.poolResiduo).toBe(0);
    expect(noPlayers.slotResidui).toBe(1);
    expect(noPlayers.pressione).toBeNull();
    expect(noPlayers.alert).toBe(true);

    const noSlots = computeScarcity(p, 'D');
    expect(noSlots.slotResidui).toBe(0);
    expect(noSlots.pressione).toBeNull();
    expect(noSlots.alert).toBe(false);
  });

  it('a fase terminata la pressione va a 0, non a null', () => {
    const tiny = makeTinyConfig({
      players: makeRoster('P', 3, 8, 1),
      teamCount: 1,
      slotsByRole: { P: 1, D: 0, C: 0, A: 0 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 5, phase: 'P' })], tiny);
    const s = computeScarcity(residualPool(state, tiny), 'P');
    expect(s.slotResidui).toBe(0);
    expect(s.poolResiduo).toBe(2);
    expect(s.pressione).toBe(0);
    expect(s.alert).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §4.5
// ---------------------------------------------------------------------------

describe('§4.5 — inflazione della fase', () => {
  const config = realConfig();
  const model = realBuilt().model;

  it('a inizio asta le quote residue coincidono con quelle di §4.2', () => {
    const pool = residualPool(initialLeagueState(config), config);
    const shares = residualPlannedShares(pool, model);
    expect(shares.P).toBeCloseTo(model.budgetSplitByRole.P, 12);
    expect(shares.A).toBeCloseTo(model.budgetSplitByRole.A, 12);
    expect(shares.P + shares.D + shares.C + shares.A).toBeCloseTo(1, 12);
  });

  it('ridistribuisce le quote sulle fasi ancora aperte', () => {
    const { events } = runAuction({ config, priceFor: payExpected, maxSteps: 36 });
    const state = reduce(events, config);
    const pool = residualPool(state, config);
    expect(pool.slotsByRole.P).toBe(0);
    const shares = residualPlannedShares(pool, model);
    expect(shares.P).toBe(0);
    expect(shares.D + shares.C + shares.A).toBeCloseTo(1, 12);
    expect(shares.C).toBeGreaterThan(model.budgetSplitByRole.C);
  });

  it('ad asta finita tutte le quote sono 0', () => {
    const { finalState } = runAuction({ config, priceFor: payExpected });
    const shares = residualPlannedShares(residualPool(finalState, config), model);
    expect(shares).toEqual({ P: 0, D: 0, C: 0, A: 0 });
  });

  it('a inizio asta l inflazione della fase P e vicina a 1', () => {
    const pool = residualPool(initialLeagueState(config), config);
    const inflation = computePhaseInflation(
      initialLeagueState(config),
      config,
      model,
      pool,
      'P',
      {},
    );
    expect(inflation.phase).toBe('P');
    // 12 x 800 x 8.4% = 810 di crediti pianificati.
    expect(inflation.expectedCreditsOnPhase).toBeCloseTo(810, 0);
    // Il valore di pool e 806, non 810: somma di 36 prezzi arrotondati
    // singolarmente, mentre 810 e round(240 x f) sulla somma delle QUOT.
    expect(inflation.poolExpectedValue).toBe(806);
    expect(inflation.inflazione).toBeCloseTo(1, 1);
  });

  it('il piano personale dell utente sostituisce la baseline solo per lui', () => {
    const state = initialLeagueState(config);
    const pool = residualPool(state, config);
    const neutral = computePhaseInflation(state, config, model, pool, 'P');
    const planned = computePhaseInflation(state, config, model, pool, 'P', {
      userPlan: { P: 200 },
    });
    // L'utente pianifica 200 invece di ~67,5: +132,5 sulla fase.
    expect(planned.expectedCreditsOnPhase - neutral.expectedCreditsOnPhase).toBeCloseTo(132.5, 0);
    expect(planned.inflazione ?? 0).toBeGreaterThan(neutral.inflazione ?? 0);
  });

  it('il piano personale e comunque limitato dai crediti disponibili', () => {
    const state = initialLeagueState(config);
    const pool = residualPool(state, config);
    const absurd = computePhaseInflation(state, config, model, pool, 'P', {
      userPlan: { P: 100_000 },
    });
    const neutral = computePhaseInflation(state, config, model, pool, 'P');
    expect(absurd.expectedCreditsOnPhase - neutral.expectedCreditsOnPhase).toBeCloseTo(
      800 - 800 * model.budgetSplitByRole.P,
      0,
    );
  });

  it('il piano personale su un altra fase non tocca quella corrente', () => {
    const state = initialLeagueState(config);
    const pool = residualPool(state, config);
    const withPlan = computePhaseInflation(state, config, model, pool, 'P', { userPlan: { A: 500 } });
    const neutral = computePhaseInflation(state, config, model, pool, 'P');
    expect(withPlan.expectedCreditsOnPhase).toBeCloseTo(neutral.expectedCreditsOnPhase, 9);
  });

  it('con pool della fase vuoto l inflazione e null invece di dividere per zero', () => {
    const { finalState } = runAuction({ config, priceFor: payExpected });
    const pool = residualPool(finalState, config);
    const inflation = computePhaseInflation(finalState, config, model, pool, 'A');
    expect(inflation.poolExpectedValue).toBe(0);
    expect(inflation.inflazione).toBeNull();
  });

  it('sopra 1 quando in lega ci sono piu crediti che valore di pool', () => {
    const players = makeRoster('A', 2, 1, 1);
    const rich = makeTinyConfig({
      players,
      teamCount: 2,
      creditsPerTeam: 500,
      slotsByRole: { P: 0, D: 0, C: 0, A: 1 },
    });
    const model2 = computePricingModel(players, {
      teams: rich.teams,
      creditsPerTeam: rich.creditsPerTeam,
      slotsByRole: rich.slotsByRole,
    });
    const state = initialLeagueState(rich);
    const inflation = computePhaseInflation(
      state,
      rich,
      model2,
      residualPool(state, rich),
      'A',
    );
    expect(inflation.inflazione).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// §4.6
// ---------------------------------------------------------------------------

describe('§4.6 — profilo avversari', () => {
  const config = realConfig();
  const index = makePlayerIndex(config.players);

  it('senza acquisti l indice e null e non affidabile', () => {
    const a = computeAggressiveness(teamState(initialLeagueState(config), 'leo'), index);
    expect(a.index).toBeNull();
    expect(a.sampleSize).toBe(0);
    expect(a.reliable).toBe(false);
  });

  it('media il rapporto pagato / atteso', () => {
    const lautaro = findPlayer(config.players, 'Martinez L.');
    const dimarco = findPlayer(config.players, 'Dimarco');
    expect(lautaro.expectedPrice).toBe(118);
    expect(dimarco.expectedPrice).toBe(108);

    const state = reduce(
      [
        makeEvent({ playerId: lautaro.id, teamId: 'leo', price: 236, phase: 'A' }),
        makeEvent({ playerId: dimarco.id, teamId: 'leo', price: 54, phase: 'D' }),
      ],
      config,
    );
    const a = computeAggressiveness(teamState(state, 'leo'), index);
    expect(a.sampleSize).toBe(2);
    expect(a.index).toBeCloseTo((2 + 0.5) / 2, 9);
    expect(a.reliable).toBe(false);
  });

  it('diventa affidabile dal terzo acquisto', () => {
    expect(AGGRESSIVENESS_MIN_SAMPLE).toBe(3);
    const ids = config.players.filter((p) => p.role === 'D').slice(0, 3).map((p) => p.id);
    const state = reduce(
      ids.map((id) => makeEvent({ playerId: id, teamId: 'leo', price: 10, phase: 'D' })),
      config,
    );
    const a = computeAggressiveness(teamState(state, 'leo'), index);
    expect(a.sampleSize).toBe(3);
    expect(a.reliable).toBe(true);
  });

  it('ignora gli acquisti di giocatori fuori dall indice passato', () => {
    const state = reduce(
      [makeEvent({ playerId: 2764, teamId: 'leo', price: 100, phase: 'A' })],
      config,
    );
    const a = computeAggressiveness(teamState(state, 'leo'), new Map());
    expect(a.sampleSize).toBe(0);
    expect(a.index).toBeNull();
  });

  it('non esplode su expectedPrice = 0', () => {
    const zero = makeTinyConfig({
      players: [makePlayer({ id: 1, role: 'A', quot: 1, expectedPrice: 0 })],
      teamCount: 1,
      creditsPerTeam: 30,
      slotsByRole: { P: 0, D: 0, C: 0, A: 1 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 7, phase: 'A' })], zero);
    const a = computeAggressiveness(teamState(state, 't1'), makePlayerIndex(zero.players));
    expect(a.index).toBe(7);
    expect(Number.isFinite(a.index ?? Number.NaN)).toBe(true);
  });

  it('copre tutti i 12 partecipanti', () => {
    const all = aggressivenessForAll(initialLeagueState(config), config, index);
    expect(all).toHaveLength(12);
    expect(all.map((a) => a.teamId)).toContain('leo');
  });
});

// ---------------------------------------------------------------------------
// §4.7
// ---------------------------------------------------------------------------

describe('§4.7 — riconciliazione', () => {
  const config = realConfig();

  it('a inizio asta: 0 spesi, 0 slot, tutto disponibile', () => {
    const r = computeReconciliation(initialLeagueState(config), config);
    expect(r).toEqual({
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
    const { finalState } = runAuction({ config, priceFor: payExpected });
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
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 9, phase: 'A' })], tiny);
    const r = computeReconciliation(state, tiny);
    expect(r.creditsRemaining).toBe(1);
    expect(r.slotsRemaining).toBe(1);
    expect(r.consistent).toBe(true);

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

  it('mette insieme pool, tetti, scarcity, aggressivita e riconciliazione', () => {
    const state = initialLeagueState(config);
    const m = computeLeagueMetrics(state, config, makePlayerIndex(config.players));
    expect(m.pool.totalSlots).toBe(300);
    expect(m.ceilings).toHaveLength(12);
    expect(m.scarcity.A.poolResiduo).toBe(88);
    expect(m.aggressiveness).toHaveLength(12);
    expect(m.reconciliation.totalCredits).toBe(9600);
  });

  it('propaga la soglia tier alla scarcity', () => {
    const state = initialLeagueState(config);
    const index = makePlayerIndex(config.players);
    const all = computeLeagueMetrics(state, config, index);
    const top = computeLeagueMetrics(state, config, index, { maxTier: 1 });
    expect(top.scarcity.A.poolResiduo).toBeLessThan(all.scarcity.A.poolResiduo);
  });

  it('funziona anche su una lega senza listone', () => {
    const empty = makeLeagueConfig([], {
      teams: makeTeams(),
      creditsPerTeam: 800,
      slotsByRole: DEFAULT_SLOTS_BY_ROLE,
    });
    const m = computeLeagueMetrics(initialLeagueState(empty), empty, new Map());
    for (const role of ['P', 'D', 'C', 'A'] as Role[]) {
      expect(m.scarcity[role].poolResiduo).toBe(0);
      expect(m.scarcity[role].pressione).toBeNull();
    }
  });
});
