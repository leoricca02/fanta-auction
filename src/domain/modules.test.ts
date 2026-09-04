import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MODULE,
  MODULE_NAMES,
  ModuleError,
  OUTFIELD_COUNT,
  addCandidate,
  applyModule,
  buildModule,
  clearSlot,
  emptyLineup,
  emptySlotsFor,
  firstEmptySlot,
  isValidModuleName,
  moduleByName,
  parseModuleName,
  removeCandidate,
  rolesForSlot,
  setSlotNote,
} from './modules';
import { lineupCompletion, lineupStatus, makeLineupIndex } from './lineup';
import type { Lineup } from './types';

const NOW = 1_760_000_000_000;
const LATER = NOW + 1000;

describe('parseModuleName', () => {
  it('spezza il modulo nelle sue linee', () => {
    expect(parseModuleName('4-3-3')).toEqual([4, 3, 3]);
    expect(parseModuleName('4-2-3-1')).toEqual([4, 2, 3, 1]);
  });

  it('rifiuta i moduli con meno di tre linee', () => {
    expect(() => parseModuleName('10')).toThrowError(/almeno tre linee/);
    expect(() => parseModuleName('4-6')).toThrowError(ModuleError);
  });

  it('rifiuta le linee non numeriche o nulle', () => {
    expect(() => parseModuleName('4-x-3')).toThrowError(/"x" non e' un numero di reparto/);
    expect(() => parseModuleName('4-0-6')).toThrowError(/"0" non e' un numero/);
    expect(() => parseModuleName('4-3.5-3')).toThrowError(/non e' un numero/);
  });

  it('rifiuta i moduli che non sommano a 10', () => {
    expect(() => parseModuleName('4-4-4')).toThrowError(/12 giocatori di movimento invece di 10/);
    expect(() => parseModuleName('3-3-3')).toThrowError(/9 giocatori/);
  });
});

describe('buildModule', () => {
  it('ogni modulo del catalogo produce 11 slot', () => {
    for (const name of MODULE_NAMES) {
      const definition = buildModule(name);
      expect(definition.slots).toHaveLength(OUTFIELD_COUNT + 1);
      expect(definition.name).toBe(name);
    }
  });

  it('gli id degli slot sono univoci in ogni modulo', () => {
    for (const name of MODULE_NAMES) {
      const ids = buildModule(name).slots.map((s) => s.slotId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('il primo slot e sempre il portiere', () => {
    for (const name of MODULE_NAMES) {
      const first = buildModule(name).slots[0];
      expect(first?.slotId).toBe('P1');
      expect(first?.roleLabel).toBe('POR');
      expect(first?.roles).toEqual(['P']);
      expect(first?.line).toBe(0);
    }
  });

  it('4-3-3: quattro difensori, tre centrocampisti, tridente', () => {
    const slots = buildModule('4-3-3').slots;
    expect(slots.map((s) => s.slotId)).toEqual([
      'P1',
      'D1',
      'D2',
      'D3',
      'D4',
      'C1',
      'C2',
      'C3',
      'A1',
      'A2',
      'A3',
    ]);
    expect(slots.map((s) => s.roleLabel)).toEqual([
      'POR',
      'DD',
      'DC',
      'DC',
      'DS',
      'MEZ',
      'MED',
      'MEZ',
      'AD',
      'PC',
      'AS',
    ]);
  });

  it('le ali di un tridente accettano anche i centrocampisti', () => {
    const slots = buildModule('4-3-3').slots;
    expect(slots.find((s) => s.slotId === 'A1')?.roles).toEqual(['A', 'C']);
    expect(slots.find((s) => s.slotId === 'A2')?.roles).toEqual(['A']);
    expect(slots.find((s) => s.slotId === 'A3')?.roles).toEqual(['A', 'C']);
  });

  it('la punta unica accetta solo attaccanti', () => {
    expect(buildModule('4-2-3-1').slots.find((s) => s.slotId === 'A1')?.roles).toEqual(['A']);
  });

  it('4-2-3-1: la linea di trequarti accetta C e A', () => {
    const slots = buildModule('4-2-3-1').slots;
    const mids = slots.filter((s) => s.slotId.startsWith('C'));
    expect(mids.map((s) => s.roleLabel)).toEqual(['MED', 'MED', 'TRQ', 'TRQ', 'TRQ']);
    expect(mids.slice(0, 2).every((s) => s.roles.join() === 'C')).toBe(true);
    expect(mids.slice(2).every((s) => s.roles.join() === 'C,A')).toBe(true);
  });

  it('3-4-2-1: due trequartisti dietro la punta', () => {
    const slots = buildModule('3-4-2-1').slots;
    expect(slots.filter((s) => s.roleLabel === 'TRQ')).toHaveLength(2);
    expect(slots.filter((s) => s.slotId.startsWith('D'))).toHaveLength(3);
    expect(slots.filter((s) => s.slotId.startsWith('A'))).toHaveLength(1);
  });

  it('3-4-1-2: il trequartista dietro le due punte', () => {
    const slots = buildModule('3-4-1-2').slots;
    expect(slots.filter((s) => s.slotId.startsWith('D')).map((s) => s.roleLabel)).toEqual([
      'DC',
      'DC',
      'DC',
    ]);
    // Quattro in linea, poi il solo trequartista: l'ultima linea di mezzo e'
    // sempre quella dei trequarti, e il suo picker accetta anche gli attaccanti.
    expect(slots.filter((s) => s.slotId.startsWith('C')).map((s) => s.roleLabel)).toEqual([
      'EST',
      'MED',
      'MED',
      'EST',
      'TRQ',
    ]);
    const trq = slots.find((s) => s.roleLabel === 'TRQ');
    expect(trq?.roles.join()).toBe('C,A');
    expect(slots.filter((s) => s.slotId.startsWith('A'))).toHaveLength(2);
    // Le quattro linee del nome sono quattro righe di campo distinte.
    expect(new Set(slots.map((s) => s.line)).size).toBe(5);
  });

  it('3-5-2 e 5-3-2 hanno le etichette dei rispettivi reparti', () => {
    expect(
      buildModule('3-5-2')
        .slots.filter((s) => s.slotId.startsWith('C'))
        .map((s) => s.roleLabel),
    ).toEqual(['EST', 'MEZ', 'MED', 'MEZ', 'EST']);
    expect(
      buildModule('5-3-2')
        .slots.filter((s) => s.slotId.startsWith('D'))
        .map((s) => s.roleLabel),
    ).toEqual(['DD', 'DC', 'DC', 'DC', 'DS']);
  });

  it('4-2-4 usa le etichette del reparto a quattro punte', () => {
    expect(
      buildModule('4-2-4')
        .slots.filter((s) => s.slotId.startsWith('A'))
        .map((s) => s.roleLabel),
    ).toEqual(['AD', 'PC', 'PC', 'AS']);
  });

  it('le linee crescono dalla porta all attacco', () => {
    for (const name of MODULE_NAMES) {
      const lines = buildModule(name).slots.map((s) => s.line);
      expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    }
  });

  it('etichette di ripiego per reparti fuori catalogo', () => {
    const odd = buildModule('6-1-3');
    expect(odd.slots.filter((s) => s.roleLabel === 'DIF')).toHaveLength(6);
    expect(buildModule('2-7-1').slots.filter((s) => s.roleLabel === 'CEN')).toHaveLength(7);
    expect(buildModule('1-4-5').slots.filter((s) => s.roleLabel === 'ATT')).toHaveLength(5);
  });
});

describe('moduleByName', () => {
  it('restituisce la definizione e la memoizza', () => {
    const first = moduleByName('4-3-3');
    expect(first).not.toBeNull();
    expect(moduleByName('4-3-3')).toBe(first);
  });

  it('restituisce null su un modulo non valido invece di lanciare', () => {
    expect(moduleByName('4-4-4')).toBeNull();
    expect(moduleByName('spaghetti')).toBeNull();
    expect(moduleByName('')).toBeNull();
  });

  it('il modulo di default e nel catalogo', () => {
    expect(MODULE_NAMES).toContain(DEFAULT_MODULE);
  });

  it('isValidModuleName riconosce i moduli buoni senza lanciare', () => {
    for (const name of MODULE_NAMES) expect(isValidModuleName(name)).toBe(true);
    expect(isValidModuleName('4-4-4')).toBe(false);
    expect(isValidModuleName('spaghetti')).toBe(false);
    expect(isValidModuleName('')).toBe(false);
  });
});

describe('emptySlotsFor / emptyLineup', () => {
  it('crea slot vuoti pronti da riempire', () => {
    const slots = emptySlotsFor('3-5-2');
    expect(slots).toHaveLength(11);
    expect(slots.every((s) => s.candidates.length === 0 && s.note === '')).toBe(true);
  });

  it('emptyLineup e completo di teamCode, modulo e timestamp', () => {
    const lineup = emptyLineup('Inter', '4-3-3', NOW);
    expect(lineup.teamCode).toBe('Inter');
    expect(lineup.module).toBe('4-3-3');
    expect(lineup.updatedAt).toBe(NOW);
    expect(lineup.slots).toHaveLength(11);
  });

  it('fallisce su un modulo sconosciuto', () => {
    expect(() => emptySlotsFor('4-4-4')).toThrowError(/Modulo "4-4-4" sconosciuto/);
  });

  it('una formazione appena creata risulta a zero nel completamento', () => {
    const index = makeLineupIndex([emptyLineup('Inter', '4-3-3', NOW)]);
    const completion = lineupCompletion('Inter', index);
    expect(completion.hasLineup).toBe(true);
    expect(completion.filledSlots).toBe(0);
    expect(completion.totalSlots).toBe(11);
    expect(completion.ratio).toBe(0);
  });
});

describe('addCandidate — il secondo giocatore e il ballottaggio', () => {
  const base = (): Lineup => emptyLineup('Inter', '4-3-3', NOW);

  it('un candidato rende il giocatore TITOLARE', () => {
    const lineup = addCandidate(base(), 'P1', 1, LATER);
    expect(lineup.slots[0]?.candidates).toEqual([1]);
    expect(lineup.updatedAt).toBe(LATER);
    expect(lineupStatus(1, 'Inter', makeLineupIndex([lineup]))).toBe('TITOLARE');
  });

  it('un secondo candidato nello stesso slot crea il ballottaggio', () => {
    let lineup = addCandidate(base(), 'D1', 10, NOW);
    lineup = addCandidate(lineup, 'D1', 11, LATER);
    expect(lineup.slots.find((s) => s.slotId === 'D1')?.candidates).toEqual([10, 11]);

    const index = makeLineupIndex([lineup]);
    expect(lineupStatus(10, 'Inter', index)).toBe('BALLOTTAGGIO');
    expect(lineupStatus(11, 'Inter', index)).toBe('BALLOTTAGGIO');
  });

  it('non duplica un candidato gia presente nello slot', () => {
    let lineup = addCandidate(base(), 'D1', 10, NOW);
    lineup = addCandidate(lineup, 'D1', 10, LATER);
    expect(lineup.slots.find((s) => s.slotId === 'D1')?.candidates).toEqual([10]);
    expect(lineup.updatedAt).toBe(NOW);
  });

  it('sposta il giocatore invece di duplicarlo in due slot', () => {
    // Cosi' l'editor non genera da solo il dato sporco che §4.1 deve gestire.
    let lineup = addCandidate(base(), 'D1', 10, NOW);
    lineup = addCandidate(lineup, 'D2', 10, LATER);
    expect(lineup.slots.find((s) => s.slotId === 'D1')?.candidates).toEqual([]);
    expect(lineup.slots.find((s) => s.slotId === 'D2')?.candidates).toEqual([10]);
    expect(lineupCompletion('Inter', makeLineupIndex([lineup])).namedPlayers).toBe(1);
  });

  it('lo spostamento conserva gli altri candidati dello slot di partenza', () => {
    let lineup = addCandidate(base(), 'D1', 10, NOW);
    lineup = addCandidate(lineup, 'D1', 11, NOW);
    lineup = addCandidate(lineup, 'D2', 10, LATER);
    expect(lineup.slots.find((s) => s.slotId === 'D1')?.candidates).toEqual([11]);
    expect(lineup.slots.find((s) => s.slotId === 'D2')?.candidates).toEqual([10]);
  });

  it('su uno slot inesistente non cambia niente', () => {
    const lineup = base();
    expect(addCandidate(lineup, 'Z9', 10, LATER)).toBe(lineup);
  });
});

describe('removeCandidate / clearSlot / setSlotNote', () => {
  function filled(): Lineup {
    let lineup = emptyLineup('Inter', '4-3-3', NOW);
    lineup = addCandidate(lineup, 'D1', 10, NOW);
    lineup = addCandidate(lineup, 'D1', 11, NOW);
    return lineup;
  }

  it('removeCandidate toglie solo quel giocatore', () => {
    const lineup = removeCandidate(filled(), 'D1', 10, LATER);
    expect(lineup.slots.find((s) => s.slotId === 'D1')?.candidates).toEqual([11]);
    expect(lineup.updatedAt).toBe(LATER);
  });

  it('togliendo uno dei due il ballottaggio torna titolarita', () => {
    const lineup = removeCandidate(filled(), 'D1', 10, LATER);
    expect(lineupStatus(11, 'Inter', makeLineupIndex([lineup]))).toBe('TITOLARE');
    expect(lineupStatus(10, 'Inter', makeLineupIndex([lineup]))).toBe('PANCHINA');
  });

  it('clearSlot svuota lo slot lasciando la nota', () => {
    const withNote = setSlotNote(filled(), 'D1', 'rientra dopo la sosta', NOW);
    const cleared = clearSlot(withNote, 'D1', LATER);
    const slot = cleared.slots.find((s) => s.slotId === 'D1');
    expect(slot?.candidates).toEqual([]);
    expect(slot?.note).toBe('rientra dopo la sosta');
  });

  it('setSlotNote scrive la nota di slot di §5.2', () => {
    const lineup = setSlotNote(filled(), 'D1', 'in dubbio', LATER);
    expect(lineup.slots.find((s) => s.slotId === 'D1')?.note).toBe('in dubbio');
    expect(lineup.updatedAt).toBe(LATER);
  });

  it('su uno slot inesistente restituiscono la formazione invariata', () => {
    const lineup = filled();
    expect(removeCandidate(lineup, 'Z9', 10, LATER)).toBe(lineup);
    expect(clearSlot(lineup, 'Z9', LATER)).toBe(lineup);
    expect(setSlotNote(lineup, 'Z9', 'x', LATER)).toBe(lineup);
  });
});

describe('applyModule — cambiare modulo non azzera il lavoro', () => {
  function fourThreeThree(): Lineup {
    let lineup = emptyLineup('Inter', '4-3-3', NOW);
    lineup = addCandidate(lineup, 'P1', 1, NOW);
    ['D1', 'D2', 'D3', 'D4'].forEach((slotId, i) => {
      lineup = addCandidate(lineup, slotId, 10 + i, NOW);
    });
    ['C1', 'C2', 'C3'].forEach((slotId, i) => {
      lineup = addCandidate(lineup, slotId, 20 + i, NOW);
    });
    ['A1', 'A2', 'A3'].forEach((slotId, i) => {
      lineup = addCandidate(lineup, slotId, 30 + i, NOW);
    });
    return lineup;
  }

  it('4-3-3 -> 3-5-2 conserva quello che ci sta e dichiara il resto', () => {
    const { lineup, dropped } = applyModule(fourThreeThree(), '3-5-2', LATER);

    expect(lineup.module).toBe('3-5-2');
    expect(lineup.updatedAt).toBe(LATER);
    expect(lineup.slots.find((s) => s.slotId === 'P1')?.candidates).toEqual([1]);
    expect(lineup.slots.find((s) => s.slotId === 'D3')?.candidates).toEqual([12]);
    expect(lineup.slots.find((s) => s.slotId === 'C3')?.candidates).toEqual([22]);
    expect(lineup.slots.find((s) => s.slotId === 'C4')?.candidates).toEqual([]);
    // Escono il quarto difensore e la terza punta.
    expect(dropped).toEqual([13, 32]);
  });

  it('4-3-3 -> 4-4-2 perde solo la terza punta', () => {
    const { lineup, dropped } = applyModule(fourThreeThree(), '4-4-2', LATER);
    expect(dropped).toEqual([32]);
    expect(lineup.slots.filter((s) => s.candidates.length > 0)).toHaveLength(10);
  });

  it('passare a un modulo piu capiente non perde niente', () => {
    const { dropped } = applyModule(fourThreeThree(), '4-2-3-1', LATER);
    // 4-3-3 ha C1..C3 e A1..A3; 4-2-3-1 ha C1..C5 e solo A1.
    expect(dropped).toEqual([31, 32]);
  });

  it('conserva anche le note di slot', () => {
    const withNote = setSlotNote(fourThreeThree(), 'D1', 'terzino offensivo', NOW);
    const { lineup } = applyModule(withNote, '3-4-3', LATER);
    expect(lineup.slots.find((s) => s.slotId === 'D1')?.note).toBe('terzino offensivo');
  });

  it('tornare al modulo di partenza non riporta indietro i giocatori persi', () => {
    const { lineup } = applyModule(fourThreeThree(), '3-5-2', LATER);
    const { lineup: back, dropped } = applyModule(lineup, '4-3-3', LATER);

    // D4 e A3 esistono di nuovo, ma vuoti: il 13 e il 32 sono usciti al primo
    // cambio e nessuno li rimette dentro.
    expect(back.slots.find((s) => s.slotId === 'D4')?.candidates).toEqual([]);
    expect(back.slots.find((s) => s.slotId === 'A3')?.candidates).toEqual([]);
    // Il ritorno non perde nulla: C4 e C5 del 3-5-2 erano rimasti vuoti.
    expect(dropped).toEqual([]);
  });

  it('non elenca due volte lo stesso giocatore tra i persi', () => {
    let lineup = emptyLineup('Inter', '4-3-3', NOW);
    lineup = addCandidate(lineup, 'A3', 30, NOW);
    lineup = { ...lineup, slots: lineup.slots.map((s) => ({ ...s, candidates: [...s.candidates] })) };
    const { dropped } = applyModule(lineup, '4-2-3-1', LATER);
    expect(dropped).toEqual([30]);
  });

  it('cambiare modulo su una formazione vuota non perde niente', () => {
    const { dropped } = applyModule(emptyLineup('Inter', '4-3-3', NOW), '3-5-2', LATER);
    expect(dropped).toEqual([]);
  });

  it('fallisce su un modulo sconosciuto senza toccare la formazione', () => {
    expect(() => applyModule(fourThreeThree(), '4-4-4', LATER)).toThrowError(ModuleError);
  });
});

describe('firstEmptySlot — avanzamento automatico del picker', () => {
  it('su una formazione vuota e il primo slot', () => {
    expect(firstEmptySlot(emptyLineup('Inter', '4-3-3', NOW))).toBe('P1');
  });

  it('salta gli slot gia riempiti', () => {
    let lineup = emptyLineup('Inter', '4-3-3', NOW);
    lineup = addCandidate(lineup, 'P1', 1, NOW);
    lineup = addCandidate(lineup, 'D1', 10, NOW);
    expect(firstEmptySlot(lineup)).toBe('D2');
  });

  it('con "after" riprende dallo slot successivo, anche se quello dopo e pieno', () => {
    let lineup = emptyLineup('Inter', '4-3-3', NOW);
    lineup = addCandidate(lineup, 'D2', 11, NOW);
    expect(firstEmptySlot(lineup, 'D1')).toBe('D3');
    expect(firstEmptySlot(lineup, 'P1')).toBe('D1');
  });

  it('restituisce null quando la formazione e completa', () => {
    let lineup = emptyLineup('Inter', '4-3-3', NOW);
    lineup.slots.forEach((slot, i) => {
      lineup = addCandidate(lineup, slot.slotId, 100 + i, NOW);
    });
    expect(firstEmptySlot(lineup)).toBeNull();
  });

  it('restituisce null se "after" e l ultimo slot', () => {
    expect(firstEmptySlot(emptyLineup('Inter', '4-3-3', NOW), 'A3')).toBeNull();
  });

  it('con "after" sconosciuto riparte dall inizio', () => {
    const lineup = emptyLineup('Inter', '4-3-3', NOW);
    expect(firstEmptySlot(lineup, 'Z9')).toBe('P1');
  });
});

describe('rolesForSlot', () => {
  it('restituisce i ruoli ammessi dallo slot', () => {
    expect(rolesForSlot('4-3-3', 'P1')).toEqual(['P']);
    expect(rolesForSlot('4-3-3', 'D2')).toEqual(['D']);
    expect(rolesForSlot('4-3-3', 'C1')).toEqual(['C']);
    expect(rolesForSlot('4-3-3', 'A1')).toEqual(['A', 'C']);
    expect(rolesForSlot('4-2-3-1', 'C5')).toEqual(['C', 'A']);
  });

  it('senza vincoli se il modulo o lo slot sono sconosciuti', () => {
    expect(rolesForSlot('4-4-4', 'P1')).toEqual(['P', 'D', 'C', 'A']);
    expect(rolesForSlot('4-3-3', 'Z9')).toEqual(['P', 'D', 'C', 'A']);
  });
});
