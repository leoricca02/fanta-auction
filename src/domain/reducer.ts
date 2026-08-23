import type { AssignmentEvent, ByRole, LeagueConfig, Player, Role } from './types';
import { PHASE_ORDER } from './types';

/**
 * `reduce(events, config) -> LeagueState` (PRD §3.2).
 *
 * Lo stato di lega non e' mai mutato direttamente: e' sempre la piega
 * dell'event log. Conseguenze richieste dal PRD e implementate qui:
 *
 * - **undo/redo su qualsiasi evento**, anche non l'ultimo: `undone` e' un flag,
 *   non una cancellazione, e la piega si limita a saltare gli eventi annullati;
 * - **nessun hard delete**: `undoEvent`/`redoEvent` restituiscono un nuovo log
 *   con lo stesso numero di eventi;
 * - **eventi invalidi non esplodono**: vengono scartati e registrati in
 *   `rejections`. Un log che arriva da IndexedDB dopo un crash deve poter essere
 *   ripiegato senza che una singola riga sporca faccia fallire tutta l'app.
 */

export type RejectionReason =
  | 'UNKNOWN_PLAYER'
  | 'UNKNOWN_TEAM'
  | 'DUPLICATE_EVENT_ID'
  | 'INVALID_PRICE'
  | 'PHASE_MISMATCH'
  | 'PLAYER_ALREADY_ASSIGNED'
  | 'ROLE_SLOTS_FULL'
  | 'INSUFFICIENT_CREDITS';

export interface EventRejection {
  readonly eventId: string;
  readonly reason: RejectionReason;
  /** Messaggio leggibile, gia' formattato per la UI. */
  readonly detail: string;
}

export interface RosterEntry {
  readonly playerId: number;
  readonly role: Role;
  readonly price: number;
  readonly eventId: string;
}

export interface OwnedPlayer extends RosterEntry {
  readonly teamId: string;
}

export interface TeamState {
  readonly teamId: string;
  /** Crediti residui. */
  readonly credits: number;
  readonly spent: number;
  /** Acquisti in ordine di applicazione. */
  readonly roster: readonly RosterEntry[];
  readonly slotsFilledByRole: ByRole<number>;
  readonly slotsFreeByRole: ByRole<number>;
  readonly slotsFilled: number;
  readonly slotsFree: number;
}

export interface LeagueState {
  readonly teamsById: Readonly<Record<string, TeamState>>;
  readonly assignmentByPlayerId: Readonly<Record<number, OwnedPlayer>>;
  /** Id degli eventi effettivamente applicati, in ordine. */
  readonly appliedEventIds: readonly string[];
  readonly rejections: readonly EventRejection[];
  /** §4.7 — somma dei crediti spesi in lega. */
  readonly creditsSpent: number;
  /** §4.7 — somma degli slot occupati in lega. */
  readonly slotsFilled: number;
}

function emptyByRole(): Record<Role, number> {
  return { P: 0, D: 0, C: 0, A: 0 };
}

function makeTeamState(teamId: string, config: LeagueConfig): TeamState {
  const free = emptyByRole();
  let total = 0;
  for (const role of PHASE_ORDER) {
    free[role] = config.slotsByRole[role];
    total += free[role];
  }
  return {
    teamId,
    credits: config.creditsPerTeam,
    spent: 0,
    roster: [],
    slotsFilledByRole: emptyByRole(),
    slotsFreeByRole: free,
    slotsFilled: 0,
    slotsFree: total,
  };
}

export function initialLeagueState(config: LeagueConfig): LeagueState {
  const teamsById: Record<string, TeamState> = {};
  for (const team of config.teams) {
    teamsById[team.id] = makeTeamState(team.id, config);
  }
  return {
    teamsById,
    assignmentByPlayerId: {},
    appliedEventIds: [],
    rejections: [],
    creditsSpent: 0,
    slotsFilled: 0,
  };
}

/** Indice `id -> Player`, costruito una volta per piega. */
export type PlayerIndex = ReadonlyMap<number, Player>;

export function makePlayerIndex(players: readonly Player[]): PlayerIndex {
  return new Map(players.map((p) => [p.id, p]));
}

/**
 * §4.3 — tetto matematico: `crediti - (slotRimanenti - 1)`.
 * E' anche il vincolo di floor del reducer: dopo l'acquisto deve restare
 * almeno 1 credito per ogni slot ancora libero.
 */
export function maxBidAssoluto(team: TeamState): number {
  if (team.slotsFree <= 0) return 0;
  return team.credits - (team.slotsFree - 1);
}

/** Esito della validazione: in caso di successo porta con se' giocatore e squadra. */
export type Resolution =
  | { readonly ok: true; readonly player: Player; readonly team: TeamState }
  | { readonly ok: false; readonly rejection: EventRejection };

/**
 * Valida un evento contro lo stato corrente e, se valido, restituisce le
 * entita' gia' risolte. Stessa funzione usata dal reducer e dalla command bar
 * prima di persistere su IndexedDB.
 */
export function resolveAssignment(
  state: LeagueState,
  event: AssignmentEvent,
  index: PlayerIndex,
): Resolution {
  const reject = (reason: RejectionReason, detail: string): Resolution => ({
    ok: false,
    rejection: { eventId: event.id, reason, detail },
  });

  if (state.appliedEventIds.includes(event.id)) {
    return reject('DUPLICATE_EVENT_ID', `Evento "${event.id}" gia' applicato.`);
  }

  const player = index.get(event.playerId);
  if (player === undefined) {
    return reject('UNKNOWN_PLAYER', `Giocatore #${event.playerId} non presente nel listone.`);
  }

  const team = state.teamsById[event.teamId];
  if (team === undefined) {
    return reject('UNKNOWN_TEAM', `Squadra "${event.teamId}" non presente in lega.`);
  }

  if (!Number.isInteger(event.price) || event.price < 1) {
    return reject(
      'INVALID_PRICE',
      `Prezzo ${event.price} non valido per ${player.name}: atteso un intero >= 1.`,
    );
  }

  if (event.phase !== player.role) {
    return reject(
      'PHASE_MISMATCH',
      `${player.name} e' di ruolo ${player.role} ma l'evento dichiara fase ${event.phase}.`,
    );
  }

  const owner = state.assignmentByPlayerId[event.playerId];
  if (owner !== undefined) {
    return reject(
      'PLAYER_ALREADY_ASSIGNED',
      `${player.name} e' gia' assegnato a "${owner.teamId}" per ${owner.price}.`,
    );
  }

  if (team.slotsFreeByRole[player.role] <= 0) {
    return reject(
      'ROLE_SLOTS_FULL',
      `"${team.teamId}" ha gia' tutti gli slot ${player.role} occupati.`,
    );
  }

  const ceiling = maxBidAssoluto(team);
  if (event.price > ceiling) {
    return reject(
      'INSUFFICIENT_CREDITS',
      `${event.price} supera il tetto di "${team.teamId}": ${team.credits} crediti ` +
        `e ${team.slotsFree} slot liberi lasciano al massimo ${ceiling} ` +
        `(1 credito riservato per ogni slot restante).`,
    );
  }

  return { ok: true, player, team };
}

/**
 * Valida un evento. `null` significa applicabile.
 * Wrapper di `resolveAssignment` per i chiamanti che vogliono solo il verdetto.
 */
export function validateAssignment(
  state: LeagueState,
  event: AssignmentEvent,
  index: PlayerIndex,
): EventRejection | null {
  const resolution = resolveAssignment(state, event, index);
  return resolution.ok ? null : resolution.rejection;
}

function applyAssignment(
  state: LeagueState,
  event: AssignmentEvent,
  player: Player,
  team: TeamState,
): LeagueState {
  const entry: RosterEntry = {
    playerId: player.id,
    role: player.role,
    price: event.price,
    eventId: event.id,
  };

  const slotsFilledByRole = { ...team.slotsFilledByRole };
  const slotsFreeByRole = { ...team.slotsFreeByRole };
  slotsFilledByRole[player.role] += 1;
  slotsFreeByRole[player.role] -= 1;

  const nextTeam: TeamState = {
    ...team,
    credits: team.credits - event.price,
    spent: team.spent + event.price,
    roster: [...team.roster, entry],
    slotsFilledByRole,
    slotsFreeByRole,
    slotsFilled: team.slotsFilled + 1,
    slotsFree: team.slotsFree - 1,
  };

  return {
    teamsById: { ...state.teamsById, [team.teamId]: nextTeam },
    assignmentByPlayerId: {
      ...state.assignmentByPlayerId,
      [player.id]: { ...entry, teamId: team.teamId },
    },
    appliedEventIds: [...state.appliedEventIds, event.id],
    rejections: state.rejections,
    creditsSpent: state.creditsSpent + event.price,
    slotsFilled: state.slotsFilled + 1,
  };
}

/**
 * Piega l'event log sulla configurazione di lega.
 *
 * Gli eventi con `undone: true` sono saltati senza finire tra le `rejections`:
 * annullare non e' un errore.
 */
export function reduce(events: readonly AssignmentEvent[], config: LeagueConfig): LeagueState {
  const index = makePlayerIndex(config.players);
  let state = initialLeagueState(config);
  const rejections: EventRejection[] = [];

  for (const event of events) {
    if (event.undone) continue;
    const resolution = resolveAssignment(state, event, index);
    if (!resolution.ok) {
      rejections.push(resolution.rejection);
      continue;
    }
    state = applyAssignment(state, event, resolution.player, resolution.team);
  }

  return { ...state, rejections };
}

function setUndone(
  events: readonly AssignmentEvent[],
  eventId: string,
  undone: boolean,
): AssignmentEvent[] {
  return events.map((e) => (e.id === eventId ? { ...e, undone } : e));
}

/**
 * Marca un evento come annullato. Funziona su qualsiasi posizione del log,
 * non solo sull'ultima: lo stato si ricalcola ripiegando tutto.
 */
export function undoEvent(events: readonly AssignmentEvent[], eventId: string): AssignmentEvent[] {
  return setUndone(events, eventId, true);
}

/** Ripristina un evento annullato. */
export function redoEvent(events: readonly AssignmentEvent[], eventId: string): AssignmentEvent[] {
  return setUndone(events, eventId, false);
}

/** Ultimo evento attivo del log, quello che `Ctrl+Z` annulla (PRD §5.1). */
export function lastActiveEvent(events: readonly AssignmentEvent[]): AssignmentEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as AssignmentEvent;
    if (!e.undone) return e;
  }
  return null;
}

/** Ultimo evento annullato, quello che `Ctrl+Shift+Z` ripristina. */
export function lastUndoneEvent(events: readonly AssignmentEvent[]): AssignmentEvent | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i] as AssignmentEvent;
    if (e.undone) return e;
  }
  return null;
}

export function teamState(state: LeagueState, teamId: string): TeamState {
  const team = state.teamsById[teamId];
  if (team === undefined) {
    throw new Error(`Squadra "${teamId}" non presente nello stato di lega.`);
  }
  return team;
}
