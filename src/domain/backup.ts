import type {
  AssignmentEvent,
  LeagueConfig,
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
import type { EventRejection } from './reducer';
import { reduce } from './reducer';

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
 * - A parita' di chiave vince il record con `updatedAt` piu' recente, **non**
 *   il file: importare un backup vecchio non deve sovrascrivere lavoro nuovo.
 *   I record scartati per questo motivo sono elencati in `skippedRecords`.
 * - Il risultato e' una **anteprima**: contiene lo stato che si otterrebbe e i
 *   conflitti che l'event log produrrebbe, ottenuti da un dry-run del reducer.
 *   Nulla e' applicato finche' il chiamante non persiste `result.data`.
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

export type UserCollection = 'lineups' | 'playerNotes' | 'teamNotes' | 'objectives';

/** Un record del file scartato perche' lo store ne ha una versione piu' recente. */
export interface SkippedRecord {
  readonly collection: UserCollection;
  /** `teamCode` oppure `playerId`; `'objectives'` per l'istanza unica. */
  readonly key: string;
  readonly currentUpdatedAt: number;
  readonly incomingUpdatedAt: number;
}

export interface ImportCollectionSummary {
  readonly added: number;
  readonly updated: number;
  /** Record del file ignorati perche' piu' vecchi di quelli gia' presenti. */
  readonly skipped: number;
  /** `true` se la collezione era assente dal file e quindi lasciata intatta. */
  readonly untouched: boolean;
}

/**
 * Esito del dry-run del reducer sul log risultante dal merge.
 *
 * Il merge non distruttivo non puo' scartare eventi: se il file e lo store
 * contengono due assegnazioni incompatibili, dopo l'import ci sono entrambe e
 * il reducer ne applica una sola. L'utente deve vederlo **prima** di confermare.
 */
export interface ImportConflicts {
  /** Eventi che il reducer scarterebbe sul log risultante. */
  readonly rejected: readonly EventRejection[];
  readonly rejectedCount: number;
  /** Eventi che verrebbero applicati. */
  readonly appliedCount: number;
  /** Scartati che arrivano dal file. */
  readonly fromFile: number;
  /** Scartati che erano gia' nello store. */
  readonly fromCurrent: number;
  /**
   * Eventi che il reducer applicava **prima** dell'import e scarterebbe dopo.
   * E' il caso grave: importare invalida assegnazioni gia' registrate.
   */
  readonly newlyRejected: readonly EventRejection[];
}

export interface ImportSummary {
  readonly lineups: ImportCollectionSummary;
  readonly playerNotes: ImportCollectionSummary;
  readonly teamNotes: ImportCollectionSummary;
  readonly events: ImportCollectionSummary;
  /** `true` se il file conteneva gli obiettivi ed erano piu' recenti. */
  readonly objectivesReplaced: boolean;
  /** Ogni record del file ignorato perche' superato, con i due timestamp. */
  readonly skippedRecords: readonly SkippedRecord[];
  readonly schemaVersion: number;
  readonly exportedAt: number;
}

export type ImportResult =
  | {
      readonly ok: true;
      /** Stato che si otterrebbe. Non e' ancora applicato. */
      readonly data: UserData;
      readonly summary: ImportSummary;
      readonly conflicts: ImportConflicts;
    }
  | { readonly ok: false; readonly error: ImportError };

// ---------------------------------------------------------------------------
// Stato vuoto
// ---------------------------------------------------------------------------

/** `updatedAt` a 0: uno stato vuoto perde sempre contro qualsiasi file. */
export function emptyObjectives(updatedAt = 0): Objectives {
  return { text: '', targets: [], updatedAt };
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
        updatedAt: data.objectives.updatedAt,
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

/** `updatedAt` assente vale 0: un record senza timestamp perde ogni confronto. */
function readUpdatedAt(source: Record<string, unknown>, path: string): number {
  return source['updatedAt'] === undefined ? 0 : readInt(source, 'updatedAt', path);
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
    updatedAt: readUpdatedAt(o, path),
  };
}

function parsePlayerNote(raw: unknown, path: string): PlayerNote {
  const o = readRecord(raw, path);
  return {
    playerId: readInt(o, 'playerId', path),
    text: readOptionalString(o, 'text', path),
    tag: readTag(o, path),
    archived: readBoolean(o, 'archived', path),
    updatedAt: readUpdatedAt(o, path),
  };
}

function parseTeamNote(raw: unknown, path: string): TeamNote {
  const o = readRecord(raw, path);
  return {
    teamCode: readString(o, 'teamCode', path),
    text: readOptionalString(o, 'text', path),
    updatedAt: readUpdatedAt(o, path),
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
  return {
    text: readOptionalString(o, 'text', path),
    targets,
    updatedAt: readUpdatedAt(o, path),
  };
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
  readonly skipped: readonly SkippedRecord[];
}

const UNTOUCHED: ImportCollectionSummary = {
  added: 0,
  updated: 0,
  skipped: 0,
  untouched: true,
};

/**
 * Merge non distruttivo per chiave, con risoluzione per `updatedAt`.
 *
 * - chiave assente nello store  -> il record del file entra
 * - `incoming.updatedAt > current.updatedAt` -> il file vince
 * - altrimenti (piu' vecchio o pari) -> **lo store vince** e il record del file
 *   finisce in `skipped`. La parita' tiene il record corrente, cosi' reimportare
 *   lo stesso file e' un no-op.
 *
 * L'ordine e' quello corrente, con le novita' in coda: importare non deve
 * rimescolare una lista gia' ordinata a mano.
 */
function mergeByKey<T>(
  collection: UserCollection,
  current: readonly T[],
  incoming: readonly T[] | null,
  keyOf: (item: T) => string,
  updatedAtOf: (item: T) => number,
): MergeOutcome<T> {
  if (incoming === null) return { merged: [...current], summary: UNTOUCHED, skipped: [] };

  const byKey = new Map<string, T>();
  const order: string[] = [];
  for (const item of current) {
    const key = keyOf(item);
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, item);
  }

  const skipped: SkippedRecord[] = [];
  let added = 0;
  let updated = 0;

  for (const item of incoming) {
    const key = keyOf(item);
    const existing = byKey.get(key);
    if (existing === undefined) {
      order.push(key);
      byKey.set(key, item);
      added += 1;
      continue;
    }
    if (updatedAtOf(item) > updatedAtOf(existing)) {
      byKey.set(key, item);
      updated += 1;
      continue;
    }
    skipped.push({
      collection,
      key,
      currentUpdatedAt: updatedAtOf(existing),
      incomingUpdatedAt: updatedAtOf(item),
    });
  }

  return {
    merged: order.map((key) => byKey.get(key) as T),
    summary: { added, updated, skipped: skipped.length, untouched: false },
    skipped,
  };
}

/**
 * L'event log si fonde per `id` senza confronto di `updatedAt`: un evento e'
 * immutabile, quindi due record con lo stesso id sono lo stesso fatto e il file
 * puo' solo confermarlo. Il riordino per `ts`, poi per `id`, e' necessario
 * perche' la piega del reducer dipende dall'ordine.
 */
function mergeEvents(
  current: readonly AssignmentEvent[],
  incoming: readonly AssignmentEvent[] | null,
): MergeOutcome<AssignmentEvent> {
  if (incoming === null) return { merged: [...current], summary: UNTOUCHED, skipped: [] };

  const byId = new Map<string, AssignmentEvent>(current.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  for (const event of incoming) {
    if (byId.has(event.id)) updated += 1;
    else added += 1;
    byId.set(event.id, event);
  }

  const merged = [...byId.values()].sort((a, b) =>
    a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id),
  );
  return { merged, summary: { added, updated, skipped: 0, untouched: false }, skipped: [] };
}

// ---------------------------------------------------------------------------
// Dry-run del reducer
// ---------------------------------------------------------------------------

/**
 * Ripiega il log risultante **senza applicare niente** e riporta cosa il
 * reducer scarterebbe. E' il "2 eventi verranno scartati" che l'utente deve
 * leggere prima di confermare l'import.
 */
function dryRun(
  currentEvents: readonly AssignmentEvent[],
  mergedEvents: readonly AssignmentEvent[],
  incomingIds: ReadonlySet<string>,
  config: LeagueConfig,
): ImportConflicts {
  const after = reduce(mergedEvents, config);
  const before = reduce(currentEvents, config);
  const rejectedBefore = new Set(before.rejections.map((r) => r.eventId));

  let fromFile = 0;
  let fromCurrent = 0;
  const newlyRejected: EventRejection[] = [];
  for (const rejection of after.rejections) {
    if (incomingIds.has(rejection.eventId)) fromFile += 1;
    else fromCurrent += 1;
    if (!rejectedBefore.has(rejection.eventId) && !incomingIds.has(rejection.eventId)) {
      newlyRejected.push(rejection);
    }
  }

  return {
    rejected: after.rejections,
    rejectedCount: after.rejections.length,
    appliedCount: after.appliedEventIds.length,
    fromFile,
    fromCurrent,
    newlyRejected,
  };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Calcola l'anteprima di un import. **Non applica niente**: restituisce lo
 * stato che si otterrebbe, cosa e' stato saltato e quali eventi il reducer
 * scarterebbe. Sta al chiamante mostrarli, farli confermare e poi persistere
 * `result.data`.
 *
 * Non lancia e non muta `current`: in caso di errore restituisce
 * `{ ok: false }` e lo stato di partenza resta esattamente com'era.
 *
 * @param current stato utente attuale (usa `emptyUserData()` per uno store vuoto).
 * @param raw il JSON come stringa, oppure un oggetto gia' deserializzato.
 * @param config lega e listone, necessari al dry-run del reducer.
 */
export function importUserData(
  current: UserData,
  raw: unknown,
  config: LeagueConfig,
): ImportResult {
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

    const mergedLineups = mergeByKey(
      'lineups',
      current.lineups,
      lineups,
      (l) => l.teamCode,
      (l) => l.updatedAt,
    );
    const mergedPlayerNotes = mergeByKey(
      'playerNotes',
      current.playerNotes,
      playerNotes,
      (n) => String(n.playerId),
      (n) => n.updatedAt,
    );
    const mergedTeamNotes = mergeByKey(
      'teamNotes',
      current.teamNotes,
      teamNotes,
      (n) => n.teamCode,
      (n) => n.updatedAt,
    );
    const mergedEvents = mergeEvents(current.events, events);

    // Istanza unica, stessa regola: vince il piu' recente, non il file.
    //
    // `updatedAt === 0` sullo store significa "obiettivi mai toccati": e'
    // l'equivalente singleton di una chiave assente dalla collezione, quindi il
    // file entra come aggiunta invece di perdere il confronto per pareggio.
    const objectivesPristine = current.objectives.updatedAt === 0;
    const objectivesWins =
      objectives !== null &&
      (objectivesPristine || objectives.updatedAt > current.objectives.updatedAt);
    const skippedRecords = [
      ...mergedLineups.skipped,
      ...mergedPlayerNotes.skipped,
      ...mergedTeamNotes.skipped,
    ];
    if (objectives !== null && !objectivesWins) {
      skippedRecords.push({
        collection: 'objectives',
        key: 'objectives',
        currentUpdatedAt: current.objectives.updatedAt,
        incomingUpdatedAt: objectives.updatedAt,
      });
    }

    const incomingIds = new Set((events ?? []).map((e) => e.id));

    return {
      ok: true,
      data: {
        lineups: mergedLineups.merged,
        playerNotes: mergedPlayerNotes.merged,
        teamNotes: mergedTeamNotes.merged,
        objectives: objectivesWins && objectives !== null ? objectives : current.objectives,
        events: mergedEvents.merged,
      },
      summary: {
        lineups: mergedLineups.summary,
        playerNotes: mergedPlayerNotes.summary,
        teamNotes: mergedTeamNotes.summary,
        events: mergedEvents.summary,
        objectivesReplaced: objectivesWins,
        skippedRecords,
        schemaVersion,
        exportedAt:
          typeof parsed['exportedAt'] === 'number' && Number.isFinite(parsed['exportedAt'])
            ? parsed['exportedAt']
            : 0,
      },
      conflicts: dryRun(current.events, mergedEvents.merged, incomingIds, config),
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
