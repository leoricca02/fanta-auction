import type { ByRole, LeagueConfig, Player, Role } from './types';
import { PHASE_ORDER } from './types';
import type { LeagueState, TeamState } from './reducer';
import type { ResidualPool } from './pool';
import { residualPool } from './pool';
import { totalLeagueCredits, totalLeagueSlots } from './config';

/**
 * Ricalibrazione live (§4.8), livello di sostituzione (§4.9), soglie di
 * rilancio (§4.10).
 *
 * I 9600 crediti sono una quantita' conservata. Se l'asta parte cara il resto
 * **deve** andare a sconto: non e' una stima, e' un vincolo di bilancio.
 *
 *   creditiResidui = creditiTotali - somma dei prezzi pagati
 *   slotResidui    = 300 - assegnazioni attive
 *   poolResiduo    = unione dei top {slotResidui_r} non assegnati, per QUOT. desc
 *   f_live         = (creditiResidui - slotResidui) / somma QUOT(poolResiduo)
 *
 * Il termine `- slotResidui` e' il floor da 1 credito per slot, non spendibile.
 *
 * **Segno.** Prezzi sopra l'atteso fanno *scendere* `f_live`, non salire: i
 * crediti extra sono usciti dal montepremi, quindi il resto del mercato si e'
 * impoverito. La soglia esatta di break-even e' `prezzo = 1 + f_live * QUOT(p)`:
 * il `+1` e' il credito di floor che lo slot appena riempito restituisce al
 * pool. Pagare *esattamente* il prezzo atteso fa quindi salire `f_live` di un
 * epsilon. Vedi `breakEvenPrice`.
 */

function emptyByRole<T>(make: () => T): Record<Role, T> {
  return { P: make(), D: make(), C: make(), A: make() };
}

export interface LivePricing {
  /** §4.8. Clampato a 0 verso il basso: non esistono prezzi negativi. */
  readonly fLive: number;
  readonly creditsRemaining: number;
  readonly slotsRemaining: number;
  readonly pool: ResidualPool;
  /** §4.9 — valore del giocatore marginale per ruolo. Mai sotto 1. */
  readonly marginaleByRole: ByRole<number>;
}

/** §4.8 — `f_live` grezzo, prima del clamp. */
export function fLiveRaw(creditsRemaining: number, slotsRemaining: number, quotSum: number): number {
  if (quotSum <= 0) return 0;
  return (creditsRemaining - slotsRemaining) / quotSum;
}

/** `max(1, round(QUOT(p) * f_live))` (§4.8). */
export function expectedPriceLiveFor(quot: number, fLive: number): number {
  return Math.max(1, Math.round(quot * fLive));
}

export function expectedPriceLive(player: Player, live: LivePricing): number {
  return expectedPriceLiveFor(player.quot, live.fLive);
}

/**
 * Prezzo oltre il quale l'acquisto di `player` fa **scendere** `f_live`.
 *
 * Deriva dall'algebra di §4.8, non e' una soglia di comodo: con
 * `A = creditiResidui - slotResidui` e `Q = somma QUOT(poolResiduo)`,
 * dopo un acquisto a prezzo `x` di un giocatore dentro il pool si ha
 * `f' = (A + 1 - x) / (Q - q)`, e `f' <= f` equivale a `x >= 1 + f * q`.
 */
export function breakEvenPrice(player: Player, live: LivePricing): number {
  return 1 + live.fLive * player.quot;
}

/**
 * §4.9 — livello di sostituzione: il giocatore *marginale* del ruolo, cioe'
 * l'ultimo che verra' assegnato in lega. Se il pool del ruolo e' esaurito o
 * piu' corto degli slot, vale 1.
 */
export function marginaleFor(
  pool: readonly Player[],
  slots: number,
  fLive: number,
): number {
  if (slots <= 0) return 1;
  const marginal = pool[slots - 1];
  if (marginal === undefined) return 1;
  return expectedPriceLiveFor(marginal.quot, fLive);
}

/** Calcola l'intero stato di pricing live a partire dallo stato di lega. */
export function computeLivePricing(state: LeagueState, config: LeagueConfig): LivePricing {
  const pool = residualPool(state, config);
  const creditsRemaining = totalLeagueCredits(config) - state.creditsSpent;
  const slotsRemaining = totalLeagueSlots(config) - state.slotsFilled;
  const fLive = Math.max(0, fLiveRaw(creditsRemaining, slotsRemaining, pool.quotSum));

  const marginaleByRole = emptyByRole<number>(() => 1);
  for (const role of PHASE_ORDER) {
    marginaleByRole[role] = marginaleFor(pool.byRole[role], pool.slotsByRole[role], fLive);
  }

  return { fLive, creditsRemaining, slotsRemaining, pool, marginaleByRole };
}

/**
 * Somma dei prezzi attesi live sul pool residuo. Deve stare entro l'1% di
 * `creditiResidui - slotResidui` (invariante di §4.8).
 */
export function residualPoolValue(live: LivePricing): number {
  let sum = 0;
  for (const role of PHASE_ORDER) {
    for (const p of live.pool.byRole[role]) sum += expectedPriceLiveFor(p.quot, live.fLive);
  }
  return sum;
}

export interface ConservationCheck {
  /** Somma dei prezzi attesi live sul pool residuo. */
  readonly poolValue: number;
  /** `creditiResidui - slotResidui`. */
  readonly target: number;
  /** Scarto relativo. `null` quando `target` e' 0 e il rapporto non e' definito. */
  readonly relativeError: number | null;
  /**
   * `true` se lo scarto sta entro `tolerance`.
   *
   * Il clamp `max(1, ...)` rende l'invariante **unilaterale**: `poolValue` non
   * puo' scendere sotto `slotResidui`, quindi con `target` vicino a zero — a
   * fine asta, o quando `creditiResidui == slotResidui` — l'invariante e' rotta
   * per costruzione e `withinTolerance` diventa `false`. Non e' un bug della
   * metrica: e' il limite in cui tutti i prezzi valgono 1.
   */
  readonly withinTolerance: boolean;
}

export function checkConservation(live: LivePricing, tolerance = 0.01): ConservationCheck {
  const poolValue = residualPoolValue(live);
  const target = live.creditsRemaining - live.slotsRemaining;
  if (target === 0) {
    return { poolValue, target, relativeError: null, withinTolerance: poolValue === 0 };
  }
  const relativeError = Math.abs(poolValue - target) / Math.abs(target);
  return { poolValue, target, relativeError, withinTolerance: relativeError <= tolerance };
}

/**
 * §4.10 — le tre soglie piu' il surplus corrente. Numeri, mai un verdetto:
 * nessun booleano "conviene", nessuna stringa di consiglio.
 */
export interface BidVerdict {
  /** Aritmetico, sempre affidabile. */
  readonly tettoSostenibile: number;
  /** Dipende dalle stime `userValue`. Puo' essere negativo: non e' clampato. */
  readonly prezzoIndifferenza: number;
  /** Giocatori dello stesso tier ancora non assegnati nel ruolo, `p` incluso. */
  readonly scarsitaTier: number;
  /** `valore(p) - prezzoAttuale`. */
  readonly surplusCorrente: number;
}

/** `userValue(p)` — stima personale dell'utente, `null` se non compilata. */
export type UserValueLookup = (playerId: number) => number | null;

const NO_USER_VALUES: UserValueLookup = () => null;

/**
 * §4.10 — tetto sostenibile: quanto puo' pagare la squadra senza compromettere
 * gli slot restanti.
 *
 *   crediti - somma_r ( slotLiberi(r) * marginale(r) ) + marginale( role(p) )
 *
 * L'ultimo termine ripristina la riserva dello slot che si sta riempiendo ora.
 * Con un solo slot libero, e nel ruolo di `p`, il risultato e' esattamente i
 * crediti disponibili.
 */
export function tettoSostenibile(team: TeamState, role: Role, live: LivePricing): number {
  let reserve = 0;
  for (const r of PHASE_ORDER) {
    reserve += team.slotsFreeByRole[r] * live.marginaleByRole[r];
  }
  return team.credits - reserve + live.marginaleByRole[role];
}

/**
 * §4.10 — prezzo di indifferenza: sopra questa cifra conviene lasciare e
 * prendere la migliore alternativa rimasta nel ruolo.
 *
 *   valore(q)             = userValue(q) ?? expectedPriceLive(q)
 *   surplus(q)            = valore(q) - expectedPriceLive(q)
 *   prezzoIndifferenza(p) = valore(p) - max{ surplus(q) : q nel pool del ruolo, q != p }
 *
 * Negativo significa che esiste gia' un'alternativa migliore a mercato: si
 * lascia subito. Il segno **non** viene clampato a 0.
 *
 * Se `p` e' l'ultimo del pool e non esiste alcuna alternativa, il massimo su
 * insieme vuoto vale 0: senza alternative non c'e' costo opportunita', e la
 * soglia coincide con `valore(p)`.
 */
export function prezzoIndifferenza(
  player: Player,
  live: LivePricing,
  userValue: UserValueLookup = NO_USER_VALUES,
): number {
  const valueOf = (q: Player): number => userValue(q.id) ?? expectedPriceLive(q, live);
  const alternatives = live.pool.byRole[player.role];

  let bestSurplus = 0;
  let found = false;
  for (const q of alternatives) {
    if (q.id === player.id) continue;
    const surplus = valueOf(q) - expectedPriceLive(q, live);
    if (!found || surplus > bestSurplus) {
      bestSurplus = surplus;
      found = true;
    }
  }

  return valueOf(player) - bestSurplus;
}

/**
 * §4.10 / §4.4 — scarsita' del tier: quanti giocatori dello stesso ruolo e
 * dello stesso tier restano non assegnati, `p` incluso.
 */
export function scarsitaTier(player: Player, live: LivePricing): number {
  let count = 0;
  for (const q of live.pool.unassignedByRole[player.role]) {
    if (q.tier === player.tier) count++;
  }
  return count;
}

export interface BidVerdictInput {
  readonly player: Player;
  readonly team: TeamState;
  readonly live: LivePricing;
  /** Prezzo a cui il rilancio e' arrivato adesso. */
  readonly currentPrice: number;
  readonly userValue?: UserValueLookup;
}

/** §4.10 — le tre soglie. Nessun verdetto, solo numeri. */
export function bidVerdict(input: BidVerdictInput): BidVerdict {
  const { player, team, live, currentPrice } = input;
  const userValue = input.userValue ?? NO_USER_VALUES;
  const value = userValue(player.id) ?? expectedPriceLive(player, live);

  return {
    tettoSostenibile: tettoSostenibile(team, player.role, live),
    prezzoIndifferenza: prezzoIndifferenza(player, live, userValue),
    scarsitaTier: scarsitaTier(player, live),
    surplusCorrente: value - currentPrice,
  };
}
