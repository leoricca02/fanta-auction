import type { Player, Role } from './types';
import { normalizeQuery } from './search';

/**
 * Commenti della guida sugli infortunati (SosFanta).
 *
 * La fascia `INFORTUNATI` dice *che* e' fermo; il commento della guida e'
 * l'unico posto in cui c'e' scritto **per quanto**. E' la differenza fra "non
 * prenderlo" e "prendilo a saldo, rientra alla dodicesima": all'asta il secondo
 * e' un affare e il primo no.
 *
 * Resta prosa, di proposito. "Rientro previsto dopo la sosta di novembre" non
 * e' una data, e ridurlo a un numero di giornate vorrebbe dire inventarsi una
 * precisione che la fonte non ha. La scheda mostra la frase, l'utente decide.
 *
 * Dato derivato come le fasce: si rigenera con `node scripts/build-tiers.mjs`,
 * sta fuori dal backup, non si sovrappone alla nota dell'utente.
 */

/** Un commento della guida, agganciato per nome come le fasce. */
export interface InjuryNote {
  /** Ruolo del blocco: serve a sciogliere le omonimie, come in `TierBlock`. */
  readonly role: Role;
  /** Nome come lo scrive la guida. */
  readonly name: string;
  /** Il paragrafo, per intero e senza tagli. */
  readonly text: string;
}

/** Giocatore -> commento. Contiene solo chi ha agganciato. */
export type InjuryIndex = ReadonlyMap<number, string>;

/**
 * Aggancia i commenti ai giocatori del listone.
 *
 * Stessa regola delle fasce, perche' e' la stessa fonte e la stessa convenzione
 * dei nomi: il ruolo fa da disambiguatore e, se restano piu' candidati, nessuno
 * prende il commento. Un infortunio attribuito all'omonimo sbagliato e' una
 * bugia che all'asta costa crediti veri.
 */
export function makeInjuryIndex(
  players: readonly Player[],
  notes: readonly InjuryNote[],
): InjuryIndex {
  const byKey = new Map<string, Player[]>();
  for (const p of players) {
    const slot = byKey.get(p.searchKey);
    if (slot === undefined) byKey.set(p.searchKey, [p]);
    else slot.push(p);
  }

  const index = new Map<number, string>();
  for (const note of notes) {
    const candidates = byKey.get(normalizeQuery(note.name));
    if (candidates === undefined) continue;
    const sameRole = candidates.filter((p) => p.role === note.role);
    const picked =
      sameRole.length === 1 ? sameRole[0] : candidates.length === 1 ? candidates[0] : undefined;
    if (picked === undefined) continue;
    // La guida non commenta due volte lo stesso uomo; se lo facesse, vale il
    // primo commento, che e' quello del suo ruolo.
    if (!index.has(picked.id)) index.set(picked.id, note.text);
  }
  return index;
}

export function injuryOf(playerId: number, index: InjuryIndex): string | null {
  return index.get(playerId) ?? null;
}
