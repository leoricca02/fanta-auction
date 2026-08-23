import type {
  AssignmentEvent,
  Lineup,
  LineupSlot,
  Objectives,
  ObjectiveTarget,
  PlayerNote,
  Role,
  Tag,
  TeamNote,
  UserData,
} from './types';
import { PHASE_ORDER, TAGS } from './types';

/**
 * Backup dei dati utente (PRD §3.1) — **il requisito piu' importante del
 * progetto**.
 *
 * Le note sono l'intero valore dell'applicazione e vivono in IndexedDB, che una
 * pulizia dati del browser azzera senza preavviso. Un backup che si rompe in
 * silenzio e' peggio di nessun backup, quindi qui:
 *
 * - `importUserData` **non lancia mai** e **non muta mai** lo stato corrente:
 *   restituisce un risultato discriminato. Un file corrotto non puo' lasciare
 *   lo store a meta' strada, perche' lo store nuovo si costruisce tutto in
 *   memoria e viene restituito solo se la validazione e' passata per intero.
 * - Il merge e' **non distruttivo**: cio' che esiste e non e' nel file resta.
 * - Ogni collezione assente dal file e' "nessun dato", non "cancella tutto".
 *
 * Questo modulo e' puro: serializza e valida. Scriverlo su disco e leggerlo da
 * IndexedDB e' compito di /src/store e /src/export.
 */

/** Marcatore di formato. Serve a rifiutare un JSON di un'altra applicazione. */
export const BACKUP_FORMAT = 'fanta-auction-assistant';

/** Versione dello schema dei dati utente. Si incrementa a ogni breaking change. */
export const USER_DATA_SCHEMA_VERSION = 1;

export interface UserDataBackup {
  readonly app: typeof BACKUP_FORMAT;
  readonly schemaVersion: number;
  readonly exportedAt: number;
  readonly data: UserData;
}

export type ImportErrorReason =
  | 'INVALID_JSON'
  | 'NOT_AN_OBJECT'
  | 'UNKNOWN_FORMAT'
  | 'UNSUPPORTED_SCHEMA'
  | 'INVALID_PAYLOAD';

export interface ImportError {
  readonly reason: ImportErrorReason;
  /** Messaggio gia' formattato per la UI: dice cosa non va e dove. */
  readonly detail: string;
}

export interface ImportCollectionSummary {
  readonly added: number;
  readonly updated: number;
  /** `true` se la collezione era assente dal file e quindi lasciata intatta. */
  readonly untouched: boolean;
}

export interface ImportSummary {
  readonly lineups: ImportCollectionSummary;
  readonly playerNotes: ImportCollectionSummary;
  readonly teamNotes: ImportCollectionSummary;
  readonly events: ImportCollectionSummary;
  /** `true` se il file conteneva gli obiettivi e li ha sostituiti. */
  readonly objectivesReplaced: boolean;
  readonly schemaVersion: number;
  readonly exportedAt: number;
}

export type ImportResult =
  | { readonly ok: true; readonly data: UserData; readonly summary: ImportSummary }
  | { readonly ok: false; readonly error: ImportError };

// ---------------------------------------------------------------------------
// Stato vuoto
// ---------------------------------------------------------------------------

export function emptyObjectives(): Objectives {
  return { text: '', targets: [] };
}

export function emptyUserData(): UserData {
  return {
    lineups: [],
    playerNotes: [],
    teamNotes: [],
    objectives: emptyObjectives(),
    events: [],
  };
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Costruisce la busta di backup. Non tocca `data`. */
export function exportUserData(data: UserData, now: number = Date.now()): UserDataBackup {
  return {
    app: BACKUP_FORMAT,
    schemaVersion: USER_DATA_SCHEMA_VERSION,
    exportedAt: now,
    data: {
      lineups: data.lineups.map(cloneLineup),
      playerNotes: data.playerNotes.map((n) => ({ ...n })),
      teamNotes: data.teamNotes.map((n) => ({ ...n })),
      objectives: {
        text: data.objectives.text,
        targets: data.objectives.targets.map((t) => ({ ...t })),
      },
      events: data.events.map((e) => ({ ...e })),
    },
  };
}

/** Il JSON da scrivere su file. `space = 2` perche' un backup si legge a occhio. */
export function serializeUserData(data: UserData, now: number = Date.now()): string {
  return JSON.stringify(exportUserData(data, now), null, 2);
}

/** Nome file suggerito, ordinabile cronologicamente. */
export function backupFilename(now: number = Date.now()): string {
  const iso = new Date(now).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `fanta-auction-backup-${iso}.json`;
}

function cloneLineup(l: Lineup): Lineup {
  return {
    teamCode: l.teamCode,
    module: l.module,
    updatedAt: l.updatedAt,
    slots: l.slots.map((s) => ({ ...s, candidates: [...s.candidates] })),
  };
}

// ---------------------------------------------------------------------------
// Validazione
// ---------------------------------------------------------------------------

/** Lanciato solo internamente: `importUserData` lo converte in `ImportError`. */
class PayloadError extends Error {
  override readonly name = 'PayloadError';
}

function fail(path: string, expected: string, got: unknown): never {
  throw new PayloadError(`${path}: atteso ${expected}, trovato ${describe(got)}.`);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'string') return `stringa "${value.slice(0, 24)}"`;
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (typeof value !== 'string') fail(`${path}.${key}`, 'una stringa', value);
  return value;
}

function readOptionalString(source: Record<string, unknown>, key: string, path: string): string {
  const value = source[key];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(`${path}.${key}`, 'una stringa', value);
  return value;
}

function readNumber(source: Record<string, unknown>, key: string, path: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path}.${key}`, 'un numero finito', value);
  }
  return value;
}

function readInt(source: Record<string, unknown>, key: string, path: string): number {
  const value = readNumber(source, key, path);
  if (!Number.isInteger(value)) fail(`${path}.${key}`, 'un intero', value);
  return value;
}

function readBoolean(source: Record<string, unknown>, key: string, path: string): boolean {
  const value = source[key];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') fail(`${path}.${key}`, 'un booleano', value);
  return value;
}

function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'un array', value);
  return value;
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'un oggetto', value);
  return value;
}

function readTag(source: Record<string, unknown>, path: string): Tag | null {
  const value = source['tag'];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !(TAGS as readonly string[]).includes(value)) {
    fail(`${path}.tag`, `uno tra ${TAGS.join(', ')} oppure null`, value);
  }
  return value as Tag;
}

function readRole(source: Record<string, unknown>, path: string): Role {
  const value = source['phase'];
  if (typeof value !== 'string' || !(PHASE_ORDER as readonly string[]).includes(value)) {
    fail(`${path}.phase`, `uno tra ${PHASE_ORDER.join(', ')}`, value);
  }
  return value as Role;
}

function parseLineup(raw: unknown, path: string): Lineup {
  const o = readRecord(raw, path);
  const slots = readArray(o['slots'] ?? [], `${path}.slots`).map<LineupSlot>((s, i) => {
    const slotPath = `${path}.slots[${i}]`;
    const slot = readRecord(s, slotPath);
    const candidates = readArray(slot['candidates'] ?? [], `${slotPath}.candidates`).map(
      (c, j) => {
        if (typeof c !== 'number' || !Number.isInteger(c)) {
          fail(`${slotPath}.candidates[${j}]`, 'un id intero', c);
        }
        return c;
      },
    );
    return {
      slotId: readString(slot, 'slotId', slotPath),
      roleLabel: readOptionalString(slot, 'roleLabel', slotPath),
      candidates,
      note: readOptionalString(slot, 'note', slotPath),
    };
  });

  return {
    teamCode: readString(o, 'teamCode', path),
    module: readOptionalString(o, 'module', path),
    slots,
    updatedAt: o['updatedAt'] === undefined ? 0 : readInt(o, 'updatedAt', path),
  };
}

function parsePlayerNote(raw: unknown, path: string): PlayerNote {
  const o = readRecord(raw, path);
  return {
    playerId: readInt(o, 'playerId', path),
    text: readOptionalString(o, 'text', path),
    tag: readTag(o, path),
    archived: readBoolean(o, 'archived', path),
  };
}

function parseTeamNote(raw: unknown, path: string): TeamNote {
  const o = readRecord(raw, path);
  return {
    teamCode: readString(o, 'teamCode', path),
    text: readOptionalString(o, 'text', path),
  };
}

function parseObjectives(raw: unknown, path: string): Objectives {
  const o = readRecord(raw, path);
  const targets = readArray(o['targets'] ?? [], `${path}.targets`).map<ObjectiveTarget>((t, i) => {
    const targetPath = `${path}.targets[${i}]`;
    const target = readRecord(t, targetPath);
    return {
      playerId: readInt(target, 'playerId', targetPath),
      priority: target['priority'] === undefined ? i : readNumber(target, 'priority', targetPath),
      note: readOptionalString(target, 'note', targetPath),
    };
  });
  return { text: readOptionalString(o, 'text', path), targets };
}

function parseEvent(raw: unknown, path: string): AssignmentEvent {
  const o = readRecord(raw, path);
  return {
    id: readString(o, 'id', path),
    ts: readInt(o, 'ts', path),
    playerId: readInt(o, 'playerId', path),
    teamId: readString(o, 'teamId', path),
    price: readInt(o, 'price', path),
    phase: readRole(o, path),
    undone: readBoolean(o, 'undone', path),
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

interface MergeOutcome<T> {
  readonly merged: T[];
  readonly summary: ImportCollectionSummary;
}

const UNTOUCHED: ImportCollectionSummary = { added: 0, updated: 0, untouched: true };

/**
 * Merge non distruttivo per chiave: cio' che c'e' e non arriva dal file resta,
 * cio' che arriva dal file sovrascrive. L'ordine e' quello corrente, con le
 * novita' in coda: importare non deve rimescolare una lista gia' ordinata.
 */
function mergeByKey<T, K>(
  current: readonly T[],
  incoming: readonly T[] | null,
  keyOf: (item: T) => K,
): MergeOutcome<T> {
  if (incoming === null) return { merged: [...current], summary: UNTOUCHED };

  const byKey = new Map<K, T>();
  const order: K[] = [];
  for (const item of current) {
    const key = keyOf(item);
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, item);
  }

  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const key = keyOf(item);
    if (byKey.has(key)) updated += 1;
    else {
      order.push(key);
      added += 1;
    }
    byKey.set(key, item);
  }

  return {
    merged: order.map((key) => byKey.get(key) as T),
    summary: { added, updated, untouched: false },
  };
}

/** L'event log si riordina per `ts`, poi per `id`: la piega dipende dall'ordine. */
function sortEvents(events: readonly AssignmentEvent[]): AssignmentEvent[] {
  return [...events].sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Importa un backup dentro lo stato corrente.
 *
 * Non lancia e non muta `current`: in caso di errore restituisce
 * `{ ok: false }` e lo stato di partenza resta esattamente com'era.
 *
 * @param current stato utente attuale (usa `emptyUserData()` per uno store vuoto).
 * @param raw il JSON come stringa, oppure un oggetto gia' deserializzato.
 */
export function importUserData(current: UserData, raw: unknown): ImportResult {
  let parsed: unknown = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      return err('INVALID_JSON', `Il file non e' JSON valido: ${String(cause)}`);
    }
  }

  if (!isRecord(parsed)) {
    return err(
      'NOT_AN_OBJECT',
      `Il backup deve essere un oggetto JSON, trovato ${describe(parsed)}.`,
    );
  }

  if (parsed['app'] !== BACKUP_FORMAT) {
    return err(
      'UNKNOWN_FORMAT',
      `Questo file non e' un backup di ${BACKUP_FORMAT} ` +
        `(campo "app": ${describe(parsed['app'])}).`,
    );
  }

  const schemaVersion = parsed['schemaVersion'];
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return err(
      'UNSUPPORTED_SCHEMA',
      `Versione di schema illeggibile: ${describe(schemaVersion)}. ` +
        `Attesa la versione ${USER_DATA_SCHEMA_VERSION}.`,
    );
  }
  if (schemaVersion !== USER_DATA_SCHEMA_VERSION) {
    return err(
      'UNSUPPORTED_SCHEMA',
      `Versione di schema ${schemaVersion} non supportata: questa build legge ` +
        `solo la ${USER_DATA_SCHEMA_VERSION}. Import annullato, nulla e' stato modificato.`,
    );
  }

  try {
    const payload = readRecord(parsed['data'] ?? {}, 'data');

    // Una collezione assente significa "nessun dato", mai "cancella tutto".
    const lineups = payload['lineups'] === undefined
      ? null
      : readArray(payload['lineups'], 'data.lineups').map((l, i) =>
          parseLineup(l, `data.lineups[${i}]`),
        );
    const playerNotes = payload['playerNotes'] === undefined
      ? null
      : readArray(payload['playerNotes'], 'data.playerNotes').map((n, i) =>
          parsePlayerNote(n, `data.playerNotes[${i}]`),
        );
    const teamNotes = payload['teamNotes'] === undefined
      ? null
      : readArray(payload['teamNotes'], 'data.teamNotes').map((n, i) =>
          parseTeamNote(n, `data.teamNotes[${i}]`),
        );
    const events = payload['events'] === undefined
      ? null
      : readArray(payload['events'], 'data.events').map((e, i) =>
          parseEvent(e, `data.events[${i}]`),
        );
    const objectives =
      payload['objectives'] === undefined
        ? null
        : parseObjectives(payload['objectives'], 'data.objectives');

    const mergedLineups = mergeByKey(current.lineups, lineups, (l) => l.teamCode);
    const mergedPlayerNotes = mergeByKey(current.playerNotes, playerNotes, (n) => n.playerId);
    const mergedTeamNotes = mergeByKey(current.teamNotes, teamNotes, (n) => n.teamCode);
    const mergedEvents = mergeByKey(current.events, events, (e) => e.id);

    return {
      ok: true,
      data: {
        lineups: mergedLineups.merged,
        playerNotes: mergedPlayerNotes.merged,
        teamNotes: mergedTeamNotes.merged,
        // Istanza unica: se il file la porta, sostituisce; altrimenti resta la corrente.
        objectives: objectives ?? current.objectives,
        events: sortEvents(mergedEvents.merged),
      },
      summary: {
        lineups: mergedLineups.summary,
        playerNotes: mergedPlayerNotes.summary,
        teamNotes: mergedTeamNotes.summary,
        events: mergedEvents.summary,
        objectivesReplaced: objectives !== null,
        schemaVersion,
        exportedAt:
          typeof parsed['exportedAt'] === 'number' && Number.isFinite(parsed['exportedAt'])
            ? parsed['exportedAt']
            : 0,
      },
    };
  } catch (cause) {
    // Nessuna eccezione esce da qui, nemmeno una inattesa: un import che
    // esplode a meta' e' esattamente il fallimento che §3.1 vuole escludere.
    if (cause instanceof PayloadError) return err('INVALID_PAYLOAD', cause.message);
    return err('INVALID_PAYLOAD', `Struttura del backup illeggibile: ${String(cause)}`);
  }
}

function err(reason: ImportErrorReason, detail: string): ImportResult {
  return { ok: false, error: { reason, detail } };
}

// ---------------------------------------------------------------------------
// Auto-backup (PRD §3.1)
// ---------------------------------------------------------------------------

/** Un giorno in millisecondi. */
export const BACKUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * §3.1 — l'app scarica un backup all'apertura se l'ultimo risale a piu' di un
 * giorno. Decisione pura: il download vero e proprio e' compito della UI.
 *
 * @param lastBackupAt timestamp dell'ultimo backup, `null` se non ce n'e' mai stato uno.
 */
export function shouldAutoBackup(
  lastBackupAt: number | null,
  now: number = Date.now(),
  maxAgeMs: number = BACKUP_MAX_AGE_MS,
): boolean {
  if (lastBackupAt === null) return true;
  return now - lastBackupAt >= maxAgeMs;
}
