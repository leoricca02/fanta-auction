import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CREDITS_PER_TEAM,
  DEFAULT_SLOTS_BY_ROLE,
  LeagueConfigError,
  leagueSlotsByRole,
  makeLeagueConfig,
  makeTeams,
  phasesAfter,
  phasesFrom,
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

  it('normalizza le sigle in minuscolo', () => {
    expect(makeTeams([['Alpha', 'ALF'], ['Beta', 'BET']])[0]?.abbr).toBe('alf');
  });

  it('accetta un userIndex diverso da 0', () => {
    const teams = makeTeams([['A', 'a'], ['B', 'b']], 1);
    expect(teams[1]?.isUser).toBe(true);
    expect(teams[0]?.isUser).toBe(false);
  });

  it('rifiuta le sigle duplicate, anche se differiscono solo di case', () => {
    expect(() => makeTeams([['A', 'x'], ['B', 'X']])).toThrowError(LeagueConfigError);
    expect(() => makeTeams([['A', 'x'], ['B', 'X']])).toThrowError(/Sigla duplicata "X"/);
  });

  it('rifiuta una lega senza squadre', () => {
    expect(() => makeTeams([])).toThrowError(/almeno un partecipante/);
  });

  it('rifiuta un userIndex fuori range', () => {
    expect(() => makeTeams([['A', 'a']], 5)).toThrowError(/userIndex 5 fuori range: attesi 0\.\.0/);
    expect(() => makeTeams([['A', 'a']], -1)).toThrowError(/fuori range/);
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

  it('N_r = 36 / 96 / 96 / 72', () => {
    expect(leagueSlotsByRole(config)).toEqual({ P: 36, D: 96, C: 96, A: 72 });
  });

  it('gli override sostituiscono i default', () => {
    const custom = makeLeagueConfig([makePlayer({ id: 1, role: 'A', quot: 4 })], {
      creditsPerTeam: 500,
      slotsByRole: { P: 1, D: 2, C: 2, A: 1 },
      teams: makeTeams([['Solo', 's']]),
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
    expect(() => userTeam({ teams: none, creditsPerTeam: 800, slotsByRole: DEFAULT_SLOTS_BY_ROLE }))
      .toThrowError(/trovate 0/);
    expect(() => userTeam({ teams: two, creditsPerTeam: 800, slotsByRole: DEFAULT_SLOTS_BY_ROLE }))
      .toThrowError(/trovate 2/);
  });
});

describe('ordine delle fasi', () => {
  it('phasesFrom include la fase stessa', () => {
    expect(phasesFrom('P')).toEqual(['P', 'D', 'C', 'A']);
    expect(phasesFrom('C')).toEqual(['C', 'A']);
    expect(phasesFrom('A')).toEqual(['A']);
  });

  it('phasesAfter esclude la fase stessa', () => {
    expect(phasesAfter('P')).toEqual(['D', 'C', 'A']);
    expect(phasesAfter('C')).toEqual(['A']);
    expect(phasesAfter('A')).toEqual([]);
  });
});
