import type { Lineup, Player, UserData } from './types';
import type { LeagueState } from './reducer';
import { applyNotePatch } from './notes';

/**
 * Re-import del listone (PRD §2).
 *
 * Il mercato chiude il 1° settembre e il listone va riscaricato. `Player`
 * appartiene al listone ed e' sostituibile; i dati utente sono agganciati a `#`,
 * che e' l'ID stabile di Fantacalcio.it, e non vengono mai toccati da un import.
 *
 * Ma "non toccati" non basta: un giocatore che esce dalla Serie A resta dentro
 * le formazioni come id che non corrisponde piu' a nessuno, e uno che cambia
 * squadra resta schierato nella formazione del club sbagliato. Il diff serve a
 * vedere queste cose **prima** di applicarle, e il piano di import a sistemarle
 * in modo dichiarato invece che in silenzio.
 */

/** Soglia oltre la quale una variazione di quotazione smette di essere rumore. */
export const QUOT_CHANGE_THRESHOLD_PCT = 20;

export interface TeamChange {
  readonly player: Player;
  readonly from: string;
  readonly to: string;
}

export interface QuotChange {
  readonly player: Player;
  readonly from: number;
  readonly to: number;
  /** Variazione percentuale, con segno. */
  readonly deltaPct: number;
}

export interface ListoneDiff {
  /** Nuovi in lista. */
  readonly added: readonly Player[];
  /** Usciti dalla Serie A: presenti prima, assenti adesso. */
  readonly removed: readonly Player[];
  readonly teamChanged: readonly TeamChange[];
  /** Solo le variazioni oltre la soglia: sotto e' rumore. */
  readonly quotChanged: readonly QuotChange[];
  /** Giocatori presenti in entrambi i listoni. */
  readonly kept: number;
}

/**
 * Confronta due listoni per `#`.
 *
 * `teamChanged` e `quotChanged` portano il giocatore **nuovo**: e' quello che
 * resta dopo l'import, e la UI deve mostrare dove va a finire, non da dove
 * viene.
 */
export function diffListone(
  current: readonly Player[],
  next: readonly Player[],
): ListoneDiff {
  const before = new Map(current.map((p) => [p.id, p]));
  const after = new Map(next.map((p) => [p.id, p]));

  const added = next.filter((p) => !before.has(p.id));
  const removed = current.filter((p) => !after.has(p.id));

  const teamChanged: TeamChange[] = [];
  const quotChanged: QuotChange[] = [];
  let kept = 0;

  for (const player of next) {
    const old = before.get(player.id);
    if (old === undefined) continue;
    kept += 1;

    if (old.team !== player.team) {
      teamChanged.push({ player, from: old.team, to: player.team });
    }
    // Una quotazione che parte da 0 non ha variazione percentuale definita:
    // la si tratta come un salto pieno, che e' anche il caso piu' vistoso.
    const deltaPct =
      old.quot === 0 ? (player.quot === 0 ? 0 : 100) : ((player.quot - old.quot) / old.quot) * 100;
    if (Math.abs(deltaPct) >= QUOT_CHANGE_THRESHOLD_PCT) {
      quotChanged.push({ player, from: old.quot, to: player.quot, deltaPct });
    }
  }

  return { added, removed, teamChanged, quotChanged, kept };
}

// ---------------------------------------------------------------------------
// Impatto sui dati utente
// ---------------------------------------------------------------------------

/** Perche' la sparizione di un giocatore ti riguarda. */
export type DataReason = 'nota' | 'tag' | 'obiettivo' | 'formazione' | 'aspettativa';

export interface AffectedPlayer {
  readonly player: Player;
  /** Vuoto significa che il giocatore non compare in nessun tuo dato. */
  readonly reasons: readonly DataReason[];
}

export interface ListoneImpact {
  /** Usciti su cui avevi lavorato: e' il tuo studio a essere invalidato. */
  readonly removedWithData: readonly AffectedPlayer[];
  /** Usciti che non ti riguardavano. */
  readonly removedCount: number;
  /**
   * Cambi squadra di giocatori che hai schierato: restano negli slot del club
   * sbagliato finche' non li togli.
   */
  readonly teamChangedInLineup: readonly TeamChange[];
  /** Formazioni che perdono almeno un giocatore. */
  readonly lineupsTouched: readonly string[];
  /** Slot che resteranno vuoti dopo la pulizia. */
  readonly slotsEmptied: number;
}

function reasonsFor(playerId: number, data: UserData): DataReason[] {
  const reasons: DataReason[] = [];
  const note = data.playerNotes.find((n) => n.playerId === playerId);
  if (note !== undefined && note.text.trim() !== '') reasons.push('nota');
  if (note?.tag != null) reasons.push('tag');
  if (data.objectives.targets.some((t) => t.playerId === playerId)) reasons.push('obiettivo');
  if (data.lineups.some((l) => l.slots.some((s) => s.candidates.includes(playerId)))) {
    reasons.push('formazione');
  }
  if (data.expectations.some((e) => e.playerId === playerId)) reasons.push('aspettativa');
  return reasons;
}

export function assessImpact(diff: ListoneDiff, data: UserData): ListoneImpact {
  const removedWithData: AffectedPlayer[] = [];
  for (const player of diff.removed) {
    const reasons = reasonsFor(player.id, data);
    if (reasons.length > 0) removedWithData.push({ player, reasons });
  }

  const teamChangedInLineup = diff.teamChanged.filter((change) =>
    data.lineups.some(
      (l) =>
        l.teamCode === change.from &&
        l.slots.some((s) => s.candidates.includes(change.player.id)),
    ),
  );

  const toRemove = new Set<number>([
    ...diff.removed.map((p) => p.id),
    ...teamChangedInLineup.map((c) => c.player.id),
  ]);

  const lineupsTouched: string[] = [];
  let slotsEmptied = 0;
  for (const lineup of data.lineups) {
    let touched = false;
    for (const slot of lineup.slots) {
      const remaining = slot.candidates.filter((id) => !toRemove.has(id));
      if (remaining.length === slot.candidates.length) continue;
      touched = true;
      if (remaining.length === 0 && slot.candidates.length > 0) slotsEmptied += 1;
    }
    if (touched) lineupsTouched.push(lineup.teamCode);
  }

  return {
    removedWithData,
    removedCount: diff.removed.length,
    teamChangedInLineup,
    lineupsTouched,
    slotsEmptied,
  };
}

// ---------------------------------------------------------------------------
// Applicazione
// ---------------------------------------------------------------------------

export type ImportBlock = { readonly reason: 'ACTIVE_ASSIGNMENTS'; readonly count: number };

/**
 * §2 — il re-import e' **bloccato** se esiste anche una sola assegnazione
 * attiva: cambiare il listone ad asta iniziata invaliderebbe l'event log, e
 * nessuna conferma vale il rischio di perdere gli acquisti gia' battuti.
 */
export function blockingReason(state: LeagueState): ImportBlock | null {
  const count = state.appliedEventIds.length;
  return count > 0 ? { reason: 'ACTIVE_ASSIGNMENTS', count } : null;
}

function withoutPlayers(lineup: Lineup, ids: ReadonlySet<number>, now: number): Lineup {
  let changed = false;
  const slots = lineup.slots.map((slot) => {
    const candidates = slot.candidates.filter((id) => !ids.has(id));
    if (candidates.length === slot.candidates.length) return slot;
    changed = true;
    return { ...slot, candidates };
  });
  return changed ? { ...lineup, slots, updatedAt: now } : lineup;
}

/**
 * Dati utente come resteranno dopo il re-import.
 *
 * - le note dei giocatori usciti si **archiviano**, non si cancellano: un
 *   giocatore puo' rientrare, e una cancellazione e' irrecuperabile (§2);
 * - gli usciti escono dalle formazioni, dove sarebbero id fantasma;
 * - chi ha cambiato squadra esce dalla formazione del **vecchio** club, dove
 *   non gioca piu';
 * - obiettivi e testo libero non si toccano: sono il tuo piano, non il listone.
 */
export function applyListoneChange(
  data: UserData,
  diff: ListoneDiff,
  impact: ListoneImpact,
  now: number,
): UserData {
  const removedIds = new Set(diff.removed.map((p) => p.id));
  const fromLineups = new Set<number>([
    ...removedIds,
    ...impact.teamChangedInLineup.map((c) => c.player.id),
  ]);

  const playerNotes = data.playerNotes.map((note) =>
    removedIds.has(note.playerId) && !note.archived
      ? applyNotePatch(note, { archived: true }, note.playerId, now)
      : note,
  );

  return {
    ...data,
    playerNotes,
    lineups: data.lineups.map((lineup) => withoutPlayers(lineup, fromLineups, now)),
  };
}

export interface ListoneImportPlan {
  readonly diff: ListoneDiff;
  readonly impact: ListoneImpact;
  /** Non `null` significa che l'import non si puo' applicare. */
  readonly blocked: ImportBlock | null;
  /** Dati utente risultanti. Non ancora applicati. */
  readonly nextUserData: UserData;
  /** `true` se non c'era ancora un listone: non serve confermare niente. */
  readonly firstImport: boolean;
}

export function planListoneImport(args: {
  readonly current: readonly Player[];
  readonly next: readonly Player[];
  readonly data: UserData;
  readonly state: LeagueState;
  readonly now?: number;
}): ListoneImportPlan {
  const now = args.now ?? Date.now();
  const diff = diffListone(args.current, args.next);
  const impact = assessImpact(diff, args.data);

  return {
    diff,
    impact,
    blocked: blockingReason(args.state),
    nextUserData: applyListoneChange(args.data, diff, impact, now),
    firstImport: args.current.length === 0,
  };
}

/** `true` se il piano cambia qualcosa dei dati utente. */
export function planTouchesUserData(plan: ListoneImportPlan): boolean {
  return (
    plan.impact.removedWithData.length > 0 ||
    plan.impact.teamChangedInLineup.length > 0 ||
    plan.impact.lineupsTouched.length > 0
  );
}
