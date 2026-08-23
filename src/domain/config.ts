import type { ByRole, FantaTeam, LeagueConfig, Player } from './types';
import { PHASE_ORDER } from './types';

/** Slot per squadra, PRD §1: 3 P, 8 D, 8 C, 6 A = 25. */
export const DEFAULT_SLOTS_BY_ROLE: ByRole<number> = { P: 3, D: 8, C: 8, A: 6 };

/** Crediti per squadra, PRD §1. */
export const DEFAULT_CREDITS_PER_TEAM = 800;

/**
 * 12 partecipanti. Le sigle sono di 3 lettere (PRD §3) e sono il target della
 * command bar (§5.1). L'utente e' `leo`. Nomi e sigle si sostituiscono in fase
 * di setup lega.
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
  ['Squadra 10', 'sqa'],
  ['Squadra 11', 'sqb'],
  ['Squadra 12', 'sqc'],
];

export class LeagueConfigError extends Error {
  override readonly name = 'LeagueConfigError';
}

/**
 * Forma minima di lega richiesta dai calcoli: il listone non serve.
 * `LeagueConfig` e' assegnabile a questo tipo.
 */
export type LeagueShape = Omit<LeagueConfig, 'players'>;

/**
 * Crea squadre nuove. Quella all'indice `userIndex` e' l'utente.
 *
 * Fallisce su sigle duplicate o di lunghezza diversa da 3: la sigla e' quello
 * che si digita nella command bar, e un prefisso ambiguo sotto asta e' un
 * acquisto assegnato alla squadra sbagliata.
 *
 * Alla creazione l'id coincide con la sigla, ma **non e' la sigla**: per
 * rinominare una squadra conservando i suoi acquisti serve `updateTeams`.
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
    if (key.length !== 3) {
      throw new LeagueConfigError(`Sigla "${abbr}": attese esattamente 3 lettere.`);
    }
    if (seenAbbr.has(key)) {
      throw new LeagueConfigError(`Sigla duplicata "${abbr}": le sigle devono essere univoche.`);
    }
    seenAbbr.add(key);
    return { id: key, name, abbr: key, isUser: i === userIndex };
  });
}

/**
 * Aggiorna nomi e sigle **conservando gli id** delle squadre esistenti.
 *
 * L'id di una squadra e' la chiave a cui punta ogni `AssignmentEvent`. Alla
 * creazione coincide con la sigla, ma da quel momento in poi e' immutabile:
 * rigenerarlo quando l'utente rinomina una squadra farebbe puntare tutti i suoi
 * acquisti a un id inesistente, e il reducer li scarterebbe in silenzio come
 * `UNKNOWN_TEAM`.
 *
 * L'accoppiamento e' **posizionale**: la riga `i` dell'elenco resta la stessa
 * squadra, comunque la si chiami.
 */
export function updateTeams(
  current: readonly FantaTeam[],
  seeds: readonly (readonly [name: string, abbr: string])[],
  userIndex = 0,
): FantaTeam[] {
  // Valida sigle e cardinalita' con le stesse regole della creazione.
  const validated = makeTeams(seeds, userIndex);
  const usedIds = new Set<string>();

  return validated.map((team, i) => {
    const existing = current[i];
    const id = existing?.id ?? freshId(usedIds, i);
    usedIds.add(id);
    return { ...team, id };
  });
}

/**
 * Id per una squadra che prima non c'era. Il prefisso `team-` non puo'
 * collidere con una sigla, che e' di tre lettere.
 */
function freshId(used: ReadonlySet<string>, index: number): string {
  let n = index + 1;
  while (used.has(`team-${n}`)) n += 1;
  return `team-${n}`;
}

export function makeLeagueConfig(
  players: readonly Player[],
  overrides: Partial<LeagueShape> = {},
): LeagueConfig {
  return {
    teams: overrides.teams ?? makeTeams(),
    creditsPerTeam: overrides.creditsPerTeam ?? DEFAULT_CREDITS_PER_TEAM,
    slotsByRole: overrides.slotsByRole ?? DEFAULT_SLOTS_BY_ROLE,
    players,
  };
}

/** Crediti totali in palio: 12 x 800 = 9600 (PRD §1). */
export function totalLeagueCredits(config: LeagueShape): number {
  return config.teams.length * config.creditsPerTeam;
}

/** Slot totali di lega: 12 x 25 = 300 (PRD §1). */
export function totalLeagueSlots(config: LeagueShape): number {
  const perTeam = PHASE_ORDER.reduce((acc, role) => acc + config.slotsByRole[role], 0);
  return perTeam * config.teams.length;
}

/** Squadra dell'utente. Fallisce se non ce n'e' esattamente una (PRD §3). */
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
