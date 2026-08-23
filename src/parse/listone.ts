import * as XLSX from 'xlsx';
import type { Player, Role } from '../domain/types';

/**
 * Parser difensivo del listone .xlsx (PRD §2.1).
 *
 * Principio: lo schema cambia ogni stagione, quindi il parser valida e fallisce
 * con un messaggio che nomina la colonna o la riga colpevole. Mai in silenzio.
 */

/** Colonne attese in §2.1. La mancanza di una qualsiasi è un errore fatale. */
export const EXPECTED_COLUMNS = [
  '#',
  'Nome',
  'Fuori lista',
  'Sq.',
  'Under',
  'R.',
  'R.MANTRA',
  'PGv',
  'MV',
  'FM',
  'FVM/1000',
  'QUOT.',
  'FantaSquadra',
  'Costo',
] as const;

export type ExpectedColumn = (typeof EXPECTED_COLUMNS)[number];

/** Marcatore della colonna `Fuori lista`: 21 righe da escludere dal pool. */
export const FUORI_LISTA_MARKER = '*';

const VALID_ROLES: ReadonlySet<string> = new Set<Role>(['P', 'D', 'C', 'A']);

export class ListoneParseError extends Error {
  override readonly name = 'ListoneParseError';
  /** Riga del foglio (1-based, header incluso) quando l'errore è su una riga. */
  readonly row: number | null;

  constructor(message: string, row: number | null = null) {
    super(message);
    this.row = row;
  }
}

export interface ParseListoneOptions {
  /** Foglio da leggere. Default: il primo del workbook. */
  readonly sheetName?: string;
}

export interface ParseListoneResult {
  readonly players: readonly Player[];
  /** Righe dati totali, header e righe vuote esclusi. */
  readonly totalRows: number;
  /** Righe scartate perché `Fuori lista === '*'`. */
  readonly excludedCount: number;
  /** Righe interamente vuote, ignorate senza errore. */
  readonly blankRows: number;
  /** Anomalie non fatali (es. omonimie), da mostrare all'utente. */
  readonly warnings: readonly string[];
}

/**
 * Normalizza un nome per la fuzzy search: accenti via, minuscolo, separatori
 * collassati. Il nome originale resta intatto in `Player.name` per il display.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/[đð]/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/þ/g, 'th')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

/** Interi tolleranti: accetta `35` e `"35"`, rifiuta `"35a"`, vuoto, `3.5`. */
function cellToInt(value: unknown, column: ExpectedColumn, row: number): number {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === null || raw === undefined || raw === '') {
    throw new ListoneParseError(`Riga ${row}: colonna "${column}" vuota, atteso un intero.`, row);
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new ListoneParseError(
      `Riga ${row}: colonna "${column}" non numerica (valore "${String(value)}").`,
      row,
    );
  }
  if (!Number.isInteger(n)) {
    throw new ListoneParseError(
      `Riga ${row}: colonna "${column}" non intera (valore "${String(value)}").`,
      row,
    );
  }
  return n;
}

function readWorkbook(input: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  const data = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (data.byteLength === 0) {
    throw new ListoneParseError('File vuoto: nessun byte da leggere.');
  }
  try {
    return XLSX.read(data, { type: 'array' });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ListoneParseError(`Impossibile leggere il file .xlsx: ${detail}`);
  }
}

function pickSheet(wb: XLSX.WorkBook, sheetName: string | undefined): XLSX.WorkSheet {
  const name = sheetName ?? wb.SheetNames[0];
  if (name === undefined) {
    throw new ListoneParseError('Il workbook non contiene fogli.');
  }
  const sheet = wb.Sheets[name];
  if (sheet === undefined) {
    throw new ListoneParseError(
      `Foglio "${name}" non trovato. Fogli disponibili: ${wb.SheetNames.join(', ')}.`,
    );
  }
  return sheet;
}

/**
 * Mappa nome colonna -> indice. Fallisce nominando **tutte** le colonne mancanti
 * in un colpo solo, e le eventuali colonne duplicate (mapping ambiguo).
 */
function mapColumns(header: readonly unknown[]): Record<ExpectedColumn, number> {
  const indexByName = new Map<string, number[]>();
  header.forEach((cell, i) => {
    const name = cellToString(cell);
    if (name === '') return;
    const slot = indexByName.get(name);
    if (slot === undefined) indexByName.set(name, [i]);
    else slot.push(i);
  });

  const missing: string[] = [];
  const duplicated: string[] = [];
  const mapping = {} as Record<ExpectedColumn, number>;

  for (const column of EXPECTED_COLUMNS) {
    const found = indexByName.get(column);
    if (found === undefined) {
      missing.push(column);
      continue;
    }
    if (found.length > 1) {
      duplicated.push(`${column} (x${found.length})`);
      continue;
    }
    mapping[column] = found[0] as number;
  }

  if (missing.length > 0) {
    throw new ListoneParseError(
      `Colonne mancanti nel listone: ${missing.map((c) => `"${c}"`).join(', ')}. ` +
        `Attese: ${EXPECTED_COLUMNS.join(', ')}. ` +
        `Trovate: ${[...indexByName.keys()].join(', ')}.`,
    );
  }
  if (duplicated.length > 0) {
    throw new ListoneParseError(
      `Colonne duplicate nel listone: ${duplicated.join(', ')}. Il mapping sarebbe ambiguo.`,
    );
  }
  return mapping;
}

function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((cell) => cellToString(cell) === '');
}

/**
 * Legge il listone e restituisce i giocatori in lista.
 *
 * @param input contenuto binario del .xlsx (browser: `File.arrayBuffer()`).
 * @throws {ListoneParseError} su colonna mancante o duplicata, riga malformata,
 *   ruolo sconosciuto, `#` duplicato.
 */
export function parseListone(
  input: ArrayBuffer | Uint8Array,
  options: ParseListoneOptions = {},
): ParseListoneResult {
  const sheet = pickSheet(readWorkbook(input), options.sheetName);
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });

  const header = aoa[0];
  if (header === undefined) {
    throw new ListoneParseError('Foglio vuoto: header atteso sulla riga 1.');
  }
  const col = mapColumns(header);

  const players: Player[] = [];
  const warnings: string[] = [];
  const seenIds = new Map<number, string>();
  const seenSearchKeys = new Map<string, string>();
  let excludedCount = 0;
  let blankRows = 0;

  for (let i = 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    const rowNumber = i + 1; // 1-based, header incluso
    if (isBlankRow(row)) {
      blankRows++;
      continue;
    }

    if (cellToString(row[col['Fuori lista']]) === FUORI_LISTA_MARKER) {
      excludedCount++;
      continue;
    }

    const id = cellToInt(row[col['#']], '#', rowNumber);
    const name = cellToString(row[col['Nome']]);
    if (name === '') {
      throw new ListoneParseError(`Riga ${rowNumber}: colonna "Nome" vuota.`, rowNumber);
    }
    const team = cellToString(row[col['Sq.']]);
    if (team === '') {
      throw new ListoneParseError(`Riga ${rowNumber}: colonna "Sq." vuota.`, rowNumber);
    }
    const roleRaw = cellToString(row[col['R.']]).toUpperCase();
    if (!VALID_ROLES.has(roleRaw)) {
      throw new ListoneParseError(
        `Riga ${rowNumber}: ruolo "${roleRaw}" non valido nella colonna "R." (attesi P, D, C, A).`,
        rowNumber,
      );
    }

    const previousId = seenIds.get(id);
    if (previousId !== undefined) {
      throw new ListoneParseError(
        `Riga ${rowNumber}: id "#"=${id} duplicato (già usato da "${previousId}"). ` +
          `La colonna "#" è la chiave primaria.`,
        rowNumber,
      );
    }
    seenIds.set(id, name);

    const searchKey = normalizeName(name);
    if (searchKey === '') {
      throw new ListoneParseError(
        `Riga ${rowNumber}: "Nome" ("${name}") si normalizza a stringa vuota, ` +
          `inutilizzabile per la ricerca.`,
        rowNumber,
      );
    }
    const previousKey = seenSearchKeys.get(searchKey);
    if (previousKey !== undefined) {
      warnings.push(
        `Omonimia su "${searchKey}": "${previousKey}" e "${name}". ` +
          `La fuzzy search chiederà disambiguazione.`,
      );
    } else {
      seenSearchKeys.set(searchKey, name);
    }

    players.push({
      id,
      name,
      searchKey,
      team,
      role: roleRaw as Role,
      under: cellToInt(row[col['Under']], 'Under', rowNumber),
      quot: cellToInt(row[col['QUOT.']], 'QUOT.', rowNumber),
      fvm: cellToInt(row[col['FVM/1000']], 'FVM/1000', rowNumber),
    });
  }

  if (players.length === 0) {
    throw new ListoneParseError('Nessun giocatore in lista dopo il filtro "Fuori lista".');
  }

  return {
    players,
    totalRows: aoa.length - 1 - blankRows,
    excludedCount,
    blankRows,
    warnings,
  };
}
