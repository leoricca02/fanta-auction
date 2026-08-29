import { makeStatsIndex } from '../domain/player-stats';
import { makeAdvancedIndex } from '../domain/advanced-stats';
import { makeRankIndex } from '../domain/highlights';
import { SEASON_STATS } from './stats';
import { ADVANCED_STATS } from './advanced-stats';

/**
 * Indice delle statistiche, costruito una volta sola all'avvio.
 *
 * Le fasce si ricalcolano a ogni import perche' dipendono dal listone; queste
 * no: l'aggancio e' per id, la tabella e' immobile, e ricostruire una Map di
 * 663 righe a ogni render della scheda sarebbe lavoro sprecato.
 */
export const STATS_INDEX = makeStatsIndex(SEASON_STATS);

/**
 * Statistiche avanzate (Sofascore), agganciate all'id gia' in fase di build.
 * Coprono 562 dei 663: chi manca non ha giocato in Serie A nel 2025/26.
 */
export const ADVANCED_INDEX = makeAdvancedIndex(ADVANCED_STATS);

/**
 * Classifiche per ruolo, una volta sola come sopra: la scheda le legge per dire
 * "12° tra i difensori" senza riordinare 663 righe a ogni apertura.
 */
export const RANK_INDEX = makeRankIndex(SEASON_STATS, ADVANCED_INDEX);
