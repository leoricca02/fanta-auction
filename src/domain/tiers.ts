import type { Player, Role } from './types';
import { normalizeQuery } from './search';

/**
 * Fasce della guida all'asta (SosFanta).
 *
 * Sono un **dato derivato dal listone**, non dati utente: si ricalcolano a ogni
 * import, non entrano nel backup di §3.1 e non hanno niente a che vedere con il
 * `Tag` (obiettivo/alternativa/evita), che resta il giudizio dell'utente. Una
 * fascia dice cosa pensa la guida, un tag dice cosa pensi tu.
 *
 * L'aggancio e' per nome normalizzato, non per id: la guida non pubblica gli id
 * di Fantacalcio.it. Regge perche' la guida usa la stessa convenzione del
 * listone ("Martinez Jo.", "Milinkovic-Savic V."). Sul listone 2026-27 aggancia
 * 479 dei 482 nomi, senza ambiguita'; i tre superstiti sono giocatori usciti
 * dalla Serie A. Chi non aggancia semplicemente non ha fascia: qui non c'e'
 * niente da salvare, quindi non c'e' niente da perdere.
 */

/**
 * Le fasce in ordine di valore decrescente, come le presenta la guida.
 * L'indice in questo array e' il rank: e' l'unico ordinamento che esiste.
 *
 * Non e' una scala pulita — `INFORTUNATI`, `SCOMMESSE` e i `JOLLY` sono
 * categorie, non gradini — ma e' l'ordine in cui la guida stessa le elenca, ed
 * e' quello che uno si aspetta di ritrovare scorrendo la tabella.
 */
export const TIER_ORDER = [
  'SUPER TOP',
  'TOP',
  'SEMITOP',
  'SOTTO AI SEMITOP',
  'FASCIA ALTA',
  'JOLLY 1ª FASCIA',
  'POSSIBILI SORPRESE',
  'FASCIA MEDIA',
  'INFORTUNATI',
  'SCOMMESSE',
  'SOPRA AI LOW COST',
  'JOLLY 2ª FASCIA',
  'LOW COST 1ª FASCIA',
  'LOW COST 2ª FASCIA',
  'LEGHE NUMEROSE',
  'JOLLY 3ª FASCIA',
  'JOLLY 4ª FASCIA',
  'A RISCHIO',
  'DA EVITARE',
  'MERCATO',
] as const;

export type Tier = (typeof TIER_ORDER)[number];

/** Un blocco della guida: una fascia, per un ruolo, con i suoi nomi grezzi. */
export interface TierBlock {
  readonly role: Role;
  readonly tier: Tier;
  /** Nomi come li scrive la guida, da normalizzare per l'aggancio. */
  readonly names: readonly string[];
}

/** Giocatore -> fascia. Contiene solo chi ha agganciato. */
export type TierIndex = ReadonlyMap<number, Tier>;

const RANK_BY_TIER: ReadonlyMap<string, number> = new Map(TIER_ORDER.map((t, i) => [t, i]));

/** Rank della fascia. Chi non ha fascia sta in fondo, sempre. */
export function tierRank(tier: Tier | null): number {
  return tier === null ? TIER_ORDER.length : (RANK_BY_TIER.get(tier) ?? TIER_ORDER.length);
}

/**
 * Aggancia le fasce ai giocatori del listone.
 *
 * Omonimie: il ruolo del blocco fa da disambiguatore. Se restano piu' candidati
 * dello stesso ruolo con lo stesso nome normalizzato, nessuno prende la fascia —
 * meglio nessun badge che il badge sull'omonimo sbagliato.
 */
export function makeTierIndex(
  players: readonly Player[],
  blocks: readonly TierBlock[],
): TierIndex {
  const byKey = new Map<string, Player[]>();
  for (const p of players) {
    const slot = byKey.get(p.searchKey);
    if (slot === undefined) byKey.set(p.searchKey, [p]);
    else slot.push(p);
  }

  const index = new Map<number, Tier>();
  for (const block of blocks) {
    for (const name of block.names) {
      const candidates = byKey.get(normalizeQuery(name));
      if (candidates === undefined) continue;
      const sameRole = candidates.filter((p) => p.role === block.role);
      const picked = sameRole.length === 1 ? sameRole[0] : candidates.length === 1 ? candidates[0] : undefined;
      if (picked === undefined) continue;
      // Primo blocco che aggancia vince: la guida non ripete un nome, e se lo
      // facesse la fascia piu' alta e' quella che l'utente deve vedere.
      if (!index.has(picked.id)) index.set(picked.id, block.tier);
    }
  }
  return index;
}

export function tierOf(playerId: number, index: TierIndex): Tier | null {
  return index.get(playerId) ?? null;
}

/** Fascia crescente di rank (le migliori prima), poi il fallback passato. */
export function compareByTier(
  index: TierIndex,
  fallback: (a: Player, b: Player) => number,
): (a: Player, b: Player) => number {
  return (a, b) => {
    const delta = tierRank(tierOf(a.id, index)) - tierRank(tierOf(b.id, index));
    return delta !== 0 ? delta : fallback(a, b);
  };
}
