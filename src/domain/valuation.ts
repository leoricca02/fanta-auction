import type { Expectation, Player, Role } from './types';
import type { LeagueState } from './reducer';

/**
 * Prezzo dinamico (§5.5).
 *
 * Non e' il modello di prezzo della 1.0, che il PRD §0 ha eliminato. Quello
 * derivava una previsione dalle colonne del listone; questo mette in rapporto
 * due numeri, e nessuno dei due e' una previsione dell'applicazione:
 *
 *   - `V`, il valore di un giocatore, e' **la tua aspettativa dichiarata** —
 *     presenze, gol, assist, cartellini che pensi faccia nel 2026/27;
 *   - il **tasso** e' quanto il tuo tavolo, stasera, sta pagando un punto di
 *     `V`, misurato sulle aste gia' battute.
 *
 * Il prodotto risponde a una domanda sola: se penso che Yildiz faccia gli
 * stessi numeri di Kolo Muani, e Kolo Muani e' andato a 60, perche' pagare
 * Yildiz diversamente? Il numero a schermo serve a ricordarlo mentre il
 * banditore corre, non a decidere al posto tuo.
 *
 * **Solo giocatori di movimento.** L'asta dei portieri si gioca su porte
 * inviolate e titolarita' del reparto, non su gol e assist: una formula sola
 * per entrambi mentirebbe su uno dei due. I portieri restano fuori.
 */

/** Ruoli con prezzo dinamico. */
export type MovementRole = 'D' | 'C' | 'A';

export const MOVEMENT_ROLES = ['D', 'C', 'A'] as const satisfies readonly MovementRole[];

export function isMovementRole(role: Role): role is MovementRole {
  return role !== 'P';
}

// ---------------------------------------------------------------------------
// L'aspettativa: dato utente, non dato derivato
// ---------------------------------------------------------------------------

export type ExpectationIndex = ReadonlyMap<number, Expectation>;

export function makeExpectationIndex(rows: readonly Expectation[]): ExpectationIndex {
  return new Map(rows.map((e) => [e.playerId, e]));
}

// ---------------------------------------------------------------------------
// Pesi
// ---------------------------------------------------------------------------

/**
 * Pesi della formula.
 *
 * Gol, assist e cartellini sono i bonus/malus del fantacalcio: non sono
 * un'opinione, sono il regolamento. L'unico numero discutibile e' quanto vale
 * una presenza, e vale **per ruolo**: da un difensore compri titolarita' e
 * voto, da un attaccante compri gol. Trenta presenze di un difensore e trenta
 * di un attaccante non sono la stessa merce.
 *
 * Il tasso si calcola per reparto (vedi `marketRates`), e questo rende la
 * **scala** dei pesi irrilevante: moltiplicali tutti per due e ogni tasso si
 * dimezza da solo, i prezzi non si muovono di un credito. Quello che conta e'
 * solo la **forma**: quante presenze valgono un gol, dentro quel ruolo.
 *
 * Alzare `matches[A]` da 0.2 a 0.4, quindi, non e' un cambio di scala ed i
 * prezzi cambiano: si sta dicendo che da un attaccante si compra il doppio di
 * titolarita' a parita' di gol. E' la manopola vera, una per reparto.
 */
export interface ValuationWeights {
  readonly matches: Readonly<Record<MovementRole, number>>;
  readonly goal: number;
  readonly assist: number;
  readonly yellow: number;
  readonly red: number;
}

export const DEFAULT_WEIGHTS: ValuationWeights = {
  matches: { D: 0.5, C: 0.3, A: 0.2 },
  goal: 3,
  assist: 1,
  yellow: -0.5,
  red: -1,
};

/**
 * Valore di un'aspettativa. Mai negativo: un monte di cartellini non rende un
 * giocatore un debito, lo rende soltanto senza valore d'asta.
 */
export function valueOf(
  expectation: Expectation,
  role: MovementRole,
  weights: ValuationWeights = DEFAULT_WEIGHTS,
): number {
  const raw =
    weights.matches[role] * expectation.matches +
    weights.goal * expectation.goals +
    weights.assist * expectation.assists +
    weights.yellow * expectation.yellows +
    weights.red * expectation.reds;
  return Math.max(0, raw);
}

// ---------------------------------------------------------------------------
// Il tasso: quanto costa un punto di V a questo tavolo
// ---------------------------------------------------------------------------

/**
 * Aste valutate sotto le quali il tasso di un reparto non si regge da solo.
 * Con una o due aste il tasso e' il prezzo di quelle due aste, non del tavolo.
 */
export const MIN_SAMPLE = 3;

/**
 * Da dove viene il tasso. Sempre dichiarato, cosi' la UI puo' distinguere "non
 * ho abbastanza aste" da "non hai valutato nessuno".
 */
export type RateSource =
  /** Dalle aste di questo stesso reparto: l'unico caso in cui c'e' un prezzo. */
  | 'role'
  /** Il reparto e' partito da poco: meno di `MIN_SAMPLE` aste valutate. */
  | 'warming'
  /** Nessuna asta valutata in questo reparto. */
  | 'none';

export interface RoleRate {
  readonly role: MovementRole;
  /** Crediti per punto di `V`. `null` quando non c'e' niente su cui misurarlo. */
  readonly rate: number | null;
  /** Aste **valutate** del reparto: quelle senza aspettativa non contano. */
  readonly sample: number;
  readonly source: RateSource;
}

export type RateIndex = Readonly<Record<MovementRole, RoleRate>>;

/**
 * Mediana, non media: una singola asta fuori scala non deve spostare la scala
 * di tutte le altre.
 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * Rapporti prezzo/valore delle aste gia' battute, divisi per reparto.
 *
 * Entrano solo i giocatori che **hai valutato tu**: di un acquisto senza
 * aspettativa non conosci il denominatore, e infilarlo nel conto con un valore
 * inventato sposterebbe il tasso di tutti gli altri.
 */
function ratiosByRole(
  state: LeagueState,
  expectations: ExpectationIndex,
  weights: ValuationWeights,
): Record<MovementRole, number[]> {
  const ratios: Record<MovementRole, number[]> = { D: [], C: [], A: [] };

  for (const owned of Object.values(state.assignmentByPlayerId)) {
    if (!isMovementRole(owned.role)) continue;
    const expectation = expectations.get(owned.playerId);
    if (expectation === undefined) continue;
    const value = valueOf(expectation, owned.role, weights);
    // V a zero non e' un rapporto: e' una divisione per zero travestita.
    if (value <= 0) continue;
    ratios[owned.role].push(owned.price / value);
  }

  return ratios;
}

/**
 * Il tasso corrente di ogni reparto, ricalcolato a ogni martellata.
 *
 * **Ogni reparto sta per conto suo, e non si prestano niente.** Un punto di
 * difensore e un punto di attaccante non costano uguale nemmeno alla lontana:
 * la simulazione su listone e statistiche vere misura 0,96 crediti per punto
 * sui difensori e 1,90 sugli attaccanti. Prestare il tasso dei difensori alla
 * fase A dimezzerebbe ogni consiglio, e lo farebbe proprio all'apertura del
 * reparto, quando escono i nomi grossi. Meglio nessun numero.
 *
 * Conseguenza accettata: all'inizio di ogni fase i primi `MIN_SAMPLE` colpi
 * non hanno prezzo dinamico (`source: 'warming'`). E' il costo di non mentire
 * sulla scala, e dura tre aste.
 */
export function marketRates(
  state: LeagueState,
  expectations: ExpectationIndex,
  weights: ValuationWeights = DEFAULT_WEIGHTS,
): RateIndex {
  const ratios = ratiosByRole(state, expectations, weights);
  const out = {} as Record<MovementRole, RoleRate>;

  for (const role of MOVEMENT_ROLES) {
    const own = ratios[role];
    if (own.length >= MIN_SAMPLE) {
      out[role] = { role, rate: median(own), sample: own.length, source: 'role' };
    } else {
      out[role] = {
        role,
        rate: null,
        sample: own.length,
        source: own.length > 0 ? 'warming' : 'none',
      };
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Il prezzo
// ---------------------------------------------------------------------------

export interface DynamicPrice {
  readonly playerId: number;
  /** Valore della tua aspettativa. */
  readonly value: number;
  /** Crediti consigliati: `tasso x V`, mai sotto 1. */
  readonly price: number;
  readonly rate: number;
  readonly sample: number;
}

/**
 * Prezzo consigliato per un giocatore, o `null`.
 *
 * `null` non e' zero ed e' il caso piu' frequente: portiere, nessuna
 * aspettativa inserita, aspettativa che vale zero, oppure reparto appena
 * aperto senza abbastanza aste. La UI deve dire *quale* dei quattro —
 * "valutalo" e "aspetta tre aste" sono due schermate diverse, e `marketRates`
 * porta con se' il motivo in `source`.
 */
export function dynamicPrice(
  player: Player,
  expectations: ExpectationIndex,
  rates: RateIndex,
  weights: ValuationWeights = DEFAULT_WEIGHTS,
): DynamicPrice | null {
  if (!isMovementRole(player.role)) return null;

  const expectation = expectations.get(player.id);
  if (expectation === undefined) return null;

  const value = valueOf(expectation, player.role, weights);
  if (value <= 0) return null;

  const { rate, sample } = rates[player.role];
  if (rate === null) return null;

  return {
    playerId: player.id,
    value,
    price: Math.max(1, Math.round(value * rate)),
    rate,
    sample,
  };
}
