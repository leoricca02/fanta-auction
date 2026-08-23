import type { ByRole, LeagueConfig, Player, Role } from './types';
import { PHASE_ORDER } from './types';
import type { LeagueState } from './reducer';
import { sortByQuotDesc } from './pricing';

/**
 * Pool residuo: chi resta da assegnare e quanti slot restano da riempire.
 *
 * Base condivisa da §4.4 (scarcity), §4.5 (inflazione), §4.8 (`f_live`) e
 * §4.9 (livello di sostituzione). Sta in un modulo a se' perche' altrimenti
 * `metrics.ts` e `live-pricing.ts` si importerebbero a vicenda.
 *
 * **Decisione di M1 (§4.8).** Il PRD definisce `poolResiduo` come i top
 * `{slotResidui}` giocatori non assegnati per QUOT. desc, senza distinguere i
 * ruoli, mentre §4.1 e §4.9 ragionano per ruolo. Le due letture divergono: il
 * top-300 globale del file corrente somma 2904 di QUOT., i top-N_r per ruolo
 * sommano 2844, e con la lettura globale `f_live(0)` non sarebbe piu' legata a
 * `f`. Qui il pool e' **partizionato per ruolo**: `poolResiduo` e' l'unione dei
 * top `{slotResidui_r}` di ogni ruolo. Cosi' §4.8 e §4.9 leggono lo stesso
 * insieme e la continuita' all'origine e' un'identita' esatta.
 */

function emptyByRole<T>(make: () => T): Record<Role, T> {
  return { P: make(), D: make(), C: make(), A: make() };
}

/** Giocatori non ancora assegnati, per ruolo, ordinati per QUOT. desc. */
export function unassignedByRole(state: LeagueState, config: LeagueConfig): ByRole<Player[]> {
  const out = emptyByRole<Player[]>(() => []);
  for (const p of config.players) {
    if (state.assignmentByPlayerId[p.id] === undefined) out[p.role].push(p);
  }
  for (const role of PHASE_ORDER) {
    out[role] = sortByQuotDesc(out[role]);
  }
  return out;
}

/** `slotResidui_r` — slot liberi del ruolo r sommati su tutte le squadre (§4.4). */
export function residualSlotsByRole(state: LeagueState, config: LeagueConfig): ByRole<number> {
  const out = emptyByRole<number>(() => 0);
  for (const team of config.teams) {
    const t = state.teamsById[team.id];
    if (t === undefined) continue;
    for (const role of PHASE_ORDER) out[role] += t.slotsFreeByRole[role];
  }
  return out;
}

export function totalResidualSlots(byRole: ByRole<number>): number {
  return PHASE_ORDER.reduce((acc, role) => acc + byRole[role], 0);
}

export interface ResidualPool {
  /** Top `{slotResidui_r}` non assegnati per ruolo, QUOT. desc. */
  readonly byRole: ByRole<readonly Player[]>;
  /** Tutti i non assegnati per ruolo, QUOT. desc — sovrainsieme di `byRole`. */
  readonly unassignedByRole: ByRole<readonly Player[]>;
  readonly slotsByRole: ByRole<number>;
  readonly totalSlots: number;
  /** Somma delle QUOT. del pool residuo — denominatore di `f_live` (§4.8). */
  readonly quotSum: number;
  /** Id dei giocatori dentro il pool residuo. */
  readonly ids: ReadonlySet<number>;
}

export function residualPool(state: LeagueState, config: LeagueConfig): ResidualPool {
  const unassigned = unassignedByRole(state, config);
  const slotsByRole = residualSlotsByRole(state, config);
  const byRole = emptyByRole<readonly Player[]>(() => []);
  const ids = new Set<number>();
  let quotSum = 0;

  for (const role of PHASE_ORDER) {
    const pool = unassigned[role].slice(0, slotsByRole[role]);
    byRole[role] = pool;
    for (const p of pool) {
      ids.add(p.id);
      quotSum += p.quot;
    }
  }

  return {
    byRole,
    unassignedByRole: unassigned,
    slotsByRole,
    totalSlots: totalResidualSlots(slotsByRole),
    quotSum,
    ids,
  };
}

/**
 * Fase attiva: il primo ruolo in ordine P -> D -> C -> A con slot ancora liberi
 * in lega. `null` quando l'asta e' finita.
 */
export function activePhase(pool: ResidualPool): Role | null {
  for (const role of PHASE_ORDER) {
    if (pool.slotsByRole[role] > 0) return role;
  }
  return null;
}
