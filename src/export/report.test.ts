import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { buildReportXlsx, buildRosterRows, buildSpendRows, totalSpendByRole } from './report';
import { reduce } from '../domain/reducer';
import { findPlayer, makeEvent, realConfig, resetEventCounter } from '../test/fixtures';
import { payScaledByQuot, runAuction } from '../test/replay';

beforeEach(() => resetEventCounter());

const config = realConfig();
const lautaro = findPlayer(config.players, 'Martinez L.');
const dimarco = findPlayer(config.players, 'Dimarco');

const state = reduce(
  [
    makeEvent({ playerId: lautaro.id, teamId: 'leo', price: 140, phase: 'A' }),
    makeEvent({ playerId: dimarco.id, teamId: 'leo', price: 92, phase: 'D' }),
    makeEvent({ playerId: 5585, teamId: 'sq2', price: 80, phase: 'A' }),
  ],
  config,
);

describe('§6.3 — righe delle rose', () => {
  it('una riga per acquisto, col nome del giocatore e il prezzo pagato', () => {
    const rows = buildRosterRows(state, config);
    expect(rows).toHaveLength(3);
    const riga = rows.find((r) => r.giocatore === 'Martinez L.');
    expect(riga).toMatchObject({
      sigla: 'LEO',
      ruolo: 'A',
      club: 'Inter',
      quot: 33,
      prezzo: 140,
    });
  });

  it('ordina per squadra e poi per ruolo di asta', () => {
    const rows = buildRosterRows(state, config);
    const leo = rows.filter((r) => r.sigla === 'LEO');
    expect(leo.map((r) => r.ruolo)).toEqual(['D', 'A']);
  });

  it('a inizio asta non produce righe', () => {
    expect(buildRosterRows(reduce([], config), config)).toEqual([]);
  });
});

describe('§6.3 — spesa per reparto', () => {
  it('una riga per ogni squadra, anche quelle che non hanno comprato', () => {
    const rows = buildSpendRows(state, config);
    expect(rows).toHaveLength(12);
    expect(rows.every((r) => r.residuo + r.totale === 800)).toBe(true);
  });

  it('somma il pagato per reparto', () => {
    const leo = buildSpendRows(state, config).find((r) => r.sigla === 'LEO');
    expect(leo).toMatchObject({ P: 0, D: 92, C: 0, A: 140, totale: 232, slotOccupati: 2 });
    expect(leo?.residuo).toBe(568);
  });

  it('i totali di lega combaciano con la somma delle squadre', () => {
    const totals = totalSpendByRole(state, config);
    const rows = buildSpendRows(state, config);
    for (const role of ['P', 'D', 'C', 'A'] as const) {
      expect(totals[role]).toBe(rows.reduce((acc, r) => acc + r[role], 0));
    }
  });

  it('su un asta completa i conti chiudono', () => {
    const { finalState } = runAuction({ config, priceFor: payScaledByQuot(3) });
    const rows = buildSpendRows(finalState, config);
    expect(rows.every((r) => r.slotOccupati === 25)).toBe(true);
    const speso = rows.reduce((acc, r) => acc + r.totale, 0);
    expect(speso).toBe(finalState.creditsSpent);
    expect(buildRosterRows(finalState, config)).toHaveLength(300);
  });
});

describe('§6.3 — workbook', () => {
  it('produce tre fogli leggibili', () => {
    const wb = XLSX.read(buildReportXlsx(state, config), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Rose', 'Spesa per reparto', 'Totali lega']);

    const rose = XLSX.utils.sheet_to_json(wb.Sheets['Rose'] as XLSX.WorkSheet);
    expect(rose).toHaveLength(3);

    const totali = XLSX.utils.sheet_to_json<{ ruolo: string; spesaLega: number }>(
      wb.Sheets['Totali lega'] as XLSX.WorkSheet,
    );
    expect(totali.find((r) => r.ruolo === 'A')?.spesaLega).toBe(220);
  });
});
