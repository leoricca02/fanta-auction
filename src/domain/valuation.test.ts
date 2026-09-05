import { describe, expect, it } from 'vitest';

import type { AssignmentEvent, Player } from './types';
import { reduce } from './reducer';
import type { Expectation } from './types';
import {
  DEFAULT_WEIGHTS,
  MIN_SAMPLE,
  dynamicPrice,
  isMovementRole,
  makeExpectationIndex,
  marketRates,
  median,
  valueOf,
} from './valuation';
import { makeLeagueConfig } from './config';
import type { SyntheticPlayerSpec } from '../test/fixtures';
import { makePlayer } from '../test/fixtures';

/**
 * Prezzo dinamico (§5.5). La prova sul campo — quanto il consiglio si avvicina
 * al prezzo vero — sta in `src/test/valuation-sim.test.ts`, che simula un'asta
 * intera sul listone reale. Qui ci sono le regole del meccanismo.
 */

function expectation(playerId: number, over: Partial<Expectation> = {}): Expectation {
  return {
    playerId,
    matches: 0,
    goals: 0,
    assists: 0,
    yellows: 0,
    reds: 0,
    updatedAt: 0,
    ...over,
  };
}

function event(playerId: number, price: number, phase: 'D' | 'C' | 'A'): AssignmentEvent {
  return {
    id: `ev-${playerId}`,
    ts: playerId,
    playerId,
    teamId: 'leo',
    price,
    phase,
    undone: false,
  };
}

describe('valueOf', () => {
  it('applica i bonus/malus del fantacalcio', () => {
    const e = expectation(1, { matches: 30, goals: 10, assists: 5, yellows: 8, reds: 1 });
    // A: 0.2*30 + 3*10 + 1*5 - 0.5*8 - 1*1 = 6 + 30 + 5 - 4 - 1
    expect(valueOf(e, 'A')).toBeCloseTo(36);
  });

  it('pesa le presenze in modo diverso per reparto', () => {
    const e = expectation(1, { matches: 30 });
    expect(valueOf(e, 'D')).toBeCloseTo(15);
    expect(valueOf(e, 'C')).toBeCloseTo(9);
    expect(valueOf(e, 'A')).toBeCloseTo(6);
  });

  it('non scende sotto zero: un monte di cartellini non e\' un debito', () => {
    expect(valueOf(expectation(1, { matches: 2, yellows: 10, reds: 2 }), 'C')).toBe(0);
  });

  it('i portieri non hanno un ruolo valutabile', () => {
    expect(isMovementRole('P')).toBe(false);
    expect(isMovementRole('D')).toBe(true);
  });
});

describe('median', () => {
  it('e\' null su una lista vuota', () => {
    expect(median([])).toBeNull();
  });

  it('media i due centrali su lunghezza pari', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('ignora un valore fuori scala', () => {
    // La ragione per cui non e' una media: un'asta impazzita non deve
    // spostare la scala di tutte le altre.
    expect(median([2, 2, 2, 2, 200])).toBe(2);
    const mean = [2, 2, 2, 2, 200].reduce((a, b) => a + b) / 5;
    expect(mean).toBeGreaterThan(40);
  });
});

describe('marketRates', () => {
  const config = makeLeagueConfig(([
    { id: 1, role: 'D', quot: 10 },
    { id: 2, role: 'D', quot: 10 },
    { id: 3, role: 'D', quot: 10 },
    { id: 4, role: 'D', quot: 10 },
    { id: 5, role: 'A', quot: 10 },
    { id: 6, role: 'A', quot: 10 },
    { id: 7, role: 'A', quot: 10 },
    { id: 8, role: 'P', quot: 10 },
  ] as readonly SyntheticPlayerSpec[]).map(makePlayer));

  /** V = 10 per ogni difensore (20 presenze x 0.5), V = 30 per ogni attaccante. */
  const expectations = makeExpectationIndex([
    expectation(1, { matches: 20 }),
    expectation(2, { matches: 20 }),
    expectation(3, { matches: 20 }),
    expectation(4, { matches: 20 }),
    expectation(5, { goals: 10 }),
    expectation(6, { goals: 10 }),
    expectation(7, { goals: 10 }),
  ]);

  it('senza aste non c\'e\' tasso, e lo dice', () => {
    const rates = marketRates(reduce([], config), expectations);
    expect(rates.D).toEqual({ role: 'D', rate: null, sample: 0, source: 'none' });
  });

  it('sotto MIN_SAMPLE il reparto e\' ancora in riscaldamento', () => {
    const events = [event(1, 20, 'D'), event(2, 20, 'D')];
    const rates = marketRates(reduce(events, config), expectations);
    expect(MIN_SAMPLE).toBe(3);
    expect(rates.D.source).toBe('warming');
    expect(rates.D.rate).toBeNull();
    expect(rates.D.sample).toBe(2);
  });

  it('da MIN_SAMPLE in poi misura i crediti per punto di V', () => {
    const events = [event(1, 20, 'D'), event(2, 20, 'D'), event(3, 30, 'D')];
    const rates = marketRates(reduce(events, config), expectations);
    // rapporti 2, 2, 3 -> mediana 2
    expect(rates.D).toEqual({ role: 'D', rate: 2, sample: 3, source: 'role' });
  });

  it('ogni reparto sta per conto suo: niente scala imprestata', () => {
    // Tre difensori venduti non danno un tasso agli attaccanti. La
    // simulazione misura 0,96 sui D e 1,90 sugli A: prestarlo dimezzerebbe
    // ogni consiglio all'apertura della fase.
    const events = [event(1, 20, 'D'), event(2, 20, 'D'), event(3, 20, 'D')];
    const rates = marketRates(reduce(events, config), expectations);
    expect(rates.D.source).toBe('role');
    expect(rates.A.source).toBe('none');
    expect(rates.A.rate).toBeNull();
  });

  it('le aste senza aspettativa non entrano nel conto', () => {
    const withoutOne = makeExpectationIndex([
      expectation(1, { matches: 20 }),
      expectation(2, { matches: 20 }),
    ]);
    // Il terzo difensore va a un prezzo assurdo, ma non e' valutato: se
    // entrasse nel tasso con un valore inventato sposterebbe tutti gli altri.
    const events = [event(1, 20, 'D'), event(2, 20, 'D'), event(3, 500, 'D')];
    const rates = marketRates(reduce(events, config), withoutOne);
    expect(rates.D.sample).toBe(2);
    expect(rates.D.source).toBe('warming');
  });

  it('un\'aspettativa che vale zero non e\' un rapporto', () => {
    const withZero = makeExpectationIndex([
      expectation(1, { matches: 20 }),
      expectation(2, { matches: 20 }),
      expectation(3, { matches: 20 }),
      expectation(4, { yellows: 4 }),
    ]);
    const events = [event(1, 20, 'D'), event(2, 20, 'D'), event(3, 20, 'D'), event(4, 5, 'D')];
    const rates = marketRates(reduce(events, config), withZero);
    expect(rates.D.sample).toBe(3);
    expect(Number.isFinite(rates.D.rate as number)).toBe(true);
  });

  it('gli acquisti dei portieri non toccano niente', () => {
    const withKeeper = makeExpectationIndex([
      ...[1, 2, 3].map((id) => expectation(id, { matches: 20 })),
      expectation(8, { matches: 30 }),
    ]);
    const events = [
      event(1, 20, 'D'),
      event(2, 20, 'D'),
      event(3, 20, 'D'),
      { ...event(8, 200, 'D'), phase: 'P' as const },
    ];
    const rates = marketRates(reduce(events, config), withKeeper);
    expect(rates.D.rate).toBe(2);
  });
});

describe('dynamicPrice', () => {
  const config = makeLeagueConfig(([
    { id: 1, role: 'A', quot: 10 },
    { id: 2, role: 'A', quot: 10 },
    { id: 3, role: 'A', quot: 10 },
    { id: 4, role: 'A', quot: 10 },
    { id: 5, role: 'A', quot: 10 },
    { id: 9, role: 'P', quot: 10 },
  ] as readonly SyntheticPlayerSpec[]).map(makePlayer));
  const find = (id: number): Player => config.players.find((p) => p.id === id) as Player;

  // Tre attaccanti da V=30 venduti a 60: il tasso e' 2 crediti per punto.
  const rows = [1, 2, 3].map((id) => expectation(id, { goals: 10 }));
  const events = [event(1, 60, 'A'), event(2, 60, 'A'), event(3, 60, 'A')];

  it('stesso valore, stesso consiglio: e\' tutta la feature', () => {
    const expectations = makeExpectationIndex([
      ...rows,
      expectation(4, { goals: 10 }),
      expectation(5, { goals: 10 }),
    ]);
    const rates = marketRates(reduce(events, config), expectations);

    const a = dynamicPrice(find(4), expectations, rates);
    const b = dynamicPrice(find(5), expectations, rates);
    expect(a?.price).toBe(60);
    expect(b?.price).toBe(60);
  });

  it('meta\' valore, meta\' prezzo', () => {
    const expectations = makeExpectationIndex([...rows, expectation(4, { goals: 5 })]);
    const rates = marketRates(reduce(events, config), expectations);
    expect(dynamicPrice(find(4), expectations, rates)?.price).toBe(30);
  });

  it('il prezzo segue il tasso: se il tavolo alza, il consiglio alza', () => {
    const expectations = makeExpectationIndex([...rows, expectation(4, { goals: 10 })]);

    const calm = marketRates(reduce(events, config), expectations);
    const hot = marketRates(
      reduce([event(1, 120, 'A'), event(2, 120, 'A'), event(3, 120, 'A')], config),
      expectations,
    );

    expect(dynamicPrice(find(4), expectations, calm)?.price).toBe(60);
    expect(dynamicPrice(find(4), expectations, hot)?.price).toBe(120);
  });

  it('non scende mai sotto un credito', () => {
    const expectations = makeExpectationIndex([...rows, expectation(4, { goals: 1, yellows: 5 })]);
    const rates = marketRates(reduce(events, config), expectations);
    // V = 3 - 2.5 = 0.5, tasso 2 -> 1 credito, non 0.
    expect(dynamicPrice(find(4), expectations, rates)?.price).toBe(1);
  });

  it('e\' null, non zero, quando manca un pezzo', () => {
    const expectations = makeExpectationIndex(rows);
    const rates = marketRates(reduce(events, config), expectations);

    // Nessuna aspettativa inserita.
    expect(dynamicPrice(find(4), expectations, rates)).toBeNull();
    // Portiere: fuori scope per costruzione.
    expect(dynamicPrice(find(9), makeExpectationIndex([...rows, expectation(9, { matches: 30 })]), rates)).toBeNull();
    // Reparto senza abbastanza aste.
    const cold = marketRates(reduce([], config), expectations);
    expect(dynamicPrice(find(1), expectations, cold)).toBeNull();
  });

  it('porta con se\' quante aste lo sostengono', () => {
    const expectations = makeExpectationIndex([...rows, expectation(4, { goals: 10 })]);
    const rates = marketRates(reduce(events, config), expectations);
    const quote = dynamicPrice(find(4), expectations, rates);
    expect(quote?.sample).toBe(3);
    expect(quote?.rate).toBe(2);
    expect(quote?.value).toBe(30);
  });

  it('la scala dei pesi non sposta i prezzi, la loro forma si', () => {
    const expectations = makeExpectationIndex([
      ...[1, 2, 3].map((id) => expectation(id, { matches: 20, goals: 5 })),
      expectation(4, { matches: 30, goals: 8 }),
    ]);
    const state = reduce(events, config);

    const quote = (w: typeof DEFAULT_WEIGHTS): number | undefined =>
      dynamicPrice(find(4), expectations, marketRates(state, expectations, w), w)?.price;

    const base = quote(DEFAULT_WEIGHTS);

    // Scala: tutti i pesi per due. Il tasso si dimezza, il prezzo resta.
    expect(
      quote({
        matches: { D: 1, C: 0.6, A: 0.4 },
        goal: 6,
        assist: 2,
        yellow: -1,
        red: -2,
      }),
    ).toBe(base);

    // Forma: solo le presenze pesano il doppio. Ora si sta dicendo un'altra
    // cosa sul reparto, e il prezzo cambia. E' la manopola da girare.
    expect(quote({ ...DEFAULT_WEIGHTS, matches: { D: 1, C: 0.6, A: 0.4 } })).not.toBe(base);
  });
});
