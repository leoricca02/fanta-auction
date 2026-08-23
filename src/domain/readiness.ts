import type { Lineup, Objectives, Player, PlayerNote, Role } from './types';
import { PHASE_ORDER } from './types';
import type { LineupIndex } from './lineup';
import { lineupCompletion } from './lineup';

/**
 * "Sei pronto?" — la checklist prima dell'asta (§5.5).
 *
 * Il lavoro di questo progetto non si perde per un errore: si perde per
 * un'omissione. Tre club senza formazione fra i venti non si notano finche' non
 * te ne chiamano uno, e allora il badge dice `non inserita` proprio nei cinque
 * secondi in cui non puoi rimediare. Un backup vecchio di dieci giorni non da'
 * nessun segnale finche' non serve.
 *
 * Percio' la checklist e' fatta di controlli **verificabili**, non di consigli:
 * ogni voce e' una domanda con risposta si'/no e un numero accanto, e dice cosa
 * fare quando la risposta e' no.
 */

export type CheckLevel = 'ok' | 'warn' | 'todo';

export interface Check {
  readonly id: string;
  readonly label: string;
  readonly level: CheckLevel;
  /** Riga di dettaglio con i numeri: e' quella che si legge davvero. */
  readonly detail: string;
  /** Cosa fare adesso. Vuoto quando non c'e' niente da fare. */
  readonly action: string;
}

export interface ReadinessInput {
  readonly players: readonly Player[];
  readonly teamsConfigured: number;
  readonly hasUserTeam: boolean;
  readonly lineups: readonly Lineup[];
  readonly notes: readonly PlayerNote[];
  readonly objectives: Objectives;
  readonly lastBackupAt: number | null;
  readonly now: number;
  /** Quota di slot compilati sotto cui una formazione conta come incompleta. */
  readonly lineupThreshold?: number;
}

export interface Readiness {
  readonly checks: readonly Check[];
  /** Quante voci sono a posto. */
  readonly done: number;
  readonly total: number;
  /** `true` se nessuna voce e' `todo`: gli avvisi non bloccano. */
  readonly ready: boolean;
  /** Club di Serie A senza formazione, in ordine alfabetico. */
  readonly missingLineups: readonly string[];
  /** Club con formazione avviata ma sotto la soglia. */
  readonly incompleteLineups: readonly string[];
}

const DAY = 24 * 60 * 60 * 1000;

/** Club di Serie A presenti nel listone. */
export function clubsInListone(players: readonly Player[]): string[] {
  return [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b, 'it'));
}

/** Ruoli in cui il listone non ha abbastanza giocatori per riempire la lega. */
export function rolesTooThin(
  players: readonly Player[],
  slotsByRole: Readonly<Record<Role, number>>,
  teamCount: number,
): Role[] {
  const have: Record<Role, number> = { P: 0, D: 0, C: 0, A: 0 };
  for (const p of players) have[p.role] += 1;
  return PHASE_ORDER.filter((role) => have[role] < slotsByRole[role] * teamCount);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

export function computeReadiness(input: ReadinessInput): Readiness {
  const {
    players,
    teamsConfigured,
    hasUserTeam,
    lineups,
    notes,
    objectives,
    lastBackupAt,
    now,
    lineupThreshold = 0.7,
  } = input;

  const checks: Check[] = [];

  // 1 — il listone
  checks.push(
    players.length === 0
      ? {
          id: 'listone',
          label: 'Listone caricato',
          level: 'todo',
          detail: 'Nessun giocatore in archivio.',
          action: 'Impostazioni → Listone: carica lista_calciatori_classic.xlsx.',
        }
      : {
          id: 'listone',
          label: 'Listone caricato',
          level: 'ok',
          detail: `${players.length} giocatori, ${clubsInListone(players).length} club.`,
          action: '',
        },
  );

  // 2 — i partecipanti
  const teamsOk = teamsConfigured >= 2 && hasUserTeam;
  checks.push({
    id: 'partecipanti',
    label: 'Partecipanti e sigle',
    level: teamsOk ? 'ok' : 'todo',
    detail: hasUserTeam
      ? `${teamsConfigured} squadre, la tua e' impostata.`
      : `${teamsConfigured} squadre, nessuna marcata come la tua.`,
    action: teamsOk ? '' : 'Impostazioni → Partecipanti: nomi, sigle vere, e quale squadra sei tu.',
  });

  // 3 — le formazioni, la voce che vale i giorni di lavoro
  const clubs = clubsInListone(players);
  const index: LineupIndex = new Map(lineups.map((l) => [l.teamCode, l]));
  const missingLineups: string[] = [];
  const incompleteLineups: string[] = [];
  for (const club of clubs) {
    const completion = lineupCompletion(club, index);
    if (!completion.hasLineup || completion.filledSlots === 0) {
      missingLineups.push(club);
      continue;
    }
    if (completion.ratio < lineupThreshold) incompleteLineups.push(club);
  }

  const lineupLevel: CheckLevel =
    clubs.length === 0 ? 'todo' : missingLineups.length > 0 ? 'todo' : incompleteLineups.length > 0 ? 'warn' : 'ok';

  checks.push({
    id: 'formazioni',
    label: 'Formazioni delle squadre di Serie A',
    level: lineupLevel,
    detail:
      clubs.length === 0
        ? 'Senza listone non ci sono club da compilare.'
        : `${clubs.length - missingLineups.length} club su ${clubs.length} compilati` +
          (incompleteLineups.length > 0
            ? `, ${incompleteLineups.length} sotto il ${Math.round(lineupThreshold * 100)}%.`
            : '.'),
    action:
      missingLineups.length > 0
        ? `Mancano del tutto: ${missingLineups.join(', ')}.`
        : incompleteLineups.length > 0
          ? `Da finire: ${incompleteLineups.join(', ')}.`
          : '',
  });

  // 4 — obiettivi
  const targets = objectives.targets.length;
  const noteById = new Map(notes.filter((n) => !n.archived).map((n) => [n.playerId, n]));
  const targetsWithoutNote = objectives.targets.filter(
    (t) => t.note.trim() === '' && (noteById.get(t.playerId)?.text ?? '').trim() === '',
  ).length;

  checks.push({
    id: 'obiettivi',
    label: 'Obiettivi',
    level: targets === 0 ? 'warn' : targetsWithoutNote > 0 ? 'warn' : 'ok',
    detail:
      targets === 0
        ? 'Nessun target in lista.'
        : `${plural(targets, 'target', 'target')}, ${targetsWithoutNote} senza nota.`,
    action:
      targets === 0
        ? 'Obiettivi: metti i nomi su cui vuoi arrivare preparato.'
        : targetsWithoutNote > 0
          ? 'Una riga di nota per target: e’ quella che compare inline durante la chiamata.'
          : '',
  });

  // 5 — appunti
  const liveNotes = notes.filter((n) => !n.archived && n.text.trim() !== '').length;
  checks.push({
    id: 'appunti',
    label: 'Appunti sui giocatori',
    level: liveNotes === 0 ? 'warn' : 'ok',
    detail:
      liveNotes === 0
        ? 'Nessun appunto scritto.'
        : `${plural(liveNotes, 'giocatore annotato', 'giocatori annotati')}.`,
    action: liveNotes === 0 ? 'Gli appunti sono l’unica cosa che il tabellone non ha.' : '',
  });

  // 6 — il backup, il rischio numero uno
  const ageMs = lastBackupAt === null ? null : now - lastBackupAt;
  const backupLevel: CheckLevel =
    ageMs === null ? 'todo' : ageMs > 7 * DAY ? 'todo' : ageMs > DAY ? 'warn' : 'ok';
  checks.push({
    id: 'backup',
    label: 'Backup scaricato',
    level: backupLevel,
    detail:
      ageMs === null
        ? 'Mai scaricato: una pulizia del browser azzera tutto.'
        : `Ultimo ${describeAge(ageMs)}.`,
    action: backupLevel === 'ok' ? '' : 'Impostazioni → Backup: scarica il .json adesso.',
  });

  const done = checks.filter((c) => c.level === 'ok').length;
  return {
    checks,
    done,
    total: checks.length,
    ready: checks.every((c) => c.level !== 'todo'),
    missingLineups,
    incompleteLineups,
  };
}

/** Eta' in parole: "oggi", "ieri", "12 giorni fa". */
export function describeAge(ageMs: number): string {
  const days = Math.floor(ageMs / DAY);
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  return `${days} giorni fa`;
}
