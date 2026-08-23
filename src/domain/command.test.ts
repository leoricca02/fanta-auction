import { describe, expect, it } from 'vitest';

import { commandPrice, commandQuery, parseCommand } from './command';

const ABBRS = new Set(['leo', 'mrc', 'sq2']);

describe('parseCommand — le tre forme di §5.1', () => {
  it('solo nome: cerca', () => {
    expect(parseCommand('dimarco', ABBRS)).toEqual({ kind: 'search', query: 'dimarco' });
  });

  it('nome e prezzo: valutazione', () => {
    expect(parseCommand('dimarco 60', ABBRS)).toEqual({
      kind: 'evaluate',
      query: 'dimarco',
      price: 60,
    });
  });

  it('nome, prezzo e sigla: assegnazione', () => {
    expect(parseCommand('dimarco 60 mrc', ABBRS)).toEqual({
      kind: 'assign',
      query: 'dimarco',
      price: 60,
      abbr: 'mrc',
    });
  });

  it('input vuoto', () => {
    expect(parseCommand('', ABBRS)).toEqual({ kind: 'empty' });
    expect(parseCommand('    ', ABBRS)).toEqual({ kind: 'empty' });
  });
});

describe('parseCommand — nomi difficili', () => {
  it('il nome puo contenere spazi', () => {
    expect(parseCommand('martinez l 118 leo', ABBRS)).toEqual({
      kind: 'assign',
      query: 'martinez l',
      price: 118,
      abbr: 'leo',
    });
  });

  it('il nome puo contenere punteggiatura', () => {
    expect(parseCommand('martinez l. 118 leo', ABBRS)).toMatchObject({
      kind: 'assign',
      query: 'martinez l.',
    });
  });

  it('un nome che finisce con una parola di tre lettere resta una ricerca', () => {
    // Senza prezzo non c'e' assegnazione possibile: "leo" e' parte del nome.
    expect(parseCommand('leo', ABBRS)).toEqual({ kind: 'search', query: 'leo' });
    expect(parseCommand('de leo', ABBRS)).toEqual({ kind: 'search', query: 'de leo' });
  });

  it('normalizza gli spazi multipli', () => {
    expect(parseCommand('  dimarco   60   mrc  ', ABBRS)).toEqual({
      kind: 'assign',
      query: 'dimarco',
      price: 60,
      abbr: 'mrc',
    });
  });

  it('la sigla e case-insensitive', () => {
    expect(parseCommand('dimarco 60 MRC', ABBRS)).toMatchObject({ abbr: 'mrc' });
  });

  it('un nome tutto numerico non esiste: il numero e sempre il prezzo', () => {
    expect(parseCommand('60', ABBRS)).toEqual({
      kind: 'error',
      detail: 'Manca il nome del giocatore.',
    });
  });
});

describe('parseCommand — errori che devono essere espliciti', () => {
  it('sigla sconosciuta: non assegna alla squadra sbagliata', () => {
    const result = parseCommand('dimarco 60 xxx', ABBRS);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') {
      expect(result.detail).toContain('Sigla "xxx" sconosciuta');
      expect(result.detail).toContain('leo, mrc, sq2');
    }
  });

  it('token finale che non e una sigla di tre lettere', () => {
    const result = parseCommand('dimarco 60 milan', ABBRS);
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.detail).toContain('tre lettere');
  });

  it('prezzo zero o negativo', () => {
    expect(parseCommand('dimarco 0', ABBRS)).toMatchObject({ kind: 'error' });
    expect(parseCommand('dimarco 0 mrc', ABBRS)).toMatchObject({ kind: 'error' });
    // Il segno meno non e' una cifra: "-5" non e' un prezzo, e' parte del nome.
    expect(parseCommand('dimarco -5', ABBRS)).toEqual({ kind: 'search', query: 'dimarco -5' });
  });

  it('prezzo senza nome, con sigla', () => {
    expect(parseCommand('60 mrc', ABBRS)).toEqual({
      kind: 'error',
      detail: 'Manca il nome del giocatore.',
    });
  });

  it('un prezzo decimale non e un prezzo: resta ricerca', () => {
    expect(parseCommand('dimarco 6.5', ABBRS)).toEqual({ kind: 'search', query: 'dimarco 6.5' });
  });
});

describe('parseCommand — mentre digiti', () => {
  it('ogni stato intermedio e valido, non lancia mai', () => {
    const testo = 'dimarco 60 mrc';
    for (let i = 0; i <= testo.length; i++) {
      expect(() => parseCommand(testo.slice(0, i), ABBRS)).not.toThrow();
    }
  });

  it('il prezzo si aggiorna a ogni cifra battuta', () => {
    expect(commandPrice(parseCommand('dimarco 6', ABBRS))).toBe(6);
    expect(commandPrice(parseCommand('dimarco 60', ABBRS))).toBe(60);
    expect(commandPrice(parseCommand('dimarco 601', ABBRS))).toBe(601);
  });

  it('la sigla incompleta non assegna per sbaglio', () => {
    // "m" e "mr" non sono sigle: finche' non arrivi a tre lettere non succede
    // niente, cosi' un Invio anticipato non chiude l'acquisto sulla squadra
    // sbagliata.
    expect(parseCommand('dimarco 60 m', ABBRS).kind).toBe('error');
    expect(parseCommand('dimarco 60 mr', ABBRS).kind).toBe('error');
    expect(parseCommand('dimarco 60 mrc', ABBRS).kind).toBe('assign');
  });
});

describe('commandQuery / commandPrice', () => {
  it('estraggono la query da ogni forma', () => {
    expect(commandQuery(parseCommand('dimarco', ABBRS))).toBe('dimarco');
    expect(commandQuery(parseCommand('dimarco 60', ABBRS))).toBe('dimarco');
    expect(commandQuery(parseCommand('dimarco 60 mrc', ABBRS))).toBe('dimarco');
    expect(commandQuery(parseCommand('', ABBRS))).toBe('');
    expect(commandQuery(parseCommand('dimarco 60 xxx', ABBRS))).toBe('');
  });

  it('il prezzo e null dove non c e', () => {
    expect(commandPrice(parseCommand('dimarco', ABBRS))).toBeNull();
    expect(commandPrice(parseCommand('', ABBRS))).toBeNull();
    expect(commandPrice(parseCommand('dimarco 60', ABBRS))).toBe(60);
    expect(commandPrice(parseCommand('dimarco 60 mrc', ABBRS))).toBe(60);
  });
});
