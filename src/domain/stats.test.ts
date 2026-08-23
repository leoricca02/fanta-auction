import { beforeEach, describe, expect, it } from 'vitest';

import {
  assignedFromClub,
  compareTeamStats,
  computeAuctionStats,
  computePace,
  distinctClubs,
  share,
  statsForTeam,
} from './stats';
import { makePlayerIndex, reduce, teamState } from './reducer';
import { makeLineupIndex } from './lineup';
import type { AssignmentEvent, LeagueConfig, Player } from './types';
import {
  makeEvent,
  makeLineup,
  makePlayer,
  makeSlot,
  makeTinyConfig,
  realConfig,
  realListone,
  resetEventCounter,
} from '../test/fixtures';

beforeEach(() => resetEventCounter());

// Due club di Serie A, cosi' la concentrazione per club e' verificabile.
const INTER: Player[] = [
  makePlayer({ id: 1, role: 'P', quot: 10, name: 'Sommer', team: 'Inter' }),
  makePlayer({ id: 2, role: 'D', quot: 20, name: 'Dimarco', team: 'Inter' }),
  makePlayer({ id: 3, role: 'C', quot: 30, name: 'Barella', team: 'Inter' }),
  makePlayer({ id: 4, role: 'A', quot: 40, name: 'Thuram', team: 'Inter' }),
];
const MILAN: Player[] = [
  makePlayer({ id: 5, role: 'P', quot: 9, name: 'Maignan', team: 'Milan' }),
  makePlayer({ id: 6, role: 'D', quot: 18, name: 'Estupinan', team: 'Milan' }),
  makePlayer({ id: 7, role: 'C', quot: 28, name: 'Fofana', team: 'Milan' }),
  makePlayer({ id: 8, role: 'A', quot: 38, name: 'Leao', team: 'Milan' }),
];
const PLAYERS = [...INTER, ...MILAN];

function tiny(): LeagueConfig {
  return makeTinyConfig({ players: PLAYERS, teamCount: 2, creditsPerTeam: 100 });
}

/** Dimarco titolare nell'Inter, Estupinan in ballottaggio nel Milan. */
function lineups() {
  return makeLineupIndex([
    makeLineup('Inter', [makeSlot('D1', [2]), makeSlot('C1', [3])]),
    makeLineup('Milan', [makeSlot('D1', [6, 5])]),
  ]);
}

function build(events: readonly AssignmentEvent[], config = tiny()) {
  const state = reduce(events, config);
  return computeAuctionStats({
    state,
    config,
    players: makePlayerIndex(config.players),
    lineups: lineups(),
    events,
  });
}

// ---------------------------------------------------------------------------

describe('share — nessuna divisione per zero arriva alla UI', () => {
  it('restituisce la quota, e 0 quando il totale e zero', () => {
    expect(share(3, 4)).toBe(0.75);
    expect(share(0, 0)).toBe(0);
    expect(share(5, 0)).toBe(0);
  });
});

describe('asta non ancora iniziata', () => {
  const stats = build([]);

  it('si dichiara vuota invece di mostrare dodici zeri', () => {
    expect(stats.empty).toBe(true);
    expect(stats.market.slotsFilled).toBe(0);
    expect(stats.topDeals).toEqual([]);
    expect(stats.topOverQuot).toEqual([]);
  });

  it('non calcola il termometro senza acquisti', () => {
    expect(stats.market.heatIndex).toBeNull();
    expect(stats.market.avgPrice).toBe(0);
  });

  it('il residuo per slot e il monte diviso tutti gli slot', () => {
    // 2 squadre x 100 crediti, 2 x 4 slot.
    expect(stats.market.residualPerSlot).toBe(200 / 8);
  });

  it('nessun ritmo e nessuna proiezione', () => {
    expect(stats.pace.assignments).toBe(0);
    expect(stats.pace.perMinute).toBeNull();
    expect(stats.pace.projectedEndTs).toBeNull();
    expect(stats.pace.firstTs).toBeNull();
    expect(stats.pace.lastTs).toBeNull();
    expect(stats.pace.elapsedMs).toBe(0);
  });
});

describe('termometro del tavolo', () => {
  it('sopra 1 quando i crediti se ne vanno piu in fretta degli slot', () => {
    // Un solo slot su 8 (12.5%), ma 50 crediti su 200 (25%).
    const stats = build([makeEvent({ playerId: 4, teamId: 't01', price: 50, phase: 'A' })]);
    expect(stats.market.filledShare).toBeCloseTo(1 / 8);
    expect(stats.market.spentShare).toBeCloseTo(50 / 200);
    expect(stats.market.heatIndex).toBeCloseTo(2);
  });

  it('sotto 1 quando il tavolo tiene', () => {
    const stats = build([
      makeEvent({ playerId: 1, teamId: 't01', price: 1, phase: 'P' }),
      makeEvent({ playerId: 5, teamId: 't02', price: 1, phase: 'P' }),
    ]);
    expect(stats.market.heatIndex as number).toBeLessThan(1);
  });

  it('il residuo per slot scende man mano che il tavolo spende', () => {
    const stats = build([makeEvent({ playerId: 4, teamId: 't01', price: 60, phase: 'A' })]);
    expect(stats.market.residualPerSlot).toBeCloseTo((200 - 60) / 7);
    expect(stats.market.avgPrice).toBe(60);
  });
});

describe('reparti', () => {
  const stats = build([
    makeEvent({ playerId: 4, teamId: 't01', price: 60, phase: 'A' }),
    makeEvent({ playerId: 8, teamId: 't02', price: 20, phase: 'A' }),
    makeEvent({ playerId: 1, teamId: 't01', price: 4, phase: 'P' }),
  ]);

  it('somma spesa e slot per ruolo, con il colpo piu caro del reparto', () => {
    const attacco = stats.byRole.find((r) => r.role === 'A');
    expect(attacco?.spent).toBe(80);
    expect(attacco?.filled).toBe(2);
    expect(attacco?.avgPrice).toBe(40);
    expect(attacco?.top?.name).toBe('Thuram');
    expect(attacco?.totalSlots).toBe(2);
  });

  it('la quota di spesa dei reparti somma al totale', () => {
    const somma = stats.byRole.reduce((acc, r) => acc + r.shareOfSpend, 0);
    expect(somma).toBeCloseTo(1);
  });

  it('un reparto non ancora partito resta a zero senza NaN', () => {
    const centro = stats.byRole.find((r) => r.role === 'C');
    expect(centro?.filled).toBe(0);
    expect(centro?.avgPrice).toBe(0);
    expect(centro?.shareOfSpend).toBe(0);
    expect(centro?.top).toBeNull();
  });
});

describe('classifiche dei colpi', () => {
  // I prezzi stanno sotto il max bid assoluto: un evento rifiutato dal reducer
  // non entrerebbe nelle statistiche, ed e' giusto cosi'.
  const stats = build([
    makeEvent({ playerId: 4, teamId: 't01', price: 40, phase: 'A' }), // quot 40 -> 1.00
    makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' }), // quot 20 -> 1.50
    makeEvent({ playerId: 8, teamId: 't02', price: 30, phase: 'A' }), // quot 38 -> 0.79
  ]);

  it('ordina per prezzo, e a parita per nome', () => {
    expect(stats.topDeals.map((d) => d.name)).toEqual(['Thuram', 'Dimarco', 'Leao']);
  });

  it('ordina il sopra-quotazione per rapporto, non per prezzo', () => {
    expect(stats.topOverQuot[0]?.name).toBe('Dimarco');
    expect(stats.topOverQuot[0]?.overQuot).toBe(1.5);
    expect(stats.topOverQuot.at(-1)?.name).toBe('Leao');
  });

  it('porta con se lo stato di formazione del giocatore', () => {
    const dimarco = stats.topDeals.find((d) => d.name === 'Dimarco');
    expect(dimarco?.status).toBe('TITOLARE');
    expect(dimarco?.teamId).toBe('t01');
  });

  it('a parita di rapporto ordina per prezzo, e poi per nome', () => {
    const trio = [
      makePlayer({ id: 30, role: 'D', quot: 20, name: 'Alfa', team: 'Roma' }),
      makePlayer({ id: 31, role: 'C', quot: 10, name: 'Beta', team: 'Roma' }),
      makePlayer({ id: 32, role: 'A', quot: 20, name: 'Gamma', team: 'Roma' }),
    ];
    const config = makeTinyConfig({ players: trio, teamCount: 2, creditsPerTeam: 100 });
    const events = [
      makeEvent({ playerId: 32, teamId: 't01', price: 30, phase: 'A' }), // 1.5, 30
      makeEvent({ playerId: 31, teamId: 't01', price: 15, phase: 'C' }), // 1.5, 15
      makeEvent({ playerId: 30, teamId: 't01', price: 30, phase: 'D' }), // 1.5, 30
    ];
    const stats = computeAuctionStats({
      state: reduce(events, config),
      config,
      players: makePlayerIndex(trio),
      lineups: makeLineupIndex([]),
      events,
    });
    // Stesso rapporto per tutti e tre: decide il prezzo, e a parita il nome.
    expect(stats.topOverQuot.map((d) => d.name)).toEqual(['Alfa', 'Gamma', 'Beta']);
    expect(stats.topDeals.map((d) => d.name)).toEqual(['Alfa', 'Gamma', 'Beta']);
  });

  it('taglia le classifiche a `top`', () => {
    const config = tiny();
    const events = [
      makeEvent({ playerId: 4, teamId: 't01', price: 60, phase: 'A' }),
      makeEvent({ playerId: 8, teamId: 't02', price: 10, phase: 'A' }),
    ];
    const corta = computeAuctionStats({
      state: reduce(events, config),
      config,
      players: makePlayerIndex(config.players),
      lineups: lineups(),
      events,
      top: 1,
    });
    expect(corta.topDeals).toHaveLength(1);
    expect(corta.topOverQuot).toHaveLength(1);
  });

  it('quotazione zero non produce un rapporto infinito', () => {
    const zero = makePlayer({ id: 99, role: 'A', quot: 0, name: 'Zero', team: 'Inter' });
    const config = makeTinyConfig({ players: [...PLAYERS, zero], teamCount: 2 });
    const events = [makeEvent({ playerId: 99, teamId: 't01', price: 30, phase: 'A' })];
    const stats = computeAuctionStats({
      state: reduce(events, config),
      config,
      players: makePlayerIndex(config.players),
      lineups: lineups(),
      events,
    });
    expect(stats.topOverQuot[0]?.overQuot).toBe(0);
  });
});

describe('titolarita degli acquisti', () => {
  it('conta gli stati e la quota di titolari sui noti', () => {
    const stats = build([
      makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' }), // TITOLARE
      makeEvent({ playerId: 6, teamId: 't02', price: 25, phase: 'D' }), // BALLOTTAGGIO
      makeEvent({ playerId: 4, teamId: 't01', price: 40, phase: 'A' }), // PANCHINA (Inter ha lineup)
      makeEvent({ playerId: 7, teamId: 't02', price: 20, phase: 'C' }), // PANCHINA (Milan ha lineup)
    ]);
    expect(stats.mix.TITOLARE).toBe(1);
    expect(stats.mix.BALLOTTAGGIO).toBe(1);
    expect(stats.mix.PANCHINA).toBe(2);
    expect(stats.mix.assigned).toBe(4);
    expect(stats.mix.starterShare).toBe(0.25);
  });

  it('un acquisto sparito dal listone conta come sconosciuto anche in lega', () => {
    // Dopo un re-import l'evento resta ma il giocatore non c'e' piu': la spesa
    // e' reale, la titolarita' no.
    const config = tiny();
    const events = [makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' })];
    const stats = computeAuctionStats({
      state: reduce(events, config),
      config,
      players: makePlayerIndex([]),
      lineups: lineups(),
      events,
    });
    expect(stats.mix.NON_INSERITO).toBe(1);
    expect(stats.mix.starterShare).toBe(0);
    expect(stats.topDeals).toEqual([]);
    expect(stats.market.creditsSpent).toBe(30);
    expect(stats.byRole.every((r) => r.filled === 0)).toBe(true);
  });

  it('i club senza formazione finiscono in NON_INSERITO e non falsano la quota', () => {
    const config = tiny();
    const events = [makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' })];
    const stats = computeAuctionStats({
      state: reduce(events, config),
      config,
      players: makePlayerIndex(config.players),
      lineups: makeLineupIndex([]),
      events,
    });
    expect(stats.mix.NON_INSERITO).toBe(1);
    expect(stats.mix.starterShare).toBe(0);
  });
});

describe('statistiche per squadra', () => {
  const config = tiny();
  const events = [
    makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' }),
    makeEvent({ playerId: 3, teamId: 't01', price: 45, phase: 'C' }),
    makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P' }),
  ];
  const state = reduce(events, config);
  const stats = statsForTeam(teamState(state, 't01'), makePlayerIndex(PLAYERS), lineups());

  it('spesa e slot per reparto', () => {
    expect(stats.spent).toBe(80);
    expect(stats.credits).toBe(20);
    expect(stats.spentByRole.C).toBe(45);
    expect(stats.filledByRole.D).toBe(1);
    expect(stats.slotsFilled).toBe(3);
    expect(stats.slotsFree).toBe(1);
  });

  it('la potenza di fuoco residua: crediti per slot ancora libero', () => {
    expect(stats.perFreeSlot).toBe(20);
    expect(stats.maxBid).toBe(20);
    expect(stats.avgPrice).toBeCloseTo(80 / 3);
  });

  it('trova il colpo piu caro e il club piu rappresentato', () => {
    expect(stats.priciest?.name).toBe('Barella');
    expect(stats.topClub).toEqual({ club: 'Inter', count: 3 });
  });

  it('il club piu rappresentato e quello con piu giocatori, non il primo comprato', () => {
    const misto = makeTinyConfig({
      players: PLAYERS,
      teamCount: 2,
      creditsPerTeam: 100,
      slotsByRole: { P: 1, D: 1, C: 1, A: 1 },
    });
    const ev = [
      makeEvent({ playerId: 2, teamId: 't01', price: 10, phase: 'D' }), // Inter
      makeEvent({ playerId: 7, teamId: 't01', price: 10, phase: 'C' }), // Milan
      makeEvent({ playerId: 5, teamId: 't01', price: 10, phase: 'P' }), // Milan
    ];
    const t = statsForTeam(
      teamState(reduce(ev, misto), 't01'),
      makePlayerIndex(PLAYERS),
      lineups(),
    );
    expect(t.topClub).toEqual({ club: 'Milan', count: 2 });
  });

  it('a rosa completa non divide per zero', () => {
    const pieno = makeTinyConfig({
      players: PLAYERS,
      teamCount: 2,
      slotsByRole: { P: 1, D: 0, C: 0, A: 0 },
    });
    const soloPortiere = [makeEvent({ playerId: 1, teamId: 't01', price: 7, phase: 'P' })];
    const t = statsForTeam(
      teamState(reduce(soloPortiere, pieno), 't01'),
      makePlayerIndex(PLAYERS),
      lineups(),
    );
    expect(t.slotsFree).toBe(0);
    expect(t.perFreeSlot).toBe(0);
  });

  it('una squadra senza acquisti non ha colpo piu caro ne club', () => {
    const vuota = statsForTeam(teamState(state, 't02'), makePlayerIndex(PLAYERS), lineups());
    expect(vuota.priciest).toBeNull();
    expect(vuota.topClub).toBeNull();
    expect(vuota.avgPrice).toBe(0);
    expect(vuota.mix.assigned).toBe(0);
  });

  it('un acquisto sparito dal listone resta nella spesa ma non nella titolarita', () => {
    // Succede dopo un re-import: il giocatore esce dalla Serie A, l'evento resta.
    const config2 = makeTinyConfig({ players: PLAYERS, teamCount: 2 });
    const ev = [makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' })];
    const t = statsForTeam(
      teamState(reduce(ev, config2), 't01'),
      makePlayerIndex([]),
      lineups(),
    );
    expect(t.spent).toBe(30);
    expect(t.mix.NON_INSERITO).toBe(1);
    expect(t.priciest).toBeNull();
    expect(t.topClub).toBeNull();
  });
});

describe('ritmo dell asta', () => {
  const minute = 60_000;

  it('nasce dal secondo acquisto in poi', () => {
    const uno = computePace([makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P', ts: 1000 })], 10);
    expect(uno.assignments).toBe(1);
    expect(uno.perMinute).toBeNull();
    expect(uno.projectedEndTs).toBeNull();
    expect(uno.firstTs).toBe(1000);
  });

  it('calcola chiamate al minuto e fine stimata sugli slot che restano', () => {
    const events = [
      makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P', ts: 0 }),
      makeEvent({ playerId: 2, teamId: 't01', price: 5, phase: 'D', ts: minute }),
      makeEvent({ playerId: 3, teamId: 't01', price: 5, phase: 'C', ts: 2 * minute }),
    ];
    const pace = computePace(events, 4);
    expect(pace.perMinute).toBe(1);
    expect(pace.elapsedMs).toBe(2 * minute);
    expect(pace.projectedEndTs).toBe(2 * minute + 4 * minute);
  });

  it('ignora gli eventi annullati', () => {
    const events = [
      makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P', ts: 0 }),
      makeEvent({ playerId: 2, teamId: 't01', price: 5, phase: 'D', ts: minute, undone: true }),
    ];
    expect(computePace(events, 3).assignments).toBe(1);
  });

  it('non proietta la fine quando non restano slot', () => {
    const events = [
      makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P', ts: 0 }),
      makeEvent({ playerId: 2, teamId: 't01', price: 5, phase: 'D', ts: minute }),
    ];
    expect(computePace(events, 0).projectedEndTs).toBeNull();
  });

  it('due acquisti nello stesso istante non producono un ritmo infinito', () => {
    const events = [
      makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P', ts: 500 }),
      makeEvent({ playerId: 2, teamId: 't01', price: 5, phase: 'D', ts: 500 }),
    ];
    const pace = computePace(events, 3);
    expect(pace.perMinute).toBeNull();
    expect(pace.projectedEndTs).toBeNull();
  });

  it('gli eventi fuori ordine non spostano primo e ultimo', () => {
    const events = [
      makeEvent({ playerId: 2, teamId: 't01', price: 5, phase: 'D', ts: 2 * minute }),
      makeEvent({ playerId: 1, teamId: 't01', price: 5, phase: 'P', ts: 0 }),
    ];
    const pace = computePace(events, 2);
    expect(pace.firstTs).toBe(0);
    expect(pace.lastTs).toBe(2 * minute);
  });
});

describe('ordinamenti della tabella squadre', () => {
  const config = tiny();
  const events = [
    makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' }),
    makeEvent({ playerId: 6, teamId: 't02', price: 10, phase: 'D' }),
  ];
  const stats = build(events, config);

  it('per sigla, crescente', () => {
    const ordinate = [...stats.teams].sort(compareTeamStats('teamId'));
    expect(ordinate.map((t) => t.teamId)).toEqual(['t01', 't02']);
  });

  it('per numero, decrescente', () => {
    expect([...stats.teams].sort(compareTeamStats('spent'))[0]?.teamId).toBe('t01');
    expect([...stats.teams].sort(compareTeamStats('credits'))[0]?.teamId).toBe('t02');
    expect([...stats.teams].sort(compareTeamStats('maxBid'))[0]?.teamId).toBe('t02');
    expect([...stats.teams].sort(compareTeamStats('perFreeSlot'))[0]?.teamId).toBe('t02');
    expect([...stats.teams].sort(compareTeamStats('avgPrice'))[0]?.teamId).toBe('t01');
    expect([...stats.teams].sort(compareTeamStats('slotsFilled'))[0]?.slotsFilled).toBe(1);
  });

  it('per quota di titolari, con la sigla a spareggio', () => {
    // t01 ha Dimarco (TITOLARE), t02 Estupinan (BALLOTTAGGIO).
    expect([...stats.teams].sort(compareTeamStats('starterShare'))[0]?.teamId).toBe('t01');
  });

  it('a parita di numero vince la sigla', () => {
    const pari = build([]);
    expect([...pari.teams].sort(compareTeamStats('spent')).map((t) => t.teamId)).toEqual([
      't01',
      't02',
    ]);
    expect([...pari.teams].sort(compareTeamStats('starterShare')).map((t) => t.teamId)).toEqual([
      't01',
      't02',
    ]);
  });
});

describe('concentrazione per club', () => {
  const config = tiny();
  const events = [
    makeEvent({ playerId: 2, teamId: 't01', price: 30, phase: 'D' }),
    makeEvent({ playerId: 3, teamId: 't01', price: 30, phase: 'C' }),
    makeEvent({ playerId: 8, teamId: 't01', price: 20, phase: 'A' }),
  ];
  const state = reduce(events, config);
  const index = makePlayerIndex(PLAYERS);

  it('conta i club distinti della rosa', () => {
    expect(distinctClubs(teamState(state, 't01'), index)).toBe(2);
    expect(distinctClubs(teamState(state, 't02'), index)).toBe(0);
  });

  it('ignora i giocatori spariti dal listone', () => {
    expect(distinctClubs(teamState(state, 't01'), makePlayerIndex([]))).toBe(0);
  });

  it('elenca chi di un club e gia andato, QUOT. desc', () => {
    const presi = assignedFromClub(state, index, 'Inter');
    expect(presi.map((p) => p.name)).toEqual(['Barella', 'Dimarco']);
    expect(assignedFromClub(state, makePlayerIndex([]), 'Inter')).toEqual([]);
  });

  it('a parita di quotazione ordina per id', () => {
    const gemelli = [
      makePlayer({ id: 20, role: 'C', quot: 15, name: 'Uno', team: 'Lazio' }),
      makePlayer({ id: 21, role: 'C', quot: 15, name: 'Due', team: 'Lazio' }),
    ];
    const c = makeTinyConfig({ players: gemelli, teamCount: 2, slotsByRole: { P: 0, D: 0, C: 2, A: 0 } });
    const ev = [
      makeEvent({ playerId: 21, teamId: 't01', price: 5, phase: 'C' }),
      makeEvent({ playerId: 20, teamId: 't01', price: 5, phase: 'C' }),
    ];
    const presi = assignedFromClub(reduce(ev, c), makePlayerIndex(gemelli), 'Lazio');
    expect(presi.map((p) => p.id)).toEqual([20, 21]);
  });
});

describe('sul listone e sulla lega veri', () => {
  it('regge un asta reale e resta coerente coi totali del reducer', () => {
    const config = realConfig();
    const players = realListone();
    const attaccanti = players.filter((p) => p.role === 'A').slice(0, 12);
    const events = attaccanti.map((p, i) =>
      makeEvent({
        playerId: p.id,
        teamId: config.teams[i % config.teams.length]?.id as string,
        price: 20 + i,
        phase: 'A',
      }),
    );
    const state = reduce(events, config);
    const stats = computeAuctionStats({
      state,
      config,
      players: makePlayerIndex(players),
      lineups: makeLineupIndex([]),
      events,
    });

    expect(stats.teams).toHaveLength(12);
    expect(stats.market.totalSlots).toBe(12 * 25);
    expect(stats.market.totalCredits).toBe(12 * 800);
    expect(stats.market.slotsFilled).toBe(12);
    expect(stats.market.creditsSpent).toBe(events.reduce((acc, e) => acc + e.price, 0));
    expect(stats.byRole.reduce((acc, r) => acc + r.filled, 0)).toBe(12);
    expect(stats.empty).toBe(false);
  });
});
