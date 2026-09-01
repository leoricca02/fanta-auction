import { describe, expect, it } from 'vitest';

import type { InjuryNote } from './injuries';
import { injuryOf, makeInjuryIndex } from './injuries';
import { normalizeQuery } from './search';
import { TIER_BLOCKS } from '../data/tiers';
import { makeTierIndex, tierOf } from './tiers';
import type { Player, Role } from './types';
import { INJURY_NOTES } from '../data/injuries';
import { makePlayer, realListone } from '../test/fixtures';

function p(id: number, name: string, role: Role): Player {
  return { ...makePlayer({ id, role, quot: 10 }), name, searchKey: normalizeQuery(name) };
}

const note = (name: string, role: Role, text: string): InjuryNote => ({ name, role, text });

describe('makeInjuryIndex', () => {
  it('aggancia per nome normalizzato', () => {
    const players = [p(1, 'Buongiorno', 'D')];
    const index = makeInjuryIndex(players, [note('Buongiorno', 'D', 'rientro a novembre')]);
    expect(injuryOf(1, index)).toBe('rientro a novembre');
  });

  it('non inventa un commento per chi non ce l ha', () => {
    const index = makeInjuryIndex([p(1, 'Bastoni', 'D')], []);
    expect(injuryOf(1, index)).toBeNull();
  });

  it('usa il ruolo per sciogliere l omonimia', () => {
    const players = [p(1, 'Thuram', 'C'), p(2, 'Thuram', 'A')];
    const index = makeInjuryIndex(players, [note('Thuram', 'C', 'ne avra per un mese')]);
    expect(injuryOf(1, index)).toBe('ne avra per un mese');
    expect(injuryOf(2, index)).toBeNull();
  });

  /** Due omonimi dello stesso ruolo: meglio nessun commento che quello sbagliato. */
  it('rifiuta l omonimia che il ruolo non scioglie', () => {
    const players = [p(1, 'Thuram', 'A'), p(2, 'Thuram', 'A')];
    const index = makeInjuryIndex(players, [note('Thuram', 'A', 'fuori due mesi')]);
    expect(injuryOf(1, index)).toBeNull();
    expect(injuryOf(2, index)).toBeNull();
  });

  it('ignora un nome che il listone non ha piu', () => {
    const index = makeInjuryIndex([p(1, 'Bastoni', 'D')], [note('Kean', 'A', 'operato')]);
    expect(index.size).toBe(0);
  });
});

/** Il file e' generato da `scripts/build-tiers.mjs`, insieme alle fasce. */
describe('src/data/injuries.ts', () => {
  it('non contiene commenti vuoti', () => {
    for (const n of INJURY_NOTES) expect(n.text.trim().length, n.name).toBeGreaterThan(40);
  });

  it('non commenta due volte lo stesso giocatore', () => {
    const keys = INJURY_NOTES.map((n) => `${n.role}|${n.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * Sensore, non formalita': il commento vive nel badge "infortunato", che e'
   * la fascia a darlo. Un nome commentato che non sta in INFORTUNATI vuol dire
   * che i paragrafi della guida sono stati letti sotto la fascia sbagliata.
   */
  it('parla solo di giocatori che la guida mette fra gli infortunati', () => {
    const players = realListone();
    const tiers = makeTierIndex(players, TIER_BLOCKS);
    const index = makeInjuryIndex(players, INJURY_NOTES);
    for (const player of players) {
      if (injuryOf(player.id, index) === null) continue;
      expect(tierOf(player.id, tiers), player.name).toBe('INFORTUNATI');
    }
  });

  it('aggancia al listone reale la gran parte dei commenti', () => {
    const index = makeInjuryIndex(realListone(), INJURY_NOTES);
    expect(index.size).toBeGreaterThanOrEqual(INJURY_NOTES.length - 2);
  });
});
