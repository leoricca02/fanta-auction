/**
 * Statistiche avanzate della scorsa stagione (Sofascore): anticipi, contrasti,
 * falli, duelli aerei, minuti, parate.
 *
 * Sono le voci che Fantacalcio.it non pubblica e che alla chiamata dicono cose
 * che la fantamedia non dice — un difensore che fa 40 anticipi non e' lo stesso
 * difensore che ne fa 4, anche a parita' di voto.
 *
 * ## Non si agganciano per id
 *
 * A differenza di [[SeasonStats]], che condivide l'id di Fantacalcio.it col
 * listone, qui l'aggancio e' **per nome**, risolto una volta sola in
 * `scripts/build-advanced.mjs` e congelato: il file generato porta gia' l'id
 * giusto, e lo `slug` resta accanto per poter tornare alla fonte a mano.
 *
 * ## Le presenze sono due cose diverse
 *
 * `appearances` conta ogni apparizione, anche i due minuti di recupero;
 * `SeasonStats.played` conta le partite **a voto**. La prima e' sempre >= alla
 * seconda e non va confrontata con essa: qui serve solo a sapere quanto pesa il
 * campione. Il denominatore vero dei conteggi sono i **minuti**.
 */

export interface AdvancedStats {
  /** Id Fantacalcio.it, gia' risolto: combacia con `Player.id` e `SeasonStats.id`. */
  readonly id: number;
  /** Slug Sofascore, per ritrovare il giocatore sulla fonte. */
  readonly slug: string;
  /** Minuti giocati. E' il denominatore di tutto quello che sta sotto. */
  readonly minutes: number;
  /** Apparizioni Sofascore: **non** le presenze a voto di `SeasonStats`. */
  readonly appearances: number;
  /** Anticipi (intercettazioni). */
  readonly interceptions: number;
  /** Contrasti vinti. */
  readonly tackles: number;
  /** Falli commessi. */
  readonly fouls: number;
  readonly aerialDuelsWon: number;
  /** Ammonizioni viste da Sofascore: puo' scostarsi di poco da quelle nostre. */
  readonly yellow: number;
  /** Parate. Ha senso solo per i portieri. */
  readonly saves: number;
}

export type AdvancedIndex = ReadonlyMap<number, AdvancedStats>;

export function makeAdvancedIndex(rows: readonly AdvancedStats[]): AdvancedIndex {
  return new Map(rows.map((r) => [r.id, r]));
}

export function advancedOf(playerId: number, index: AdvancedIndex): AdvancedStats | null {
  return index.get(playerId) ?? null;
}

/**
 * Sotto questi minuti un conteggio per 90' non e' una media, e' un caso: tre
 * anticipi in mezz'ora farebbero primo in classifica chi ha giocato una volta
 * sola. Cinque partite piene.
 */
export const MIN_MINUTES = 450;

/**
 * Quanto ne fa ogni 90 minuti, o `null` se ha giocato troppo poco perche' la
 * divisione voglia dire qualcosa.
 *
 * Per 90' e non per presenza: la presenza di chi entra al 90' e quella di chi
 * le gioca tutte non sono la stessa unita' di misura, e i minuti sono
 * l'unica cosa che le rende confrontabili.
 */
export function per90(total: number, minutes: number): number | null {
  if (minutes < MIN_MINUTES) return null;
  return (total / minutes) * 90;
}
