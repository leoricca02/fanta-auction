import type { Player, Role } from './types';
import { compareByQuotDesc } from './free-agents';

/**
 * Ricerca dei giocatori per la command bar (PRD §5.1).
 *
 * Requisito: match tollerante ad accenti, maiuscole e nomi parziali, su una
 * lista gia' filtrata sul ruolo della fase attiva (63-184 candidati, non 516).
 *
 * **Perche' non Fuse.js**, che pure e' nello stack di §7. Sotto asta serve
 * prevedibilita' prima che intelligenza: lo stesso prefisso deve dare sempre
 * lo stesso primo risultato, e "chi ha il punteggio piu' alto" dev'essere
 * spiegabile in una riga. Il ranking qui sotto e' a gradini espliciti e
 * l'ordine e' totale, quindi il primo risultato non cambia mai a parita' di
 * input. Fuse resta fra le dipendenze: se il matching a gradini si rivelasse
 * troppo rigido, sostituirlo tocca solo questo modulo.
 */

/** Gradini di qualita' del match. Piu' basso e' meglio. */
export const MatchRank = {
  Exact: 0,
  Prefix: 1,
  WordPrefix: 2,
  Substring: 3,
  Subsequence: 4,
} as const;

/** Normalizza una query come `Player.searchKey`: minuscolo, senza accenti. */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/[đð]/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/þ/g, 'th')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `true` se tutte le lettere di `query` compaiono in ordine dentro `text`. */
export function isSubsequence(text: string, query: string): boolean {
  let i = 0;
  for (const ch of text) {
    if (ch === query[i]) i += 1;
    if (i === query.length) return true;
  }
  return query.length === 0;
}

/**
 * Gradino del match tra `searchKey` e query normalizzata.
 * `null` se non c'e' match.
 */
export function rankMatch(searchKey: string, query: string): number | null {
  if (query === '') return MatchRank.Exact;
  if (searchKey === query) return MatchRank.Exact;
  if (searchKey.startsWith(query)) return MatchRank.Prefix;
  if (searchKey.split(' ').some((word) => word.startsWith(query))) return MatchRank.WordPrefix;
  if (searchKey.includes(query)) return MatchRank.Substring;
  if (isSubsequence(searchKey, query)) return MatchRank.Subsequence;
  return null;
}

export interface SearchOptions {
  /** Restringe al ruolo della fase attiva (§5.1). */
  readonly role?: Role;
  /** Esclude i giocatori gia' assegnati. */
  readonly excludeIds?: ReadonlySet<number>;
  readonly limit?: number;
}

export interface SearchHit {
  readonly player: Player;
  readonly rank: number;
}

/**
 * Cerca fra i giocatori e restituisce i migliori, in ordine deterministico:
 * gradino di match crescente, poi `QUOT.` decrescente, poi id.
 *
 * Con query vuota restituisce i piu' quotati del ruolo: aprendo la barra hai
 * gia' davanti i nomi che verranno chiamati.
 */
export function searchPlayers(
  players: readonly Player[],
  rawQuery: string,
  options: SearchOptions = {},
): SearchHit[] {
  const query = normalizeQuery(rawQuery);
  const limit = options.limit ?? 8;
  const hits: SearchHit[] = [];

  for (const player of players) {
    if (options.role !== undefined && player.role !== options.role) continue;
    if (options.excludeIds?.has(player.id) === true) continue;
    const rank = rankMatch(player.searchKey, query);
    if (rank === null) continue;
    hits.push({ player, rank });
  }

  hits.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : compareByQuotDesc(a.player, b.player)));
  return hits.slice(0, limit);
}

/** Il primo risultato, quello che `Invio` conferma. */
export function bestMatch(
  players: readonly Player[],
  rawQuery: string,
  options: SearchOptions = {},
): Player | null {
  return searchPlayers(players, rawQuery, { ...options, limit: 1 })[0]?.player ?? null;
}

/**
 * `true` se i primi due risultati sono indistinguibili per qualita' di match:
 * la command bar deve chiedere conferma invece di scegliere da sola (§5.1).
 */
export function isAmbiguous(hits: readonly SearchHit[]): boolean {
  const [first, second] = hits;
  if (first === undefined || second === undefined) return false;
  return first.rank === second.rank && first.rank <= MatchRank.WordPrefix;
}
