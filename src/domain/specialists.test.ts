import { describe, expect, it } from 'vitest';

import type { SpecialistBlock } from './specialists';
import {
  SET_PIECES,
  hierarchyOf,
  makeHierarchyIndex,
  makeSpecialistIndex,
  rosterKey,
  specialistLabel,
  specialistsOf,
} from './specialists';
import { normalizeQuery } from './search';
import type { Player } from './types';
import { SPECIALIST_BLOCKS } from '../data/specialists';
import { makePlayer, realListone } from '../test/fixtures';

/** Come per le fasce: la chiave di ricerca va costruita come la costruisce il parser. */
function p(id: number, name: string, team: string): Player {
  return { ...makePlayer({ id, role: 'C', quot: 10 }), name, team, searchKey: normalizeQuery(name) };
}

describe('rosterKey', () => {
  it('toglie le iniziali di disambiguazione del listone', () => {
    expect(rosterKey('Paz N.')).toBe('paz');
    expect(rosterKey('Esposito Se.')).toBe('esposito');
    expect(rosterKey('Ederson D.S.')).toBe('ederson');
  });

  it('non tocca i cognomi composti', () => {
    expect(rosterKey('Da Cunha')).toBe('da cunha');
    expect(rosterKey('Kolo Muani')).toBe('kolo muani');
  });

  it('ripiega accenti e maiuscole', () => {
    expect(rosterKey('Calò')).toBe('calo');
    expect(rosterKey('Laurienté')).toBe('lauriente');
  });
});

describe('makeSpecialistIndex', () => {
  const roster = [p(1, 'Calhanoglu', 'Inter'), p(2, 'Dimarco', 'Inter'), p(3, 'Orsolini', 'Bologna')];

  it('aggancia dentro la rosa del club e tiene la gerarchia', () => {
    const blocks: SpecialistBlock[] = [
      { team: 'Inter', kind: 'rigori', names: ['Calhanoglu', 'Dimarco'] },
    ];
    const index = makeSpecialistIndex(roster, blocks);
    expect(specialistsOf(1, index)).toEqual([{ kind: 'rigori', rank: 1 }]);
    expect(specialistsOf(2, index)).toEqual([{ kind: 'rigori', rank: 2 }]);
  });

  it('non aggancia un nome alla squadra sbagliata', () => {
    const blocks: SpecialistBlock[] = [{ team: 'Bologna', kind: 'corner', names: ['Dimarco'] }];
    expect(specialistsOf(2, makeSpecialistIndex(roster, blocks))).toEqual([]);
  });

  /** La fonte scrive "Nico Paz", il listone "Paz N.". */
  it('recupera l ordine invertito dei nomi', () => {
    const como = [p(9, 'Paz N.', 'Como')];
    const blocks: SpecialistBlock[] = [{ team: 'Como', kind: 'punizioni', names: ['Nico Paz'] }];
    expect(specialistsOf(9, makeSpecialistIndex(como, blocks))).toEqual([
      { kind: 'punizioni', rank: 1 },
    ]);
  });

  /**
   * Il caso che ha deciso la regola: la fonte cita "Martinez" fra i rigoristi
   * dell'Inter e in rosa ci sono Lautaro e il portiere Josep.
   */
  it('non sceglie a sorte fra due omonimi della stessa rosa', () => {
    const inter = [p(4, 'Martinez L.', 'Inter'), p(5, 'Martinez Jo.', 'Inter')];
    const blocks: SpecialistBlock[] = [{ team: 'Inter', kind: 'rigori', names: ['Martinez'] }];
    const index = makeSpecialistIndex(inter, blocks);
    expect(specialistsOf(4, index)).toEqual([]);
    expect(specialistsOf(5, index)).toEqual([]);
  });

  it('ignora un nome che nella rosa non c e', () => {
    const blocks: SpecialistBlock[] = [{ team: 'Inter', kind: 'rigori', names: ['Chi Non Gioca'] }];
    expect(makeSpecialistIndex(roster, blocks).size).toBe(0);
  });

  it('tiene insieme piu incarichi dello stesso giocatore, in ordine di tipo', () => {
    const blocks: SpecialistBlock[] = [
      { team: 'Inter', kind: 'corner', names: ['Dimarco', 'Calhanoglu'] },
      { team: 'Inter', kind: 'rigori', names: ['Calhanoglu'] },
      { team: 'Inter', kind: 'punizioni', names: ['Calhanoglu'] },
    ];
    expect(specialistsOf(1, makeSpecialistIndex(roster, blocks))).toEqual([
      { kind: 'rigori', rank: 1 },
      { kind: 'punizioni', rank: 1 },
      { kind: 'corner', rank: 2 },
    ]);
  });

  it('tiene la posizione piu alta se un nome e ripetuto', () => {
    const blocks: SpecialistBlock[] = [
      { team: 'Inter', kind: 'rigori', names: ['Calhanoglu', 'Dimarco', 'Calhanoglu'] },
    ];
    expect(specialistsOf(1, makeSpecialistIndex(roster, blocks))).toEqual([
      { kind: 'rigori', rank: 1 },
    ]);
  });
});

describe('makeHierarchyIndex', () => {
  const roster = [p(1, 'Calhanoglu', 'Inter'), p(2, 'Dimarco', 'Inter')];
  const blocks: SpecialistBlock[] = [
    { team: 'Inter', kind: 'rigori', names: ['Calhanoglu', 'Lautaro Martinez', 'Dimarco'] },
  ];

  it('tiene la gerarchia intera, non solo chi aggancia', () => {
    const slots = hierarchyOf('Inter', 'rigori', makeHierarchyIndex(roster, blocks));
    expect(slots.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(slots.map((s) => s.name)).toEqual(['Calhanoglu', 'Lautaro Martinez', 'Dimarco']);
  });

  /** Chi non e' piu' in rosa resta nella lista, ma marcato: e' l'informazione. */
  it('lascia null il giocatore che il listone non ha piu', () => {
    const slots = hierarchyOf('Inter', 'rigori', makeHierarchyIndex(roster, blocks));
    expect(slots[0]?.player?.id).toBe(1);
    expect(slots[1]?.player).toBeNull();
    expect(slots[2]?.player?.id).toBe(2);
  });

  it('e vuota per una squadra o un tipo che la fonte non copre', () => {
    const index = makeHierarchyIndex(roster, blocks);
    expect(hierarchyOf('Inter', 'corner', index)).toEqual([]);
    expect(hierarchyOf('Bologna', 'rigori', index)).toEqual([]);
  });

  it('non guarda maiuscole e accenti del nome squadra', () => {
    const index = makeHierarchyIndex(roster, blocks);
    expect(hierarchyOf('inter', 'rigori', index)).toHaveLength(3);
  });

  it('concorda con makeSpecialistIndex sul listone reale', () => {
    const players = realListone();
    const roles = makeSpecialistIndex(players, SPECIALIST_BLOCKS);
    const hierarchy = makeHierarchyIndex(players, SPECIALIST_BLOCKS);
    for (const player of players) {
      for (const role of specialistsOf(player.id, roles)) {
        const slots = hierarchyOf(player.team, role.kind, hierarchy);
        expect(slots[role.rank - 1]?.player?.id, `${player.name} ${role.kind}`).toBe(player.id);
      }
    }
  });
});

describe('specialistLabel', () => {
  it('dice tipo e posizione', () => {
    expect(specialistLabel({ kind: 'rigori', rank: 1 })).toBe('rigorista 1º');
    expect(specialistLabel({ kind: 'corner', rank: 2 })).toBe('corner 2º');
  });
});

/** Il file e' generato da `scripts/build-specialists.mjs`. */
describe('src/data/specialists.ts', () => {
  it('copre le venti squadre per ognuno dei tre piazzati', () => {
    for (const kind of SET_PIECES) {
      const teams = SPECIALIST_BLOCKS.filter((b) => b.kind === kind).map((b) => b.team);
      expect(new Set(teams).size, kind).toBe(20);
    }
  });

  it('non lascia un blocco vuoto', () => {
    for (const b of SPECIALIST_BLOCKS) expect(b.names.length, `${b.team} ${b.kind}`).toBeGreaterThan(0);
  });

  it('nomina solo club che esistono nel listone', () => {
    const teams = new Set(realListone().map((p) => normalizeQuery(p.team)));
    for (const b of SPECIALIST_BLOCKS) expect(teams.has(normalizeQuery(b.team)), b.team).toBe(true);
  });

  it('aggancia la grande maggioranza dei nomi al listone reale', () => {
    const index = makeSpecialistIndex(realListone(), SPECIALIST_BLOCKS);
    const total = SPECIALIST_BLOCKS.reduce((n, b) => n + b.names.length, 0);
    const hooked = [...index.values()].reduce((n, roles) => n + roles.length, 0);
    // Chi resta fuori ha lasciato il club fra la pubblicazione e il listone,
    // oppure e' un omonimo rifiutato apposta.
    expect(hooked).toBeGreaterThan(total * 0.9);
  });

  it('da a ogni squadra almeno un rigorista agganciato', () => {
    const players = realListone();
    const index = makeSpecialistIndex(players, SPECIALIST_BLOCKS);
    const withPenalty = new Set(
      players
        .filter((p) => specialistsOf(p.id, index).some((r) => r.kind === 'rigori' && r.rank === 1))
        .map((p) => p.team),
    );
    expect(withPenalty.size).toBe(20);
  });
});
