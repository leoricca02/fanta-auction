import type { ByRole, LeagueConfig, Player, Role, Tier } from './types';
import { PHASE_ORDER } from './types';
import type { LeagueState, TeamState } from './reducer';
import { maxBidAssoluto, teamState } from './reducer';
import type { ResidualPool } from './pool';
import { residualPool } from './pool';
import type { PricingModel } from './pricing';
import { phasesAfter, totalLeagueCredits, totalLeagueSlots } from './config';

export { maxBidAssoluto } from './reducer';

/**
 * Metriche di §4.3 - §4.7. Funzioni pure, nessuna dipendenza da React o Dexie.
 *
 * Le metriche che dipendono dalla ricalibrazione live (§4.8 - §4.10) stanno in
 * `live-pricing.ts`.
 */

function emptyByRole<T>(make: () => T): Record<Role, T> {
  return { P: make(), D: make(), C: make(), A: make() };
}

// ---------------------------------------------------------------------------
// §4.3 — Max bid
// ---------------------------------------------------------------------------

export interface TeamCeiling {
  readonly teamId: string;
  readonly credits: number;
  readonly slotsFree: number;
  /** Tetto matematico: `crediti - (slotRimanenti - 1)`. */
  readonly maxBidAssoluto: number;
}

/**
 * §4.3 — tetto assoluto di **tutti** i partecipanti: risponde a
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

/**
 * §4.3 — max bid ragionevole: crediti meno la riserva delle **fasi future**,
 * a `prezzoMinimoAccettabile_fase` per slot.
 *
 * Il PRD non definisce `prezzoMinimoAccettabile_fase`. Decisione di M1: e' il
 * `marginale(r)` di §4.9, che §4.9 stesso descrive come "il costo di riempire
 * uno slot al minimo accettabile". La fase corrente e' esclusa, perche' il
 * giocatore su cui si sta rilanciando la occupa gia'.
 */
export function maxBidRagionevole(
  team: TeamState,
  currentPhase: Role,
  minPriceByRole: ByRole<number>,
): number {
  let reserve = 0;
  for (const role of phasesAfter(currentPhase)) {
    reserve += team.slotsFreeByRole[role] * minPriceByRole[role];
  }
  return team.credits - reserve;
}

// ---------------------------------------------------------------------------
// §4.4 — Scarcity della fase attiva
// ---------------------------------------------------------------------------

/** Soglia di alert su `pressione` (PRD §4.4). */
export const SCARCITY_ALERT_THRESHOLD = 0.8;

export interface Scarcity {
  readonly role: Role;
  /** Giocatori del ruolo non assegnati, filtrati per tier. */
  readonly poolResiduo: number;
  /** Slot liberi del ruolo sommati su tutte le squadre. */
  readonly slotResidui: number;
  /**
   * `slotResidui / poolResiduo`. `null` quando il pool e' vuoto:
   * il rapporto non e' definito, e mostrare `Infinity` mentirebbe.
   */
  readonly pressione: number | null;
  /** `pressione > 0.8`. Con pool vuoto e slot ancora liberi vale `true`. */
  readonly alert: boolean;
}

export interface ScarcityOptions {
  /** Considera solo i tier `<= maxTier` (la "soglia tier" di §4.4). */
  readonly maxTier?: Tier;
}

export function computeScarcity(
  pool: ResidualPool,
  role: Role,
  options: ScarcityOptions = {},
): Scarcity {
  const maxTier = options.maxTier ?? 5;
  const candidates = pool.unassignedByRole[role].filter((p) => p.tier <= maxTier);
  const poolResiduo = candidates.length;
  const slotResidui = pool.slotsByRole[role];

  if (poolResiduo === 0) {
    return { role, poolResiduo, slotResidui, pressione: null, alert: slotResidui > 0 };
  }
  const pressione = slotResidui / poolResiduo;
  return { role, poolResiduo, slotResidui, pressione, alert: pressione > SCARCITY_ALERT_THRESHOLD };
}

export function scarcityByRole(pool: ResidualPool, options: ScarcityOptions = {}): ByRole<Scarcity> {
  return {
    P: computeScarcity(pool, 'P', options),
    D: computeScarcity(pool, 'D', options),
    C: computeScarcity(pool, 'C', options),
    A: computeScarcity(pool, 'A', options),
  };
}

// ---------------------------------------------------------------------------
// §4.5 — Inflazione della fase
// ---------------------------------------------------------------------------

/** Piano budget personale dell'utente, in crediti assoluti per ruolo. */
export type UserBudgetPlan = Partial<Readonly<Record<Role, number>>>;

export interface PhaseInflation {
  readonly phase: Role;
  /** `somma_t min(crediti(t), quotaPianificata_fase(t))`. */
  readonly expectedCreditsOnPhase: number;
  /** `somma_{p nel pool della fase} expectedPrice(p)`, prezzi statici §4.1. */
  readonly poolExpectedValue: number;
  /** Sopra 1 il mercato paga sopra quotazione; sotto 1 e' a sconto. */
  readonly inflazione: number | null;
}

/**
 * Quote di §4.2 rinormalizzate sulle sole fasi ancora aperte.
 *
 * Un avversario che ha gia' chiuso i portieri non ha piu' motivo di riservare
 * l'8.4% ai portieri: quel budget si redistribuisce sulle fasi che restano.
 */
export function residualPlannedShares(
  pool: ResidualPool,
  model: PricingModel,
): ByRole<number> {
  const openRoles = PHASE_ORDER.filter((role) => pool.slotsByRole[role] > 0);
  const total = openRoles.reduce((acc, role) => acc + model.budgetSplitByRole[role], 0);
  const out = emptyByRole<number>(() => 0);
  if (total <= 0) return out;
  for (const role of openRoles) out[role] = model.budgetSplitByRole[role] / total;
  return out;
}

export interface InflationOptions {
  /**
   * Piano personale dell'utente in crediti assoluti. Per gli 11 avversari si
   * usa comunque la baseline §4.2 sui crediti correnti (decisione di M1: un
   * piano per gli avversari non esiste).
   */
  readonly userPlan?: UserBudgetPlan;
}

export function computePhaseInflation(
  state: LeagueState,
  config: LeagueConfig,
  model: PricingModel,
  pool: ResidualPool,
  phase: Role,
  options: InflationOptions = {},
): PhaseInflation {
  const shares = residualPlannedShares(pool, model);
  const share = shares[phase];

  let expectedCreditsOnPhase = 0;
  for (const team of config.teams) {
    const t = teamState(state, team.id);
    const userPlanned = team.isUser ? options.userPlan?.[phase] : undefined;
    const planned = userPlanned ?? t.credits * share;
    expectedCreditsOnPhase += Math.min(t.credits, planned);
  }

  let poolExpectedValue = 0;
  for (const p of pool.byRole[phase]) poolExpectedValue += p.expectedPrice;

  return {
    phase,
    expectedCreditsOnPhase,
    poolExpectedValue,
    inflazione: poolExpectedValue > 0 ? expectedCreditsOnPhase / poolExpectedValue : null,
  };
}

// ---------------------------------------------------------------------------
// §4.6 — Profilo avversari
// ---------------------------------------------------------------------------

/** Acquisti sotto i quali l'indice non e' ancora leggibile (PRD §4.6). */
export const AGGRESSIVENESS_MIN_SAMPLE = 3;

export interface Aggressiveness {
  readonly teamId: string;
  /** `media(prezzoPagato / expectedPrice)`. `null` senza acquisti. */
  readonly index: number | null;
  readonly sampleSize: number;
  /** "Leggibile dal terzo o quarto acquisto" (PRD §4.6). */
  readonly reliable: boolean;
}

export function computeAggressiveness(
  team: TeamState,
  players: ReadonlyMap<number, Player>,
): Aggressiveness {
  let sum = 0;
  let n = 0;
  for (const entry of team.roster) {
    const player = players.get(entry.playerId);
    if (player === undefined) continue;
    // Il prezzo atteso puo' arrotondare a 0 su quotazioni minime: il floor a 1
    // evita una divisione per zero che manderebbe l'indice a Infinity.
    sum += entry.price / Math.max(1, player.expectedPrice);
    n++;
  }
  return {
    teamId: team.teamId,
    index: n > 0 ? sum / n : null,
    sampleSize: n,
    reliable: n >= AGGRESSIVENESS_MIN_SAMPLE,
  };
}

export function aggressivenessForAll(
  state: LeagueState,
  config: LeagueConfig,
  players: ReadonlyMap<number, Player>,
): Aggressiveness[] {
  return config.teams.map((team) => computeAggressiveness(teamState(state, team.id), players));
}

// ---------------------------------------------------------------------------
// §4.7 — Riconciliazione
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
 * §4.7 — barra di riconciliazione: crediti spesi e slot occupati in lega,
 * per il confronto a colpo d'occhio col tabellone ufficiale.
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
// Vista aggregata
// ---------------------------------------------------------------------------

export interface LeagueMetrics {
  readonly pool: ResidualPool;
  readonly ceilings: readonly TeamCeiling[];
  readonly scarcity: ByRole<Scarcity>;
  readonly aggressiveness: readonly Aggressiveness[];
  readonly reconciliation: Reconciliation;
}

export function computeLeagueMetrics(
  state: LeagueState,
  config: LeagueConfig,
  players: ReadonlyMap<number, Player>,
  options: ScarcityOptions = {},
): LeagueMetrics {
  const pool = residualPool(state, config);
  return {
    pool,
    ceilings: ceilingsForAll(state, config),
    scarcity: scarcityByRole(pool, options),
    aggressiveness: aggressivenessForAll(state, config, players),
    reconciliation: computeReconciliation(state, config),
  };
}
