import Dexie from 'dexie';
import type { EntityTable } from 'dexie';

import type {
  AssignmentEvent,
  Lineup,
  Objectives,
  Player,
  PlayerNote,
  TeamNote,
  UserData,
} from '../domain/types';
import { emptyObjectives } from '../domain/backup';

/**
 * Persistenza su IndexedDB (PRD §7).
 *
 * Regola del progetto: **si scrive prima di renderizzare**. Ogni azione dello
 * store attende la `put` e solo dopo aggiorna lo stato in memoria, cosi' quello
 * che vedi a schermo e' sempre gia' su disco. Se il browser muore a meta' lavoro
 * si riapre e si ritrova tutto.
 *
 * `Player` sta qui solo come cache del listone: e' sostituibile e non e' un dato
 * utente. Tutto il resto e' §3.1 e va nel backup.
 */

/** Riga singleton degli obiettivi: IndexedDB vuole una chiave primaria. */
export interface StoredObjectives extends Objectives {
  readonly key: 'singleton';
}

export const OBJECTIVES_KEY = 'singleton';

export type MetaKey =
  | 'listoneFilename'
  | 'listoneImportedAt'
  | 'listoneCount'
  | 'lastBackupAt';

export interface MetaRow {
  readonly key: MetaKey;
  readonly value: string | number;
}

const db = new Dexie('fanta-auction') as Dexie & {
  players: EntityTable<Player, 'id'>;
  lineups: EntityTable<Lineup, 'teamCode'>;
  playerNotes: EntityTable<PlayerNote, 'playerId'>;
  teamNotes: EntityTable<TeamNote, 'teamCode'>;
  objectives: EntityTable<StoredObjectives, 'key'>;
  events: EntityTable<AssignmentEvent, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
};

db.version(1).stores({
  players: 'id, team, role',
  lineups: 'teamCode',
  playerNotes: 'playerId',
  teamNotes: 'teamCode',
  objectives: 'key',
  events: 'id, ts',
  meta: 'key',
});

export { db };

// ---------------------------------------------------------------------------
// Lettura
// ---------------------------------------------------------------------------

export async function loadPlayers(): Promise<Player[]> {
  return db.players.toArray();
}

export async function loadUserData(): Promise<UserData> {
  const [lineups, playerNotes, teamNotes, storedObjectives, events] = await Promise.all([
    db.lineups.toArray(),
    db.playerNotes.toArray(),
    db.teamNotes.toArray(),
    db.objectives.get(OBJECTIVES_KEY),
    db.events.toArray(),
  ]);

  const objectives: Objectives =
    storedObjectives === undefined
      ? emptyObjectives()
      : {
          text: storedObjectives.text,
          targets: storedObjectives.targets,
          updatedAt: storedObjectives.updatedAt,
        };

  return {
    lineups,
    playerNotes,
    teamNotes,
    objectives,
    events: [...events].sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id))),
  };
}

export async function getMeta(key: MetaKey): Promise<string | number | null> {
  return (await db.meta.get(key))?.value ?? null;
}

export async function setMeta(key: MetaKey, value: string | number): Promise<void> {
  await db.meta.put({ key, value });
}

// ---------------------------------------------------------------------------
// Scrittura
// ---------------------------------------------------------------------------

export async function saveLineup(lineup: Lineup): Promise<void> {
  await db.lineups.put(lineup);
}

export async function savePlayerNote(note: PlayerNote): Promise<void> {
  await db.playerNotes.put(note);
}

export async function saveTeamNote(note: TeamNote): Promise<void> {
  await db.teamNotes.put(note);
}

export async function saveObjectives(objectives: Objectives): Promise<void> {
  await db.objectives.put({ ...objectives, key: OBJECTIVES_KEY });
}

/** Il listone e' sostituibile in blocco: i dati utente restano agganciati a `#`. */
export async function replacePlayers(players: readonly Player[]): Promise<void> {
  await db.transaction('rw', db.players, async () => {
    await db.players.clear();
    await db.players.bulkPut([...players]);
  });
}

/**
 * Riscrive tutti i dati utente in una sola transazione. E' il commit di un
 * import di backup: o passa tutto, o non passa niente.
 */
export async function replaceUserData(data: UserData): Promise<void> {
  await db.transaction(
    'rw',
    [db.lineups, db.playerNotes, db.teamNotes, db.objectives, db.events],
    async () => {
      await Promise.all([
        db.lineups.clear(),
        db.playerNotes.clear(),
        db.teamNotes.clear(),
        db.objectives.clear(),
        db.events.clear(),
      ]);
      await Promise.all([
        db.lineups.bulkPut([...data.lineups]),
        db.playerNotes.bulkPut([...data.playerNotes]),
        db.teamNotes.bulkPut([...data.teamNotes]),
        db.objectives.put({ ...data.objectives, key: OBJECTIVES_KEY }),
        db.events.bulkPut([...data.events]),
      ]);
    },
  );
}
