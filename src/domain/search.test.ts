import { describe, expect, it } from 'vitest';

import {
  MatchRank,
  bestMatch,
  isAmbiguous,
  isSubsequence,
  normalizeQuery,
  rankMatch,
  searchInPhase,
  searchPlayers,
} from './search';
import { findPlayer, makePlayer, realListone } from '../test/fixtures';

describe('normalizeQuery', () => {
  it('appiattisce accenti, maiuscole e punteggiatura come searchKey', () => {
    expect(normalizeQuery('Dimarco')).toBe('dimarco');
    expect(normalizeQuery('Martinez L.')).toBe('martinez l');
    expect(normalizeQuery('Østigård')).toBe('ostigard');
    expect(normalizeQuery("Dell'Orco")).toBe('dell orco');
    expect(normalizeQuery('  DUŠAN  ')).toBe('dusan');
  });

  it('una query normalizzata combacia con la searchKey del listone', () => {
    const lautaro = findPlayer(realListone(), 'Martinez L.');
    expect(normalizeQuery('MARTINEZ L.')).toBe(lautaro.searchKey);
  });
});

describe('isSubsequence', () => {
  it('accetta le lettere in ordine, anche non contigue', () => {
    expect(isSubsequence('dimarco', 'dmc')).toBe(true);
    expect(isSubsequence('dimarco', 'dim')).toBe(true);
    expect(isSubsequence('dimarco', 'ocd')).toBe(false);
    expect(isSubsequence('dimarco', 'dimarcox')).toBe(false);
  });

  it('la query vuota e sempre sottosequenza', () => {
    expect(isSubsequence('dimarco', '')).toBe(true);
    expect(isSubsequence('', '')).toBe(true);
    expect(isSubsequence('', 'a')).toBe(false);
  });
});

describe('rankMatch — gradini espliciti', () => {
  it('assegna il gradino giusto a ogni tipo di match', () => {
    expect(rankMatch('dimarco', '')).toBe(MatchRank.Exact);
    expect(rankMatch('dimarco', 'dimarco')).toBe(MatchRank.Exact);
    expect(rankMatch('dimarco', 'dima')).toBe(MatchRank.Prefix);
    expect(rankMatch('martinez l', 'l')).toBe(MatchRank.WordPrefix);
    expect(rankMatch('dimarco', 'marc')).toBe(MatchRank.Substring);
    expect(rankMatch('dimarco', 'dmc')).toBe(MatchRank.Subsequence);
    expect(rankMatch('dimarco', 'zzz')).toBeNull();
  });

  it('il prefisso batte la sottostringa', () => {
    expect(rankMatch('dimarco', 'dim')).toBeLessThan(rankMatch('dimarco', 'mar') as number);
  });
});

describe('searchPlayers sul listone reale', () => {
  const players = realListone();

  it('trova per prefisso e mette il migliore in cima', () => {
    expect(bestMatch(players, 'dimarco')?.name).toBe('Dimarco');
    expect(bestMatch(players, 'DIMARCO')?.name).toBe('Dimarco');
    expect(bestMatch(players, 'dima')?.name).toBe('Dimarco');
  });

  it('e tollerante ad accenti e maiuscole', () => {
    const conAccento = bestMatch(players, 'Dimàrco');
    expect(conAccento?.name).toBe('Dimarco');
  });

  it('filtra sul ruolo della fase attiva', () => {
    const attaccanti = searchPlayers(players, '', { role: 'A', limit: 5 });
    expect(attaccanti).toHaveLength(5);
    expect(attaccanti.every((h) => h.player.role === 'A')).toBe(true);
  });

  it('con query vuota propone i piu quotati del ruolo', () => {
    const primi = searchPlayers(players, '', { role: 'A', limit: 3 }).map((h) => h.player);
    expect(primi[0]?.name).toBe('Malen');
    const quots = primi.map((p) => p.quot);
    expect([...quots].sort((a, b) => b - a)).toEqual(quots);
  });

  it('esclude i giocatori gia assegnati', () => {
    const lautaro = findPlayer(players, 'Martinez L.');
    const senza = searchPlayers(players, 'martinez', { excludeIds: new Set([lautaro.id]) });
    expect(senza.some((h) => h.player.id === lautaro.id)).toBe(false);
  });

  it('rispetta il limite', () => {
    expect(searchPlayers(players, 'a', { limit: 3 })).toHaveLength(3);
    expect(searchPlayers(players, '', { limit: 1 })).toHaveLength(1);
  });

  it('restituisce vuoto se non c e nessun match', () => {
    expect(searchPlayers(players, 'qwertyuiopzxcvbnm')).toEqual([]);
    expect(bestMatch(players, 'qwertyuiopzxcvbnm')).toBeNull();
  });

  it('e deterministico: la stessa query da sempre lo stesso primo risultato', () => {
    for (const query of ['di', 'mar', 'lau', 'a', '']) {
      const primo = bestMatch(players, query)?.id;
      const secondo = bestMatch([...players].reverse(), query)?.id;
      expect(primo).toBe(secondo);
    }
  });

  it('a parita di gradino ordina per QUOT. decrescente', () => {
    const hits = searchPlayers(players, 'a', { role: 'A', limit: 8 });
    const stessoGradino = hits.filter((h) => h.rank === hits[0]?.rank);
    const quots = stessoGradino.map((h) => h.player.quot);
    expect([...quots].sort((a, b) => b - a)).toEqual(quots);
  });
});

describe('searchInPhase — inserimento retroattivo di §5.1', () => {
  const players = realListone();

  it('durante l asta normale mostra solo il ruolo della fase', () => {
    const result = searchInPhase(players, 'a', { phase: 'D', limit: 8 });
    expect(result.outOfPhase).toBe(false);
    expect(result.hits.every((h) => h.player.role === 'D')).toBe(true);
  });

  it('allarga a tutti i ruoli se nella fase non c e nessun match', () => {
    // Il caso vero: sei in fase D e ti accorgi che un portiere e' gia' andato.
    const result = searchInPhase(players, 'martinez l', { phase: 'D', limit: 8 });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.outOfPhase).toBe(true);
    expect(result.hits[0]?.player.name).toBe('Martinez L.');
    expect(result.hits[0]?.player.role).toBe('A');
  });

  it('non allarga se il match nella fase esiste, anche debole', () => {
    const dimarco = findPlayer(players, 'Dimarco');
    expect(dimarco.role).toBe('D');
    const result = searchInPhase(players, 'dimarco', { phase: 'D' });
    expect(result.outOfPhase).toBe(false);
    expect(result.hits[0]?.player.id).toBe(dimarco.id);
  });

  it('senza fase attiva cerca ovunque senza segnalare niente', () => {
    const conNull = searchInPhase(players, 'martinez l', { phase: null });
    expect(conNull.outOfPhase).toBe(false);
    expect(conNull.hits.length).toBeGreaterThan(0);

    const senzaCampo = searchInPhase(players, 'martinez l');
    expect(senzaCampo.outOfPhase).toBe(false);
    expect(senzaCampo.hits.length).toBeGreaterThan(0);
  });

  it('nessun match da nessuna parte non e fuori fase, e vuoto', () => {
    const result = searchInPhase(players, 'qwertyuiopzxcvbnm', { phase: 'D' });
    expect(result.hits).toEqual([]);
    expect(result.outOfPhase).toBe(false);
  });

  it('rispetta le esclusioni anche quando allarga', () => {
    const lautaro = findPlayer(players, 'Martinez L.');
    const result = searchInPhase(players, 'martinez l', {
      phase: 'D',
      excludeIds: new Set([lautaro.id]),
    });
    expect(result.hits.some((h) => h.player.id === lautaro.id)).toBe(false);
  });

  it('rispetta il limite anche quando allarga', () => {
    // Listone controllato: nessun portiere corrisponde, tre attaccanti si'.
    const piccolo = [
      makePlayer({ id: 1, role: 'P', quot: 10, name: 'Portiere Uno' }),
      makePlayer({ id: 2, role: 'A', quot: 30, name: 'Rossi A' }),
      makePlayer({ id: 3, role: 'A', quot: 20, name: 'Rossi B' }),
      makePlayer({ id: 4, role: 'A', quot: 10, name: 'Rossi C' }),
    ];
    const result = searchInPhase(piccolo, 'rossi', { phase: 'P', limit: 2 });
    expect(result.outOfPhase).toBe(true);
    expect(result.hits).toHaveLength(2);
    expect(result.hits.map((h) => h.player.quot)).toEqual([30, 20]);
  });
});

describe('isAmbiguous — quando la barra deve chiedere conferma', () => {
  const a = makePlayer({ id: 1, role: 'D', quot: 20, name: 'Rossi A' });
  const b = makePlayer({ id: 2, role: 'D', quot: 10, name: 'Rossi B' });
  const c = makePlayer({ id: 3, role: 'D', quot: 5, name: 'Verdi' });

  it('due prefissi identici sono ambigui', () => {
    expect(isAmbiguous(searchPlayers([a, b, c], 'rossi'))).toBe(true);
  });

  it('un solo risultato non e ambiguo', () => {
    expect(isAmbiguous(searchPlayers([a, b, c], 'verdi'))).toBe(false);
    expect(isAmbiguous([])).toBe(false);
  });

  it('gradini diversi non sono ambigui: il migliore vince', () => {
    const hits = [
      { player: a, rank: MatchRank.Prefix },
      { player: b, rank: MatchRank.Substring },
    ];
    expect(isAmbiguous(hits)).toBe(false);
  });

  it('due match deboli non bloccano: sotto un certo gradino si sceglie e basta', () => {
    const hits = [
      { player: a, rank: MatchRank.Subsequence },
      { player: b, rank: MatchRank.Subsequence },
    ];
    expect(isAmbiguous(hits)).toBe(false);
  });
});
