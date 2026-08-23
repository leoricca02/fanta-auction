import type { AssignmentEvent, ByRole, LeagueConfig, LineupStatus, Player, Role } from './types';
import { PHASE_ORDER } from './types';
import type { LeagueState, PlayerIndex, TeamState } from './reducer';
import { maxBidAssoluto, teamState } from './reducer';
import type { LineupIndex } from './lineup';
import { lineupStatus } from './lineup';

/**
 * Statistiche dell'asta in corso (overlay `t`).
 *
 * Tutto qui dentro e' **misurato**, mai stimato: prezzi battuti, slot occupati,
 * crediti residui, e gli stati di formazione che hai inserito tu. E' la
 * differenza con il modello di prezzo della 1.0, che e' stato eliminato — un
 * rapporto fra due numeri osservati non e' una previsione.
 *
 * L'unica proiezione e' `projectedEndTs`, ed e' dichiarata tale: il ritmo
 * tenuto finora esteso agli slot che restano.
 */

function emptyByRole(): Record<Role, number> {
  return { P: 0, D: 0, C: 0, A: 0 };
}

/** Quota, `0` se il totale e' zero: nessuna divisione per zero nella UI. */
export function share(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

// ---------------------------------------------------------------------------
// Mercato: quanto sta costando il tavolo
// ---------------------------------------------------------------------------

export interface RoleMarket {
  readonly role: Role;
  readonly spent: number;
  readonly filled: number;
  readonly totalSlots: number;
  /** Prezzo medio pagato nel reparto. `0` se il reparto non e' ancora partito. */
  readonly avgPrice: number;
  /** Quota della spesa di lega finita in questo reparto. */
  readonly shareOfSpend: number;
  /** Colpo piu' caro del reparto. */
  readonly top: Deal | null;
}

export interface Deal {
  readonly playerId: number;
  readonly name: string;
  readonly role: Role;
  readonly club: string;
  readonly teamId: string;
  readonly price: number;
  readonly quot: number;
  /** `prezzo / QUOT.` — due numeri osservati, non una valutazione. */
  readonly overQuot: number;
  readonly status: LineupStatus;
}

export interface Market {
  readonly creditsSpent: number;
  readonly totalCredits: number;
  readonly slotsFilled: number;
  readonly totalSlots: number;
  readonly spentShare: number;
  readonly filledShare: number;
  /**
   * **Termometro del tavolo.** `spentShare / filledShare`: sopra 1 il tavolo
   * sta correndo (i crediti se ne vanno piu' in fretta degli slot), sotto 1 sta
   * tenendo. `null` finche' non c'e' nessun acquisto.
   */
  readonly heatIndex: number | null;
  /** Prezzo medio pagato in lega finora. */
  readonly avgPrice: number;
  /**
   * Crediti residui in lega diviso gli slot ancora liberi: quanto vale in media
   * uno slot da qui alla fine. E' il numero che dice se conviene aspettare.
   */
  readonly residualPerSlot: number;
}

// ---------------------------------------------------------------------------
// Titolarita': il dato che nessun tabellone ha
// ---------------------------------------------------------------------------

export interface StarterMix {
  readonly TITOLARE: number;
  readonly BALLOTTAGGIO: number;
  readonly PANCHINA: number;
  readonly NON_INSERITO: number;
  readonly assigned: number;
  /** Quota di titolari sugli assegnati **di cui conosci la formazione**. */
  readonly starterShare: number;
}

function emptyMix(): Record<LineupStatus, number> {
  return { TITOLARE: 0, BALLOTTAGGIO: 0, PANCHINA: 0, NON_INSERITO: 0 };
}

function mixFrom(counts: Record<LineupStatus, number>): StarterMix {
  const assigned =
    counts.TITOLARE + counts.BALLOTTAGGIO + counts.PANCHINA + counts.NON_INSERITO;
  const known = assigned - counts.NON_INSERITO;
  return { ...counts, assigned, starterShare: share(counts.TITOLARE, known) };
}

// ---------------------------------------------------------------------------
// Squadre
// ---------------------------------------------------------------------------

export interface TeamStats {
  readonly teamId: string;
  readonly credits: number;
  readonly spent: number;
  readonly slotsFilled: number;
  readonly slotsFree: number;
  readonly maxBid: number;
  /** Crediti residui per slot ancora libero: la potenza di fuoco vera. */
  readonly perFreeSlot: number;
  readonly avgPrice: number;
  readonly spentByRole: ByRole<number>;
  readonly filledByRole: ByRole<number>;
  readonly priciest: Deal | null;
  readonly mix: StarterMix;
  /** Club di Serie A piu' rappresentato in rosa, con quanti giocatori. */
  readonly topClub: { readonly club: string; readonly count: number } | null;
}

function dealFrom(
  playerId: number,
  teamId: string,
  price: number,
  players: PlayerIndex,
  lineups: LineupIndex,
): Deal | null {
  const player = players.get(playerId);
  if (player === undefined) return null;
  return {
    playerId,
    name: player.name,
    role: player.role,
    club: player.team,
    teamId,
    price,
    quot: player.quot,
    overQuot: player.quot > 0 ? price / player.quot : 0,
    status: lineupStatus(player.id, player.team, lineups),
  };
}

export function statsForTeam(
  team: TeamState,
  players: PlayerIndex,
  lineups: LineupIndex,
): TeamStats {
  const spentByRole = emptyByRole();
  const filledByRole = emptyByRole();
  const counts = emptyMix();
  const byClub = new Map<string, number>();
  let priciest: Deal | null = null;

  for (const entry of team.roster) {
    spentByRole[entry.role] += entry.price;
    filledByRole[entry.role] += 1;

    const deal = dealFrom(entry.playerId, team.teamId, entry.price, players, lineups);
    if (deal === null) {
      // Giocatore uscito dal listone dopo l'acquisto: resta nella spesa, ma non
      // puo' contribuire ne' alla titolarita' ne' alla concentrazione per club.
      counts.NON_INSERITO += 1;
      continue;
    }
    counts[deal.status] += 1;
    byClub.set(deal.club, (byClub.get(deal.club) ?? 0) + 1);
    if (priciest === null || deal.price > priciest.price) priciest = deal;
  }

  let topClub: { club: string; count: number } | null = null;
  for (const [club, count] of byClub) {
    if (topClub === null || count > topClub.count) topClub = { club, count };
  }

  return {
    teamId: team.teamId,
    credits: team.credits,
    spent: team.spent,
    slotsFilled: team.slotsFilled,
    slotsFree: team.slotsFree,
    maxBid: maxBidAssoluto(team),
    perFreeSlot: share(team.credits, team.slotsFree),
    avgPrice: share(team.spent, team.slotsFilled),
    spentByRole,
    filledByRole,
    priciest,
    mix: mixFrom(counts),
    topClub,
  };
}

// ---------------------------------------------------------------------------
// Ritmo
// ---------------------------------------------------------------------------

export interface Pace {
  readonly assignments: number;
  readonly firstTs: number | null;
  readonly lastTs: number | null;
  readonly elapsedMs: number;
  /** Chiamate al minuto sul tempo trascorso. `null` sotto i due acquisti. */
  readonly perMinute: number | null;
  /** Fine stimata al ritmo tenuto finora — l'unica proiezione del modulo. */
  readonly projectedEndTs: number | null;
}

export function computePace(
  events: readonly AssignmentEvent[],
  slotsFree: number,
): Pace {
  const applied = events.filter((e) => !e.undone);
  if (applied.length === 0) {
    return {
      assignments: 0,
      firstTs: null,
      lastTs: null,
      elapsedMs: 0,
      perMinute: null,
      projectedEndTs: null,
    };
  }

  let firstTs = Infinity;
  let lastTs = -Infinity;
  for (const e of applied) {
    if (e.ts < firstTs) firstTs = e.ts;
    if (e.ts > lastTs) lastTs = e.ts;
  }

  const elapsedMs = lastTs - firstTs;
  // Il primo acquisto non ha un "prima": il ritmo nasce dal secondo in poi.
  const perMinute = elapsedMs > 0 ? (applied.length - 1) / (elapsedMs / 60_000) : null;
  const projectedEndTs =
    perMinute !== null && perMinute > 0 && slotsFree > 0
      ? lastTs + (slotsFree / perMinute) * 60_000
      : null;

  return { assignments: applied.length, firstTs, lastTs, elapsedMs, perMinute, projectedEndTs };
}

// ---------------------------------------------------------------------------
// Il quadro completo
// ---------------------------------------------------------------------------

export interface AuctionStats {
  readonly market: Market;
  readonly byRole: readonly RoleMarket[];
  readonly teams: readonly TeamStats[];
  readonly mix: StarterMix;
  readonly pace: Pace;
  /** Colpi piu' cari della lega, prezzo desc. */
  readonly topDeals: readonly Deal[];
  /** Chi ha pagato di piu' sopra la propria `QUOT.`, rapporto desc. */
  readonly topOverQuot: readonly Deal[];
  /** Nessun acquisto: la UI mostra il vuoto invece di dodici zeri. */
  readonly empty: boolean;
}

export interface StatsInput {
  readonly state: LeagueState;
  readonly config: LeagueConfig;
  readonly players: PlayerIndex;
  readonly lineups: LineupIndex;
  readonly events: readonly AssignmentEvent[];
  /** Quanti colpi mostrare nelle classifiche. */
  readonly top?: number;
}

export function computeAuctionStats({
  state,
  config,
  players,
  lineups,
  events,
  top = 5,
}: StatsInput): AuctionStats {
  const teams = config.teams.map((t) => statsForTeam(teamState(state, t.id), players, lineups));

  const totalCredits = config.creditsPerTeam * config.teams.length;
  const slotsPerTeam = PHASE_ORDER.reduce((acc, r) => acc + config.slotsByRole[r], 0);
  const totalSlots = slotsPerTeam * config.teams.length;
  const slotsFilled = state.slotsFilled;
  const creditsSpent = state.creditsSpent;

  const spentShare = share(creditsSpent, totalCredits);
  const filledShare = share(slotsFilled, totalSlots);

  const market: Market = {
    creditsSpent,
    totalCredits,
    slotsFilled,
    totalSlots,
    spentShare,
    filledShare,
    heatIndex: filledShare > 0 ? spentShare / filledShare : null,
    avgPrice: share(creditsSpent, slotsFilled),
    residualPerSlot: share(totalCredits - creditsSpent, totalSlots - slotsFilled),
  };

  const deals: Deal[] = [];
  const counts = emptyMix();
  for (const owned of Object.values(state.assignmentByPlayerId)) {
    const deal = dealFrom(owned.playerId, owned.teamId, owned.price, players, lineups);
    if (deal === null) {
      counts.NON_INSERITO += 1;
      continue;
    }
    counts[deal.status] += 1;
    deals.push(deal);
  }

  const byRole: RoleMarket[] = PHASE_ORDER.map((role) => {
    let spent = 0;
    let filled = 0;
    let roleTop: Deal | null = null;
    for (const deal of deals) {
      if (deal.role !== role) continue;
      spent += deal.price;
      filled += 1;
      if (roleTop === null || deal.price > roleTop.price) roleTop = deal;
    }
    return {
      role,
      spent,
      filled,
      totalSlots: config.slotsByRole[role] * config.teams.length,
      avgPrice: share(spent, filled),
      shareOfSpend: share(spent, creditsSpent),
      top: roleTop,
    };
  });

  const topDeals = [...deals].sort((a, b) => b.price - a.price || a.name.localeCompare(b.name, 'it'));
  const topOverQuot = [...deals].sort(
    (a, b) => b.overQuot - a.overQuot || b.price - a.price || a.name.localeCompare(b.name, 'it'),
  );

  return {
    market,
    byRole,
    teams,
    mix: mixFrom(counts),
    pace: computePace(events, totalSlots - slotsFilled),
    topDeals: topDeals.slice(0, top),
    topOverQuot: topOverQuot.slice(0, top),
    empty: slotsFilled === 0,
  };
}

// ---------------------------------------------------------------------------
// Ordinamenti della tabella squadre
// ---------------------------------------------------------------------------

export type TeamSortKey =
  | 'teamId'
  | 'credits'
  | 'spent'
  | 'slotsFilled'
  | 'maxBid'
  | 'perFreeSlot'
  | 'avgPrice'
  | 'starterShare';

/** Comparatore per la tabella squadre: numeri desc, sigla asc. */
export function compareTeamStats(key: TeamSortKey): (a: TeamStats, b: TeamStats) => number {
  if (key === 'teamId') return (a, b) => a.teamId.localeCompare(b.teamId, 'it');
  if (key === 'starterShare') {
    return (a, b) => b.mix.starterShare - a.mix.starterShare || a.teamId.localeCompare(b.teamId, 'it');
  }
  return (a, b) => (b[key] as number) - (a[key] as number) || a.teamId.localeCompare(b.teamId, 'it');
}

/**
 * Un giocatore per ogni club di Serie A che la squadra non ha ancora toccato?
 * No: qui interessa il contrario, la concentrazione. Quanti club distinti
 * compongono la rosa — poche squadre significa rotazioni e turni infrasettimanali
 * che si sovrappongono.
 */
export function distinctClubs(team: TeamState, players: PlayerIndex): number {
  const clubs = new Set<string>();
  for (const entry of team.roster) {
    const player = players.get(entry.playerId);
    if (player !== undefined) clubs.add(player.team);
  }
  return clubs.size;
}

/** Giocatori assegnati che appartengono a un dato club di Serie A. */
export function assignedFromClub(state: LeagueState, players: PlayerIndex, club: string): Player[] {
  const out: Player[] = [];
  for (const owned of Object.values(state.assignmentByPlayerId)) {
    const player = players.get(owned.playerId);
    if (player !== undefined && player.team === club) out.push(player);
  }
  return out.sort((a, b) => b.quot - a.quot || a.id - b.id);
}
