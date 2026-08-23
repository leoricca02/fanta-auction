import * as XLSX from 'xlsx';

import type { LeagueConfig } from '../domain/types';
import type { LeagueState } from '../domain/reducer';
import { ListoneParseError } from '../parse/listone';

/**
 * Export `.xlsx` nativo reimportabile (PRD §6.1) — priorita' massima.
 *
 * **Si riscrive dentro il file originale**, non se ne genera uno nuovo. Il
 * listone ha colonne che l'app non usa (`R.MANTRA`, `PGv`, `MV`, `FM`) e righe
 * che scarta (i fuori lista): rigenerarlo da capo produrrebbe un file simile ma
 * non identico, e "reimportabile in Lega Fantacalcio" non ammette il quasi.
 * Cosi' l'unica differenza rispetto a quello che hai scaricato sono le due
 * colonne che dovevano essere compilate.
 */

export interface AssignmentRow {
  /** Sigla della squadra acquirente, come finira' in `FantaSquadra`. */
  readonly abbr: string;
  readonly price: number;
}

export class ExportError extends Error {
  override readonly name = 'ExportError';
}

/** Mappa `playerId -> acquirente` a partire dallo stato di lega ripiegato. */
export function assignmentsFromState(
  state: LeagueState,
  config: LeagueConfig,
): Map<number, AssignmentRow> {
  const abbrByTeamId = new Map(config.teams.map((t) => [t.id, t.abbr.toUpperCase()]));
  const out = new Map<number, AssignmentRow>();
  for (const [playerId, owned] of Object.entries(state.assignmentByPlayerId)) {
    out.set(Number(playerId), {
      abbr: abbrByTeamId.get(owned.teamId) ?? owned.teamId.toUpperCase(),
      price: owned.price,
    });
  }
  return out;
}

/** Indice di colonna a partire dall'header, come nel parser. */
function columnIndex(header: readonly unknown[], name: string): number {
  const index = header.findIndex(
    (cell) => typeof cell === 'string' && cell.trim() === name,
  );
  if (index < 0) {
    throw new ListoneParseError(`Colonna "${name}" mancante nel file sorgente dell'export.`);
  }
  return index;
}

export interface NativeExportResult {
  readonly bytes: Uint8Array;
  /** Righe a cui e' stato scritto un acquirente. */
  readonly written: number;
  /**
   * Giocatori assegnati che non compaiono nel file sorgente. Succede se il
   * listone e' stato sostituito dopo l'inizio dell'asta.
   */
  readonly missing: readonly number[];
}

/**
 * Riempie `FantaSquadra` e `Costo` nel file originale.
 *
 * @param sourceBytes il `.xlsx` esattamente com'e' stato importato.
 * @param assignments acquirenti per id giocatore (colonna `#`).
 */
export function buildNativeXlsx(
  sourceBytes: Uint8Array,
  assignments: ReadonlyMap<number, AssignmentRow>,
  options: { readonly sheetName?: string } = {},
): NativeExportResult {
  if (sourceBytes.byteLength === 0) {
    throw new ExportError('File sorgente assente: ricarica il listone prima di esportare.');
  }

  const workbook = XLSX.read(sourceBytes, { type: 'array', cellStyles: true });
  const sheetName = options.sheetName ?? workbook.SheetNames[0];
  if (sheetName === undefined) throw new ExportError('Il file sorgente non contiene fogli.');
  const sheet = workbook.Sheets[sheetName];
  if (sheet === undefined) throw new ExportError(`Foglio "${sheetName}" non trovato.`);

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const header = aoa[0];
  if (header === undefined) throw new ExportError('Il foglio sorgente e vuoto.');

  const idCol = columnIndex(header, '#');
  const teamCol = columnIndex(header, 'FantaSquadra');
  const costCol = columnIndex(header, 'Costo');

  const seen = new Set<number>();
  let written = 0;

  for (let row = 1; row < aoa.length; row++) {
    const raw = aoa[row]?.[idCol];
    const id = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(id)) continue;

    const assignment = assignments.get(id);
    if (assignment === undefined) continue;

    seen.add(id);
    written += 1;
    // Le due colonne non sono per forza adiacenti: ognuna al suo posto.
    // `encode_cell` usa indici 0-based, e la riga 0 e' l'header.
    sheet[XLSX.utils.encode_cell({ r: row, c: teamCol })] = { t: 's', v: assignment.abbr };
    sheet[XLSX.utils.encode_cell({ r: row, c: costCol })] = { t: 'n', v: assignment.price };
  }

  const missing = [...assignments.keys()].filter((id) => !seen.has(id));
  const out: unknown = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

  return { bytes: new Uint8Array(out as ArrayBuffer), written, missing };
}

/** Nome file suggerito. */
export function nativeExportFilename(now: number = Date.now()): string {
  const iso = new Date(now).toISOString().slice(0, 10);
  return `lista_calciatori_classic-compilata-${iso}.xlsx`;
}

