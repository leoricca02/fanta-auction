import * as XLSX from 'xlsx';

import type { ByRole, LeagueConfig, Player, Role } from '../domain/types';
import { PHASE_ORDER } from '../domain/types';
import type { LeagueState } from '../domain/reducer';
import { makePlayerIndex, teamState } from '../domain/reducer';

/**
 * Report `.xlsx` multi-foglio (PRD §6.3): rose e spesa per reparto.
 *
 * A differenza dell'export nativo questo file non deve essere reimportabile da
 * nessuna parte: serve a rileggere l'asta a mente fredda. La costruzione dei
 * dati sta in funzioni pure e testabili, la serializzazione e' un dettaglio.
 */

export interface RosterRow {
  readonly squadra: string;
  readonly sigla: string;
  readonly ruolo: Role;
  readonly giocatore: string;
  readonly club: string;
  readonly quot: number;
  readonly prezzo: number;
}

export interface SpendRow {
  readonly squadra: string;
  readonly sigla: string;
  readonly P: number;
  readonly D: number;
  readonly C: number;
  readonly A: number;
  readonly totale: number;
  readonly residuo: number;
  readonly slotOccupati: number;
}

/** Righe delle rose, ordinate per squadra e poi per ruolo di asta. */
export function buildRosterRows(state: LeagueState, config: LeagueConfig): RosterRow[] {
  const players = makePlayerIndex(config.players);
  const rows: RosterRow[] = [];

  for (const team of config.teams) {
    const t = teamState(state, team.id);
    for (const role of PHASE_ORDER) {
      for (const entry of t.roster.filter((e) => e.role === role)) {
        const player: Player | undefined = players.get(entry.playerId);
        rows.push({
          squadra: team.name,
          sigla: team.abbr.toUpperCase(),
          ruolo: role,
          giocatore: player?.name ?? `#${entry.playerId}`,
          club: player?.team ?? '',
          quot: player?.quot ?? 0,
          prezzo: entry.price,
        });
      }
    }
  }
  return rows;
}

/** Spesa per reparto, una riga per squadra. */
export function buildSpendRows(state: LeagueState, config: LeagueConfig): SpendRow[] {
  return config.teams.map((team) => {
    const t = teamState(state, team.id);
    const byRole: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
    for (const entry of t.roster) byRole[entry.role] += entry.price;
    return {
      squadra: team.name,
      sigla: team.abbr.toUpperCase(),
      P: byRole.P,
      D: byRole.D,
      C: byRole.C,
      A: byRole.A,
      totale: t.spent,
      residuo: t.credits,
      slotOccupati: t.slotsFilled,
    };
  });
}

/** Spesa complessiva di lega per reparto. */
export function totalSpendByRole(state: LeagueState, config: LeagueConfig): ByRole<number> {
  const out: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const team of config.teams) {
    for (const entry of teamState(state, team.id).roster) out[entry.role] += entry.price;
  }
  return out;
}

export function buildReportXlsx(state: LeagueState, config: LeagueConfig): Uint8Array {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildRosterRows(state, config)),
    'Rose',
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(buildSpendRows(state, config)),
    'Spesa per reparto',
  );

  const totals = totalSpendByRole(state, config);
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      PHASE_ORDER.map((role) => ({ ruolo: role, spesaLega: totals[role] })),
    ),
    'Totali lega',
  );

  const out: unknown = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out as ArrayBuffer);
}

export function reportFilename(now: number = Date.now()): string {
  return `fanta-report-${new Date(now).toISOString().slice(0, 10)}.xlsx`;
}
