import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CREDITS_PER_TEAM,
  DEFAULT_SLOTS_BY_ROLE,
  LeagueConfigError,
  makeLeagueConfig,
  makeTeams,
  totalLeagueCredits,
  totalLeagueSlots,
  updateTeams,
  userTeam,
} from './config';
import { reduce, teamState } from './reducer';
import { makeEvent, makePlayer } from '../test/fixtures';

describe('makeTeams', () => {
  it('crea 12 squadre con la prima marcata come utente', () => {
    const teams = makeTeams();
    expect(teams).toHaveLength(12);
    expect(teams.filter((t) => t.isUser)).toHaveLength(1);
    expect(teams[0]?.isUser).toBe(true);
    expect(teams[0]?.abbr).toBe('leo');
    expect(teams[0]?.id).toBe('leo');
  });

  it('tutte le sigle di default sono di 3 lettere e univoche', () => {
    const teams = makeTeams();
    for (const t of teams) expect(t.abbr).toHaveLength(3);
    expect(new Set(teams.map((t) => t.abbr)).size).toBe(12);
  });

  it('normalizza le sigle in minuscolo', () => {
    expect(makeTeams([['Alpha', 'ALF'], ['Beta', 'BET']])[0]?.abbr).toBe('alf');
  });

  it('accetta un userIndex diverso da 0', () => {
    const teams = makeTeams([['A', 'aaa'], ['B', 'bbb']], 1);
    expect(teams[1]?.isUser).toBe(true);
    expect(teams[0]?.isUser).toBe(false);
  });

  it('rifiuta le sigle di lunghezza diversa da 3', () => {
    expect(() => makeTeams([['A', 'ab']])).toThrowError(/attese esattamente 3 lettere/);
    expect(() => makeTeams([['A', 'abcd']])).toThrowError(/Sigla "abcd"/);
  });

  it('rifiuta le sigle duplicate, anche se differiscono solo di case', () => {
    expect(() => makeTeams([['A', 'xyz'], ['B', 'XYZ']])).toThrowError(LeagueConfigError);
    expect(() => makeTeams([['A', 'xyz'], ['B', 'XYZ']])).toThrowError(/Sigla duplicata "XYZ"/);
  });

  it('rifiuta una lega senza squadre', () => {
    expect(() => makeTeams([])).toThrowError(/almeno un partecipante/);
  });

  it('rifiuta un userIndex fuori range', () => {
    expect(() => makeTeams([['A', 'aaa']], 5)).toThrowError(
      /userIndex 5 fuori range: attesi 0\.\.0/,
    );
    expect(() => makeTeams([['A', 'aaa']], -1)).toThrowError(/fuori range/);
  });
});

describe('updateTeams — rinominare non stacca gli acquisti', () => {
  const initial = makeTeams([
    ['Leonardo', 'leo'],
    ['Marco', 'mrc'],
    ['Anna', 'ann'],
  ]);

  it('cambiare la sigla NON cambia l id', () => {
    // E' il bug che faceva sparire in silenzio tutti gli acquisti di una
    // squadra rinominata: gli eventi puntano all'id, non alla sigla.
    const updated = updateTeams(initial, [
      ['Leonardo', 'leo'],
      ['Marco Rossi', 'mar'],
      ['Anna', 'ann'],
    ]);
    expect(updated[1]?.id).toBe('mrc');
    expect(updated[1]?.abbr).toBe('mar');
    expect(updated[1]?.name).toBe('Marco Rossi');
    expect(updated.map((t) => t.id)).toEqual(['leo', 'mrc', 'ann']);
  });

  it('un evento resta valido dopo il rename', () => {
    const players = [makePlayer({ id: 1, role: 'P', quot: 5 })];
    const before = makeLeagueConfig(players, { teams: initial });
    const after = makeLeagueConfig(players, {
      teams: updateTeams(initial, [
        ['Leonardo', 'leo'],
        ['Marco Rossi', 'mar'],
        ['Anna', 'ann'],
      ]),
    });
    const events = [makeEvent({ playerId: 1, teamId: 'mrc', price: 10, phase: 'P' })];

    expect(reduce(events, before).rejections).toEqual([]);
    expect(reduce(events, after).rejections).toEqual([]);
    expect(teamState(reduce(events, after), 'mrc').credits).toBe(790);
  });

  it('l accoppiamento e posizionale: il nome non conta', () => {
    const updated = updateTeams(initial, [
      ['Tutto', 'aaa'],
      ['Rifatto', 'bbb'],
      ['Da capo', 'ccc'],
    ]);
    expect(updated.map((t) => t.id)).toEqual(['leo', 'mrc', 'ann']);
    expect(updated.map((t) => t.abbr)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('le squadre nuove prendono un id che non puo collidere con una sigla', () => {
    const updated = updateTeams(initial, [
      ['Leonardo', 'leo'],
      ['Marco', 'mrc'],
      ['Anna', 'ann'],
      ['Quarta', 'qua'],
    ]);
    expect(updated[3]?.id).toBe('team-4');
    expect(updated[3]?.abbr).toBe('qua');
    expect(new Set(updated.map((t) => t.id)).size).toBe(4);
  });

  it('non riusa un id gia preso da un altra riga', () => {
    const updated = updateTeams(
      [{ id: 'team-4', name: 'Vecchia', abbr: 'vec', isUser: false }],
      [
        ['Vecchia', 'vec'],
        ['Nuova', 'nuo'],
        ['Altra', 'alt'],
        ['Ancora', 'anc'],
      ],
    );
    expect(new Set(updated.map((t) => t.id)).size).toBe(4);
    expect(updated[0]?.id).toBe('team-4');
    expect(updated.slice(1).some((t) => t.id === 'team-4')).toBe(false);
  });

  it('sposta il flag utente senza toccare gli id', () => {
    const updated = updateTeams(initial, [
      ['Leonardo', 'leo'],
      ['Marco', 'mrc'],
      ['Anna', 'ann'],
    ], 2);
    expect(updated.map((t) => t.isUser)).toEqual([false, false, true]);
    expect(updated.map((t) => t.id)).toEqual(['leo', 'mrc', 'ann']);
  });

  it('valida le sigle come alla creazione', () => {
    expect(() => updateTeams(initial, [['A', 'xx'], ['B', 'bbb'], ['C', 'ccc']])).toThrowError(
      /3 lettere/,
    );
    expect(() => updateTeams(initial, [['A', 'dup'], ['B', 'dup'], ['C', 'ccc']])).toThrowError(
      /duplicata/,
    );
  });

  it('partendo da zero si comporta come makeTeams', () => {
    const created = updateTeams([], [['Solo', 'sol']]);
    expect(created[0]?.id).toBe('team-1');
    expect(created[0]?.abbr).toBe('sol');
  });
});

describe('totali di lega', () => {
  const config = makeLeagueConfig([]);

  it('12 x 800 = 9600 crediti e 12 x 25 = 300 slot', () => {
    expect(totalLeagueCredits(config)).toBe(9600);
    expect(totalLeagueSlots(config)).toBe(300);
    expect(config.creditsPerTeam).toBe(DEFAULT_CREDITS_PER_TEAM);
    expect(config.slotsByRole).toEqual(DEFAULT_SLOTS_BY_ROLE);
  });

  it('gli override sostituiscono i default', () => {
    const custom = makeLeagueConfig([makePlayer({ id: 1, role: 'A', quot: 4 })], {
      creditsPerTeam: 500,
      slotsByRole: { P: 1, D: 2, C: 2, A: 1 },
      teams: makeTeams([['Solo', 'sol']]),
    });
    expect(totalLeagueCredits(custom)).toBe(500);
    expect(totalLeagueSlots(custom)).toBe(6);
    expect(custom.players).toHaveLength(1);
  });
});

describe('userTeam', () => {
  it('restituisce l unica squadra dell utente', () => {
    expect(userTeam(makeLeagueConfig([])).abbr).toBe('leo');
  });

  it('fallisce se le squadre utente non sono esattamente una', () => {
    const teams = makeTeams();
    const none = teams.map((t) => ({ ...t, isUser: false }));
    const two = teams.map((t, i) => ({ ...t, isUser: i < 2 }));
    expect(() =>
      userTeam({ teams: none, creditsPerTeam: 800, slotsByRole: DEFAULT_SLOTS_BY_ROLE }),
    ).toThrowError(/trovate 0/);
    expect(() =>
      userTeam({ teams: two, creditsPerTeam: 800, slotsByRole: DEFAULT_SLOTS_BY_ROLE }),
    ).toThrowError(/trovate 2/);
  });
});
