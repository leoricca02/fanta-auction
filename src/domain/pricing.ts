import type { ByRole, ListonePlayer, Player, Role, Tier } from './types';
import { PHASE_ORDER, TIER_COUNT } from './types';
import type { LeagueShape } from './config';
import { leagueSlotsByRole, totalLeagueCredits } from './config';

/**
 * Prezzo atteso di lega (PRD §4.1) e tiering (§2.1 + decisione di M1).
 *
 * Le quotazioni del listone sono tarate su una lega da 500 crediti e
 * sotto-quotano strutturalmente: vanno riscalate sull'economia reale.
 *
 *   N_r   = slot del ruolo r nella lega            (P 36, D 96, C 96, A 72)
 *   pool_r = top N_r giocatori del ruolo r per QUOT.
 *   S     = somma delle QUOT. dei pool             (= 2844 sul file corrente)
 *   f     = creditiTotaliLega / S                  (= 9600 / 2844 = 3.3755)
 *   expectedPrice(p) = round(QUOT(p) * f)
 *
 * `f` si ricalcola a ogni import. Non e' mai hardcodato.
 */

const EMPTY_BY_ROLE = (): Record<Role, number> => ({ P: 0, D: 0, C: 0, A: 0 });

/**
 * Ordinamento canonico del pool: QUOT. desc, poi FVM desc, poi id asc.
 *
 * Il tiebreak esiste perche' sul file reale ci sono pareggi enormi al taglio
 * (39 portieri a QUOT.=1 per 36 slot): senza un ordine totale, `poolResiduo`
 * e `marginale(r)` (§4.9) diventerebbero non deterministici tra un render e l'altro.
 */
export function compareByQuotDesc(a: ListonePlayer, b: ListonePlayer): number {
  if (a.quot !== b.quot) return b.quot - a.quot;
  if (a.fvm !== b.fvm) return b.fvm - a.fvm;
  return a.id - b.id;
}

/** Ordinamento per il tiering: FVM desc, poi QUOT. desc, poi id asc. */
export function compareByFvmDesc(a: ListonePlayer, b: ListonePlayer): number {
  if (a.fvm !== b.fvm) return b.fvm - a.fvm;
  if (a.quot !== b.quot) return b.quot - a.quot;
  return a.id - b.id;
}

/** Copia ordinata per QUOT. desc. Non muta l'input. */
export function sortByQuotDesc<T extends ListonePlayer>(players: readonly T[]): T[] {
  return [...players].sort(compareByQuotDesc);
}

export function groupByRole<T extends ListonePlayer>(players: readonly T[]): ByRole<T[]> {
  const out: Record<Role, T[]> = { P: [], D: [], C: [], A: [] };
  for (const p of players) out[p.role].push(p);
  return out;
}

export interface PricingModel {
  /** Fattore di riscalatura §4.1. */
  readonly f: number;
  /** S — somma delle QUOT. dei pool per ruolo. */
  readonly quotSum: number;
  readonly quotSumByRole: ByRole<number>;
  /** Crediti totali in palio (9600). */
  readonly totalCredits: number;
  /** N_r — slot di lega per ruolo. */
  readonly leagueSlotsByRole: ByRole<number>;
  /**
   * Budget split implicito §4.2: quota del valore di pool per ruolo, in [0, 1].
   * Baseline neutra, non un vincolo.
   */
  readonly budgetSplitByRole: ByRole<number>;
}

/**
 * Calcola `f` sul listone passato. `players` sono i giocatori **in lista**
 * (fuori lista gia' esclusi dal parser).
 */
export function computePricingModel(
  players: readonly ListonePlayer[],
  config: LeagueShape,
): PricingModel {
  const slots = leagueSlotsByRole(config);
  const totalCredits = totalLeagueCredits(config);
  const byRole = groupByRole(players);

  const quotSumByRole = EMPTY_BY_ROLE();
  for (const role of PHASE_ORDER) {
    const pool = sortByQuotDesc(byRole[role]).slice(0, slots[role]);
    quotSumByRole[role] = pool.reduce((acc, p) => acc + p.quot, 0);
  }
  const quotSum = PHASE_ORDER.reduce((acc, role) => acc + quotSumByRole[role], 0);
  const f = quotSum > 0 ? totalCredits / quotSum : 0;

  const budgetSplitByRole = EMPTY_BY_ROLE();
  for (const role of PHASE_ORDER) {
    budgetSplitByRole[role] = quotSum > 0 ? quotSumByRole[role] / quotSum : 0;
  }

  return {
    f,
    quotSum,
    quotSumByRole,
    totalCredits,
    leagueSlotsByRole: slots,
    budgetSplitByRole,
  };
}

/** `round(quot * f)`, letterale come §4.1. */
export function expectedPriceFor(quot: number, f: number): number {
  return Math.round(quot * f);
}

/**
 * Tier per posizione dentro il ruolo: quintili di FVM/1000 (decisione di M1,
 * il PRD dichiara il campo in §3.1 ma non la regola).
 *
 * @param index posizione 0-based nell'ordinamento per FVM desc dentro il ruolo.
 * @param roleCount numero di giocatori del ruolo.
 */
export function tierForIndex(index: number, roleCount: number): Tier {
  if (roleCount <= 0) return TIER_COUNT as Tier;
  const raw = Math.floor((index * TIER_COUNT) / roleCount) + 1;
  return Math.min(TIER_COUNT, Math.max(1, raw)) as Tier;
}

/** Media crediti per slot della baseline §4.2, per ruolo. */
export function baselineCreditsByRole(model: PricingModel): ByRole<number> {
  const out = EMPTY_BY_ROLE();
  for (const role of PHASE_ORDER) {
    out[role] = model.budgetSplitByRole[role] * model.totalCredits;
  }
  return out;
}

export interface BuiltListone {
  readonly players: readonly Player[];
  readonly model: PricingModel;
}

/**
 * Arricchisce i giocatori del parser con `expectedPrice` (§4.1) e `tier`.
 *
 * L'output e' in ordine canonico — ruoli in ordine di fase P, D, C, A e,
 * dentro il ruolo, FVM/1000 desc — non nell'ordine di riga del file.
 */
export function buildPlayers(raw: readonly ListonePlayer[], config: LeagueShape): BuiltListone {
  const model = computePricingModel(raw, config);
  const byRole = groupByRole(raw);
  const players: Player[] = [];

  for (const role of PHASE_ORDER) {
    const ordered = [...byRole[role]].sort(compareByFvmDesc);
    ordered.forEach((p, i) => {
      players.push({
        ...p,
        expectedPrice: expectedPriceFor(p.quot, model.f),
        tier: tierForIndex(i, ordered.length),
      });
    });
  }

  return { players, model };
}
