import { describe, expect, it } from 'vitest';

import {
  EXPECTED_COLUMNS,
  ListoneParseError,
  normalizeName,
  parseListone,
} from './listone';
import { makeXlsx, readListoneBytes, realListone } from '../test/fixtures';

const HEADER = [...EXPECTED_COLUMNS];

/** Riga valida di default; `overrides` sostituisce per nome di colonna. */
function row(overrides: Partial<Record<string, unknown>> = {}): unknown[] {
  const base: Record<string, unknown> = {
    '#': 1,
    Nome: 'Rossi',
    'Fuori lista': '',
    'Sq.': 'Inter',
    Under: 25,
    'R.': 'D',
    'R.MANTRA': 'Dc',
    PGv: 0,
    MV: 0,
    FM: 0,
    'FVM/1000': 40,
    'QUOT.': 12,
    FantaSquadra: null,
    Costo: null,
  };
  return HEADER.map((c) => (c in overrides ? overrides[c] : base[c]));
}

describe('normalizeName', () => {
  it('rimuove accenti e porta in minuscolo conservando le parole', () => {
    expect(normalizeName('Đurić')).toBe('duric');
    expect(normalizeName('Østigård')).toBe('ostigard');
    expect(normalizeName("Dell'Orco")).toBe('dell orco');
    expect(normalizeName('Martinez L.')).toBe('martinez l');
    expect(normalizeName('  Politano   ')).toBe('politano');
  });

  it('gestisce i caratteri che NFD non decompone', () => {
    expect(normalizeName('Æblesen')).toBe('aeblesen');
    expect(normalizeName('Œuf')).toBe('oeuf');
    expect(normalizeName('Straße')).toBe('strasse');
    expect(normalizeName('Łukasz')).toBe('lukasz');
    expect(normalizeName('Þor')).toBe('thor');
    expect(normalizeName('Ødegaard')).toBe('odegaard');
  });

  it('collassa i separatori e restituisce vuoto su input non alfanumerico', () => {
    expect(normalizeName('a--b__c')).toBe('a b c');
    expect(normalizeName('***')).toBe('');
  });
});

describe('parseListone — file reale', () => {
  const result = parseListone(readListoneBytes());

  it('carica 538 giocatori escludendo i 49 fuori lista', () => {
    expect(result.totalRows).toBe(587);
    expect(result.excludedCount).toBe(49);
    expect(result.players).toHaveLength(538);
  });

  it('rispetta la distribuzione per ruolo di §2.1', () => {
    const byRole = { P: 0, D: 0, C: 0, A: 0 };
    for (const p of result.players) byRole[p.role] += 1;
    expect(byRole).toEqual({ P: 64, D: 189, C: 194, A: 91 });
  });

  it('usa "#" come id primario e non produce duplicati', () => {
    const ids = new Set(result.players.map((p) => p.id));
    expect(ids.size).toBe(538);
  });

  it('conserva il nome originale e affianca searchKey normalizzata', () => {
    const lautaro = result.players.find((p) => p.id === 2764);
    expect(lautaro).toBeDefined();
    expect(lautaro?.name).toBe('Martinez L.');
    expect(lautaro?.searchKey).toBe('martinez l');
    expect(lautaro?.role).toBe('A');
    expect(lautaro?.quot).toBe(33);
    expect(lautaro?.fvm).toBe(289);
    expect(lautaro?.team).toBe('Inter');
  });

  it('non segnala omonimie sul file corrente', () => {
    expect(result.warnings).toEqual([]);
  });

  it('accetta anche un ArrayBuffer', () => {
    const bytes = readListoneBytes();
    const ab = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    expect(parseListone(ab).players).toHaveLength(538);
  });

  it('legge il foglio richiesto per nome', () => {
    expect(parseListone(readListoneBytes(), { sheetName: 'Lista calciatori' }).players).toHaveLength(
      538,
    );
  });

  it('e memoizzato dalla fixture con lo stesso risultato', () => {
    expect(realListone()).toHaveLength(538);
    expect(realListone()).toBe(realListone());
  });
});

describe('parseListone — validazione delle colonne', () => {
  it('nomina la colonna mancante, una alla volta', () => {
    for (const missing of EXPECTED_COLUMNS) {
      const header = HEADER.filter((c) => c !== missing);
      const values = row();
      const data = HEADER.map((c, i) => [c, values[i]] as const)
        .filter(([c]) => c !== missing)
        .map(([, v]) => v);
      const bytes = makeXlsx([header, data]);
      expect(() => parseListone(bytes)).toThrowError(ListoneParseError);
      expect(() => parseListone(bytes)).toThrowError(new RegExp(`"${escapeRe(missing)}"`));
    }
  });

  it('nomina tutte le colonne mancanti insieme', () => {
    const bytes = makeXlsx([['#', 'Nome'], [1, 'Rossi']]);
    let message = '';
    try {
      parseListone(bytes);
    } catch (e) {
      message = e instanceof Error ? e.message : '';
    }
    expect(message).toContain('Colonne mancanti');
    expect(message).toContain('"QUOT."');
    expect(message).toContain('"FVM/1000"');
    expect(message).toContain('"Fuori lista"');
  });

  it('rifiuta le colonne duplicate invece di scegliere a caso', () => {
    const header = [...HEADER, 'QUOT.'];
    const bytes = makeXlsx([header, [...row(), 99]]);
    expect(() => parseListone(bytes)).toThrowError(/Colonne duplicate.*QUOT\. \(x2\)/s);
  });

  it('ignora le colonne senza intestazione', () => {
    const bytes = makeXlsx([
      [...HEADER, null, ''],
      [...row(), 'orfano', 'orfano'],
    ]);
    expect(parseListone(bytes).players).toHaveLength(1);
  });

  it('ignora le colonne extra sconosciute', () => {
    const bytes = makeXlsx([
      [...HEADER, 'Colonna Nuova 2027'],
      [...row(), 'ignorami'],
    ]);
    expect(parseListone(bytes).players).toHaveLength(1);
  });
});

describe('parseListone — validazione delle righe', () => {
  it('esclude le righe con Fuori lista === "*"', () => {
    const bytes = makeXlsx([
      HEADER,
      row({ '#': 1 }),
      row({ '#': 2, 'Fuori lista': '*' }),
      row({ '#': 3, 'Fuori lista': ' * ' }),
      row({ '#': 4 }),
    ]);
    const result = parseListone(bytes);
    expect(result.players.map((p) => p.id)).toEqual([1, 4]);
    expect(result.excludedCount).toBe(2);
  });

  it('non esclude altri marcatori nella colonna Fuori lista', () => {
    const bytes = makeXlsx([HEADER, row({ 'Fuori lista': 'x' })]);
    expect(parseListone(bytes).players).toHaveLength(1);
  });

  it('salta le righe interamente vuote senza errore', () => {
    const bytes = makeXlsx([HEADER, row({ '#': 1 }), HEADER.map(() => null), row({ '#': 2 })]);
    const result = parseListone(bytes);
    expect(result.players).toHaveLength(2);
    expect(result.blankRows).toBe(1);
    expect(result.totalRows).toBe(2);
  });

  it('fallisce nominando riga e colonna su "#" non intero', () => {
    expect(() => parseListone(makeXlsx([HEADER, row({ '#': 1.5 })]))).toThrowError(
      /Riga 2: colonna "#" non intera/,
    );
  });

  it('fallisce su "#" non numerico', () => {
    expect(() => parseListone(makeXlsx([HEADER, row({ '#': 'abc' })]))).toThrowError(
      /Riga 2: colonna "#" non numerica/,
    );
  });

  it('fallisce su "#" vuoto', () => {
    expect(() => parseListone(makeXlsx([HEADER, row({ '#': null })]))).toThrowError(
      /Riga 2: colonna "#" vuota/,
    );
  });

  it('non si fa ingannare da un booleano nella colonna Fuori lista', () => {
    // SheetJS restituisce `true`/`false` per le celle booleane: vanno lette
    // come testo, non trattate come cella vuota.
    const bytes = makeXlsx([HEADER, row({ 'Fuori lista': false, '#': 1 })]);
    expect(parseListone(bytes).players).toHaveLength(1);
    expect(parseListone(bytes).excludedCount).toBe(0);
  });

  it('accetta numeri passati come stringa', () => {
    const parsed = parseListone(makeXlsx([HEADER, row({ 'QUOT.': '12', Under: '25' })]));
    expect(parsed.players[0]?.quot).toBe(12);
    expect(parsed.players[0]?.under).toBe(25);
  });

  it('fallisce su Nome vuoto', () => {
    expect(() => parseListone(makeXlsx([HEADER, row({ Nome: '   ' })]))).toThrowError(
      /Riga 2: colonna "Nome" vuota/,
    );
  });

  it('fallisce su Sq. vuota', () => {
    expect(() => parseListone(makeXlsx([HEADER, row({ 'Sq.': null })]))).toThrowError(
      /Riga 2: colonna "Sq\." vuota/,
    );
  });

  it('fallisce su ruolo sconosciuto', () => {
    expect(() => parseListone(makeXlsx([HEADER, row({ 'R.': 'Z' })]))).toThrowError(
      /ruolo "Z" non valido/,
    );
  });

  it('accetta il ruolo in minuscolo', () => {
    expect(parseListone(makeXlsx([HEADER, row({ 'R.': 'c' })])).players[0]?.role).toBe('C');
  });

  it('fallisce su "#" duplicato', () => {
    const bytes = makeXlsx([HEADER, row({ '#': 7, Nome: 'Rossi' }), row({ '#': 7, Nome: 'Bianchi' })]);
    expect(() => parseListone(bytes)).toThrowError(/id "#"=7 duplicato/);
  });

  it('fallisce se il Nome si normalizza a stringa vuota', () => {
    expect(() => parseListone(makeXlsx([HEADER, row({ Nome: '***' })]))).toThrowError(
      /si normalizza a stringa vuota/,
    );
  });

  it('segnala le omonimie come warning, non come errore', () => {
    const bytes = makeXlsx([
      HEADER,
      row({ '#': 1, Nome: 'Rossi' }),
      row({ '#': 2, Nome: 'ROSSI' }),
    ]);
    const result = parseListone(bytes);
    expect(result.players).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Omonimia su "rossi"');
  });

  it('espone la riga colpevole sull errore', () => {
    try {
      parseListone(makeXlsx([HEADER, row({ '#': 1 }), row({ '#': 2, 'R.': 'Z' })]));
      expect.unreachable('doveva fallire');
    } catch (e) {
      expect(e).toBeInstanceOf(ListoneParseError);
      expect((e as ListoneParseError).row).toBe(3);
    }
  });

  it('gestisce le righe piu corte dell header', () => {
    const bytes = makeXlsx([HEADER, [1]]);
    expect(() => parseListone(bytes)).toThrowError(/Riga 2: colonna "Nome" vuota/);
  });
});

describe('parseListone — errori strutturali', () => {
  it('fallisce su file vuoto', () => {
    expect(() => parseListone(new Uint8Array(0))).toThrowError(/File vuoto/);
    expect(() => parseListone(new ArrayBuffer(0))).toThrowError(/File vuoto/);
  });

  it('fallisce su uno zip troncato', () => {
    // Header ZIP valido seguito da spazzatura: SheetJS esplode in lettura.
    const truncated = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9, 9, 9, 9, 9, 9, 9, 9]);
    expect(() => parseListone(truncated)).toThrowError(ListoneParseError);
    expect(() => parseListone(truncated)).toThrowError(/Impossibile leggere il file \.xlsx/);
  });

  it('fallisce, non tace, su bytes che non sono uno .xlsx', () => {
    // SheetJS e tollerante: su bytes arbitrari puo restituire un foglio vuoto
    // invece di lanciare. Il contratto e che il parser fallisca comunque —
    // qui con "Colonne mancanti" — non che scelga un messaggio preciso.
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => parseListone(junk)).toThrowError(ListoneParseError);
  });

  it('fallisce nominando i fogli disponibili se il nome non esiste', () => {
    const bytes = makeXlsx([HEADER, row()], 'Foglio1');
    expect(() => parseListone(bytes, { sheetName: 'Altro' })).toThrowError(
      /Foglio "Altro" non trovato.*Foglio1/s,
    );
  });

  it('fallisce su foglio senza header', () => {
    const bytes = makeXlsx([[]]);
    expect(() => parseListone(bytes)).toThrowError(/Foglio vuoto|Colonne mancanti/);
  });

  it('fallisce se dopo il filtro non resta nessun giocatore', () => {
    const bytes = makeXlsx([HEADER, row({ 'Fuori lista': '*' })]);
    expect(() => parseListone(bytes)).toThrowError(/Nessun giocatore in lista/);
  });

});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
