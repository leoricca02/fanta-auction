import { describe, expect, it } from 'vitest';

import {
  MatchRank,
  bestMatch,
  isAmbiguous,
  isSubsequence,
  normalizeQuery,
  rankMatch,
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
    expect(primi[0]?.name).toBe('Martinez L.');
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
