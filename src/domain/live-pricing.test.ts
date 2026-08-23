import { beforeEach, describe, expect, it } from 'vitest';

import {
  bidVerdict,
  breakEvenPrice,
  checkConservation,
  computeLivePricing,
  expectedPriceLive,
  expectedPriceLiveFor,
  fLiveRaw,
  marginaleFor,
  prezzoIndifferenza,
  residualPoolValue,
  scarsitaTier,
  tettoSostenibile,
} from './live-pricing';
import { initialLeagueState, reduce, teamState } from './reducer';
import { residualPool } from './pool';
import { totalLeagueCredits, totalLeagueSlots } from './config';
import { PHASE_ORDER } from './types';
import type { LivePricing } from './live-pricing';
import type { LeagueConfig, Player } from './types';
import {
  findPlayer,
  makeEvent,
  makePlayer,
  makeRng,
  makeRoster,
  makeTinyConfig,
  realBuilt,
  realConfig,
  resetEventCounter,
} from '../test/fixtures';
import {
  payMultiple,
  payRandomBand,
  pickAverageValue,
  proportionalPhase,
  runAuction,
} from '../test/replay';

beforeEach(() => resetEventCounter());

const REAL = realConfig();
const MODEL = realBuilt().model;
const TOTAL_SLOTS_BY_ROLE = { P: 36, D: 96, C: 96, A: 72 } as const;

function liveAt(config: LeagueConfig, events: Parameters<typeof reduce>[0]): LivePricing {
  return computeLivePricing(reduce(events, config), config);
}

function poolSize(live: LivePricing): number {
  return PHASE_ORDER.reduce((acc, role) => acc + live.pool.byRole[role].length, 0);
}

// ---------------------------------------------------------------------------
// §4.8 — Continuita' all'origine
// ---------------------------------------------------------------------------

describe('§4.8 — continuita all origine', () => {
  const live = computeLivePricing(initialLeagueState(REAL), REAL);

  it('a zero eventi il pool residuo e esattamente il pool di §4.1', () => {
    expect(live.pool.quotSum).toBe(MODEL.quotSum);
    expect(live.pool.quotSum).toBe(2844);
    expect(live.creditsRemaining).toBe(9600);
    expect(live.slotsRemaining).toBe(300);
  });

  it('f_live(0) e f di §4.1 riscalato dal floor da 1 credito per slot', () => {
    // Identita' esatta, non approssimazione: stesso denominatore, numeratore
    // ridotto dei 300 crediti non spendibili.
    const credits = totalLeagueCredits(REAL);
    const slots = totalLeagueSlots(REAL);
    expect(live.fLive).toBe((MODEL.f * (credits - slots)) / credits);
    expect(live.fLive).toBe(9300 / 2844);
    expect(live.fLive).toBeCloseTo(3.27, 2);
  });

  it('lo scarto rispetto a f e esattamente 300 / 9600', () => {
    expect(1 - live.fLive / MODEL.f).toBeCloseTo(300 / 9600, 12);
    expect(live.fLive).toBeLessThan(MODEL.f);
  });

  it('senza il floor f_live coinciderebbe con f alla cifra', () => {
    expect(fLiveRaw(9600, 0, MODEL.quotSum)).toBe(MODEL.f);
  });
});

// ---------------------------------------------------------------------------
// §4.8 — Invariante di conservazione
// ---------------------------------------------------------------------------

describe('§4.8 — invariante di conservazione', () => {
  const SEEDS = [1, 7, 42, 99, 777, 1234, 20240901, 31337];

  it('a zero eventi la somma dei prezzi attesi vale i crediti spendibili', () => {
    const live = computeLivePricing(initialLeagueState(REAL), REAL);
    const check = checkConservation(live);
    expect(check.target).toBe(9300);
    expect(check.poolValue).toBe(9302);
    expect(check.relativeError).toBeLessThanOrEqual(0.01);
    expect(check.withinTolerance).toBe(true);
  });

  it.each(SEEDS)(
    'replay casuale seed %i: entro l 1%% su tutti gli stati con >= 40 slot residui',
    (seed) => {
      const rng = makeRng(seed);
      const { steps } = runAuction({ config: REAL, priceFor: payRandomBand(rng, 0.7, 1.3), rng });
      expect(steps).toHaveLength(300);

      const sampled = steps.filter((s) => s.liveBefore.slotsRemaining >= 40);
      expect(sampled.length).toBeGreaterThanOrEqual(20);

      for (const step of sampled) {
        const check = checkConservation(step.liveBefore);
        expect(check.relativeError).not.toBeNull();
        expect(check.withinTolerance).toBe(true);
        expect(check.relativeError ?? 1).toBeLessThanOrEqual(0.01);
      }
    },
  );

  it.each(SEEDS)(
    'replay casuale seed %i: lo scarto assoluto non supera mai 0.5 per giocatore di pool',
    (seed) => {
      const rng = makeRng(seed);
      const { steps } = runAuction({ config: REAL, priceFor: payRandomBand(rng, 0.7, 1.3), rng });

      // Bound universale, valido anche in coda: expectedPriceLive arrotonda al
      // piu' vicino, quindi ogni giocatore contribuisce al massimo 0.5 di errore.
      for (const step of steps) {
        const check = checkConservation(step.liveBefore);
        const bound = 0.5 * poolSize(step.liveBefore);
        expect(Math.abs(check.poolValue - check.target)).toBeLessThanOrEqual(bound);
      }
    },
  );

  it('in coda d asta la banda dell 1% si allarga, ma resta sotto il 3%', () => {
    // Documenta il limite noto: con pochi slot residui l'errore di
    // arrotondamento su una manciata di giocatori pesa su un target piccolo.
    const rng = makeRng(42);
    const { steps } = runAuction({ config: REAL, priceFor: payRandomBand(rng, 0.7, 1.3), rng });
    const tail = steps.filter((s) => s.liveBefore.slotsRemaining < 40);
    const worst = Math.max(...tail.map((s) => checkConservation(s.liveBefore).relativeError ?? 0));
    expect(worst).toBeGreaterThan(0.01);
    expect(worst).toBeLessThan(0.03);
  });

  it('vale anche su un asta interamente cara', () => {
    // Con tutto a +25% i crediti residui si consumano piu' in fretta del pool,
    // quindi il target si rimpicciolisce prima e la soglia dell'1% richiede
    // qualche slot in piu': 60 invece di 40. Il bound assoluto sotto regge lo stesso.
    const { steps } = runAuction({ config: REAL, priceFor: payMultiple(1.25) });
    const sampled = steps.filter((s) => s.liveBefore.slotsRemaining >= 60);
    expect(sampled.length).toBeGreaterThanOrEqual(20);
    for (const step of sampled) {
      expect(checkConservation(step.liveBefore).withinTolerance).toBe(true);
    }
    for (const step of steps) {
      const check = checkConservation(step.liveBefore);
      expect(Math.abs(check.poolValue - check.target)).toBeLessThanOrEqual(
        0.5 * poolSize(step.liveBefore),
      );
    }
  });

  it('residualPoolValue e la somma dei prezzi attesi del solo pool residuo', () => {
    const live = computeLivePricing(initialLeagueState(REAL), REAL);
    let manual = 0;
    for (const role of PHASE_ORDER) {
      for (const p of live.pool.byRole[role]) manual += expectedPriceLive(p, live);
    }
    expect(residualPoolValue(live)).toBe(manual);
  });
});

// ---------------------------------------------------------------------------
// §4.8 — Segno
// ---------------------------------------------------------------------------

describe('§4.8 — segno: comprare caro fa scendere f_live', () => {
  /**
   * f_live prima e dopo ogni assegnazione del replay.
   *
   * L'ultimo passo e' escluso: a pool esaurito `f_live` vale 0 per convenzione
   * (non c'e' piu' niente da prezzare) e il confronto non avrebbe significato.
   */
  function fSeries(steps: ReturnType<typeof runAuction>['steps']) {
    return steps.slice(0, -1).map((step, i) => ({
      step,
      before: step.liveBefore.fLive,
      after: (steps[i + 1] as (typeof steps)[number]).liveBefore.fLive,
    }));
  }

  function playerOf(id: number): Player {
    return REAL.players.find((p) => p.id === id) as Player;
  }

  it('il segno di OGNI passo segue la soglia di break-even, non il prezzo atteso', () => {
    // Il teorema esatto di §4.8: comprare a x fa scendere f_live se e solo se
    // x >= 1 + f_live * QUOT(p). E' il test che intercetta un f_live che sale
    // dopo un acquisto caro — e anche il caso opposto, meno ovvio.
    const rng = makeRng(4242);
    const { steps } = runAuction({ config: REAL, priceFor: payRandomBand(rng, 0.6, 1.6), rng });
    let above = 0;
    let below = 0;

    for (const { step, before, after } of fSeries(steps)) {
      const breakEven = breakEvenPrice(playerOf(step.event.playerId), step.liveBefore);
      if (step.event.price > breakEven) {
        expect(after).toBeLessThan(before);
        above++;
      } else if (step.event.price < breakEven) {
        expect(after).toBeGreaterThan(before);
        below++;
      } else {
        expect(after).toBeCloseTo(before, 12);
      }
    }
    expect(above).toBeGreaterThan(50);
    expect(below).toBeGreaterThan(50);
  });

  it('e monotona non crescente quando ogni prezzo supera il break-even', () => {
    const { steps } = runAuction({
      config: REAL,
      priceFor: ({ player, live }) => breakEvenPrice(player, live) + 1,
      maxSteps: 250,
    });

    // Nessun prezzo tagliato dal tetto della squadra: senza questa verifica il
    // test passerebbe anche con un clamp che rompe l'ipotesi di partenza.
    for (const step of steps) {
      expect(step.event.price).toBeGreaterThanOrEqual(
        breakEvenPrice(playerOf(step.event.playerId), step.liveBefore),
      );
    }

    const series = steps.map((s) => s.liveBefore.fLive);
    for (let i = 1; i < series.length; i++) {
      expect(series[i] as number).toBeLessThanOrEqual(series[i - 1] as number);
    }
    expect(series[series.length - 1] as number).toBeLessThan(series[0] as number);
  });

  it('a +20% sull atteso f_live chiude nettamente sotto il punto di partenza', () => {
    const { steps, finalState } = runAuction({ config: REAL, priceFor: payMultiple(1.2) });
    const start = (steps[0] as (typeof steps)[number]).liveBefore.fLive;
    expect(computeLivePricing(finalState, REAL).fLive).toBeLessThan(start);

    // I rialzi locali esistono, e sono tutti e soli quelli sotto break-even:
    // su un giocatore da QUOT. bassa il +20% vale meno del credito di floor
    // che lo slot appena riempito restituisce al pool.
    const rises = fSeries(steps).filter((x) => x.after > x.before);
    for (const { step } of rises) {
      const player = playerOf(step.event.playerId);
      expect(step.event.price).toBeLessThan(breakEvenPrice(player, step.liveBefore));
      expect(player.quot).toBeLessThanOrEqual(5);
    }
  });

  it('pagare ESATTAMENTE il prezzo atteso fa salire f_live, non lo lascia fermo', () => {
    // La trappola: expectedPriceLive = f_live * QUOT, break-even = 1 + f_live * QUOT.
    // Chiudere ogni acquisto al prezzo atteso lascia in giro un credito per slot
    // e gonfia il mercato residuo — qui dell'1.7% in 100 assegnazioni.
    const f0 = computeLivePricing(initialLeagueState(REAL), REAL).fLive;
    const { finalState } = runAuction({
      config: REAL,
      priceFor: ({ player }) => expectedPriceLiveFor(player.quot, f0),
      maxSteps: 100,
      phasePicker: proportionalPhase(TOTAL_SLOTS_BY_ROLE),
      playerPicker: pickAverageValue,
    });
    const rise = computeLivePricing(finalState, REAL).fLive / f0 - 1;
    expect(rise).toBeGreaterThan(0.01);
    expect(rise).toBeLessThan(0.03);
  });

  it('a prezzo scontato f_live sale: il mercato residuo si arricchisce', () => {
    const { steps } = runAuction({ config: REAL, priceFor: payMultiple(0.6), maxSteps: 150 });
    const series = steps.map((s) => s.liveBefore.fLive);
    for (let i = 1; i < series.length; i++) {
      expect(series[i] as number).toBeGreaterThanOrEqual(series[i - 1] as number);
    }
    expect(series[series.length - 1] as number).toBeGreaterThan(series[0] as number);
  });

  it('il break-even e 1 + f_live * QUOT, non il prezzo atteso', () => {
    // Il +1 e' il credito di floor che lo slot appena riempito restituisce al
    // pool. Pagare *esattamente* il prezzo atteso fa quindi salire f_live di un
    // epsilon: e' il caso che rende insufficiente il test "prezzo >= atteso".
    const live0 = computeLivePricing(initialLeagueState(REAL), REAL);
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    expect(breakEvenPrice(lautaro, live0)).toBeCloseTo(1 + live0.fLive * 35, 9);

    const atExpected = liveAt(REAL, [
      makeEvent({
        playerId: lautaro.id,
        teamId: 'leo',
        price: expectedPriceLive(lautaro, live0),
        phase: 'A',
      }),
    ]);
    expect(atExpected.fLive).toBeGreaterThan(live0.fLive);

    const aboveBreakEven = liveAt(REAL, [
      makeEvent({
        playerId: lautaro.id,
        teamId: 'leo',
        price: Math.ceil(breakEvenPrice(lautaro, live0)),
        phase: 'A',
      }),
    ]);
    expect(aboveBreakEven.fLive).toBeLessThanOrEqual(live0.fLive);
  });

  it('lo scostamento e proporzionale al sovrapprezzo', () => {
    const f0 = computeLivePricing(initialLeagueState(REAL), REAL).fLive;
    const drops = [1.0, 1.1, 1.2, 1.4].map((factor) => {
      const { finalState } = runAuction({
        config: REAL,
        priceFor: payMultiple(factor),
        maxSteps: 100,
        phasePicker: proportionalPhase(TOTAL_SLOTS_BY_ROLE),
        playerPicker: pickAverageValue,
      });
      return 1 - computeLivePricing(finalState, REAL).fLive / f0;
    });
    for (let i = 1; i < drops.length; i++) {
      expect(drops[i] as number).toBeGreaterThan(drops[i - 1] as number);
    }
  });
});

// ---------------------------------------------------------------------------
// §4.8 — Scenario "asta cara"
// ---------------------------------------------------------------------------

describe('§4.8 — scenario asta cara: 100 slot a +20%', () => {
  const f0 = computeLivePricing(initialLeagueState(REAL), REAL).fLive;

  /** Prezzi fissati sulla stima pre-asta, come nell'esempio statico di §4.8. */
  function runStatic(factor: number, options: Parameters<typeof runAuction>[0] extends never ? never : Partial<Parameters<typeof runAuction>[0]> = {}) {
    return runAuction({
      config: REAL,
      priceFor: ({ player }) => expectedPriceLiveFor(player.quot, f0) * factor,
      maxSteps: 100,
      ...options,
    });
  }

  it('100 slot di valore medio a +20% bruciano ~600 crediti extra, come stima §4.8', () => {
    const { finalState } = runStatic(1.2, {
      phasePicker: proportionalPhase(TOTAL_SLOTS_BY_ROLE),
      playerPicker: pickAverageValue,
    });
    const extra = finalState.creditsSpent - finalState.creditsSpent / 1.2;
    expect(finalState.slotsFilled).toBe(100);
    // §4.8 stima "~640 crediti extra": misurati 601.
    expect(extra).toBeGreaterThan(550);
    expect(extra).toBeLessThan(650);
  });

  it('f_live scende dell 8% circa, non del 10% di §4.8', () => {
    const { finalState } = runStatic(1.2, {
      phasePicker: proportionalPhase(TOTAL_SLOTS_BY_ROLE),
      playerPicker: pickAverageValue,
    });
    const drop = 1 - computeLivePricing(finalState, REAL).fLive / f0;
    // Misurato: 7.99%. La stima "~10%" di §4.8 e' un conto statico che ignora
    // la ricalibrazione a ogni assegnazione — vedi il test successivo.
    expect(drop).toBeGreaterThan(0.07);
    expect(drop).toBeLessThan(0.09);
  });

  it('la ricalibrazione live e autolimitante: il calo si ferma prima', () => {
    // Pagando +20% sul prezzo *live*, che scende a ogni passo, si brucia meno
    // e f_live cala del 6% invece che dell 8%.
    const { finalState } = runAuction({
      config: REAL,
      priceFor: payMultiple(1.2),
      maxSteps: 100,
      phasePicker: proportionalPhase(TOTAL_SLOTS_BY_ROLE),
      playerPicker: pickAverageValue,
    });
    const dropLive = 1 - computeLivePricing(finalState, REAL).fLive / f0;
    expect(dropLive).toBeGreaterThan(0.05);
    expect(dropLive).toBeLessThan(0.07);
  });

  it('nell ordine di fase reale il calo e minore: i primi 100 slot sono i piu economici', () => {
    // I primi 100 slot dell'asta vera sono 36 P + 64 D, i due ruoli meno cari:
    // 27 crediti di valore atteso medio contro i 32 della media di lega.
    const { finalState, steps } = runStatic(1.2);
    const byRole = { P: 0, D: 0, C: 0, A: 0 };
    for (const s of steps) byRole[s.event.phase] += 1;
    expect(byRole).toEqual({ P: 36, D: 64, C: 0, A: 0 });

    const drop = 1 - computeLivePricing(finalState, REAL).fLive / f0;
    expect(drop).toBeGreaterThan(0.06);
    expect(drop).toBeLessThan(0.08);
  });
});

// ---------------------------------------------------------------------------
// §4.8 / §4.9 — Casi limite
// ---------------------------------------------------------------------------

describe('§4.8 — casi limite', () => {
  it('creditiResidui == slotResidui manda f_live a 0 e tutti i prezzi a 1', () => {
    const config = makeTinyConfig({
      players: makeRoster('A', 5, 30, 1),
      teamCount: 1,
      creditsPerTeam: 30,
      slotsByRole: { P: 0, D: 0, C: 0, A: 3 },
    });
    const live = liveAt(config, [makeEvent({ playerId: 1, teamId: 't1', price: 28, phase: 'A' })]);
    expect(live.creditsRemaining).toBe(2);
    expect(live.slotsRemaining).toBe(2);
    expect(live.fLive).toBe(0);
    for (const p of live.pool.byRole.A) expect(expectedPriceLive(p, live)).toBe(1);
    expect(live.marginaleByRole.A).toBe(1);
  });

  it('nel caso degenere l invariante e rotta per costruzione, e lo dichiara', () => {
    const config = makeTinyConfig({
      players: makeRoster('A', 5, 30, 1),
      teamCount: 1,
      creditsPerTeam: 30,
      slotsByRole: { P: 0, D: 0, C: 0, A: 3 },
    });
    const live = liveAt(config, [makeEvent({ playerId: 1, teamId: 't1', price: 28, phase: 'A' })]);
    const check = checkConservation(live);
    expect(check.target).toBe(0);
    expect(check.poolValue).toBe(2); // il clamp a 1 non puo' scendere sotto
    expect(check.relativeError).toBeNull();
    expect(check.withinTolerance).toBe(false);
  });

  it('f_live non va sotto zero nemmeno su uno stato incoerente', () => {
    expect(fLiveRaw(10, 40, 100)).toBeLessThan(0);
    const config = makeTinyConfig({
      players: makeRoster('A', 4, 10, 1),
      teamCount: 1,
      creditsPerTeam: 10,
      slotsByRole: { P: 0, D: 0, C: 0, A: 3 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 8, phase: 'A' })], config);
    const live = computeLivePricing({ ...state, creditsSpent: 9 }, config);
    expect(live.creditsRemaining).toBeLessThan(live.slotsRemaining);
    expect(live.fLive).toBe(0);
  });

  it('con pool residuo vuoto f_live e 0 invece di NaN', () => {
    expect(fLiveRaw(500, 10, 0)).toBe(0);
    const config = makeTinyConfig({
      players: [],
      teamCount: 1,
      slotsByRole: { P: 0, D: 0, C: 0, A: 2 },
    });
    const live = computeLivePricing(initialLeagueState(config), config);
    expect(live.pool.quotSum).toBe(0);
    expect(live.fLive).toBe(0);
    expect(residualPoolValue(live)).toBe(0);
  });

  it('expectedPriceLive non scende mai sotto 1', () => {
    expect(expectedPriceLiveFor(1, 0.2)).toBe(1);
    expect(expectedPriceLiveFor(0, 3.3)).toBe(1);
    expect(expectedPriceLiveFor(10, 0)).toBe(1);
    expect(expectedPriceLiveFor(10, 3.3755)).toBe(34);
  });
});

describe('§4.9 — livello di sostituzione', () => {
  it('a inizio asta il marginale di ogni ruolo e il prezzo dell ultimo slot', () => {
    const live = computeLivePricing(initialLeagueState(REAL), REAL);
    expect(live.marginaleByRole).toEqual({ P: 3, D: 13, C: 16, A: 10 });
    for (const role of PHASE_ORDER) {
      const last = live.pool.byRole[role][live.pool.slotsByRole[role] - 1] as Player;
      expect(live.marginaleByRole[role]).toBe(expectedPriceLive(last, live));
    }
  });

  it('vale 1 se il pool del ruolo e esaurito', () => {
    expect(marginaleFor([], 3, 3.3)).toBe(1);
    const config = makeTinyConfig({
      players: makeRoster('A', 2, 10, 1),
      teamCount: 1,
      slotsByRole: { P: 2, D: 0, C: 0, A: 2 },
    });
    const live = computeLivePricing(initialLeagueState(config), config);
    expect(live.pool.byRole.P).toEqual([]);
    expect(live.pool.slotsByRole.P).toBe(2);
    expect(live.marginaleByRole.P).toBe(1);
  });

  it('vale 1 se il pool e piu corto degli slot', () => {
    const pool = [makePlayer({ id: 1, role: 'A', quot: 20 })];
    expect(marginaleFor(pool, 3, 3.3)).toBe(1);
    expect(marginaleFor(pool, 1, 3.3)).toBe(66);
  });

  it('vale 1 se il ruolo non ha piu slot liberi', () => {
    expect(marginaleFor(makeRoster('A', 5, 20, 1), 0, 3.3)).toBe(1);
    expect(marginaleFor(makeRoster('A', 5, 20, 1), -1, 3.3)).toBe(1);
  });

  it('sale man mano che il pool si assottiglia', () => {
    const early = computeLivePricing(initialLeagueState(REAL), REAL);
    const { finalState } = runAuction({
      config: REAL,
      priceFor: payMultiple(0.5),
      maxSteps: 250,
    });
    const late = computeLivePricing(finalState, REAL);
    expect(late.marginaleByRole.A).toBeGreaterThan(early.marginaleByRole.A);
  });
});

// ---------------------------------------------------------------------------
// §4.10 — Soglie di rilancio
// ---------------------------------------------------------------------------

describe('§4.10 — tetto sostenibile', () => {
  it('a inizio asta riserva il marginale per ogni slot tranne quello in gioco', () => {
    const live = computeLivePricing(initialLeagueState(REAL), REAL);
    const leo = teamState(initialLeagueState(REAL), 'leo');
    // 3*3 + 8*13 + 8*16 + 6*10 = 9 + 104 + 128 + 60 = 301.
    expect(tettoSostenibile(leo, 'A', live)).toBe(800 - 301 + 10);
    expect(tettoSostenibile(leo, 'P', live)).toBe(800 - 301 + 3);
  });

  it('e sempre sotto il tetto assoluto di §4.3', () => {
    const live = computeLivePricing(initialLeagueState(REAL), REAL);
    const leo = teamState(initialLeagueState(REAL), 'leo');
    expect(tettoSostenibile(leo, 'A', live)).toBeLessThan(776);
  });

  it('con un solo slot libero, nel ruolo del giocatore, coincide con i crediti', () => {
    const config = makeTinyConfig({
      players: [
        ...makeRoster('P', 4, 10, 1),
        ...makeRoster('A', 6, 30, 20),
      ],
      teamCount: 2,
      creditsPerTeam: 100,
      slotsByRole: { P: 1, D: 0, C: 0, A: 1 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 8, phase: 'P' })], config);
    const live = computeLivePricing(state, config);
    const t1 = teamState(state, 't1');
    expect(t1.slotsFree).toBe(1);
    expect(t1.slotsFreeByRole.A).toBe(1);
    expect(tettoSostenibile(t1, 'A', live)).toBe(t1.credits);
    expect(t1.credits).toBe(92);
  });

  it('una squadra a zero crediti non puo sostenere nulla', () => {
    const config = makeTinyConfig({
      players: makeRoster('A', 8, 30, 1),
      teamCount: 2,
      creditsPerTeam: 10,
      slotsByRole: { P: 0, D: 0, C: 0, A: 3 },
    });
    const state = reduce(
      [
        makeEvent({ playerId: 1, teamId: 't1', price: 8, phase: 'A' }),
        makeEvent({ playerId: 2, teamId: 't1', price: 1, phase: 'A' }),
      ],
      config,
    );
    const t1 = teamState(state, 't1');
    expect(t1.credits).toBe(1);
    expect(t1.slotsFree).toBe(1);
    const live = computeLivePricing(state, config);
    expect(tettoSostenibile(t1, 'A', live)).toBe(1);
  });

  it('a rosa completa vale i crediti residui piu il marginale del ruolo', () => {
    const config = makeTinyConfig({
      players: makeRoster('A', 4, 30, 1),
      teamCount: 2,
      creditsPerTeam: 50,
      slotsByRole: { P: 0, D: 0, C: 0, A: 1 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 20, phase: 'A' })], config);
    const live = computeLivePricing(state, config);
    const t1 = teamState(state, 't1');
    expect(t1.slotsFree).toBe(0);
    expect(tettoSostenibile(t1, 'A', live)).toBe(30 + live.marginaleByRole.A);
  });
});

describe('§4.10 — prezzo di indifferenza', () => {
  const live = computeLivePricing(initialLeagueState(REAL), REAL);

  it('senza stime personali coincide col prezzo atteso live', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    expect(prezzoIndifferenza(lautaro, live)).toBe(expectedPriceLive(lautaro, live));
  });

  it('sottrae il surplus della migliore alternativa nel ruolo', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const thuram = findPlayer(REAL.players, 'Thuram');
    const values = new Map<number, number>([[thuram.id, expectedPriceLive(thuram, live) + 25]]);
    const soglia = prezzoIndifferenza(lautaro, live, (id) => values.get(id) ?? null);
    expect(soglia).toBe(expectedPriceLive(lautaro, live) - 25);
  });

  it('e NEGATIVO quando esiste un alternativa a surplus maggiore del valore', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const thuram = findPlayer(REAL.players, 'Thuram');
    const lautaroValue = expectedPriceLive(lautaro, live);
    const values = new Map<number, number>([
      [lautaro.id, lautaroValue],
      [thuram.id, expectedPriceLive(thuram, live) + lautaroValue + 30],
    ]);
    const soglia = prezzoIndifferenza(lautaro, live, (id) => values.get(id) ?? null);
    expect(soglia).toBe(-30);
    expect(soglia).toBeLessThan(0);
  });

  it('il segno non e clampato a 0 nemmeno dentro BidVerdict', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const thuram = findPlayer(REAL.players, 'Thuram');
    const values = new Map<number, number>([
      [thuram.id, expectedPriceLive(thuram, live) + 500],
    ]);
    const verdict = bidVerdict({
      player: lautaro,
      team: teamState(initialLeagueState(REAL), 'leo'),
      live,
      currentPrice: 100,
      userValue: (id) => values.get(id) ?? null,
    });
    expect(verdict.prezzoIndifferenza).toBeLessThan(0);
    expect(verdict.prezzoIndifferenza).toBe(expectedPriceLive(lautaro, live) - 500);
  });

  it('usa userValue al posto del prezzo atteso quando c e', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const withValue = prezzoIndifferenza(lautaro, live, (id) => (id === lautaro.id ? 200 : null));
    expect(withValue).toBe(200);
  });

  it('sale sopra il valore se tutte le alternative sono sopravvalutate dal mercato', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const soglia = prezzoIndifferenza(lautaro, live, (id) =>
      id === lautaro.id ? 150 : 1,
    );
    expect(soglia).toBeGreaterThan(150);
  });

  it('con un solo giocatore nel pool del ruolo non c e costo opportunita', () => {
    const config = makeTinyConfig({
      players: [makePlayer({ id: 1, role: 'A', quot: 20 }), makePlayer({ id: 2, role: 'P', quot: 5 })],
      teamCount: 1,
      creditsPerTeam: 100,
      slotsByRole: { P: 1, D: 0, C: 0, A: 1 },
    });
    const solo = computeLivePricing(initialLeagueState(config), config);
    const player = config.players[0] as Player;
    expect(solo.pool.byRole.A).toHaveLength(1);
    expect(prezzoIndifferenza(player, solo)).toBe(expectedPriceLive(player, solo));
    expect(prezzoIndifferenza(player, solo, () => 77)).toBe(77);
  });

  it('con pool del ruolo vuoto resta il valore del giocatore', () => {
    const config = makeTinyConfig({
      players: [makePlayer({ id: 1, role: 'A', quot: 20 })],
      teamCount: 1,
      creditsPerTeam: 100,
      slotsByRole: { P: 0, D: 0, C: 0, A: 1 },
    });
    const state = reduce([makeEvent({ playerId: 1, teamId: 't1', price: 10, phase: 'A' })], config);
    const live0 = computeLivePricing(state, config);
    const player = config.players[0] as Player;
    expect(live0.pool.byRole.A).toEqual([]);
    expect(prezzoIndifferenza(player, live0)).toBe(expectedPriceLive(player, live0));
  });
});

describe('§4.10 — scarsita del tier e surplus corrente', () => {
  const live = computeLivePricing(initialLeagueState(REAL), REAL);

  it('conta i giocatori dello stesso ruolo e tier ancora liberi, il giocatore incluso', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const attaccantiTier1 = REAL.players.filter(
      (p) => p.role === 'A' && p.tier === lautaro.tier,
    ).length;
    expect(scarsitaTier(lautaro, live)).toBe(attaccantiTier1);
    expect(attaccantiTier1).toBeGreaterThan(1);
  });

  it('cala quando i giocatori del tier vengono assegnati', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const before = scarsitaTier(lautaro, live);
    const other = REAL.players.find(
      (p) => p.role === 'A' && p.tier === lautaro.tier && p.id !== lautaro.id,
    ) as Player;
    const after = liveAt(REAL, [
      makeEvent({ playerId: other.id, teamId: 'sq2', price: 50, phase: 'A' }),
    ]);
    expect(scarsitaTier(lautaro, after)).toBe(before - 1);
  });

  it('surplusCorrente e valore meno prezzo attuale, e puo essere negativo', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const leo = teamState(initialLeagueState(REAL), 'leo');
    const atteso = expectedPriceLive(lautaro, live);

    const cheap = bidVerdict({ player: lautaro, team: leo, live, currentPrice: atteso - 20 });
    expect(cheap.surplusCorrente).toBe(20);

    const dear = bidVerdict({ player: lautaro, team: leo, live, currentPrice: atteso + 30 });
    expect(dear.surplusCorrente).toBe(-30);
  });

  it('userValue sposta il surplus', () => {
    const lautaro = findPlayer(REAL.players, 'Martinez L.');
    const leo = teamState(initialLeagueState(REAL), 'leo');
    const verdict = bidVerdict({
      player: lautaro,
      team: leo,
      live,
      currentPrice: 100,
      userValue: () => 160,
    });
    expect(verdict.surplusCorrente).toBe(60);
  });
});

describe('§4.10 — BidVerdict', () => {
  it('restituisce solo numeri: nessun booleano, nessuna stringa di consiglio', () => {
    const live = computeLivePricing(initialLeagueState(REAL), REAL);
    const verdict = bidVerdict({
      player: findPlayer(REAL.players, 'Martinez L.'),
      team: teamState(initialLeagueState(REAL), 'leo'),
      live,
      currentPrice: 90,
    });
    expect(Object.keys(verdict).sort()).toEqual([
      'prezzoIndifferenza',
      'scarsitaTier',
      'surplusCorrente',
      'tettoSostenibile',
    ]);
    for (const value of Object.values(verdict)) expect(typeof value).toBe('number');
  });

  it('le tre soglie combaciano con le funzioni singole', () => {
    const live = computeLivePricing(initialLeagueState(REAL), REAL);
    const player = findPlayer(REAL.players, 'Dimarco');
    const team = teamState(initialLeagueState(REAL), 'leo');
    const verdict = bidVerdict({ player, team, live, currentPrice: 100 });
    expect(verdict.tettoSostenibile).toBe(tettoSostenibile(team, player.role, live));
    expect(verdict.prezzoIndifferenza).toBe(prezzoIndifferenza(player, live));
    expect(verdict.scarsitaTier).toBe(scarsitaTier(player, live));
  });

  it('resta coerente a meta asta', () => {
    const { finalState } = runAuction({ config: REAL, priceFor: payMultiple(1.1), maxSteps: 150 });
    const live = computeLivePricing(finalState, REAL);
    const pool = residualPool(finalState, REAL);
    const player = pool.byRole.A[0] as Player;
    const verdict = bidVerdict({
      player,
      team: teamState(finalState, 'leo'),
      live,
      currentPrice: 10,
    });
    expect(Number.isFinite(verdict.tettoSostenibile)).toBe(true);
    expect(Number.isFinite(verdict.prezzoIndifferenza)).toBe(true);
    expect(verdict.scarsitaTier).toBeGreaterThan(0);
  });
});
