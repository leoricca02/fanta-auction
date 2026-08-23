import { beforeEach, describe, expect, it } from 'vitest';

import { ExportPdfError, buildRosterDocument, pdfFilename, resolveVfs } from './pdf';
import { reduce } from '../domain/reducer';
import { findPlayer, makeEvent, realConfig, resetEventCounter } from '../test/fixtures';

beforeEach(() => resetEventCounter());

const config = realConfig();
const lautaro = findPlayer(config.players, 'Martinez L.');
const dimarco = findPlayer(config.players, 'Dimarco');

const state = reduce(
  [
    makeEvent({ playerId: lautaro.id, teamId: 'leo', price: 140, phase: 'A' }),
    makeEvent({ playerId: dimarco.id, teamId: 'leo', price: 92, phase: 'D' }),
  ],
  config,
);

/** Finto vfs: quello vero e' megabyte di base64, qui basta la forma. */
const FAKE_VFS = { 'Roboto-Regular.ttf': 'AAAA', 'Roboto-Italic.ttf': 'BBBB' };

describe('resolveVfs — le forme in cui pdfmake espone i font', () => {
  it('CommonJS visto da ESM: il vfs sta sotto default', () => {
    // E' la forma di pdfmake 0.2.23, quella che aveva rotto il download.
    expect(resolveVfs({ default: FAKE_VFS })).toBe(FAKE_VFS);
  });

  it('build che espone .vfs', () => {
    expect(resolveVfs({ vfs: FAKE_VFS })).toBe(FAKE_VFS);
  });

  it('build vecchie che espongono .pdfMake.vfs', () => {
    expect(resolveVfs({ pdfMake: { vfs: FAKE_VFS } })).toBe(FAKE_VFS);
  });

  it('oggetto passato direttamente', () => {
    expect(resolveVfs(FAKE_VFS)).toBe(FAKE_VFS);
  });

  it('fallisce con un messaggio esplicito se non trova i font', () => {
    expect(() => resolveVfs({})).toThrowError(ExportPdfError);
    expect(() => resolveVfs({ default: {} })).toThrowError(/vfs_fonts non ha la forma attesa/);
    expect(() => resolveVfs({ default: { 'non-un-font.txt': 'x' } })).toThrowError(ExportPdfError);
    expect(() => resolveVfs(null)).toThrowError(ExportPdfError);
  });

  it('non si fa ingannare da un default vuoto se il vfs e altrove', () => {
    expect(resolveVfs({ default: {}, vfs: FAKE_VFS })).toBe(FAKE_VFS);
  });
});

describe('§6.4 — documento delle rose', () => {
  it('ha titolo, data e un blocco per ogni squadra', () => {
    const doc = buildRosterDocument(state, config, Date.UTC(2026, 8, 10));
    const content = doc.content as unknown[];
    expect(content.length).toBe(2 + config.teams.length * 3);
    expect((content[0] as { text: string }).text).toContain('riepilogo rose');
  });

  it('elenca gli acquisti con ruolo, nome, club e prezzo', () => {
    const doc = buildRosterDocument(state, config, 0);
    const tables = (doc.content as { table?: { body: string[][] } }[]).filter(
      (block) => block.table !== undefined,
    );
    const leo = tables[0]?.table?.body ?? [];
    expect(leo[0]).toEqual(['R', 'Giocatore', 'Club', 'Costo']);
    expect(leo).toContainEqual(['D', 'Dimarco', 'Inter', '92']);
    expect(leo).toContainEqual(['A', 'Martinez L.', 'Inter', '140']);
  });

  it('le squadre senza acquisti hanno una riga di cortesia, non una tabella vuota', () => {
    const doc = buildRosterDocument(state, config, 0);
    const tables = (doc.content as { table?: { body: string[][] } }[]).filter(
      (block) => block.table !== undefined,
    );
    expect(tables[1]?.table?.body).toEqual([
      ['R', 'Giocatore', 'Club', 'Costo'],
      ['—', 'nessun acquisto', '', ''],
    ]);
  });

  it('funziona anche a inizio asta', () => {
    expect(() => buildRosterDocument(reduce([], config), config, 0)).not.toThrow();
  });
});

describe('pdfFilename', () => {
  it('contiene la data ed e ordinabile', () => {
    expect(pdfFilename(Date.UTC(2026, 8, 10))).toBe('fanta-rose-2026-09-10.pdf');
    expect(pdfFilename(Date.UTC(2026, 8, 10)) < pdfFilename(Date.UTC(2026, 8, 11))).toBe(true);
  });
});
