import { makeStatsIndex } from '../domain/player-stats';
import { SEASON_STATS } from './stats';

/**
 * Indice delle statistiche, costruito una volta sola all'avvio.
 *
 * Le fasce si ricalcolano a ogni import perche' dipendono dal listone; queste
 * no: l'aggancio e' per id, la tabella e' immobile, e ricostruire una Map di
 * 663 righe a ogni render della scheda sarebbe lavoro sprecato.
 */
export const STATS_INDEX = makeStatsIndex(SEASON_STATS);
