import type { AssignmentEvent, LeagueConfig, Player, Role } from '../domain/types';
import type { LeagueState, TeamState } from '../domain/reducer';
import {
  initialLeagueState,
  makePlayerIndex,
  maxBidAssoluto,
  resolveAssignment,
} from '../domain/reducer';
import { activePhase, computeFreeAgents } from '../domain/free-agents';

/**
 * Simulatore d'asta per i test: genera un event log valido percorrendo le fasi
 * P -> D -> C -> A fino a riempire tutti gli slot di lega.
 *
 * Sta in `/src/test` perche' e' un helper, non dominio: l'app non lo importa.
 * Non contiene nessun modello di prezzo — i prezzi arrivano dalla strategia
 * passata dal test.
 */

export interface StepContext {
  readonly index: number;
  readonly player: Player;
  readonly team: TeamState;
  readonly phase: Role;
  readonly state: LeagueState;
}

export type PriceStrategy = (ctx: StepContext) => number;

export interface AuctionStep {
  readonly event: AssignmentEvent;
  /** Stato **prima** dell'evento. */
  readonly stateBefore: LeagueState;
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
 * finiscono clampati contro il tetto. Con `rng` si pesca tra le prime tre.
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

  let state = initialLeagueState(config);
  const events: AssignmentEvent[] = [];
  const steps: AuctionStep[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const free = computeFreeAgents(state, config);
    const phase = activePhase(free.slotsFreeByRole);
    if (phase === null) break;

    const player = free.byRole[phase][0];
    if (player === undefined) break;

    const team = pickTeam(state, config, phase, rng);
    const wanted = Math.round(priceFor({ index: i, player, team, phase, state }));
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

    steps.push({ event, stateBefore: state });
    state = applyOne(state, event, index);
    events.push(event);
  }

  return { events, steps, finalState: state };
}

/** Prezzo fisso a ogni chiamata. */
export function payFlat(price: number): PriceStrategy {
  return () => price;
}

/**
 * Prezzo proporzionale alla `QUOT.` grezza.
 *
 * Non e' un modello di prezzo: e' solo un modo di generare un log realistico
 * in cui i giocatori cari costano piu' degli altri. Il dominio non conosce
 * questa formula, che vive interamente nei test.
 */
export function payScaledByQuot(scale: number): PriceStrategy {
  return ({ player }) => Math.max(1, player.quot * scale);
}

/** Prezzo casuale in `[lo, hi]`. */
export function payRandom(rng: () => number, lo: number, hi: number): PriceStrategy {
  return () => lo + rng() * (hi - lo);
}
