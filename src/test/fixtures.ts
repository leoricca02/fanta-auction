import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

import type {
  AssignmentEvent,
  LeagueConfig,
  Lineup,
  LineupSlot,
  Objectives,
  Player,
  PlayerNote,
  Role,
  Tag,
  TeamNote,
  UserData,
} from '../domain/types';
import { makeLeagueConfig, makeTeams } from '../domain/config';
import { emptyObjectives } from '../domain/backup';
import { parseListone } from '../parse/listone';

/** Helper di test. Non fa parte del bundle dell'app. */

export const LISTONE_PATH = fileURLToPath(
  new URL('../../data/lista_calciatori_classic.xlsx', import.meta.url),
);

let cachedListone: readonly Player[] | null = null;

export function readListoneBytes(): Uint8Array {
  return new Uint8Array(readFileSync(LISTONE_PATH));
}

/** Listone reale, parsato una volta sola per run. */
export function realListone(): readonly Player[] {
  if (cachedListone === null) cachedListone = parseListone(readListoneBytes()).players;
  return cachedListone;
}

/** Config di lega completa sul listone reale: 12 squadre, 800 crediti, 25 slot. */
export function realConfig(): LeagueConfig {
  return makeLeagueConfig(realListone());
}

export function findPlayer(players: readonly Player[], name: string): Player {
  const found = players.find((p) => p.name === name);
  if (found === undefined) throw new Error(`Giocatore "${name}" non trovato nel listone.`);
  return found;
}

// ---------------------------------------------------------------------------
// Listoni sintetici, per i casi limite che il file reale non contiene
// ---------------------------------------------------------------------------

export interface SyntheticPlayerSpec {
  readonly id: number;
  readonly role: Role;
  readonly quot: number;
  readonly fvm?: number;
  readonly name?: string;
  readonly team?: string;
}

export function makePlayer(spec: SyntheticPlayerSpec): Player {
  const name = spec.name ?? `P${spec.id}`;
  return {
    id: spec.id,
    name,
    searchKey: name.toLowerCase(),
    team: spec.team ?? 'Test FC',
    role: spec.role,
    under: 25,
    quot: spec.quot,
    fvm: spec.fvm ?? spec.quot * 8,
  };
}

/** `count` giocatori del ruolo, QUOT. decrescente da `topQuot`, id da `startId`. */
export function makeRoster(
  role: Role,
  count: number,
  topQuot: number,
  startId: number,
  team = 'Test FC',
): Player[] {
  return Array.from({ length: count }, (_, i) =>
    makePlayer({ id: startId + i, role, quot: Math.max(1, topQuot - i), team }),
  );
}

/** Lega piccola e controllabile: `teamCount` squadre, slot e crediti a scelta. */
export function makeTinyConfig(args: {
  readonly players: readonly Player[];
  readonly teamCount?: number;
  readonly creditsPerTeam?: number;
  readonly slotsByRole?: Readonly<Record<Role, number>>;
}): LeagueConfig {
  const teamCount = args.teamCount ?? 2;
  const seeds = Array.from(
    { length: teamCount },
    (_, i) => [`Team ${i + 1}`, `t${String(i + 1).padStart(2, '0')}`] as const,
  );
  return {
    teams: makeTeams(seeds),
    creditsPerTeam: args.creditsPerTeam ?? 100,
    slotsByRole: args.slotsByRole ?? { P: 1, D: 1, C: 1, A: 1 },
    players: args.players,
  };
}

let eventCounter = 0;

export function makeEvent(args: {
  readonly playerId: number;
  readonly teamId: string;
  readonly price: number;
  readonly phase: Role;
  readonly id?: string;
  readonly undone?: boolean;
  readonly ts?: number;
}): AssignmentEvent {
  eventCounter += 1;
  return {
    id: args.id ?? `e${eventCounter}`,
    ts: args.ts ?? 1_700_000_000_000 + eventCounter,
    playerId: args.playerId,
    teamId: args.teamId,
    price: args.price,
    phase: args.phase,
    undone: args.undone ?? false,
  };
}

export function resetEventCounter(): void {
  eventCounter = 0;
}

// ---------------------------------------------------------------------------
// Dati utente sintetici
// ---------------------------------------------------------------------------

export function makeSlot(
  slotId: string,
  candidates: readonly number[],
  roleLabel = 'GEN',
  note = '',
): LineupSlot {
  return { slotId, roleLabel, candidates: [...candidates], note };
}

export function makeLineup(
  teamCode: string,
  slots: readonly LineupSlot[],
  module = '4-3-3',
  updatedAt = 1_700_000_000_000,
): Lineup {
  return { teamCode, module, slots: [...slots], updatedAt };
}

export function makePlayerNote(
  playerId: number,
  text = 'nota',
  tag: Tag | null = null,
  archived = false,
  updatedAt = 1_700_000_000_000,
): PlayerNote {
  return { playerId, text, tag, archived, updatedAt };
}

export function makeTeamNote(
  teamCode: string,
  text = 'nota squadra',
  updatedAt = 1_700_000_000_000,
): TeamNote {
  return { teamCode, text, updatedAt };
}

export function makeObjectives(
  text: string,
  targets: readonly { playerId: number; priority: number; note: string }[] = [],
  updatedAt = 1_700_000_000_000,
): Objectives {
  return { text, targets: targets.map((t) => ({ ...t })), updatedAt };
}

export function makeUserData(partial: Partial<UserData> = {}): UserData {
  return {
    lineups: partial.lineups ?? [],
    playerNotes: partial.playerNotes ?? [],
    teamNotes: partial.teamNotes ?? [],
    objectives: partial.objectives ?? emptyObjectives(),
    events: partial.events ?? [],
  };
}

// ---------------------------------------------------------------------------
// PRNG deterministico, per i replay casuali riproducibili
// ---------------------------------------------------------------------------

/** mulberry32: piccolo, veloce, deterministico dal seed. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Costruzione di .xlsx sintetici, per i test del parser
// ---------------------------------------------------------------------------

export function makeXlsx(
  rows: readonly (readonly unknown[])[],
  sheetName = 'Lista calciatori',
): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(rows as unknown[][]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out: unknown = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(out as ArrayBuffer);
}
