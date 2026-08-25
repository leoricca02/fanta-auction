import { describe, expect, it } from 'vitest';

import {
  TIER_ORDER,
  compareByTier,
  makeTierIndex,
  tierOf,
  tierRank,
} from './tiers';
import type { TierBlock } from './tiers';
import { compareByQuotDesc } from './free-agents';
import { normalizeQuery } from './search';
import type { Player, Role } from './types';
import { TIER_BLOCKS } from '../data/tiers';
import { makePlayer, realListone } from '../test/fixtures';

const ORDER_SET = new Set<string>(TIER_ORDER);

/**
 * `makePlayer` costruisce `searchKey` con un semplice `toLowerCase()`, mentre il
 * listone vero passa da `normalizeName`. Qui l'aggancio vive o muore su quella
 * chiave, quindi i giocatori sintetici la costruiscono come il parser.
 */
function p(id: number, name: string, role: Role, quot = 10): Player {
  return { ...makePlayer({ id, role, quot }), name, searchKey: normalizeQuery(name) };
}

describe('tierRank', () => {
  it('ordina le fasce come le elenca la guida', () => {
    expect(tierRank('SUPER TOP')).toBe(0);
    expect(tierRank('TOP')).toBeGreaterThan(tierRank('SUPER TOP'));
    expect(tierRank('DA EVITARE')).toBeGreaterThan(tierRank('FASCIA MEDIA'));
  });

  it('mette chi non ha fascia in fondo', () => {
    expect(tierRank(null)).toBeGreaterThan(tierRank('MERCATO'));
  });
});

describe('makeTierIndex', () => {
  const blocks: readonly TierBlock[] = [
    { role: 'P', tier: 'SUPER TOP', names: ['Svilar'] },
    { role: 'A', tier: 'TOP', names: ['Martinez L.', 'Nessuno Qui'] },
  ];

  it('aggancia per nome normalizzato, non per id', () => {
    const players = [
      p(1, 'Svilar', 'P', 20),
      p(2, 'Martinez L.', 'A', 40),
    ];
    const index = makeTierIndex(players, blocks);
    expect(tierOf(1, index)).toBe('SUPER TOP');
    expect(tierOf(2, index)).toBe('TOP');
  });

  it('normalizza accenti e maiuscole su entrambi i lati', () => {
    const players = [p(7, 'Lucumi', 'D')];
    const accented: readonly TierBlock[] = [{ role: 'D', tier: 'FASCIA ALTA', names: ['LUCUMÌ'] }];
    expect(tierOf(7, makeTierIndex(players, accented))).toBe('FASCIA ALTA');
  });

  it('lascia senza fascia chi la guida non nomina', () => {
    const players = [p(3, 'Carneade', 'C', 1)];
    expect(tierOf(3, makeTierIndex(players, blocks))).toBeNull();
  });

  it('non inventa giocatori per i nomi della guida fuori listone', () => {
    const index = makeTierIndex([p(1, 'Svilar', 'P', 20)], blocks);
    expect(index.size).toBe(1);
  });

  it('usa il ruolo per sciogliere le omonimie', () => {
    const players = [
      p(10, 'Martinez L.', 'D', 5),
      p(11, 'Martinez L.', 'A', 40),
    ];
    const index = makeTierIndex(players, blocks);
    expect(tierOf(11, index)).toBe('TOP');
    expect(tierOf(10, index)).toBeNull();
  });

  it('non assegna niente quando l omonimia resta ambigua anche sul ruolo', () => {
    const players = [
      p(20, 'Martinez L.', 'A', 40),
      p(21, 'Martinez L.', 'A', 39),
    ];
    expect(makeTierIndex(players, blocks).size).toBe(0);
  });
});

describe('compareByTier', () => {
  it('mette le fasce migliori prima e usa il fallback a parita di fascia', () => {
    const a = p(1, 'Svilar', 'P', 1);
    const b = p(2, 'Maignan', 'P', 20);
    const c = p(3, 'Carneade', 'P', 99);
    const index = makeTierIndex([a, b, c], [
      { role: 'P', tier: 'SUPER TOP', names: ['Svilar'] },
      { role: 'P', tier: 'TOP', names: ['Maignan'] },
    ]);
    const sorted = [c, b, a].sort(compareByTier(index, compareByQuotDesc));
    expect(sorted.map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('a parita di assenza di fascia ordina per quot desc', () => {
    const a = p(1, 'Uno', 'P', 5);
    const b = p(2, 'Due', 'P', 30);
    const sorted = [a, b].sort(compareByTier(new Map(), compareByQuotDesc));
    expect(sorted.map((p) => p.id)).toEqual([2, 1]);
  });
});

// ---------------------------------------------------------------------------
// Il dataset generato da scripts/build-tiers.mjs
// ---------------------------------------------------------------------------

describe('TIER_BLOCKS', () => {
  it('usa solo fasce note', () => {
    for (const block of TIER_BLOCKS) expect(ORDER_SET.has(block.tier)).toBe(true);
  });

  it('non nomina lo stesso giocatore in due fasce dello stesso ruolo', () => {
    const seen = new Set<string>();
    for (const block of TIER_BLOCKS) {
      for (const name of block.names) {
        const key = `${block.role}|${name.toLowerCase()}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('aggancia la quasi totalita del listone reale, senza ambiguita', () => {
    const players = realListone();
    const index = makeTierIndex(players, TIER_BLOCKS);
    const total = TIER_BLOCKS.reduce((n, b) => n + b.names.length, 0);
    // Sul listone 2026-27: 479 su 482. I mancanti sono nomi usciti dalla Serie A.
    expect(index.size).toBeGreaterThanOrEqual(total - 10);
  });

  it('non contraddice mai il ruolo del listone', () => {
    const byId = new Map(realListone().map((p) => [p.id, p]));
    const index = makeTierIndex(realListone(), TIER_BLOCKS);
    const roleByTierBlock = new Map<string, string>();
    for (const block of TIER_BLOCKS) {
      for (const name of block.names) roleByTierBlock.set(name.toLowerCase(), block.role);
    }
    for (const [playerId] of index) {
      const player = byId.get(playerId);
      expect(player).toBeDefined();
      const role = roleByTierBlock.get(player!.name.toLowerCase());
      if (role !== undefined) expect(player!.role).toBe(role);
    }
  });
});
