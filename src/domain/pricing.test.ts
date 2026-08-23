import { describe, expect, it } from 'vitest';

import {
  baselineCreditsByRole,
  buildPlayers,
  compareByFvmDesc,
  compareByQuotDesc,
  computePricingModel,
  expectedPriceFor,
  groupByRole,
  sortByQuotDesc,
  tierForIndex,
} from './pricing';
import { DEFAULT_SLOTS_BY_ROLE, makeTeams } from './config';
import { PHASE_ORDER } from './types';
import type { ListonePlayer, Role, Tier } from './types';
import { findPlayer, realBuilt, realListone } from '../test/fixtures';

const LEAGUE = {
  teams: makeTeams(),
  creditsPerTeam: 800,
  slotsByRole: DEFAULT_SLOTS_BY_ROLE,
};

function raw(id: number, role: Role, quot: number, fvm = quot * 10): ListonePlayer {
  return {
    id,
    name: `P${id}`,
    searchKey: `p${id}`,
    team: 'Test',
    role,
    under: 25,
    quot,
    fvm,
  };
}

describe('§4.1 — prezzo atteso di lega sul dataset reale', () => {
  const { model, players } = realBuilt();

  it('somma le QUOT. dei top N_r per ruolo: S = 2844', () => {
    expect(model.quotSumByRole).toEqual({ P: 240, D: 779, C: 978, A: 847 });
    expect(model.quotSum).toBe(2844);
  });

  it('usa N_r = 36 / 96 / 96 / 72 e 9600 crediti', () => {
    expect(model.leagueSlotsByRole).toEqual({ P: 36, D: 96, C: 96, A: 72 });
    expect(model.totalCredits).toBe(9600);
  });

  it('calcola f ~ 3.38, non hardcodato', () => {
    expect(model.f).toBeCloseTo(3.3755, 4);
    expect(model.f).toBe(9600 / 2844);
  });

  it('riproduce i valori di sanita del PRD entro +/-1', () => {
    const cases: readonly (readonly [string, number])[] = [
      ['Martinez L.', 118],
      ['Dimarco', 108],
      ['Pulisic', 84],
    ];
    for (const [name, expected] of cases) {
      const p = findPlayer(players, name);
      expect(Math.abs(p.expectedPrice - expected)).toBeLessThanOrEqual(1);
    }
    expect(findPlayer(players, 'Martinez L.').expectedPrice).toBe(118);
    expect(findPlayer(players, 'Dimarco').expectedPrice).toBe(108);
    expect(findPlayer(players, 'Pulisic').expectedPrice).toBe(84);
  });

  it('assegna un expectedPrice a tutti i 516 giocatori', () => {
    expect(players).toHaveLength(516);
    expect(players.every((p) => Number.isInteger(p.expectedPrice))).toBe(true);
  });

  it('riproduce il budget split di §4.2', () => {
    const pct = (r: Role): number => Number((model.budgetSplitByRole[r] * 100).toFixed(1));
    expect(pct('P')).toBe(8.4);
    expect(pct('D')).toBe(27.4);
    expect(pct('C')).toBe(34.4);
    expect(pct('A')).toBe(29.8);

    const credits = baselineCreditsByRole(model);
    expect(Math.round(credits.P)).toBe(810);
    expect(Math.round(credits.D)).toBe(2630);
    expect(Math.round(credits.C)).toBe(3301);
    expect(Math.round(credits.A)).toBe(2859);
    const perSlot = (r: Role): number =>
      Number((credits[r] / model.leagueSlotsByRole[r]).toFixed(1));
    expect(perSlot('P')).toBe(22.5);
    expect(perSlot('D')).toBe(27.4);
    expect(perSlot('C')).toBe(34.4);
    expect(perSlot('A')).toBe(39.7);
  });

  it('le quote sommano a 1', () => {
    const total = PHASE_ORDER.reduce((acc, r) => acc + model.budgetSplitByRole[r], 0);
    expect(total).toBeCloseTo(1, 12);
  });

  it('f si ricalcola sul pool: una lega da 500 crediti produce un f diverso', () => {
    const small = computePricingModel(realListone(), { ...LEAGUE, creditsPerTeam: 500 });
    expect(small.quotSum).toBe(2844);
    expect(small.f).toBeCloseTo((500 * 12) / 2844, 10);
    expect(small.f).not.toBe(model.f);
  });

  it('f si ricalcola anche al variare del pool, non solo dei crediti', () => {
    const half = realListone().filter((p) => p.quot >= 5);
    const trimmed = computePricingModel(half, LEAGUE);
    expect(trimmed.quotSum).not.toBe(2844);
    expect(trimmed.f).not.toBe(model.f);
  });
});

describe('§4.1 — meccanica', () => {
  it('expectedPriceFor arrotonda al piu vicino', () => {
    expect(expectedPriceFor(10, 3.3755)).toBe(34);
    expect(expectedPriceFor(1, 3.3755)).toBe(3);
    expect(expectedPriceFor(2, 0.25)).toBe(1); // 0.5 arrotonda per eccesso
    expect(expectedPriceFor(1, 0.2)).toBe(0); // §4.1 non clampa: il floor e' §4.8
  });

  it('il pool si ferma a N_r anche con piu giocatori disponibili', () => {
    const players = [
      ...Array.from({ length: 5 }, (_, i) => raw(i + 1, 'P', 10 - i)),
      raw(100, 'D', 7),
    ];
    const model = computePricingModel(players, {
      ...LEAGUE,
      teams: makeTeams([['A', 'a']]),
      slotsByRole: { P: 2, D: 1, C: 0, A: 0 },
    });
    expect(model.quotSumByRole.P).toBe(19); // 10 + 9, non 10+9+8+7+6
    expect(model.quotSumByRole.D).toBe(7);
    expect(model.quotSum).toBe(26);
  });

  it('con pool piu corto degli slot somma quello che c e', () => {
    const model = computePricingModel([raw(1, 'P', 4)], {
      ...LEAGUE,
      teams: makeTeams([['A', 'a']]),
      slotsByRole: { P: 3, D: 0, C: 0, A: 0 },
    });
    expect(model.quotSumByRole.P).toBe(4);
  });

  it('con S = 0 restituisce f = 0 invece di dividere per zero', () => {
    const model = computePricingModel([raw(1, 'P', 0)], {
      ...LEAGUE,
      teams: makeTeams([['A', 'a']]),
      slotsByRole: { P: 1, D: 0, C: 0, A: 0 },
    });
    expect(model.quotSum).toBe(0);
    expect(model.f).toBe(0);
    expect(model.budgetSplitByRole).toEqual({ P: 0, D: 0, C: 0, A: 0 });
    expect(baselineCreditsByRole(model)).toEqual({ P: 0, D: 0, C: 0, A: 0 });
  });

  it('un listone vuoto produce un modello a zero', () => {
    const model = computePricingModel([], LEAGUE);
    expect(model.quotSum).toBe(0);
    expect(model.f).toBe(0);
  });
});

describe('ordinamenti deterministici', () => {
  it('QUOT. desc, poi FVM desc, poi id asc', () => {
    const a = raw(5, 'D', 10, 50);
    const b = raw(3, 'D', 10, 50);
    const c = raw(9, 'D', 10, 80);
    const d = raw(1, 'D', 12, 10);
    expect(sortByQuotDesc([a, b, c, d]).map((p) => p.id)).toEqual([1, 9, 3, 5]);
    expect(compareByQuotDesc(d, a)).toBeLessThan(0);
    expect(compareByQuotDesc(c, a)).toBeLessThan(0);
    expect(compareByQuotDesc(b, a)).toBeLessThan(0);
  });

  it('non muta l array di input', () => {
    const input = [raw(1, 'D', 1), raw(2, 'D', 9)];
    const before = input.map((p) => p.id);
    sortByQuotDesc(input);
    expect(input.map((p) => p.id)).toEqual(before);
  });

  it('il tiebreak conta: 39 portieri a QUOT.=1 per 36 slot nel file reale', () => {
    const portieri = groupByRole(realListone()).P;
    const atOne = portieri.filter((p) => p.quot === 1);
    expect(atOne.length).toBeGreaterThan(3);
    const first = sortByQuotDesc(portieri).map((p) => p.id);
    const second = sortByQuotDesc([...portieri].reverse()).map((p) => p.id);
    expect(first).toEqual(second);
  });

  it('compareByFvmDesc ordina per FVM, poi QUOT., poi id', () => {
    const a = raw(5, 'D', 10, 50);
    const b = raw(3, 'D', 12, 50);
    const c = raw(9, 'D', 1, 80);
    expect([a, b, c].sort(compareByFvmDesc).map((p) => p.id)).toEqual([9, 3, 5]);
    expect(compareByFvmDesc(a, raw(5, 'D', 10, 50))).toBe(0);
  });

  it('groupByRole raccoglie tutti i ruoli, anche vuoti', () => {
    expect(groupByRole([])).toEqual({ P: [], D: [], C: [], A: [] });
    const grouped = groupByRole([raw(1, 'A', 3), raw(2, 'A', 4)]);
    expect(grouped.A).toHaveLength(2);
    expect(grouped.P).toEqual([]);
  });
});

describe('tiering — quintili di FVM dentro il ruolo', () => {
  it('tierForIndex taglia in 5 gruppi contigui', () => {
    expect(tierForIndex(0, 10)).toBe(1);
    expect(tierForIndex(1, 10)).toBe(1);
    expect(tierForIndex(2, 10)).toBe(2);
    expect(tierForIndex(8, 10)).toBe(5);
    expect(tierForIndex(9, 10)).toBe(5);
  });

  it('clampa gli indici fuori range invece di produrre tier illegali', () => {
    expect(tierForIndex(10, 10)).toBe(5);
    expect(tierForIndex(-1, 10)).toBe(1);
    expect(tierForIndex(0, 0)).toBe(5);
    expect(tierForIndex(0, -3)).toBe(5);
  });

  it('sul file reale ogni ruolo ha tutti e 5 i tier, in quintili', () => {
    const { players } = realBuilt();
    for (const role of PHASE_ORDER) {
      const ofRole = players.filter((p) => p.role === role);
      const counts = new Map<Tier, number>();
      for (const p of ofRole) counts.set(p.tier, (counts.get(p.tier) ?? 0) + 1);
      expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5]);
      const sizes = [...counts.values()];
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(ofRole.length);
    }
  });

  it('il tier 1 di ogni ruolo ha FVM piu alto del tier 5', () => {
    const { players } = realBuilt();
    for (const role of PHASE_ORDER) {
      const ofRole = players.filter((p) => p.role === role);
      const t1 = ofRole.filter((p) => p.tier === 1);
      const t5 = ofRole.filter((p) => p.tier === 5);
      const minT1 = Math.min(...t1.map((p) => p.fvm));
      const maxT5 = Math.max(...t5.map((p) => p.fvm));
      expect(minT1).toBeGreaterThanOrEqual(maxT5);
    }
  });

  it('e stabile: due build consecutive danno gli stessi tier', () => {
    const a = buildPlayers(realListone(), LEAGUE).players;
    const b = buildPlayers(realListone(), LEAGUE).players;
    expect(a.map((p) => [p.id, p.tier])).toEqual(b.map((p) => [p.id, p.tier]));
  });

  it('buildPlayers emette in ordine canonico P, D, C, A', () => {
    const { players } = realBuilt();
    const roles = players.map((p) => p.role);
    expect(roles.indexOf('P')).toBe(0);
    expect(roles.lastIndexOf('P')).toBeLessThan(roles.indexOf('D'));
    expect(roles.lastIndexOf('D')).toBeLessThan(roles.indexOf('C'));
    expect(roles.lastIndexOf('C')).toBeLessThan(roles.indexOf('A'));
  });

  it('conserva ogni giocatore del listone di partenza', () => {
    const { players } = realBuilt();
    expect(new Set(players.map((p) => p.id)).size).toBe(realListone().length);
  });

  it('un ruolo con un solo giocatore lo mette in tier 1', () => {
    const { players } = buildPlayers([raw(1, 'A', 5)], LEAGUE);
    expect(players[0]?.tier).toBe(1);
  });
});
