import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  ExportError,
  assignmentsFromState,
  buildNativeXlsx,
  nativeExportFilename,
} from './native';
import { reduce } from '../domain/reducer';
import { parseListone } from '../parse/listone';
import {
  findPlayer,
  makeEvent,
  readListoneBytes,
  realConfig,
  resetEventCounter,
} from '../test/fixtures';

beforeEach(() => resetEventCounter());

/** Rilegge il file esportato come farebbe Lega Fantacalcio. */
function readBack(bytes: Uint8Array): Record<string, unknown>[] {
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0] as string];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet as XLSX.WorkSheet, {
    defval: null,
  });
}

describe('§6.1 — export nativo reimportabile', () => {
  const config = realConfig();
  const lautaro = findPlayer(config.players, 'Martinez L.');
  const dimarco = findPlayer(config.players, 'Dimarco');

  const state = reduce(
    [
      makeEvent({ playerId: lautaro.id, teamId: 'leo', price: 140, phase: 'A' }),
      makeEvent({ playerId: dimarco.id, teamId: 'sq2', price: 92, phase: 'D' }),
    ],
    config,
  );

  it('scrive FantaSquadra e Costo sulle righe giuste', () => {
    const result = buildNativeXlsx(readListoneBytes(), assignmentsFromState(state, config));
    expect(result.written).toBe(2);
    expect(result.missing).toEqual([]);

    const rows = readBack(result.bytes);
    const rigaLautaro = rows.find((r) => r['#'] === lautaro.id);
    const rigaDimarco = rows.find((r) => r['#'] === dimarco.id);

    expect(rigaLautaro?.['FantaSquadra']).toBe('LEO');
    expect(rigaLautaro?.['Costo']).toBe(140);
    expect(rigaDimarco?.['FantaSquadra']).toBe('SQ2');
    expect(rigaDimarco?.['Costo']).toBe(92);
  });

  it('lascia vuote le righe dei giocatori non assegnati', () => {
    const result = buildNativeXlsx(readListoneBytes(), assignmentsFromState(state, config));
    const rows = readBack(result.bytes);
    const nonAssegnati = rows.filter(
      (r) => r['#'] !== lautaro.id && r['#'] !== dimarco.id,
    );
    expect(nonAssegnati.every((r) => r['FantaSquadra'] === null)).toBe(true);
    expect(nonAssegnati.every((r) => r['Costo'] === null)).toBe(true);
  });

  it('conserva tutte le 594 righe, fuori lista compresi', () => {
    // Il parser ne scarta 59, ma il file per la lega deve restare integro.
    const result = buildNativeXlsx(readListoneBytes(), assignmentsFromState(state, config));
    expect(readBack(result.bytes)).toHaveLength(594);
  });

  it('conserva tutte le colonne originali, anche quelle che l app ignora', () => {
    const result = buildNativeXlsx(readListoneBytes(), assignmentsFromState(state, config));
    const prima = Object.keys(readBack(readListoneBytes())[0] ?? {});
    const dopo = Object.keys(readBack(result.bytes)[0] ?? {});
    for (const col of prima) expect(dopo).toContain(col);
    expect(dopo).toContain('R.MANTRA');
    expect(dopo).toContain('FVM/1000');
  });

  it('il file esportato e ancora leggibile dal nostro parser', () => {
    // Il giro completo: esporto, e il risultato resta un listone valido.
    const result = buildNativeXlsx(readListoneBytes(), assignmentsFromState(state, config));
    const reparsed = parseListone(result.bytes);
    expect(reparsed.players).toHaveLength(532);
    expect(reparsed.excludedCount).toBe(62);
  });

  it('senza assegnazioni non tocca niente', () => {
    const result = buildNativeXlsx(readListoneBytes(), new Map());
    expect(result.written).toBe(0);
    const rows = readBack(result.bytes);
    expect(rows.every((r) => r['FantaSquadra'] === null)).toBe(true);
  });

  it('segnala i giocatori assegnati che il file non contiene', () => {
    const result = buildNativeXlsx(
      readListoneBytes(),
      new Map([[999999, { abbr: 'LEO', price: 10 }]]),
    );
    expect(result.written).toBe(0);
    expect(result.missing).toEqual([999999]);
  });

  it('un evento annullato non finisce nell export', () => {
    const conUndo = reduce(
      [
        makeEvent({ id: 'a', playerId: lautaro.id, teamId: 'leo', price: 140, phase: 'A', undone: true }),
        makeEvent({ id: 'b', playerId: dimarco.id, teamId: 'sq2', price: 92, phase: 'D' }),
      ],
      config,
    );
    const result = buildNativeXlsx(readListoneBytes(), assignmentsFromState(conUndo, config));
    expect(result.written).toBe(1);
    const rows = readBack(result.bytes);
    expect(rows.find((r) => r['#'] === lautaro.id)?.['FantaSquadra']).toBeNull();
  });

  it('fallisce con un messaggio esplicito se manca il file sorgente', () => {
    expect(() => buildNativeXlsx(new Uint8Array(0), new Map())).toThrowError(ExportError);
    expect(() => buildNativeXlsx(new Uint8Array(0), new Map())).toThrowError(
      /ricarica il listone/,
    );
  });

  it('fallisce se il sorgente non ha le colonne di destinazione', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['#', 'Nome'], [1, 'x']]), 'S');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
    expect(() => buildNativeXlsx(bytes, new Map())).toThrowError(/"FantaSquadra" mancante/);
  });
});

describe('assignmentsFromState', () => {
  const config = realConfig();

  it('usa la sigla in maiuscolo, non l id interno', () => {
    const lautaro = findPlayer(config.players, 'Martinez L.');
    const state = reduce(
      [makeEvent({ playerId: lautaro.id, teamId: 'leo', price: 140, phase: 'A' })],
      config,
    );
    expect(assignmentsFromState(state, config).get(lautaro.id)).toEqual({
      abbr: 'LEO',
      price: 140,
    });
  });

  it('e vuota a inizio asta', () => {
    expect(assignmentsFromState(reduce([], config), config).size).toBe(0);
  });
});

describe('nativeExportFilename', () => {
  it('contiene la data ed e ordinabile', () => {
    const oggi = nativeExportFilename(Date.UTC(2026, 8, 10));
    expect(oggi).toBe('lista_calciatori_classic-compilata-2026-09-10.xlsx');
    expect(oggi < nativeExportFilename(Date.UTC(2026, 8, 11))).toBe(true);
  });
});
