import { describe, expect, it } from 'vitest';

import { reduce } from './reducer';
import { computeFreeAgents, makeNoteIndex } from './free-agents';
import { computeReconciliation } from './metrics';
import { searchInPhase } from './search';
import { lineupStatus, makeLineupIndex } from './lineup';
import { emptyLineup, addCandidate } from './modules';
import { realConfig, realListone } from '../test/fixtures';
import { payScaledByQuot, runAuction } from '../test/replay';

/**
 * Costo dei calcoli a fine asta: 516 giocatori, 300 eventi, 20 formazioni.
 *
 * Ogni battuta sulla command bar rifa' la ricerca, e ogni assegnazione rifa'
 * la piega dell'event log: se uno di questi diventasse lento, l'obiettivo dei
 * cinque secondi per chiamata salterebbe proprio nel momento peggiore.
 *
 * Le soglie sono **molto** piu' larghe del misurato, di proposito. In
 * isolamento questa macchina fa 18 ms per la piega di 300 eventi, 0.03 ms per
 * gli svincolati e 0.2 ms per una battuta sulla command bar; sotto la contesa
 * dei worker di Vitest gli stessi numeri triplicano. Un test sul tempo tarato
 * stretto e' solo un test che fallisce a caso: qui serve a intercettare una
 * regressione algoritmica — un ciclo annidato di troppo, una memoizzazione
 * saltata — non a misurare la macchina.
 */

const config = realConfig();
const { events } = runAuction({ config, priceFor: payScaledByQuot(3) });

/** Millisecondi mediani su `runs` esecuzioni: meno sensibile ai picchi. */
function median(runs: number, body: () => void): number {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    body();
    times.push(performance.now() - t0);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)] as number;
}

describe('costo a fine asta', () => {
  it('il log completo e di 300 eventi', () => {
    expect(events).toHaveLength(300);
  });

  it('ripiegare 300 eventi resta nell ordine delle decine di ms', () => {
    // Gira una volta per assegnazione, non a ogni tasto: 18 ms misurati.
    const ms = median(15, () => {
      reduce(events, config);
    });
    expect(ms).toBeLessThan(250);
  });

  it('svincolati e riconciliazione restano trascurabili', () => {
    const state = reduce(events, config);
    const notes = makeNoteIndex([]);
    const ms = median(15, () => {
      computeFreeAgents(state, config, notes);
      computeReconciliation(state, config);
    });
    expect(ms).toBeLessThan(100);
  });

  it('una battuta sulla command bar resta impercettibile', () => {
    // E' il calcolo che gira a ogni tasto premuto durante la chiamata.
    const state = reduce(events, config);
    const assigned = new Set(Object.keys(state.assignmentByPlayerId).map(Number));
    const ms = median(30, () => {
      for (const query of ['d', 'di', 'dim', 'dima']) {
        searchInPhase(config.players, query, { phase: 'D', excludeIds: assigned, limit: 8 });
      }
    });
    expect(ms).toBeLessThan(50);
  });

  it('il badge di formazione su tutto il listone resta rapido', () => {
    // Venti formazioni compilate, come sara' il giorno dell'asta.
    const players = realListone();
    const teamCodes = [...new Set(players.map((p) => p.team))];
    const lineups = teamCodes.map((code) => {
      let lineup = emptyLineup(code, '4-3-3', 0);
      const ofTeam = players.filter((p) => p.team === code).slice(0, 11);
      lineup.slots.forEach((slot, i) => {
        const player = ofTeam[i];
        if (player !== undefined) lineup = addCandidate(lineup, slot.slotId, player.id, 0);
      });
      return lineup;
    });
    const index = makeLineupIndex(lineups);

    const ms = median(10, () => {
      for (const player of players) lineupStatus(player.id, player.team, index);
    });
    expect(ms).toBeLessThan(150);
  });

  it('un replay completo da zero resta nell ordine del secondo', () => {
    // E' quello che l'app fa a ogni riapertura durante l'asta.
    const t0 = performance.now();
    runAuction({ config, priceFor: payScaledByQuot(3) });
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});
