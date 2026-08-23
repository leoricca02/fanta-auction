import type { AssignmentEvent, LeagueConfig, Player, Role } from '../domain/types';
import type { LeagueState, TeamState } from '../domain/reducer';
import { initialLeagueState, maxBidAssoluto, resolveAssignment, makePlayerIndex } from '../domain/reducer';
import type { LivePricing } from '../domain/live-pricing';
import { computeLivePricing, expectedPriceLive } from '../domain/live-pricing';
import { activePhase } from '../domain/pool';

/**
 * Simulatore d'asta per i test: genera un event log valido percorrendo le fasi
 * P -> D -> C -> A fino a riempire tutti gli slot di lega.
 *
 * Sta in `/src/test` perche' e' un helper, non dominio: l'app non lo importa.
 */

export interface StepContext {
  readonly index: number;
  readonly player: Player;
  readonly team: TeamState;
  readonly phase: Role;
  readonly state: LeagueState;
  readonly live: LivePricing;
}

export type PriceStrategy = (ctx: StepContext) => number;

export interface AuctionStep {
  readonly event: AssignmentEvent;
  /** Stato **prima** dell'evento. */
  readonly stateBefore: LeagueState;
  /** Pricing live **prima** dell'evento. */
  readonly liveBefore: LivePricing;
  /** Prezzo atteso live del giocatore prima dell'acquisto. */
  readonly expectedBefore: number;
}

export interface AuctionResult {
  readonly events: readonly AssignmentEvent[];
  readonly steps: readonly AuctionStep[];
  readonly finalState: LeagueState;
}

export interface RunAuctionOptions {
  readonly config: LeagueConfig;
  readonly priceFor: PriceStrategy;
  /** Sorgente casuale deterministica. Senza, la simulazione e' completamente greedy. */
  readonly rng?: () => number;
  /** Ferma la simulazione dopo `maxSteps` assegnazioni. */
  readonly maxSteps?: number;
  /**
   * Sceglie il ruolo del prossimo acquisto. Default: `activePhase`, cioe'
   * l'ordine sequenziale P -> D -> C -> A dell'asta vera.
   */
  readonly phasePicker?: (pool: LivePricing['pool']) => Role | null;
  /**
   * Sceglie quale giocatore del pool del ruolo va all'asta. Default: il primo,
   * cioe' il piu' caro.
   */
  readonly playerPicker?: (candidates: readonly Player[], live: LivePricing) => Player | undefined;
}

/**
 * Sceglie il giocatore di valore piu' vicino alla media del pool residuo.
 * Serve a riprodurre lo scenario di §4.8 alla lettera — "i primi 100 slot vanno
 * *mediamente* a +20%" — invece di comprare i 100 piu' cari.
 */
export const pickAverageValue = (
  candidates: readonly Player[],
  live: LivePricing,
): Player | undefined => {
  if (candidates.length === 0) return undefined;
  let meanQuot = 0;
  let n = 0;
  for (const role of ['P', 'D', 'C', 'A'] as const) {
    for (const q of live.pool.byRole[role]) {
      meanQuot += q.quot;
      n++;
    }
  }
  meanQuot = n > 0 ? meanQuot / n : 0;
  let best = candidates[0] as Player;
  let bestDelta = Math.abs(best.quot - meanQuot);
  for (const c of candidates) {
    const delta = Math.abs(c.quot - meanQuot);
    if (delta < bestDelta) {
      best = c;
      bestDelta = delta;
    }
  }
  return best;
};

/**
 * Sceglie il ruolo meno avanzato in percentuale di slot riempiti. Serve a
 * simulare 100 assegnazioni di valore *medio* invece dei primi 100 slot in
 * ordine di fase, che nel listone reale sono i piu' economici (36 P + 64 D).
 */
export function proportionalPhase(totalSlotsByRole: Record<Role, number>) {
  return (pool: LivePricing['pool']): Role | null => {
    let best: Role | null = null;
    let bestRatio = Number.POSITIVE_INFINITY;
    for (const role of ['P', 'D', 'C', 'A'] as const) {
      if (pool.slotsByRole[role] <= 0) continue;
      const total = totalSlotsByRole[role];
      const ratio = (total - pool.slotsByRole[role]) / total;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = role;
      }
    }
    return best;
  };
}

/**
 * Applica un evento senza ripiegare tutto il log: la simulazione lo fa 300
 * volte, e ripiegare da capo ogni volta sarebbe quadratico.
 */
function applyOne(
  state: LeagueState,
  event: AssignmentEvent,
  index: ReturnType<typeof makePlayerIndex>,
): LeagueState {
  const resolution = resolveAssignment(state, event, index);
  if (!resolution.ok) {
    throw new Error(`Simulazione incoerente: ${resolution.rejection.detail}`);
  }
  const { player, team } = resolution;
  const slotsFilledByRole = { ...team.slotsFilledByRole };
  const slotsFreeByRole = { ...team.slotsFreeByRole };
  slotsFilledByRole[player.role] += 1;
  slotsFreeByRole[player.role] -= 1;
  const entry = { playerId: player.id, role: player.role, price: event.price, eventId: event.id };

  return {
    teamsById: {
      ...state.teamsById,
      [team.teamId]: {
        ...team,
        credits: team.credits - event.price,
        spent: team.spent + event.price,
        roster: [...team.roster, entry],
        slotsFilledByRole,
        slotsFreeByRole,
        slotsFilled: team.slotsFilled + 1,
        slotsFree: team.slotsFree - 1,
      },
    },
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
 * Sceglie chi compra: la squadra con il tetto assoluto piu' alto tra quelle con
 * uno slot libero nel ruolo. Tiene i budget bilanciati, cosi' i prezzi non
 * finiscono clampati contro il tetto e la simulazione resta rappresentativa.
 * Con `rng` si pesca tra le prime tre.
 */
function pickTeam(
  state: LeagueState,
  config: LeagueConfig,
  role: Role,
  rng: (() => number) | undefined,
): TeamState {
  const eligible = config.teams
    .map((t) => state.teamsById[t.id])
    .filter((t): t is TeamState => t !== undefined && t.slotsFreeByRole[role] > 0)
    .sort((a, b) => maxBidAssoluto(b) - maxBidAssoluto(a));

  const first = eligible[0];
  if (first === undefined) throw new Error(`Nessuna squadra con slot ${role} libero.`);
  if (rng === undefined) return first;

  const window = eligible.slice(0, Math.min(3, eligible.length));
  return window[Math.floor(rng() * window.length)] ?? first;
}

export function runAuction(options: RunAuctionOptions): AuctionResult {
  const { config, priceFor, rng } = options;
  const index = makePlayerIndex(config.players);
  const maxSteps = options.maxSteps ?? Number.POSITIVE_INFINITY;
  const pickPhase = options.phasePicker ?? ((pool: LivePricing['pool']) => activePhase(pool));
  const pickPlayer = options.playerPicker ?? ((candidates: readonly Player[]) => candidates[0]);

  let state = initialLeagueState(config);
  const events: AssignmentEvent[] = [];
  const steps: AuctionStep[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const live = computeLivePricing(state, config);
    const phase = pickPhase(live.pool);
    if (phase === null) break;

    const candidates = live.pool.byRole[phase];
    const player = pickPlayer(candidates, live);
    if (player === undefined) break;

    const team = pickTeam(state, config, phase, rng);
    const expectedBefore = expectedPriceLive(player, live);
    const wanted = Math.round(priceFor({ index: i, player, team, phase, state, live }));
    const price = Math.max(1, Math.min(wanted, maxBidAssoluto(team)));

    const event: AssignmentEvent = {
      id: `sim-${i}`,
      ts: 1_700_000_000_000 + i,
      playerId: player.id,
      teamId: team.teamId,
      price,
      phase,
      undone: false,
    };

    steps.push({ event, stateBefore: state, liveBefore: live, expectedBefore });
    state = applyOne(state, event, index);
    events.push(event);
  }

  return { events, steps, finalState: state };
}

/** Paga esattamente il prezzo atteso live. */
export const payExpected: PriceStrategy = ({ player, live }) => expectedPriceLive(player, live);

/** Paga `factor` volte il prezzo atteso live. */
export function payMultiple(factor: number): PriceStrategy {
  return ({ player, live }) => expectedPriceLive(player, live) * factor;
}

/** Paga il prezzo atteso live moltiplicato per un fattore casuale in `[lo, hi]`. */
export function payRandomBand(rng: () => number, lo: number, hi: number): PriceStrategy {
  return ({ player, live }) => expectedPriceLive(player, live) * (lo + rng() * (hi - lo));
}
