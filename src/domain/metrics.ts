import type { LeagueConfig } from './types';
import type { LeagueState } from './reducer';
import { maxBidAssoluto, teamState } from './reducer';
import type { FreeAgents, PlayerNoteIndex } from './free-agents';
import { computeFreeAgents } from './free-agents';
import { totalLeagueCredits, totalLeagueSlots } from './config';

export { maxBidAssoluto } from './reducer';

/**
 * Le due sole metriche derivate della 2.0: max bid assoluto (§4.2) e
 * riconciliazione (§4.4). Funzioni pure, nessuna dipendenza da React o Dexie.
 *
 * Tutto il resto della 1.0 — prezzo atteso, `f_live`, inflazione di fase,
 * aggressivita' avversari, tier, livello di sostituzione, soglie di rilancio —
 * e' stato eliminato. Nessuna di queste due funzioni legge `quot` o `fvm`.
 */

// ---------------------------------------------------------------------------
// §4.2 — Max bid assoluto
// ---------------------------------------------------------------------------

export interface TeamCeiling {
  readonly teamId: string;
  readonly credits: number;
  readonly slotsFree: number;
  /** `crediti - (slotRimanenti - 1)`. Aritmetica pura. */
  readonly maxBidAssoluto: number;
}

/**
 * §4.2 — tetto assoluto di **tutti** i partecipanti: risponde a
 * "chi puo' ancora battermi su questo giocatore".
 */
export function ceilingsForAll(state: LeagueState, config: LeagueConfig): TeamCeiling[] {
  return config.teams.map((team) => {
    const t = teamState(state, team.id);
    return {
      teamId: t.teamId,
      credits: t.credits,
      slotsFree: t.slotsFree,
      maxBidAssoluto: maxBidAssoluto(t),
    };
  });
}

// ---------------------------------------------------------------------------
// §4.4 — Riconciliazione
// ---------------------------------------------------------------------------

export interface Reconciliation {
  readonly creditsSpent: number;
  readonly creditsRemaining: number;
  readonly totalCredits: number;
  readonly slotsFilled: number;
  readonly slotsRemaining: number;
  readonly totalSlots: number;
  /** `true` finche' i conti stanno dentro i limiti di lega. */
  readonly consistent: boolean;
}

/**
 * §4.4 — crediti spesi e slot occupati in lega, per il confronto a colpo
 * d'occhio col tabellone ufficiale. E' la mitigazione del rischio di desync.
 */
export function computeReconciliation(state: LeagueState, config: LeagueConfig): Reconciliation {
  const totalCredits = totalLeagueCredits(config);
  const totalSlots = totalLeagueSlots(config);
  const creditsRemaining = totalCredits - state.creditsSpent;
  const slotsRemaining = totalSlots - state.slotsFilled;
  return {
    creditsSpent: state.creditsSpent,
    creditsRemaining,
    totalCredits,
    slotsFilled: state.slotsFilled,
    slotsRemaining,
    totalSlots,
    consistent: creditsRemaining >= slotsRemaining && slotsRemaining >= 0,
  };
}

// ---------------------------------------------------------------------------
// Vista aggregata della barra
// ---------------------------------------------------------------------------

export interface LeagueMetrics {
  readonly freeAgents: FreeAgents;
  readonly ceilings: readonly TeamCeiling[];
  readonly reconciliation: Reconciliation;
}

export function computeLeagueMetrics(
  state: LeagueState,
  config: LeagueConfig,
  notes: PlayerNoteIndex = new Map(),
): LeagueMetrics {
  return {
    freeAgents: computeFreeAgents(state, config, notes),
    ceilings: ceilingsForAll(state, config),
    reconciliation: computeReconciliation(state, config),
  };
}
