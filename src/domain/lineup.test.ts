import { describe, expect, it } from 'vitest';

import {
  duplicatedCandidates,
  lineupCompletion,
  lineupPlacement,
  lineupStatus,
  lineupStatusForPlayer,
  makeLineupIndex,
} from './lineup';
import { findPlayer, makeLineup, makePlayer, makeSlot, realListone } from '../test/fixtures';

/** Inter con un 4-3-3 parziale: un ballottaggio in difesa, il resto titolari. */
function interLineup() {
  return makeLineup('Inter', [
    makeSlot('por', [1], 'POR'),
    makeSlot('dc1', [2, 3], 'DC'), // ballottaggio
    makeSlot('dc2', [4], 'DC'),
    makeSlot('med', [5], 'MED'),
    makeSlot('pc', [6], 'PC'),
  ]);
}

describe('§4.1 — lineupStatus', () => {
  const lineups = makeLineupIndex([interLineup()]);

  it('squadra senza formazione -> NON_INSERITO', () => {
    expect(lineupStatus(1, 'Milan', lineups)).toBe('NON_INSERITO');
    expect(lineupStatus(999, 'Roma', lineups)).toBe('NON_INSERITO');
    expect(lineupStatus(1, 'Inter', makeLineupIndex([]))).toBe('NON_INSERITO');
  });

  it('slot con un solo candidato -> TITOLARE', () => {
    expect(lineupStatus(1, 'Inter', lineups)).toBe('TITOLARE');
    expect(lineupStatus(4, 'Inter', lineups)).toBe('TITOLARE');
    expect(lineupStatus(6, 'Inter', lineups)).toBe('TITOLARE');
  });

  it('slot con due candidati -> BALLOTTAGGIO per entrambi', () => {
    expect(lineupStatus(2, 'Inter', lineups)).toBe('BALLOTTAGGIO');
    expect(lineupStatus(3, 'Inter', lineups)).toBe('BALLOTTAGGIO');
  });

  it('slot con tre o piu candidati -> BALLOTTAGGIO per tutti', () => {
    const three = makeLineupIndex([makeLineup('Lazio', [makeSlot('trq', [10, 11, 12], 'TRQ')])]);
    for (const id of [10, 11, 12]) expect(lineupStatus(id, 'Lazio', three)).toBe('BALLOTTAGGIO');
  });

  it('giocatore della squadra fuori da ogni slot -> PANCHINA', () => {
    expect(lineupStatus(77, 'Inter', lineups)).toBe('PANCHINA');
  });

  it('formazione esistente ma senza slot -> PANCHINA per tutti', () => {
    const empty = makeLineupIndex([makeLineup('Como', [])]);
    expect(lineupStatus(1, 'Como', empty)).toBe('PANCHINA');
  });

  it('uno slot senza candidati non promuove nessuno', () => {
    const holes = makeLineupIndex([
      makeLineup('Genoa', [makeSlot('vuoto', [], 'DC'), makeSlot('por', [9], 'POR')]),
    ]);
    expect(lineupStatus(9, 'Genoa', holes)).toBe('TITOLARE');
    expect(lineupStatus(8, 'Genoa', holes)).toBe('PANCHINA');
  });

  it('legge il club dal listone con lineupStatusForPlayer', () => {
    const player = makePlayer({ id: 1, role: 'P', quot: 16, team: 'Inter' });
    expect(lineupStatusForPlayer(player, lineups)).toBe('TITOLARE');

    const altrove = makePlayer({ id: 1, role: 'P', quot: 16, team: 'Milan' });
    expect(lineupStatusForPlayer(altrove, lineups)).toBe('NON_INSERITO');
  });

  it('funziona sui nomi di club reali del listone', () => {
    const dimarco = findPlayer(realListone(), 'Dimarco');
    const real = makeLineupIndex([
      makeLineup(dimarco.team, [makeSlot('est', [dimarco.id], 'EST')]),
    ]);
    expect(lineupStatusForPlayer(dimarco, real)).toBe('TITOLARE');
  });
});

describe('§4.1 — dato sporco: giocatore in piu slot', () => {
  it('vince lo stato piu forte, non il primo slot incontrato', () => {
    // Il 7 e' titolare in "med" e in ballottaggio in "trq".
    const ballottaggioPrima = makeLineupIndex([
      makeLineup('Napoli', [makeSlot('trq', [7, 8], 'TRQ'), makeSlot('med', [7], 'MED')]),
    ]);
    const titolarePrima = makeLineupIndex([
      makeLineup('Napoli', [makeSlot('med', [7], 'MED'), makeSlot('trq', [7, 8], 'TRQ')]),
    ]);
    expect(lineupStatus(7, 'Napoli', ballottaggioPrima)).toBe('TITOLARE');
    expect(lineupStatus(7, 'Napoli', titolarePrima)).toBe('TITOLARE');
  });

  it('e indipendente dall ordine degli slot', () => {
    const slots = [
      makeSlot('a', [7, 8], 'DC'),
      makeSlot('b', [7, 9], 'MED'),
      makeSlot('c', [7], 'PC'),
    ];
    const forward = makeLineupIndex([makeLineup('Napoli', slots)]);
    const backward = makeLineupIndex([makeLineup('Napoli', [...slots].reverse())]);
    expect(lineupStatus(7, 'Napoli', forward)).toBe(lineupStatus(7, 'Napoli', backward));
    expect(lineupStatus(7, 'Napoli', forward)).toBe('TITOLARE');
  });

  it('resta BALLOTTAGGIO se il giocatore non e mai unico candidato', () => {
    const lineups = makeLineupIndex([
      makeLineup('Napoli', [makeSlot('a', [7, 8], 'DC'), makeSlot('b', [7, 9], 'MED')]),
    ]);
    expect(lineupStatus(7, 'Napoli', lineups)).toBe('BALLOTTAGGIO');
  });

  it('lineupPlacement segnala l anomalia con duplicated e i due slot', () => {
    const lineups = makeLineupIndex([
      makeLineup('Napoli', [makeSlot('a', [7, 8], 'DC'), makeSlot('b', [7], 'MED')]),
    ]);
    const placement = lineupPlacement(7, 'Napoli', lineups);
    expect(placement.status).toBe('TITOLARE');
    expect(placement.duplicated).toBe(true);
    expect(placement.slots.map((s) => s.slotId)).toEqual(['a', 'b']);

    const pulito = lineupPlacement(8, 'Napoli', lineups);
    expect(pulito.duplicated).toBe(false);
    expect(pulito.slots.map((s) => s.slotId)).toEqual(['a']);
  });

  it('non crasha e non duplica su un candidato ripetuto nello stesso slot', () => {
    const lineups = makeLineupIndex([makeLineup('Torino', [makeSlot('a', [7, 7], 'DC')])]);
    const placement = lineupPlacement(7, 'Torino', lineups);
    // Due voci nello stesso slot restano un solo slot: `duplicated` e' false,
    // ma lo slot ha 2 candidati, quindi lo stato e' BALLOTTAGGIO.
    expect(placement.slots).toHaveLength(1);
    expect(placement.duplicated).toBe(false);
    expect(placement.status).toBe('BALLOTTAGGIO');
  });

  it('lineupPlacement senza formazione non riporta slot', () => {
    const placement = lineupPlacement(1, 'Milan', makeLineupIndex([]));
    expect(placement).toEqual({
      status: 'NON_INSERITO',
      slots: [],
      duplicated: false,
      ballotRank: null,
      ballotSize: null,
    });
  });

  it('ballotRank e ballotSize danno la posizione nel ballottaggio', () => {
    const lineups = makeLineupIndex([makeLineup('Roma', [makeSlot('a', [7, 8, 9], 'PC')])]);
    expect(lineupPlacement(7, 'Roma', lineups)).toMatchObject({
      status: 'BALLOTTAGGIO',
      ballotRank: 1,
      ballotSize: 3,
    });
    expect(lineupPlacement(9, 'Roma', lineups)).toMatchObject({ ballotRank: 3, ballotSize: 3 });
  });

  it('il ballottaggio non tocca gli altri stati', () => {
    const lineups = makeLineupIndex([makeLineup('Roma', [makeSlot('a', [7], 'PC')])]);
    expect(lineupPlacement(7, 'Roma', lineups)).toMatchObject({
      status: 'TITOLARE',
      ballotRank: null,
      ballotSize: null,
    });
    expect(lineupPlacement(8, 'Roma', lineups)).toMatchObject({
      status: 'PANCHINA',
      ballotRank: null,
    });
  });

  it('fra piu ballottaggi vince la posizione migliore', () => {
    const lineups = makeLineupIndex([
      makeLineup('Lazio', [makeSlot('a', [1, 2, 7], 'TRQ'), makeSlot('b', [7, 3], 'PC')]),
    ]);
    // Terzo in uno slot, primo nell'altro: conta il posto migliore, come per
    // lo stato piu' forte.
    expect(lineupPlacement(7, 'Lazio', lineups)).toMatchObject({
      status: 'BALLOTTAGGIO',
      duplicated: true,
      ballotRank: 1,
      ballotSize: 2,
    });
  });

  it('titolare in uno slot e ballottaggio in un altro resta senza rank', () => {
    const lineups = makeLineupIndex([
      makeLineup('Inter', [makeSlot('a', [7], 'MED'), makeSlot('b', [8, 7], 'TRQ')]),
    ]);
    // Vince TITOLARE, e il rank di un ballottaggio perso non va mostrato.
    expect(lineupPlacement(7, 'Inter', lineups)).toMatchObject({
      status: 'TITOLARE',
      ballotRank: null,
      ballotSize: null,
    });
  });

  it('duplicatedCandidates elenca chi compare in piu slot', () => {
    const lineup = makeLineup('Napoli', [
      makeSlot('a', [7, 8], 'DC'),
      makeSlot('b', [7], 'MED'),
      makeSlot('c', [9, 9], 'PC'), // ripetuto nello stesso slot: non e' duplicazione
    ]);
    expect(duplicatedCandidates(lineup)).toEqual([7]);
    expect(duplicatedCandidates(makeLineup('Pulita', [makeSlot('a', [1], 'POR')]))).toEqual([]);
  });
});

describe('makeLineupIndex', () => {
  it('indicizza per teamCode', () => {
    const index = makeLineupIndex([interLineup(), makeLineup('Milan', [makeSlot('por', [20])])]);
    expect(index.size).toBe(2);
    expect(index.get('Milan')?.slots).toHaveLength(1);
  });

  it('a parita di teamCode vince l ultimo inserito', () => {
    const index = makeLineupIndex([
      makeLineup('Inter', [makeSlot('a', [1])], '4-3-3', 1),
      makeLineup('Inter', [makeSlot('b', [2]), makeSlot('c', [3])], '3-5-2', 2),
    ]);
    expect(index.size).toBe(1);
    expect(index.get('Inter')?.module).toBe('3-5-2');
    expect(index.get('Inter')?.slots).toHaveLength(2);
  });
});

describe('§5.2 — indicatore di completamento', () => {
  it('misura slot pieni, ballottaggi e giocatori citati', () => {
    const index = makeLineupIndex([interLineup()]);
    const c = lineupCompletion('Inter', index);
    expect(c).toEqual({
      teamCode: 'Inter',
      hasLineup: true,
      totalSlots: 5,
      filledSlots: 5,
      contestedSlots: 1,
      namedPlayers: 6,
      ratio: 1,
    });
  });

  it('una formazione a meta strada ha ratio < 1', () => {
    const index = makeLineupIndex([
      makeLineup('Lecce', [
        makeSlot('por', [1], 'POR'),
        makeSlot('dc1', [], 'DC'),
        makeSlot('dc2', [], 'DC'),
        makeSlot('med', [4], 'MED'),
      ]),
    ]);
    const c = lineupCompletion('Lecce', index);
    expect(c.filledSlots).toBe(2);
    expect(c.totalSlots).toBe(4);
    expect(c.ratio).toBe(0.5);
    expect(c.namedPlayers).toBe(2);
  });

  it('squadra senza formazione: hasLineup false e ratio 0', () => {
    const c = lineupCompletion('Verona', makeLineupIndex([]));
    expect(c.hasLineup).toBe(false);
    expect(c.ratio).toBe(0);
    expect(c.totalSlots).toBe(0);
    expect(c.namedPlayers).toBe(0);
  });

  it('formazione senza slot: hasLineup true ma ratio 0, non NaN', () => {
    const c = lineupCompletion('Empoli', makeLineupIndex([makeLineup('Empoli', [])]));
    expect(c.hasLineup).toBe(true);
    expect(c.totalSlots).toBe(0);
    expect(c.ratio).toBe(0);
    expect(Number.isNaN(c.ratio)).toBe(false);
  });

  it('non conta due volte un giocatore presente in piu slot', () => {
    const index = makeLineupIndex([
      makeLineup('Udinese', [makeSlot('a', [7, 8], 'DC'), makeSlot('b', [7], 'MED')]),
    ]);
    expect(lineupCompletion('Udinese', index).namedPlayers).toBe(2);
  });
});
