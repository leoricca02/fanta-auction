import type { Player } from './types';
import { normalizeQuery } from './search';

/**
 * Specialisti dei piazzati: rigoristi, punizioni, calci d'angolo (SosFanta).
 *
 * Come le fasce sono un **dato derivato**, rigenerabile con
 * `node scripts/build-specialists.mjs`, fuori dal backup di §3.1 e senza
 * nessuna sovrapposizione col `Tag` dell'utente.
 *
 * L'aggancio e' per nome **dentro la rosa di una squadra**, non sul listone
 * intero: la fonte pubblica le gerarchie club per club, e questo restringe il
 * campo a venticinque uomini invece di cinquecento. E' il motivo per cui questo
 * aggancio e' piu' sicuro di quello delle fasce pur usando gli stessi nomi.
 *
 * **La gerarchia e' l'informazione.** Il primo rigorista di una squadra e' il
 * bonus piu' prevedibile del fantacalcio; il terzo non calcia mai. Appiattire
 * l'elenco a "e' un rigorista" butterebbe via l'unica cosa che conta, quindi il
 * `rank` sopravvive fino al badge.
 */

/** I tre piazzati, nell'ordine in cui si mostrano. */
export const SET_PIECES = ['rigori', 'punizioni', 'corner'] as const;

export type SetPiece = (typeof SET_PIECES)[number];

/** Un blocco della fonte: una squadra, un tipo, i nomi in gerarchia. */
export interface SpecialistBlock {
  /** Club come lo scrive il listone. */
  readonly team: string;
  readonly kind: SetPiece;
  /** Nomi in ordine di gerarchia: `names[0]` e' il primo tiratore. */
  readonly names: readonly string[];
}

/** Un incarico risolto su un giocatore. `rank` parte da 1. */
export interface SpecialistRole {
  readonly kind: SetPiece;
  readonly rank: number;
}

/** Giocatore -> incarichi. Contiene solo chi ha agganciato. */
export type SpecialistIndex = ReadonlyMap<number, readonly SpecialistRole[]>;

const KIND_ORDER: ReadonlyMap<SetPiece, number> = new Map(SET_PIECES.map((k, i) => [k, i]));

/**
 * Chiave di confronto di un nome, senza le iniziali di disambiguazione del
 * listone: `Ederson D.S.` e `Esposito Se.` diventano `ederson` ed `esposito`.
 *
 * Le iniziali servono a distinguere due omonimi **dentro la stessa rosa**, e
 * quel caso lo tratta `makeSpecialistIndex` rifiutando entrambi. Qui servirebbero
 * solo a non far combaciare un nome che la fonte scrive per intero.
 */
export function rosterKey(raw: string): string {
  const parts = normalizeQuery(raw).split(' ').filter((t) => t !== '');
  while (parts.length > 1 && (parts[parts.length - 1] ?? '').length <= 2) parts.pop();
  return parts.join(' ');
}

/**
 * Chiavi con cui provare ad agganciare un nome della fonte, dalla piu' forte
 * alla piu' debole.
 *
 * L'ultima parola recupera l'ordine invertito — la fonte scrive `Nico Paz`, il
 * listone `Paz N.` — e la prima recupera i cognomi composti che la fonte
 * abbrevia. Sono tentativi in cascata: il primo che aggancia **in modo univoco**
 * vince, e nessuno dei tre puo' agganciare due uomini insieme.
 */
function candidateKeys(raw: string): readonly string[] {
  const key = rosterKey(raw);
  const words = key.split(' ').filter((w) => w !== '');
  const keys = [key];
  const last = words[words.length - 1];
  const first = words[0];
  if (words.length > 1 && last !== undefined && first !== undefined) keys.push(last, first);
  return keys;
}

/**
 * Aggancia gli specialisti ai giocatori del listone.
 *
 * Omonimie: se dentro la stessa rosa due giocatori condividono la chiave,
 * **nessuno dei due** prende l'incarico. La fonte cita "Martinez" fra i
 * rigoristi dell'Inter e in rosa ci sono Lautaro e il portiere Josep: dare il
 * badge a sorte sarebbe peggio che non darlo.
 *
 * Un nome che non aggancia nessuno viene ignorato in silenzio: e' un giocatore
 * che ha lasciato il club fra la pubblicazione della fonte e il listone.
 */
export function makeSpecialistIndex(
  players: readonly Player[],
  blocks: readonly SpecialistBlock[],
): SpecialistIndex {
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

  const index = new Map<number, SpecialistRole[]>();
  for (const block of blocks) {
    const roster = rosters.get(normalizeQuery(block.team));
    if (roster === undefined) continue;
    block.names.forEach((name, i) => {
      let picked: Player | undefined;
      for (const key of candidateKeys(name)) {
        const candidates = roster.get(key);
        if (candidates === undefined) continue;
        // Chiave ambigua dentro la rosa: nessuno prende l'incarico, e non si
        // ripiega su una chiave piu' debole che sarebbe ancora piu' ambigua.
        if (candidates.length > 1) return;
        picked = candidates[0];
        break;
      }
      if (picked === undefined) return;
      const roles = index.get(picked.id) ?? [];
      // La fonte non ripete un nome nello stesso elenco; se lo facesse, vale la
      // posizione piu' alta, che e' quella che l'utente deve vedere.
      if (roles.some((r) => r.kind === block.kind)) return;
      roles.push({ kind: block.kind, rank: i + 1 });
      index.set(picked.id, roles);
    });
  }

  for (const roles of index.values()) {
    roles.sort((a, b) => (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0));
  }
  return index;
}

const NO_ROLES: readonly SpecialistRole[] = [];

export function specialistsOf(playerId: number, index: SpecialistIndex): readonly SpecialistRole[] {
  return index.get(playerId) ?? NO_ROLES;
}

/** `true` se e' il primo della gerarchia: l'unico rank che vale davvero. */
export function isFirstChoice(role: SpecialistRole): boolean {
  return role.rank === 1;
}

const KIND_LABEL: Readonly<Record<SetPiece, string>> = {
  rigori: 'rigorista',
  punizioni: 'punizioni',
  corner: 'corner',
};

/** Etichetta del badge: `rigorista 1º`, `corner 2º`. */
export function specialistLabel(role: SpecialistRole): string {
  return `${KIND_LABEL[role.kind]} ${role.rank}º`;
}
