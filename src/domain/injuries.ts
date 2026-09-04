import type { Player } from './types';
import { normalizeQuery } from './search';
import { rosterKey } from './specialists';

/**
 * Indisponibili di Serie A: la tabella di SosFanta.
 *
 * La fascia `INFORTUNATI` della guida dice *che* uno e' fermo; questa tabella
 * dice **per quanto**, con la giornata. E' la differenza fra "non prenderlo" e
 * "prendilo a saldo, rientra alla dodicesima": all'asta il secondo e' un affare
 * e il primo no.
 *
 * Sostituisce i commenti della guida, che erano prosa lunga su otto big e
 * silenzio sugli altri trenta. Questa e' corta, e' per tutti, ha la giornata, e
 * si aggiorna a ogni turno invece che una volta ad agosto.
 *
 * La descrizione resta comunque **prosa della fonte**: `matchday` c'e' solo
 * quando la fonte scrive un numero, e "in dubbio per la 6a" e "rientro previsto
 * per la 6a" restano due frasi diverse che la scheda mostra per intero. Ridurle
 * entrambe a `6` vorrebbe dire inventarsi una certezza che nessuno ha.
 *
 * Dato derivato come le fasce: si rigenera con `node scripts/build-injuries.mjs`,
 * sta fuori dal backup, non si sovrappone alla nota dell'utente.
 */

/** Perche' non e' disponibile. L'ordine e' quello di gravita'. */
export const UNAVAILABLE_KINDS = ['infortunato', 'squalificato', 'diffidato'] as const;

export type UnavailableKind = (typeof UNAVAILABLE_KINDS)[number];

/** Una riga della tabella. */
export interface UnavailableNote {
  /** Club come lo scrive il listone: l'aggancio avviene dentro questa rosa. */
  readonly team: string;
  readonly kind: UnavailableKind;
  /** Nome come lo scrive la fonte. */
  readonly name: string;
  /** La descrizione della fonte, per intero. Vuota per squalifiche e diffide. */
  readonly text: string;
  /** Giornata di rientro, quando la fonte la scrive. */
  readonly matchday: number | null;
}

/** Quello che la scheda mostra: la riga, senza il club che gia' conosce. */
export interface Unavailability {
  readonly kind: UnavailableKind;
  readonly text: string;
  readonly matchday: number | null;
}

/** Giocatore -> indisponibilita'. Contiene solo chi ha agganciato. */
export type InjuryIndex = ReadonlyMap<number, Unavailability>;

const KIND_RANK: ReadonlyMap<UnavailableKind, number> = new Map(
  UNAVAILABLE_KINDS.map((k, i) => [k, i]),
);

/**
 * Aggancia le righe della tabella ai giocatori del listone.
 *
 * Come gli specialisti, l'aggancio e' per nome **dentro la rosa del club**, non
 * sul listone intero: la fonte pubblica squadra per squadra, e questo restringe
 * il campo a venticinque uomini invece di cinquecento. E' il motivo per cui
 * questo aggancio e' piu' sicuro di quello delle fasce, che va per ruolo.
 *
 * Omonimi nella stessa rosa: **nessuno dei due**. Un infortunio attribuito
 * all'uomo sbagliato e' una bugia che all'asta costa crediti veri.
 *
 * Un giocatore fermo e squalificato insieme tiene la riga piu' grave, cioe'
 * quella che viene prima in `UNAVAILABLE_KINDS`: e' l'unica che cambia la
 * decisione, perche' la squalifica finisce da sola e l'infortunio no.
 */
export function makeInjuryIndex(
  players: readonly Player[],
  notes: readonly UnavailableNote[],
): InjuryIndex {
  const rosters = new Map<string, Map<string, Player[]>>();
  for (const p of players) {
    const teamKey = normalizeQuery(p.team);
    let roster = rosters.get(teamKey);
    if (roster === undefined) {
      roster = new Map();
      rosters.set(teamKey, roster);
    }
    const key = rosterKey(p.name);
    const slot = roster.get(key);
    if (slot === undefined) roster.set(key, [p]);
    else slot.push(p);
  }

  const index = new Map<number, Unavailability>();
  for (const note of notes) {
    const roster = rosters.get(normalizeQuery(note.team));
    if (roster === undefined) continue;
    const candidates = roster.get(rosterKey(note.name));
    // Nome che non aggancia: ha lasciato il club fra la pagina e il listone.
    // Chiave ambigua dentro la rosa: nessuno dei due, per non tirare a sorte.
    if (candidates === undefined || candidates.length !== 1) continue;
    const picked = candidates[0];
    if (picked === undefined) continue;
    const current = index.get(picked.id);
    if (current !== undefined && rank(current.kind) <= rank(note.kind)) continue;
    index.set(picked.id, { kind: note.kind, text: note.text, matchday: note.matchday });
  }
  return index;
}

function rank(kind: UnavailableKind): number {
  return KIND_RANK.get(kind) ?? UNAVAILABLE_KINDS.length;
}

export function injuryOf(playerId: number, index: InjuryIndex): Unavailability | null {
  return index.get(playerId) ?? null;
}

/** Etichetta del chip: `infortunato`, o `infortunato · rientro 13a`. */
export function unavailableLabel(note: Unavailability): string {
  return note.matchday === null ? note.kind : `${note.kind} · rientro ${note.matchday}a`;
}
