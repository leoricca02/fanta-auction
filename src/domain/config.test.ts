import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CREDITS_PER_TEAM,
  DEFAULT_SLOTS_BY_ROLE,
  LeagueConfigError,
  makeLeagueConfig,
  makeTeams,
  totalLeagueCredits,
  totalLeagueSlots,
  userTeam,
} from './config';
import { makePlayer } from '../test/fixtures';

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
