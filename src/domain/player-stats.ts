import type { Role } from './types';

/**
 * Statistiche della scorsa stagione di Serie A (Fantacalcio.it).
 *
 * Come le fasce, sono un **dato derivato**, non dati utente: si rigenerano con
 * `node scripts/build-stats.mjs`, non entrano nel backup di §3.1 e un re-import
 * del listone non le tocca. A differenza delle fasce l'aggancio e' per id —
 * la tabella delle statistiche pubblica lo stesso id di Fantacalcio.it che il
 * listone mette nella colonna `#` — quindi non c'e' nessuna omonimia da
 * disambiguare e nessun nome che possa agganciare l'uomo sbagliato.
 *
 * Chi non aggancia non ha statistiche, ed e' il caso giusto: sul listone
 * 2026-27 sono i 138 che in Serie A l'anno scorso non hanno giocato (arrivi
 * dall'estero, promossi dalla B). Dire "nessun dato" e' l'informazione, non
 * l'assenza di informazione: uno zero al loro posto sarebbe una bugia.
 *
 * **Sono cifre misurate, non un giudizio.** Una fantamedia alta su 3 presenze
 * non e' una fantamedia alta, per questo `played` sta sempre accanto ad essa
 * ovunque la si mostri.
 */
export interface SeasonStats {
  /** Id Fantacalcio.it, combacia con `Player.id`. */
  readonly id: number;
  /** Nome come lo scrive la fonte. Serve a rileggere il file generato, non alla UI. */
  readonly name: string;
  /** Club della **scorsa** stagione: puo' non essere quello attuale. */
  readonly team: string;
  /** Ruolo classic della scorsa stagione: puo' non essere quello attuale. */
  readonly role: Role;
  /** Partite a voto (PV). Il denominatore di tutto il resto. */
  readonly played: number;
  /** Media voto (MV). */
  readonly avg: number;
  /** Fantamedia (FM): media voto piu' bonus e malus. */
  readonly fantaAvg: number;
  readonly goals: number;
  readonly assists: number;
  /** Gol subiti. Ha senso solo per i portieri. */
  readonly conceded: number;
  /**
   * Porte inviolate, contate giornata per giornata: partite con voto e zero gol
   * subiti. `null` per chi non e' portiere, dove il conteggio non vorrebbe dire
   * niente — non e' uno zero.
   */
  readonly cleanSheets: number | null;
  /**
   * Partite con voto >= 6.5, contate giornata per giornata. Su `played` da la
   * percentuale di volte in cui il giocatore la partita l'ha portata a casa:
   * una media voto 6.2 fatta di 6.5 e 6 e' un'altra cosa dalla stessa media
   * fatta di 7.5 e 5, e la media da sola non lo dice.
   *
   * `null` per chi ha cambiato club a stagione in corso: la fonte elenca le
   * giornate di un club alla volta e il conteggio sarebbe monco. Non e' uno
   * zero, ed e' il motivo per cui il tipo ammette l'assenza.
   */
  readonly goodGames: number | null;
  /** Rigori segnati su rigori calciati. */
  readonly penScored: number;
  readonly penTaken: number;
  /** Rigori parati. Ha senso solo per i portieri. */
  readonly penSaved: number;
  readonly yellow: number;
  readonly red: number;
}

/** Giocatore -> statistiche. Contiene solo chi ha giocato la scorsa stagione. */
export type StatsIndex = ReadonlyMap<number, SeasonStats>;

export function makeStatsIndex(rows: readonly SeasonStats[]): StatsIndex {
  // L'id e' unico nella fonte; se non lo fosse, l'ultima riga vince ed e'
  // comunque lo stesso giocatore.
  return new Map(rows.map((r) => [r.id, r]));
}

export function statsOf(playerId: number, index: StatsIndex): SeasonStats | null {
  return index.get(playerId) ?? null;
}

/**
 * Cifra con la virgola, come la scrive la fonte italiana: `6.42` -> `'6,42'`.
 * Due decimali sempre, cosi' una colonna di fantamedie resta allineata.
 */
export function formatAvg(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

/** Rigori come li scrive la fonte: `'3/4'`. */
export function formatPenalties(stats: SeasonStats): string {
  return `${stats.penScored}/${stats.penTaken}`;
}

/**
 * Fantamedia da mostrare accanto a un nome in un elenco, o `null` se non c'e'
 * niente da mostrare.
 *
 * Zero presenze non fa `0,00`: chi non ha giocato non ha una fantamedia bassa,
 * non ne ha nessuna.
 */
export function listFantaAvg(playerId: number, index: StatsIndex): string | null {
  const stats = index.get(playerId);
  if (stats === undefined || stats.played === 0) return null;
  return formatAvg(stats.fantaAvg);
}
