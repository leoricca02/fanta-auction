import type { Lineup, LineupSlot, LineupStatus, Player } from './types';

/**
 * Stato di formazione (PRD §4.1).
 *
 *   la squadra del giocatore non ha Lineup   -> NON_INSERITO
 *   compare in uno slot con 1 candidato      -> TITOLARE
 *   compare in uno slot con 2+ candidati     -> BALLOTTAGGIO
 *   altrimenti                               -> PANCHINA
 *
 * E' la logica piu' importante dell'app: la titolarita' decide il valore di un
 * giocatore nel Classic, e qui non e' stimata — e' il dato che l'utente ha
 * inserito a mano.
 */

/** Ordine di forza degli stati. Usato per risolvere i dati sporchi. */
const STATUS_STRENGTH: Readonly<Record<LineupStatus, number>> = {
  TITOLARE: 3,
  BALLOTTAGGIO: 2,
  PANCHINA: 1,
  NON_INSERITO: 0,
};

export type LineupIndex = ReadonlyMap<string, Lineup>;

/** Indice `teamCode -> Lineup`. A parita' di `teamCode` vince l'ultimo inserito. */
export function makeLineupIndex(lineups: readonly Lineup[]): LineupIndex {
  return new Map(lineups.map((l) => [l.teamCode, l]));
}

export interface LineupPlacement {
  readonly status: LineupStatus;
  /** Slot in cui il giocatore compare. Vuoto se non compare in nessuno. */
  readonly slots: readonly LineupSlot[];
  /**
   * `true` se il giocatore compare in **piu' di uno** slot: dato sporco che
   * l'editor dovrebbe segnalare. Lo stato resta comunque deterministico.
   */
  readonly duplicated: boolean;
  /**
   * Posizione nel ballottaggio, 1-based: `1` e' il primo nome dello slot,
   * quello che l'utente considera piu' sicuro di scendere in campo. `null`
   * quando lo stato non e' `BALLOTTAGGIO`.
   */
  readonly ballotRank: number | null;
  /** Quanti candidati si contendono lo slot del ballottaggio. `null` altrimenti. */
  readonly ballotSize: number | null;
}

function statusForSlot(slot: LineupSlot): LineupStatus {
  return slot.candidates.length === 1 ? 'TITOLARE' : 'BALLOTTAGGIO';
}

/**
 * Stato di formazione con il dettaglio degli slot in cui il giocatore compare.
 *
 * **Dato sporco — giocatore in piu' slot.** Vince lo stato piu' forte
 * (`TITOLARE` > `BALLOTTAGGIO`), non il primo slot incontrato. La scelta e'
 * deliberata: dipendere dall'ordine dell'array renderebbe il badge instabile
 * al semplice riordino degli slot nell'editor, mentre "titolare da qualche
 * parte" e' il fatto che conta durante la chiamata all'asta. `duplicated`
 * espone comunque l'anomalia a chi vuole segnalarla.
 *
 * Uno slot con `candidates` vuoto non contiene nessuno e non entra nel calcolo.
 */
export function lineupPlacement(
  playerId: number,
  teamCode: string,
  lineups: LineupIndex,
): LineupPlacement {
  const lineup = lineups.get(teamCode);
  if (lineup === undefined) {
    return {
      status: 'NON_INSERITO',
      slots: [],
      duplicated: false,
      ballotRank: null,
      ballotSize: null,
    };
  }

  const slots = lineup.slots.filter((slot) => slot.candidates.includes(playerId));
  if (slots.length === 0) {
    return { status: 'PANCHINA', slots: [], duplicated: false, ballotRank: null, ballotSize: null };
  }

  let status: LineupStatus = 'PANCHINA';
  for (const slot of slots) {
    const candidate = statusForSlot(slot);
    if (STATUS_STRENGTH[candidate] > STATUS_STRENGTH[status]) status = candidate;
  }

  const ballot = status === 'BALLOTTAGGIO' ? bestBallot(playerId, slots) : null;

  return {
    status,
    slots,
    duplicated: slots.length > 1,
    ballotRank: ballot?.rank ?? null,
    ballotSize: ballot?.size ?? null,
  };
}

/**
 * Posizione del giocatore nel ballottaggio piu' favorevole in cui compare.
 *
 * `candidates` e' ordinato dall'editor e quell'ordine e' un dato, non un
 * dettaglio: il primo nome e' quello che l'utente ritiene piu' probabile in
 * campo. Fra piu' slot contesi vince il rank piu' basso, per la stessa ragione
 * per cui fra piu' stati vince il piu' forte — conta il posto migliore che il
 * giocatore occupa, non quello che capita per primo nell'array.
 */
function bestBallot(
  playerId: number,
  slots: readonly LineupSlot[],
): { readonly rank: number; readonly size: number } | null {
  let best: { rank: number; size: number } | null = null;
  for (const slot of slots) {
    if (slot.candidates.length < 2) continue;
    const rank = slot.candidates.indexOf(playerId) + 1;
    if (rank === 0) continue;
    if (best === null || rank < best.rank) best = { rank, size: slot.candidates.length };
  }
  return best;
}

/** §4.1 — solo il badge, per i chiamanti che non hanno bisogno del dettaglio. */
export function lineupStatus(
  playerId: number,
  teamCode: string,
  lineups: LineupIndex,
): LineupStatus {
  return lineupPlacement(playerId, teamCode, lineups).status;
}

/** Variante che ricava il club dal listone invece di riceverlo. */
export function lineupStatusForPlayer(player: Player, lineups: LineupIndex): LineupStatus {
  return lineupStatus(player.id, player.team, lineups);
}

// ---------------------------------------------------------------------------
// Completamento (PRD §5.2 — "indicatore di completamento per squadra")
// ---------------------------------------------------------------------------

export interface LineupCompletion {
  readonly teamCode: string;
  readonly hasLineup: boolean;
  readonly totalSlots: number;
  /** Slot con almeno un candidato. */
  readonly filledSlots: number;
  /** Slot con due o piu' candidati. */
  readonly contestedSlots: number;
  /** Giocatori distinti citati nella formazione. */
  readonly namedPlayers: number;
  /** `filledSlots / totalSlots`, `0` se la formazione non esiste o non ha slot. */
  readonly ratio: number;
}

export function lineupCompletion(teamCode: string, lineups: LineupIndex): LineupCompletion {
  const lineup = lineups.get(teamCode);
  if (lineup === undefined) {
    return {
      teamCode,
      hasLineup: false,
      totalSlots: 0,
      filledSlots: 0,
      contestedSlots: 0,
      namedPlayers: 0,
      ratio: 0,
    };
  }

  const named = new Set<number>();
  let filledSlots = 0;
  let contestedSlots = 0;
  for (const slot of lineup.slots) {
    if (slot.candidates.length > 0) filledSlots += 1;
    if (slot.candidates.length > 1) contestedSlots += 1;
    for (const id of slot.candidates) named.add(id);
  }

  const totalSlots = lineup.slots.length;
  return {
    teamCode,
    hasLineup: true,
    totalSlots,
    filledSlots,
    contestedSlots,
    namedPlayers: named.size,
    ratio: totalSlots > 0 ? filledSlots / totalSlots : 0,
  };
}

/**
 * Giocatori citati in piu' slot della stessa formazione. Alimenta la
 * segnalazione di dato sporco nell'editor.
 */
export function duplicatedCandidates(lineup: Lineup): number[] {
  const seen = new Map<number, number>();
  for (const slot of lineup.slots) {
    for (const id of new Set(slot.candidates)) {
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}
