import { describe, expect, it } from 'vitest';

import type { AssignmentEvent, LeagueConfig, Player } from '../domain/types';
import { makeLeagueConfig, makeTeams } from '../domain/config';
import { reduce } from '../domain/reducer';
import type { Expectation } from '../domain/types';
import type { MovementRole } from '../domain/valuation';
import {
  DEFAULT_WEIGHTS,
  MOVEMENT_ROLES,
  dynamicPrice,
  makeExpectationIndex,
  marketRates,
  valueOf,
} from '../domain/valuation';
import { SEASON_STATS } from '../data/stats';
import { makeStatsIndex } from '../domain/player-stats';
import { realListone } from './fixtures';

/**
 * Simulazione dell'asta per il prezzo dinamico (§5.5).
 *
 * Serve a rispondere a una domanda sola: **la formula ha senso?** Cioe', se
 * durante l'asta guardo il numero che propone, quanto e' lontano da quello che
 * il giocatore costera' davvero?
 *
 * Per non barare, niente qui e' inventato da chi ha scritto la formula:
 *
 *   - le **aspettative** sono le statistiche vere 2025/26 di Fantacalcio.it
 *     (`SEASON_STATS`): presenze, gol, assist, gialli, rossi. E' il caso
 *     realistico in cui uno compila le aspettative partendo dallo scorso anno;
 *   - i **prezzi veri** dell'asta finta escono dalla colonna `FVM/1000` del
 *     listone, riscalata sui 9.600 crediti della lega. L'FVM e' il prezzo che
 *     il mercato da' a quei numeri, e non lo produce questa applicazione.
 *
 * Se il prezzo dinamico fosse tarato sugli stessi numeri che deve indovinare
 * la simulazione non direbbe niente. Cosi' invece confronta due cose
 * indipendenti: la nostra formula lineare sulle statistiche, e i prezzi che il
 * mercato vero fa su quegli stessi giocatori.
 *
 * Stampa il rapporto con `SIM=1 npx vitest run valuation-sim`.
 */

const VERBOSE = process.env['SIM'] === '1';

function say(line = ''): void {
  // eslint-disable-next-line no-console
  if (VERBOSE) console.log(line);
}

/** Slot di lega per reparto: 12 squadre per 8 D, 8 C, 6 A. */
const SOLD_BY_ROLE: Readonly<Record<MovementRole, number>> = { D: 96, C: 96, A: 72 };

/** Crediti lasciati ai portieri, che questa feature non tocca. */
const KEEPER_RESERVE = 700;

/** RNG deterministico: la simulazione deve dare lo stesso numero a ogni run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const weight = pos - lo;
  return (sorted[lo] as number) * (1 - weight) + (sorted[hi] as number) * weight;
}

function medianOf(values: readonly number[]): number {
  return quantile(values, 0.5);
}

// ---------------------------------------------------------------------------
// Il tavolo finto
// ---------------------------------------------------------------------------

interface Sale {
  readonly player: Player;
  readonly role: MovementRole;
  /** Prezzo che il giocatore fa davvero in questa asta finta. */
  readonly price: number;
  readonly teamId: string;
}

/**
 * Aspettative dalle statistiche vere della scorsa stagione.
 *
 * Solo chi ha giocato almeno 10 partite a voto: e' il taglio che fa l'utente
 * quando compila "titolari e ballottaggi" e non i 600 nomi del listone.
 */
function expectationsFromLastSeason(players: readonly Player[]): readonly Expectation[] {
  const stats = makeStatsIndex(SEASON_STATS);
  const out: Expectation[] = [];

  for (const player of players) {
    if (player.role === 'P') continue;
    const row = stats.get(player.id);
    if (row === undefined || row.played < 10) continue;
    out.push({
      playerId: player.id,
      matches: row.played,
      goals: row.goals,
      assists: row.assists,
      yellows: row.yellow,
      reds: row.red,
      updatedAt: 0,
    });
  }

  return out;
}

/**
 * Chi viene venduto e a quanto.
 *
 * Vanno all'asta i migliori per FVM, tanti quanti sono gli slot di lega; il
 * prezzo e' l'FVM riscalato perche' la spesa totale torni sui crediti veri.
 * `noise` e' la variabilita' del tavolo: due tavoli diversi non pagano lo
 * stesso giocatore uguale nemmeno quando ragionano entrambi.
 */
function buildMarket(players: readonly Player[], noise: number, seed: number): readonly Sale[] {
  const rng = mulberry32(seed);
  const sales: Sale[] = [];

  for (const role of MOVEMENT_ROLES) {
    const pool = players
      .filter((p) => p.role === role)
      .sort((a, b) => b.fvm - a.fvm || a.id - b.id)
      .slice(0, SOLD_BY_ROLE[role]);

    for (const player of pool) {
      sales.push({ player, role, price: player.fvm, teamId: '' });
    }
  }

  const budget = 12 * 800 - KEEPER_RESERVE;
  const fvmSum = sales.reduce((acc, s) => acc + s.price, 0);
  const scale = budget / fvmSum;

  const priced = sales.map((sale) => {
    const jitter = 1 + (rng() * 2 - 1) * noise;
    return { ...sale, price: Math.max(1, Math.round(sale.price * scale * jitter)) };
  });

  // A chi va ogni giocatore. Dal piu' caro al piu' economico, ognuno alla
  // squadra che ha piu' crediti liberi e ancora uno slot in quel reparto: e'
  // il comportamento di dodici squadre che non sfondano il budget, ed e'
  // l'unico modo perche' il reducer accetti tutti i 264 eventi.
  const teamIds = makeTeams().map((t) => t.id);
  const credits = new Map(teamIds.map((id) => [id, 800]));
  const freeSlots = new Map(
    teamIds.map((id) => [id, { D: 8, C: 8, A: 6 } as Record<MovementRole, number>]),
  );

  const withTeams = [...priced]
    .sort((a, b) => b.price - a.price || a.player.id - b.player.id)
    .map((sale) => {
      const buyer = teamIds
        .filter((id) => (freeSlots.get(id) as Record<MovementRole, number>)[sale.role] > 0)
        .sort((a, b) => (credits.get(b) as number) - (credits.get(a) as number))[0] as string;

      credits.set(buyer, (credits.get(buyer) as number) - sale.price);
      (freeSlots.get(buyer) as Record<MovementRole, number>)[sale.role] -= 1;
      return { ...sale, teamId: buyer };
    });

  // Ordine di chiamata: reparti in sequenza (P -> D -> C -> A), nomi in ordine
  // sparso dentro il reparto. All'asta non si parte dal piu' caro.
  const order = mulberry32(seed + 1);
  const byRole = MOVEMENT_ROLES.map((role) => {
    const block = withTeams.filter((s) => s.role === role);
    return block
      .map((sale) => ({ sale, key: order() }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.sale);
  });

  return byRole.flat();
}

function toEvent(sale: Sale, i: number): AssignmentEvent {
  return {
    id: `sim-${i}`,
    ts: i,
    playerId: sale.player.id,
    teamId: sale.teamId,
    price: sale.price,
    phase: sale.role,
    undone: false,
  };
}

// ---------------------------------------------------------------------------
// La misura
// ---------------------------------------------------------------------------

interface Prediction {
  readonly sale: Sale;
  readonly value: number;
  readonly suggested: number;
  readonly actual: number;
  /** Errore relativo con segno: >0 vuol dire che il consiglio era alto. */
  readonly error: number;
}

/**
 * Ripercorre l'asta martellata per martellata e, **prima** di ogni assegnazione,
 * chiede alla formula quanto costera' quel giocatore.
 *
 * E' la condizione vera d'uso: il tasso conosce solo le aste gia' battute.
 */
function runAuction(
  config: LeagueConfig,
  sales: readonly Sale[],
  expectations: ReturnType<typeof makeExpectationIndex>,
): {
  readonly predictions: readonly Prediction[];
  readonly rejected: number;
  readonly reasons: readonly string[];
} {
  const events: AssignmentEvent[] = [];
  const predictions: Prediction[] = [];

  sales.forEach((sale, i) => {
    const state = reduce(events, config);
    const rates = marketRates(state, expectations, DEFAULT_WEIGHTS);
    const quote = dynamicPrice(sale.player, expectations, rates, DEFAULT_WEIGHTS);

    if (quote !== null) {
      predictions.push({
        sale,
        value: quote.value,
        suggested: quote.price,
        actual: sale.price,
        error: (quote.price - sale.price) / sale.price,
      });
    }

    events.push(toEvent(sale, i));
  });

  const final = reduce(events, config);
  return {
    predictions,
    rejected: final.rejections.length,
    reasons: final.rejections.map((r) => r.detail),
  };
}

function report(label: string, predictions: readonly Prediction[]): number {
  const abs = predictions.map((p) => Math.abs(p.error));
  const mdn = quantile(abs, 0.5);

  say();
  say(`--- ${label} — ${predictions.length} pronostici -----------------------`);
  say(
    `errore assoluto: mediana ${(mdn * 100).toFixed(0)}%  ` +
      `q25 ${(quantile(abs, 0.25) * 100).toFixed(0)}%  ` +
      `q75 ${(quantile(abs, 0.75) * 100).toFixed(0)}%  ` +
      `q90 ${(quantile(abs, 0.9) * 100).toFixed(0)}%`,
  );

  for (const role of MOVEMENT_ROLES) {
    const ofRole = predictions.filter((p) => p.sale.role === role);
    if (ofRole.length === 0) continue;
    const errs = ofRole.map((p) => Math.abs(p.error));
    const bias = ofRole.reduce((a, p) => a + p.error, 0) / ofRole.length;
    say(
      `  ${role}  n=${String(ofRole.length).padStart(3)}  ` +
        `mediana ${(quantile(errs, 0.5) * 100).toFixed(0).padStart(3)}%  ` +
        `bias ${(bias * 100 >= 0 ? '+' : '') + (bias * 100).toFixed(0)}%`,
    );
  }

  // Dove sbaglia: i costosi o i mediocri? E' la domanda che decide se la
  // proporzione pura basta o se serve il surplus sul sostituto.
  const byPrice = [...predictions].sort((a, b) => b.actual - a.actual);
  const third = Math.floor(byPrice.length / 3);
  const bands: readonly (readonly [string, readonly Prediction[]])[] = [
    ['top', byPrice.slice(0, third)],
    ['medi', byPrice.slice(third, third * 2)],
    ['bassi', byPrice.slice(third * 2)],
  ];
  say('  fascia di prezzo reale:');
  for (const [name, band] of bands) {
    if (band.length === 0) continue;
    const errs = band.map((p) => Math.abs(p.error));
    const bias = band.reduce((a, p) => a + p.error, 0) / band.length;
    const avg = band.reduce((a, p) => a + p.actual, 0) / band.length;
    say(
      `    ${name.padEnd(6)} prezzo medio ${avg.toFixed(0).padStart(3)}  ` +
        `mediana ${(quantile(errs, 0.5) * 100).toFixed(0).padStart(3)}%  ` +
        `bias ${(bias * 100 >= 0 ? '+' : '') + (bias * 100).toFixed(0)}%`,
    );
  }

  return mdn;
}

// ---------------------------------------------------------------------------

describe('prezzo dinamico — simulazione su listone e statistiche reali', () => {
  const players = realListone();
  const config = makeLeagueConfig(players);
  const expectationRows = expectationsFromLastSeason(players);
  const expectations = makeExpectationIndex(expectationRows);

  it('copre abbastanza giocatori da avere un tasso in ogni reparto', () => {
    expect(expectationRows.length).toBeGreaterThan(200);
  });

  it('il tavolo finto e\' accettato dal reducer per intero', () => {
    const sales = buildMarket(players, 0, 7);
    const { rejected, reasons } = runAuction(config, sales, expectations);
    if (rejected > 0) say(`scarti del reducer: ${reasons.join(', ')}`);
    expect(rejected).toBe(0);
  });

  it('mercato ordinato: il consiglio segue il prezzo reale', () => {
    const sales = buildMarket(players, 0, 7);
    const { predictions } = runAuction(config, sales, expectations);

    say();
    say('ASTA FINTA — 264 giocatori di movimento, prezzi dal FVM reale');
    say(`aspettative compilate: ${expectationRows.length} giocatori`);
    const mdn = report('senza variabilita\' di tavolo', predictions);

    expect(predictions.length).toBeGreaterThan(150);
    expect(mdn).toBeLessThan(0.6);
  });

  it('mercato con variabilita\' di tavolo: l\'errore non esplode', () => {
    const clean = runAuction(config, buildMarket(players, 0, 7), expectations);
    const noisy = runAuction(config, buildMarket(players, 0.2, 7), expectations);

    const mdnClean = quantile(
      clean.predictions.map((p) => Math.abs(p.error)),
      0.5,
    );
    const mdnNoisy = report('con variabilita\' +/-20%', noisy.predictions);

    // Il rumore del tavolo aggiunge errore, ma non deve raddoppiarlo: e' la
    // prova che la mediana regge le aste fuori scala.
    expect(mdnNoisy).toBeLessThan(mdnClean + 0.15);
  });

  it('il tasso di reparto si stabilizza mentre l\'asta procede', () => {
    const sales = buildMarket(players, 0.2, 7);
    const events: AssignmentEvent[] = [];
    const trail: string[] = [];

    sales.forEach((sale, i) => {
      events.push(toEvent(sale, i));
      const done = i + 1;
      if (done % 44 !== 0 && done !== sales.length) return;
      const rates = marketRates(reduce(events, config), expectations, DEFAULT_WEIGHTS);
      const cells = MOVEMENT_ROLES.map((role) => {
        const r = rates[role];
        const shown = r.rate === null ? '  —  ' : r.rate.toFixed(2).padStart(5);
        return `${role} ${shown} (n=${String(r.sample).padStart(3)}, ${r.source})`;
      });
      trail.push(`  dopo ${String(done).padStart(3)} aste:  ${cells.join('   ')}`);
    });

    say();
    say('--- tasso, crediti per punto di V ---------------------------------');
    for (const line of trail) say(line);

    const final = marketRates(reduce(events, config), expectations, DEFAULT_WEIGHTS);
    for (const role of MOVEMENT_ROLES) {
      expect(final[role].source).toBe('role');
      expect(final[role].rate).not.toBeNull();
    }
  });

  /**
   * Controprova: aspettative perfette.
   *
   * Si costruisce un'aspettativa il cui `V` e' esattamente proporzionale al
   * prezzo che il giocatore fara'. Se in questo mondo l'errore non e' zero, il
   * problema e' nel codice; se e' zero, allora tutto l'errore misurato sopra
   * viene da due sole cose: quanto sbagliano le aspettative, e la forma della
   * curva prezzo/valore. Non dal meccanismo.
   */
  it('con aspettative perfette il consiglio e\' il prezzo', () => {
    const sales = buildMarket(players, 0, 7);
    const oracle = sales.map((sale) => ({
      playerId: sale.player.id,
      matches: 0,
      goals: sale.price / 3,
      assists: 0,
      yellows: 0,
      reds: 0,
      updatedAt: 0,
    }));

    const { predictions } = runAuction(config, sales, makeExpectationIndex(oracle));
    const worst = Math.max(...predictions.map((p) => Math.abs(p.error)));

    say();
    say(`--- controprova con aspettative perfette ---------------------------`);
    say(`  ${predictions.length} pronostici, errore massimo ${(worst * 100).toFixed(1)}%`);

    // Solo l'arrotondamento al credito intero separa il consiglio dal prezzo.
    expect(worst).toBeLessThan(0.02);
  });

  /**
   * La forma della curva.
   *
   * Il rapporto lineare `prezzo = tasso x V` assume che un giocatore che vale
   * il doppio costi il doppio. Le fasce di prezzo dicono altro: sui top il
   * consiglio e' basso, sui mediocri e' alto. E' il segno che il mercato paga
   * il valore **piu' che proporzionalmente**.
   *
   * Qui si prova a curvare la formula con un solo numero — `prezzo = tasso x
   * V^gamma` — e si guarda se l'errore scende davvero. `gamma = 1` e' la
   * proporzione pura di adesso.
   */
  it('quanto migliora curvando la formula con un esponente', () => {
    const sales = buildMarket(players, 0.2, 7);

    say();
    say('--- prezzo = tasso x V^gamma --------------------------------------');
    say('  gamma   errore mediano   bias top   bias bassi');

    const rows: { readonly gamma: number; readonly mdn: number }[] = [];

    for (const gamma of [1, 1.2, 1.4, 1.6, 1.8, 2]) {
      // Stesso meccanismo di `marketRates`, con V elevato a gamma: il tasso si
      // adatta da solo alla nuova scala, quindi il confronto e' onesto.
      const curved = sales.map((sale) => {
        const e = expectations.get(sale.player.id);
        if (e === undefined) return null;
        const v = valueOf(e, sale.role, DEFAULT_WEIGHTS) ** gamma;
        return v > 0 ? { role: sale.role, v, price: sale.price } : null;
      });

      const ratesByRole = Object.fromEntries(
        MOVEMENT_ROLES.map((role) => [
          role,
          medianOf(
            curved.flatMap((c) => (c !== null && c.role === role ? [c.price / c.v] : [])),
          ),
        ]),
      ) as Record<MovementRole, number>;

      const errs = curved.flatMap((c) => {
        if (c === null) return [];
        const suggested = Math.max(1, Math.round(c.v * ratesByRole[c.role]));
        return [{ error: (suggested - c.price) / c.price, actual: c.price }];
      });

      const sorted = [...errs].sort((a, b) => b.actual - a.actual);
      const third = Math.floor(sorted.length / 3);
      const biasOf = (band: typeof sorted): number =>
        band.reduce((a, x) => a + x.error, 0) / band.length;

      const mdn = quantile(
        errs.map((e) => Math.abs(e.error)),
        0.5,
      );
      rows.push({ gamma, mdn });
      say(
        `  ${gamma.toFixed(1)}     ${(mdn * 100).toFixed(0).padStart(6)}%   ` +
          `${(biasOf(sorted.slice(0, third)) * 100).toFixed(0).padStart(8)}%   ` +
          `${(biasOf(sorted.slice(third * 2)) * 100).toFixed(0).padStart(9)}%`,
      );
    }

    const linear = rows.find((r) => r.gamma === 1) as (typeof rows)[number];
    const best = rows.reduce((a, b) => (b.mdn < a.mdn ? b : a));
    say(`  migliore: gamma ${best.gamma.toFixed(1)} — ` +
      `da ${(linear.mdn * 100).toFixed(0)}% a ${(best.mdn * 100).toFixed(0)}%`);

    // Non e' un requisito di prodotto, e' una misura: serve a decidere con i
    // numeri se la proporzione pura basta.
    expect(rows.length).toBe(6);
  });

  /**
   * Taratura del peso delle presenze, reparto per reparto.
   *
   * E' l'unico numero della formula che non venga dal regolamento del
   * fantacalcio, quindi e' l'unico che valga la pena tarare. Si prova una
   * scala di valori e si guarda quale spiega meglio i prezzi veri.
   *
   * Dentro un reparto il tasso assorbe la scala, quindi qui non si sta
   * cercando "quanto vale una presenza" in assoluto: si sta cercando **quante
   * presenze valgono un gol** in quel reparto.
   */
  it('quale peso delle presenze spiega meglio i prezzi veri', () => {
    const sales = buildMarket(players, 0.2, 7);

    say();
    say('--- taratura del peso presenze ------------------------------------');
    say('  peso    D          C          A          (errore mediano)');

    const grid = [0, 0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2];
    const errorsByRole: Record<MovementRole, { w: number; mdn: number }[]> = {
      D: [],
      C: [],
      A: [],
    };

    for (const w of grid) {
      const cells: string[] = [];
      for (const role of MOVEMENT_ROLES) {
        const weights = { ...DEFAULT_WEIGHTS, matches: { ...DEFAULT_WEIGHTS.matches, [role]: w } };
        const rows = sales.flatMap((sale) => {
          if (sale.role !== role) return [];
          const e = expectations.get(sale.player.id);
          if (e === undefined) return [];
          const v = valueOf(e, role, weights);
          return v > 0 ? [{ v, price: sale.price }] : [];
        });

        const rate = medianOf(rows.map((r) => r.price / r.v));
        const errs = rows.map((r) => Math.abs((Math.max(1, Math.round(r.v * rate)) - r.price) / r.price));
        const mdn = quantile(errs, 0.5);
        errorsByRole[role].push({ w, mdn });
        cells.push(`${(mdn * 100).toFixed(0).padStart(6)}%   `);
      }
      say(`  ${w.toFixed(1).padStart(4)}  ${cells.join('')}`);
    }

    say();
    for (const role of MOVEMENT_ROLES) {
      const best = errorsByRole[role].reduce((a, b) => (b.mdn < a.mdn ? b : a));
      const current = errorsByRole[role].find(
        (x) => x.w === DEFAULT_WEIGHTS.matches[role],
      ) as { w: number; mdn: number };
      const goals = best.w === 0 ? '—' : (3 / best.w).toFixed(1);
      say(
        `  ${role}: migliore ${best.w.toFixed(1)} (${(best.mdn * 100).toFixed(0)}%), ` +
          `attuale ${current.w.toFixed(1)} (${(current.mdn * 100).toFixed(0)}%)` +
          `  —  ${goals} presenze = 1 gol`,
      );
    }

    expect(errorsByRole.D.length).toBe(grid.length);
  });

  it('due giocatori con la stessa aspettativa ricevono lo stesso consiglio', () => {
    const sales = buildMarket(players, 0, 7);
    const events = sales.map(toEvent);
    const rates = marketRates(reduce(events, config), expectations, DEFAULT_WEIGHTS);

    // La domanda di partenza: se penso che due attaccanti facciano gli stessi
    // numeri, il consiglio deve essere lo stesso prezzo. Qui si cercano le
    // coppie con V identico e si guarda cosa hanno pagato davvero.
    const attackers = players
      .filter((p) => p.role === 'A' && expectations.has(p.id))
      .map((p) => ({
        player: p,
        value: valueOf(expectations.get(p.id) as Expectation, 'A'),
        sold: sales.find((s) => s.player.id === p.id)?.price ?? null,
      }))
      .filter((x) => x.value > 0 && x.sold !== null)
      .sort((a, b) => b.value - a.value);

    say();
    say('--- coppie di attaccanti con aspettativa quasi identica ------------');
    say('  V      giocatore                consiglio   pagato davvero');
    let shown = 0;
    for (let i = 0; i + 1 < attackers.length && shown < 4; i++) {
      const a = attackers[i] as (typeof attackers)[number];
      const b = attackers[i + 1] as (typeof attackers)[number];
      if (a.value < 20 || Math.abs(a.value - b.value) > 0.5) continue;
      for (const x of [a, b]) {
        const quote = dynamicPrice(x.player, expectations, rates);
        say(
          `  ${x.value.toFixed(1).padStart(5)}  ${x.player.name.padEnd(22)} ` +
            `${String(quote?.price ?? '—').padStart(6)}   ${String(x.sold).padStart(6)}`,
        );
      }
      say('');
      shown++;
    }

    // La garanzia vera della formula: stesso V, stesso ruolo, stesso prezzo.
    const first = attackers[0] as (typeof attackers)[number];
    const twin: Expectation = {
      ...(expectations.get(first.player.id) as Expectation),
      playerId: -1,
    };
    const withTwin = makeExpectationIndex([...expectationRows, twin]);
    const twinPlayer: Player = { ...first.player, id: -1 };
    const ratesTwin = marketRates(reduce(events, config), withTwin, DEFAULT_WEIGHTS);

    expect(dynamicPrice(twinPlayer, withTwin, ratesTwin)?.price).toBe(
      dynamicPrice(first.player, withTwin, ratesTwin)?.price,
    );
  });
});
