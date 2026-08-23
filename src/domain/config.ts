import type { ByRole, FantaTeam, LeagueConfig, Player, Role } from './types';
import { PHASE_ORDER } from './types';

/** Slot per squadra, PRD §1: 3 P, 8 D, 8 C, 6 A = 25. */
export const DEFAULT_SLOTS_BY_ROLE: ByRole<number> = { P: 3, D: 8, C: 8, A: 6 };

/** Crediti per squadra, PRD §1. */
export const DEFAULT_CREDITS_PER_TEAM = 800;

/**
 * 12 partecipanti. Le sigle sono il target della command bar (PRD §5.1) e
 * l'utente e' `leo`. Nomi e sigle sono sostituibili in fase di setup lega.
 */
export const DEFAULT_TEAM_SEEDS: readonly (readonly [name: string, abbr: string])[] = [
  ['Leonardo', 'leo'],
  ['Squadra 2', 'sq2'],
  ['Squadra 3', 'sq3'],
  ['Squadra 4', 'sq4'],
  ['Squadra 5', 'sq5'],
  ['Squadra 6', 'sq6'],
  ['Squadra 7', 'sq7'],
  ['Squadra 8', 'sq8'],
  ['Squadra 9', 'sq9'],
  ['Squadra 10', 'sq10'],
  ['Squadra 11', 'sq11'],
  ['Squadra 12', 'sq12'],
];

export class LeagueConfigError extends Error {
  override readonly name = 'LeagueConfigError';
}

/**
 * Costruisce le 12 squadre. La prima e' l'utente.
 * Fallisce su sigle duplicate: la command bar le usa come chiave di assegnazione.
 */
export function makeTeams(
  seeds: readonly (readonly [name: string, abbr: string])[] = DEFAULT_TEAM_SEEDS,
  userIndex = 0,
): FantaTeam[] {
  if (seeds.length === 0) {
    throw new LeagueConfigError('Nessuna squadra: la lega richiede almeno un partecipante.');
  }
  if (userIndex < 0 || userIndex >= seeds.length) {
    throw new LeagueConfigError(
      `userIndex ${userIndex} fuori range: attesi 0..${seeds.length - 1}.`,
    );
  }
  const seenAbbr = new Set<string>();
  return seeds.map(([name, abbr], i) => {
    const key = abbr.toLowerCase();
    if (seenAbbr.has(key)) {
      throw new LeagueConfigError(`Sigla duplicata "${abbr}": le sigle devono essere univoche.`);
    }
    seenAbbr.add(key);
    return { id: key, name, abbr: key, isUser: i === userIndex };
  });
}

export function makeLeagueConfig(
  players: readonly Player[],
  overrides: Partial<Omit<LeagueConfig, 'players'>> = {},
): LeagueConfig {
  return {
    teams: overrides.teams ?? makeTeams(),
    creditsPerTeam: overrides.creditsPerTeam ?? DEFAULT_CREDITS_PER_TEAM,
    slotsByRole: overrides.slotsByRole ?? DEFAULT_SLOTS_BY_ROLE,
    players,
  };
}

/**
 * Forma minima di lega richiesta dai calcoli: il listone non serve.
 * `LeagueConfig` e' assegnabile a questo tipo.
 */
export type LeagueShape = Omit<LeagueConfig, 'players'>;

/** Crediti totali in palio: 12 x 800 = 9600 (PRD §4.1). */
export function totalLeagueCredits(config: LeagueShape): number {
  return config.teams.length * config.creditsPerTeam;
}

/** N_r — slot del ruolo r nella lega: P 36, D 96, C 96, A 72 (PRD §4.1). */
export function leagueSlotsByRole(config: LeagueShape): ByRole<number> {
  const n = config.teams.length;
  return {
    P: config.slotsByRole.P * n,
    D: config.slotsByRole.D * n,
    C: config.slotsByRole.C * n,
    A: config.slotsByRole.A * n,
  };
}

/** Slot totali di lega: 12 x 25 = 300 (PRD §4.8). */
export function totalLeagueSlots(config: LeagueShape): number {
  const perTeam = PHASE_ORDER.reduce((acc, role) => acc + config.slotsByRole[role], 0);
  return perTeam * config.teams.length;
}

/** Squadra dell'utente. Fallisce se non ce n'e' esattamente una (PRD §3.1). */
export function userTeam(config: LeagueShape): FantaTeam {
  const users = config.teams.filter((t) => t.isUser);
  const first = users[0];
  if (users.length !== 1 || first === undefined) {
    throw new LeagueConfigError(
      `Attesa esattamente una squadra con isUser=true, trovate ${users.length}.`,
    );
  }
  return first;
}

/** Fasi da `phase` in poi, `phase` inclusa. */
export function phasesFrom(phase: Role): readonly Role[] {
  return PHASE_ORDER.slice(PHASE_ORDER.indexOf(phase));
}

/** Fasi successive a `phase`, `phase` esclusa (PRD §4.3, "fasi future"). */
export function phasesAfter(phase: Role): readonly Role[] {
  return PHASE_ORDER.slice(PHASE_ORDER.indexOf(phase) + 1);
}
