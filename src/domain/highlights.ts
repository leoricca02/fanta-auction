import type { Role } from './types';
import type { SeasonStats, StatsIndex } from './player-stats';
import type { AdvancedIndex, AdvancedStats } from './advanced-stats';
import { per90 } from './advanced-stats';

/**
 * Punti di forza e punti deboli di un giocatore, come li mostra FantaLAB
 * durante l'asta: non la cifra da sola, ma **la posizione della cifra dentro
 * il suo ruolo**.
 *
 * "Media voto 6,17" non dice niente da solo. "12° tra i difensori" dice tutto,
 * e in cinque secondi. E' la stessa cifra misurata di sempre — qui non nasce
 * nessun voto sintetico e nessun prezzo consigliato — solo ordinata.
 *
 * ## Il pool e il rank
 *
 * Il pool e' **tutti i giocatori dello stesso ruolo con almeno una presenza**
 * nella stagione: 196 difensori, non i soli titolari. Niente soglia minima di
 * presenze — una soglia renderebbe i numeri piu' "giusti" ma non sarebbero piu'
 * confrontabili con quelli che l'utente legge altrove.
 *
 * Il rank e' `1 + quanti sono strettamente migliori`, quindi i pari merito
 * condividono la posizione (due primi, poi il terzo e' 3°). E' l'ordinamento
 * delle classifiche sportive, non quello di un array ordinato.
 *
 * Le due regole non sono inventate: riproducono esattamente i numeri che
 * FantaLAB mostra sulla stessa stagione. Su Hermoso (D, Roma, 2025/26) danno
 * MV 12°, % partite >= 6.5 16°, fantamedia 19° — le tre posizioni che si
 * leggono sulla sua scheda. E' la verifica che la formula e' quella giusta e
 * non una che ci somiglia.
 *
 * ## Le due fonti, e perche' i pool non sono sempre uguali
 *
 * Le metriche di rendimento vengono da Fantacalcio.it ([[SeasonStats]]); quelle
 * di campo — anticipi, contrasti, falli, duelli aerei, parate — da Sofascore
 * ([[AdvancedStats]]), che pubblica anche i minuti.
 *
 * Le seconde si contano **ogni 90 minuti**, non a partita, perche' la presenza
 * di chi entra al 90' e quella di chi le gioca tutte non sono la stessa unita'
 * di misura. Da qui un pool piu' stretto: sotto i 450 minuti una media per 90'
 * e' un caso e non entra in classifica, quindi i difensori sono 196 sulle
 * metriche di rendimento e 162 su quelle di campo. La scheda scrive sempre
 * "su quanti", cosi' la differenza si vede invece di nascondersi.
 *
 * ## Non sono le stesse cifre di FantaLAB
 *
 * FantaLAB ha un altro fornitore, e le definizioni non coincidono: sulle sue
 * tre voci di campo di Hermoso — anticipi 74°, falli 142°, ammonizioni 146° —
 * questi dati ne riproducono una sola. Le metriche di rendimento invece
 * combaciano esattamente. Quelle di campo sono misure vere prese da Sofascore,
 * non un tentativo di indovinare i numeri di qualcun altro.
 */

/** Giornate di un campionato a venti squadre: il massimo di presenze possibili. */
const MATCHDAYS = 38;

/**
 * Una metrica classificabile: come si estrae dal giocatore, dove ha senso e
 * da che parte sta il meglio.
 */
export interface Metric {
  readonly key: string;
  /** Etichetta breve, quella che va sulla scheda. */
  readonly label: string;
  /** Ruoli in cui la metrica significa qualcosa. */
  readonly roles: readonly Role[];
  /** `false` per i malus: ammonizioni, gol subiti. */
  readonly higherIsBetter: boolean;
  /**
   * Valore del giocatore, o `null` se per lui la metrica non esiste — il
   * trasferito senza partite sufficienti contate, il portiere senza presenze.
   * Chi vale `null` non entra nemmeno nel pool: non e' ultimo, e' assente.
   */
  readonly value: (stats: SeasonStats, advanced: AdvancedStats | null) => number | null;
  /** La cifra come va letta accanto al rank. */
  readonly format: (value: number) => string;
}

const one = (value: number): string => value.toFixed(2).replace('.', ',');
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const perGame = (value: number): string => `${value.toFixed(2).replace('.', ',')}/partita`;
const perNinety = (value: number): string => `${value.toFixed(1).replace('.', ',')} ogni 90'`;

/** Il conteggio Sofascore ogni 90 minuti, o `null` se non c'e' o non basta. */
const rate =
  (pick: (a: AdvancedStats) => number) =>
  (_stats: SeasonStats, advanced: AdvancedStats | null): number | null =>
    advanced === null ? null : per90(pick(advanced), advanced.minutes);

/** Divisione che non finge: zero presenze non fa zero, fa "non pervenuto". */
function per(total: number, played: number): number | null {
  return played > 0 ? total / played : null;
}

const OUTFIELD: readonly Role[] = ['D', 'C', 'A'];
const ALL: readonly Role[] = ['P', 'D', 'C', 'A'];
/**
 * Chi difende di mestiere. Anticipi e contrasti si classificano solo qui:
 * "76esimo su 83 nei contrasti" fra i punti deboli di Vlahovic non e' un
 * difetto, e' la descrizione del ruolo che fa.
 */
const DEFENDING: readonly Role[] = ['D', 'C'];

/**
 * Le metriche, nell'ordine in cui si vogliono leggere a parita' di posizione.
 * L'ordine non decide cosa e' forza e cosa e' debolezza — lo decide il rank —
 * ma rompe i pareggi in modo stabile, cosi' la scheda non cambia da sola.
 *
 * Le voci di campo arrivano da Sofascore e si fermano sopra i 450 minuti.
 *
 * Le **parate** non ci sono, pur essendo nel dato: un portiere para molto anche
 * perche' ha una difesa che gli fa arrivare tutto addosso, e messa in classifica
 * come pregio direbbe il contrario di quello che sembra. Per il portiere restano
 * porte inviolate e gol subiti, che il verso giusto ce l'hanno.
 *
 * Anche i rigori parati restano fuori: trenta portieri su quarantatre' sono a zero,
 * e una classifica dove meta' del campo e' pari merito all'ultimo posto utile
 * non dice niente di nessuno. Nella griglia delle cifre grezze ci sono, che e'
 * il posto giusto per un evento raro.
 */
export const METRICS: readonly Metric[] = [
  {
    key: 'fantaAvg',
    label: 'Fantamedia',
    roles: ALL,
    higherIsBetter: true,
    value: (s) => (s.played > 0 ? s.fantaAvg : null),
    format: one,
  },
  {
    key: 'avg',
    label: 'Media voto',
    roles: ALL,
    higherIsBetter: true,
    value: (s) => (s.played > 0 ? s.avg : null),
    format: one,
  },
  {
    key: 'goodGames',
    label: '% partite voto >= 6.5',
    roles: ALL,
    higherIsBetter: true,
    value: (s) => (s.goodGames === null ? null : per(s.goodGames, s.played)),
    format: percent,
  },
  {
    key: 'presence',
    label: '% presenze',
    roles: ALL,
    higherIsBetter: true,
    // Zero presenze non e' l'ultimo posto in classifica: e' non esserci. Se
    // entrasse, questa metrica avrebbe un pool piu' largo di tutte le altre e
    // due posizioni della stessa scheda non sarebbero confrontabili.
    value: (s) => (s.played > 0 ? s.played / MATCHDAYS : null),
    format: percent,
  },
  {
    key: 'goals',
    label: 'Gol',
    roles: OUTFIELD,
    higherIsBetter: true,
    value: (s) => per(s.goals, s.played),
    format: perGame,
  },
  {
    key: 'assists',
    label: 'Assist',
    roles: OUTFIELD,
    higherIsBetter: true,
    value: (s) => per(s.assists, s.played),
    format: perGame,
  },
  {
    key: 'yellow',
    label: 'Ammonizioni',
    roles: ALL,
    higherIsBetter: false,
    value: (s) => per(s.yellow, s.played),
    format: perGame,
  },
  {
    key: 'cleanSheets',
    label: 'Porte inviolate',
    roles: ['P'],
    higherIsBetter: true,
    value: (s) => (s.cleanSheets === null ? null : per(s.cleanSheets, s.played)),
    format: percent,
  },
  {
    key: 'conceded',
    label: 'Gol subiti',
    roles: ['P'],
    higherIsBetter: false,
    value: (s) => per(s.conceded, s.played),
    format: perGame,
  },
  {
    key: 'interceptions',
    label: 'Anticipi',
    roles: DEFENDING,
    higherIsBetter: true,
    value: rate((a) => a.interceptions),
    format: perNinety,
  },
  {
    key: 'tackles',
    label: 'Contrasti vinti',
    roles: DEFENDING,
    higherIsBetter: true,
    value: rate((a) => a.tackles),
    format: perNinety,
  },
  {
    key: 'aerialDuels',
    label: 'Duelli aerei vinti',
    roles: OUTFIELD,
    higherIsBetter: true,
    value: rate((a) => a.aerialDuelsWon),
    format: perNinety,
  },
  {
    key: 'fouls',
    label: 'Falli commessi',
    roles: OUTFIELD,
    higherIsBetter: false,
    value: rate((a) => a.fouls),
    format: perNinety,
  },
];

/** Una metrica, il valore del giocatore e dove lo mette nel suo ruolo. */
export interface Highlight {
  readonly metric: Metric;
  readonly value: number;
  /** 1 = il migliore del ruolo. I pari merito condividono la posizione. */
  readonly rank: number;
  /** Quanti giocatori dello stesso ruolo hanno un valore per questa metrica. */
  readonly pool: number;
  /**
   * Quanto in alto sta davvero, da 0 (ultimo) a 1 (primo). Serve alla barra
   * della scheda — un "12° su 196" e un "12° su 20" non vanno disegnati
   * uguali — e a decidere cosa e' pregio e cosa e' difetto.
   *
   * Non si ricava dal `rank`, ma dalla **posizione media del gruppo di pari
   * merito**. Trenta portieri hanno zero rigori parati: sono tutti quindicesimi,
   * ma nessuno di loro e' bravo a parare i rigori, e il rank da solo lo direbbe.
   * Con la posizione media quei trenta stanno tutti a meta' classifica, che e'
   * dove stanno davvero.
   */
  readonly share: number;
}

export interface Highlights {
  /** Le metriche migliori, dalla piu' alta. */
  readonly strengths: readonly Highlight[];
  /** Le peggiori, dalla piu' bassa. */
  readonly weaknesses: readonly Highlight[];
}

/**
 * Classifiche precalcolate: metrica -> ruolo -> valori ordinati.
 *
 * Si costruisce una volta sola: ordinare 663 righe a ogni apertura della
 * scheda sarebbe lavoro sprecato, e le statistiche non cambiano mai a runtime.
 */
export type RankIndex = ReadonlyMap<string, ReadonlyMap<Role, readonly number[]>>;

/**
 * Costruisce le classifiche. `rows` e' l'elenco completo delle statistiche:
 * il pool di ogni metrica esce da li', non dal listone, perche' la posizione
 * deve dire "12° tra i difensori della Serie A", non "12° tra quelli che
 * quest'anno sono ancora in lista".
 */
export function makeRankIndex(rows: readonly SeasonStats[], advanced: AdvancedIndex): RankIndex {
  const index = new Map<string, Map<Role, number[]>>();
  for (const metric of METRICS) {
    const byRole = new Map<Role, number[]>();
    for (const role of metric.roles) byRole.set(role, []);
    for (const stats of rows) {
      const bucket = byRole.get(stats.role);
      if (bucket === undefined) continue;
      const value = metric.value(stats, advanced.get(stats.id) ?? null);
      // Chi non ha il dato non fa numero: allargherebbe il pool senza essere
      // in classifica, e ogni rank diventerebbe una posizione peggiore.
      if (value === null) continue;
      bucket.push(value);
    }
    for (const [role, values] of byRole) {
      values.sort((a, b) => (metric.higherIsBetter ? b - a : a - b));
      byRole.set(role, values);
    }
    index.set(metric.key, byRole);
  }
  return index;
}

/**
 * Quanti valori sono strettamente migliori di `value`, su un array gia'
 * ordinato dal migliore al peggiore. E' il rank meno uno: i pari merito non
 * contano, ed e' proprio questo che li fa condividere la posizione.
 */
function betterThan(sorted: readonly number[], value: number, higherIsBetter: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const at = sorted[mid];
    // `mid` sta sempre dentro l'array: l'undefined esiste solo per il tipo.
    if (at === undefined) break;
    if (higherIsBetter ? at > value : at < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Quanti valori sono migliori **o uguali** a `value`. Con quello di sopra
 * delimita il gruppo dei pari merito, che e' quello che serve alla `share`.
 */
function notWorseThan(sorted: readonly number[], value: number, higherIsBetter: boolean): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const at = sorted[mid];
    if (at === undefined) break;
    if (higherIsBetter ? at >= value : at <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Le posizioni di un giocatore, metrica per metrica, nell'ordine di `METRICS`.
 * Vuoto per chi non ha statistiche o non ha mai giocato: la scheda mostra il
 * vuoto, che e' l'informazione giusta.
 */
export function rankingsOf(
  stats: SeasonStats,
  ranks: RankIndex,
  advanced: AdvancedIndex,
): readonly Highlight[] {
  if (stats.played === 0) return [];

  const row = advanced.get(stats.id) ?? null;
  const out: Highlight[] = [];
  for (const metric of METRICS) {
    if (!metric.roles.includes(stats.role)) continue;
    const value = metric.value(stats, row);
    if (value === null) continue;
    const sorted = ranks.get(metric.key)?.get(stats.role);
    if (sorted === undefined || sorted.length === 0) continue;

    const first = betterThan(sorted, value, metric.higherIsBetter);
    const last = notWorseThan(sorted, value, metric.higherIsBetter) - 1;
    const rank = first + 1;
    // Un pool di uno non ha ne' primi ne' ultimi: la barra sta a meta'.
    const share =
      sorted.length === 1 ? 0.5 : 1 - (first + last) / 2 / (sorted.length - 1);
    out.push({ metric, value, rank, pool: sorted.length, share });
  }
  return out;
}

/**
 * Le `count` metriche migliori e le `count` peggiori, come i due blocchi della
 * scheda FantaLAB.
 *
 * Due regole, e sono la differenza fra una scheda che informa e una che riempie
 * lo spazio:
 *
 *  - **un pregio deve stare sopra la meta' del suo ruolo, un difetto sotto.**
 *    Prendere sempre e comunque le tre peggiori metteva "3° negli assist" fra i
 *    punti deboli di Dimarco, che e' il contrario dell'informazione. Chi e'
 *    forte ovunque mostra una colonna corta o vuota, ed e' il dato giusto.
 *  - **una metrica non compare da entrambe le parti**, nemmeno quando le
 *    classifiche disponibili sono poche.
 */
export function highlightsOf(
  stats: SeasonStats,
  ranks: RankIndex,
  advanced: AdvancedIndex,
  count = 3,
): Highlights {
  // `sort` e' stabile: a parita' di posizione resta l'ordine di METRICS, cosi'
  // la scheda non si riordina da sola fra due aperture.
  const all = [...rankingsOf(stats, ranks, advanced)].sort((a, b) => b.share - a.share);
  const strengths = all.filter((h) => h.share > 0.5).slice(0, count);
  const taken = new Set(strengths.map((h) => h.metric.key));
  const weaknesses = all
    .filter((h) => h.share < 0.5 && !taken.has(h.metric.key))
    .slice(-count)
    .reverse();
  return { strengths, weaknesses };
}

/** Come sopra, partendo dal giocatore: `null` se non ha statistiche. */
export function playerHighlights(
  playerId: number,
  stats: StatsIndex,
  ranks: RankIndex,
  advanced: AdvancedIndex,
  count = 3,
): Highlights | null {
  const row = stats.get(playerId);
  if (row === undefined || row.played === 0) return null;
  return highlightsOf(row, ranks, advanced, count);
}

/** "12° tra i difensori", la riga che sta sotto ogni metrica sulla scheda. */
const ROLE_PLURAL: Readonly<Record<Role, string>> = {
  P: 'i portieri',
  D: 'i difensori',
  C: 'i centrocampisti',
  A: 'gli attaccanti',
};

export function rankLabel(highlight: Highlight, role: Role): string {
  return `${highlight.rank}° tra ${ROLE_PLURAL[role]}`;
}
