import type { ByRole, LeagueConfig, Player, PlayerNote, Role, Tag } from './types';
import { PHASE_ORDER } from './types';
import type { LeagueState } from './reducer';

/**
 * Svincolati (PRD §4.3) e ordinamenti del listone.
 *
 *   svincolati = giocatori in lista senza AssignmentEvent attivo
 *
 * I conteggi per ruolo, e per ruolo con tag `obiettivo`, sostituiscono ogni
 * metrica di scarsita' della 1.0: sono conteggi, non stime.
 *
 * Qui vivono anche i comparatori di `QUOT.` e `FVM/1000`. Sono le uniche cose
 * che il dominio fa con quelle due colonne: ordinare e filtrare (§2, §5.4).
 * Nessun valore derivato.
 */

function emptyByRole<T>(make: () => T): Record<Role, T> {
  return { P: make(), D: make(), C: make(), A: make() };
}

// ---------------------------------------------------------------------------
// Ordinamenti
// ---------------------------------------------------------------------------

/**
 * `QUOT.` desc, poi `FVM/1000` desc, poi id asc.
 *
 * Il tiebreak esiste perche' sul file reale i pareggi sono enormi (39 portieri
 * a `QUOT.` = 1): senza un ordine totale la tabella svincolati e il picker
 * dell'editor formazioni cambierebbero ordine tra un render e l'altro.
 */
export function compareByQuotDesc(a: Player, b: Player): number {
  if (a.quot !== b.quot) return b.quot - a.quot;
  if (a.fvm !== b.fvm) return b.fvm - a.fvm;
  return a.id - b.id;
}

/** `FVM/1000` desc, poi `QUOT.` desc, poi id asc. */
export function compareByFvmDesc(a: Player, b: Player): number {
  if (a.fvm !== b.fvm) return b.fvm - a.fvm;
  if (a.quot !== b.quot) return b.quot - a.quot;
  return a.id - b.id;
}

/** Copia ordinata per `QUOT.` desc. Non muta l'input. */
export function sortByQuotDesc(players: readonly Player[]): Player[] {
  return [...players].sort(compareByQuotDesc);
}

export function groupByRole(players: readonly Player[]): ByRole<Player[]> {
  const out = emptyByRole<Player[]>(() => []);
  for (const p of players) out[p.role].push(p);
  return out;
}

/**
 * Giocatori di un club, filtrati per ruolo e ordinati per `QUOT.` desc.
 * E' l'elenco che alimenta il picker dell'editor formazioni (§5.2).
 */
export function playersOfTeam(
  players: readonly Player[],
  teamCode: string,
  roles?: readonly Role[],
): Player[] {
  const allowed = roles === undefined ? null : new Set<Role>(roles);
  return sortByQuotDesc(
    players.filter((p) => p.team === teamCode && (allowed === null || allowed.has(p.role))),
  );
}

/**
 * Candidati proposti per uno slot: quelli del club, compatibili di ruolo,
 * **esclusi i giocatori gia' schierati altrove nella formazione**.
 *
 * L'esclusione non e' cosmetica. `addCandidate` sposta chi e' gia' altrove
 * invece di duplicarlo, quindi senza questo filtro il picker riproporrebbe
 * sempre lo stesso nome in cima e battere Invio undici volte trascinerebbe un
 * solo giocatore lungo tutti gli slot del reparto, lasciandoli vuoti.
 */
export function slotCandidates(
  players: readonly Player[],
  teamCode: string,
  roles: readonly Role[],
  alreadyPlaced: ReadonlySet<number>,
): Player[] {
  return playersOfTeam(players, teamCode, roles).filter((p) => !alreadyPlaced.has(p.id));
}

// ---------------------------------------------------------------------------
// Note utente
// ---------------------------------------------------------------------------

export type PlayerNoteIndex = ReadonlyMap<number, PlayerNote>;

export function makeNoteIndex(notes: readonly PlayerNote[]): PlayerNoteIndex {
  return new Map(notes.map((n) => [n.playerId, n]));
}

export function tagOf(playerId: number, notes: PlayerNoteIndex): Tag | null {
  return notes.get(playerId)?.tag ?? null;
}

// ---------------------------------------------------------------------------
// §4.3 — Svincolati
// ---------------------------------------------------------------------------

export interface FreeAgents {
  /** Non assegnati, per ruolo, ordinati per `QUOT.` desc. */
  readonly byRole: ByRole<readonly Player[]>;
  readonly countByRole: ByRole<number>;
  /** Non assegnati con tag `obiettivo`, per ruolo. */
  readonly targetCountByRole: ByRole<number>;
  readonly total: number;
  readonly totalTargets: number;
  /** Slot liberi in lega per ruolo, sommati su tutte le squadre. */
  readonly slotsFreeByRole: ByRole<number>;
  readonly slotsFree: number;
}

/** Slot liberi del ruolo r sommati su tutte le squadre. */
export function leagueSlotsFreeByRole(state: LeagueState, config: LeagueConfig): ByRole<number> {
  const out = emptyByRole<number>(() => 0);
  for (const team of config.teams) {
    const t = state.teamsById[team.id];
    if (t === undefined) continue;
    for (const role of PHASE_ORDER) out[role] += t.slotsFreeByRole[role];
  }
  return out;
}

export function computeFreeAgents(
  state: LeagueState,
  config: LeagueConfig,
  notes: PlayerNoteIndex = new Map(),
): FreeAgents {
  const byRole = emptyByRole<Player[]>(() => []);
  const targetCountByRole = emptyByRole<number>(() => 0);
  let totalTargets = 0;

  for (const p of config.players) {
    if (state.assignmentByPlayerId[p.id] !== undefined) continue;
    byRole[p.role].push(p);
    if (tagOf(p.id, notes) === 'obiettivo') {
      targetCountByRole[p.role] += 1;
      totalTargets += 1;
    }
  }

  const countByRole = emptyByRole<number>(() => 0);
  let total = 0;
  for (const role of PHASE_ORDER) {
    byRole[role] = sortByQuotDesc(byRole[role]);
    countByRole[role] = byRole[role].length;
    total += countByRole[role];
  }

  const slotsFreeByRole = leagueSlotsFreeByRole(state, config);
  const slotsFree = PHASE_ORDER.reduce((acc, role) => acc + slotsFreeByRole[role], 0);

  return {
    byRole,
    countByRole,
    targetCountByRole,
    total,
    totalTargets,
    slotsFreeByRole,
    slotsFree,
  };
}

/**
 * Fase attiva: il primo ruolo in ordine P -> D -> C -> A con slot ancora liberi
 * in lega. `null` quando l'asta e' finita.
 */
export function activePhase(slotsFreeByRole: ByRole<number>): Role | null {
  for (const role of PHASE_ORDER) {
    if (slotsFreeByRole[role] > 0) return role;
  }
  return null;
}
