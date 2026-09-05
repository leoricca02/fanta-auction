import { beforeEach, describe, expect, it } from 'vitest';

import {
  BACKUP_FORMAT,
  BACKUP_MAX_AGE_MS,
  USER_DATA_SCHEMA_VERSION,
  backupFilename,
  emptyObjectives,
  emptyUserData,
  exportUserData,
  importUserData,
  serializeUserData,
  shouldAutoBackup,
} from './backup';
import type { ImportResult } from './backup';
import type { LeagueConfig, UserData } from './types';
import { reduce } from './reducer';
import { makeLeagueConfig, makeTeams } from './config';
import {
  makeEvent,
  makeLineup,
  makeObjectives,
  makePlayer,
  makePlayerNote,
  makeSlot,
  makeTeamNote,
  makeUserData,
  resetEventCounter,
} from '../test/fixtures';

beforeEach(() => resetEventCounter());

const NOW = 1_760_000_000_000;
const OLD = NOW - 1_000_000;
const NEWER = NOW + 1_000_000;

/**
 * Lega di prova con un listone piccolo ma coerente: serve al dry-run del
 * reducer, che senza giocatori scarterebbe tutto per UNKNOWN_PLAYER.
 */
const CONFIG: LeagueConfig = makeLeagueConfig(
  [
    makePlayer({ id: 1, role: 'P', quot: 16, team: 'Inter' }),
    makePlayer({ id: 2, role: 'D', quot: 12, team: 'Inter' }),
    makePlayer({ id: 3, role: 'D', quot: 9, team: 'Inter' }),
    makePlayer({ id: 4, role: 'C', quot: 14, team: 'Inter' }),
    makePlayer({ id: 5, role: 'C', quot: 11, team: 'Milan' }),
    makePlayer({ id: 6, role: 'A', quot: 20, team: 'Milan' }),
    makePlayer({ id: 7, role: 'A', quot: 18, team: 'Milan' }),
    makePlayer({ id: 8, role: 'D', quot: 7, team: 'Roma' }),
    makePlayer({ id: 9, role: 'C', quot: 6, team: 'Roma' }),
    makePlayer({ id: 10, role: 'P', quot: 8, team: 'Milan' }),
    makePlayer({ id: 50, role: 'P', quot: 5, team: 'Roma' }),
  ],
  { teams: makeTeams([['Leo', 'leo'], ['Due', 'sq2'], ['Tre', 'sq3']]) },
);

/** Dati utente pieni: una di ogni cosa che il backup deve trasportare. */
function populated(): UserData {
  return makeUserData({
    lineups: [
      makeLineup(
        'Inter',
        [
          makeSlot('por', [1], 'POR', 'sempre lui'),
          makeSlot('dc1', [2, 3], 'DC', 'ballottaggio aperto'),
        ],
        '4-3-3',
        NOW,
      ),
      makeLineup('Milan', [makeSlot('por', [10], 'POR')], '3-5-2', NOW - 5),
    ],
    playerNotes: [
      makePlayerNote(1, 'para tutto', 'obiettivo', false, NOW),
      makePlayerNote(2, 'rientra dopo la sosta', 'alternativa', false, NOW),
      makePlayerNote(3, 'fuori rosa', 'evita', true, NOW),
    ],
    teamNotes: [
      makeTeamNote('Inter', 'gioca a tre dietro', NOW),
      makeTeamNote('Milan', '', NOW),
    ],
    expectations: [
      { playerId: 2, matches: 34, goals: 4, assists: 6, yellows: 7, reds: 0, updatedAt: NOW },
      { playerId: 3, matches: 28, goals: 1, assists: 1, yellows: 5, reds: 1, updatedAt: NOW },
    ],
    objectives: makeObjectives(
      'prendo un portiere titolare e due punte',
      [
        { playerId: 1, priority: 1, note: 'prioritario' },
        { playerId: 10, priority: 2, note: 'ripiego' },
      ],
      NOW,
    ),
    events: [
      makeEvent({ id: 'ev1', playerId: 1, teamId: 'leo', price: 30, phase: 'P', ts: NOW - 100 }),
      makeEvent({ id: 'ev2', playerId: 2, teamId: 'sq2', price: 12, phase: 'D', ts: NOW - 50 }),
    ],
  });
}

function unwrap(result: ImportResult): UserData {
  if (!result.ok) throw new Error(`Import fallito: ${result.error.reason} — ${result.error.detail}`);
  return result.data;
}

function envelope(data: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    app: BACKUP_FORMAT,
    schemaVersion: USER_DATA_SCHEMA_VERSION,
    exportedAt: NOW,
    data,
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

describe('§3.1 — export', () => {
  it('produce una busta con formato, versione di schema e timestamp', () => {
    const backup = exportUserData(populated(), NOW);
    expect(backup.app).toBe(BACKUP_FORMAT);
    expect(backup.schemaVersion).toBe(USER_DATA_SCHEMA_VERSION);
    expect(backup.exportedAt).toBe(NOW);
  });

  it('contiene tutte e sei le collezioni di dati utente', () => {
    const backup = exportUserData(populated(), NOW);
    expect(Object.keys(backup.data).sort()).toEqual([
      'events',
      'expectations',
      'lineups',
      'objectives',
      'playerNotes',
      'teamNotes',
    ]);
    expect(backup.data.lineups).toHaveLength(2);
    expect(backup.data.playerNotes).toHaveLength(3);
    expect(backup.data.teamNotes).toHaveLength(2);
    expect(backup.data.expectations).toHaveLength(2);
    expect(backup.data.events).toHaveLength(2);
    expect(backup.data.objectives.targets).toHaveLength(2);
  });

  it('trasporta gli updatedAt di ogni record', () => {
    const backup = exportUserData(populated(), NOW);
    expect(backup.data.objectives.updatedAt).toBe(NOW);
    expect(backup.data.playerNotes[0]?.updatedAt).toBe(NOW);
    expect(backup.data.teamNotes[0]?.updatedAt).toBe(NOW);
    expect(backup.data.lineups[1]?.updatedAt).toBe(NOW - 5);
  });

  it('copia in profondita: mutare il backup non tocca lo stato di partenza', () => {
    const data = populated();
    const backup = exportUserData(data, NOW);
    (backup.data.lineups[0] as { module: string }).module = 'MANOMESSO';
    (backup.data.lineups[0]?.slots[0]?.candidates as number[]).push(999);
    expect(data.lineups[0]?.module).toBe('4-3-3');
    expect(data.lineups[0]?.slots[0]?.candidates).toEqual([1]);
  });

  it('serializeUserData produce JSON rileggibile', () => {
    const json = serializeUserData(populated(), NOW);
    expect(json).toContain('"app": "fanta-auction-assistant"');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('backupFilename e ordinabile cronologicamente', () => {
    expect(backupFilename(NOW)).toMatch(/^fanta-auction-backup-[\dT-]+\.json$/);
    expect(backupFilename(NOW) < backupFilename(NOW + 86_400_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('§3.1 — round-trip', () => {
  it('export -> import su store vuoto restituisce lo stato identico', () => {
    const data = populated();
    const restored = unwrap(
      importUserData(emptyUserData(), serializeUserData(data, NOW), CONFIG),
    );
    expect(restored).toEqual(data);
  });

  it('regge anche passando l oggetto invece della stringa', () => {
    const data = populated();
    const restored = unwrap(importUserData(emptyUserData(), exportUserData(data, NOW), CONFIG));
    expect(restored).toEqual(data);
  });

  it('e idempotente: reimportare lo stesso file non cambia nulla', () => {
    const data = populated();
    const json = serializeUserData(data, NOW);
    const once = unwrap(importUserData(emptyUserData(), json, CONFIG));
    const twice = unwrap(importUserData(once, json, CONFIG));
    expect(twice).toEqual(once);
  });

  it('sopravvive a un giro completo su dati vuoti', () => {
    const restored = unwrap(
      importUserData(emptyUserData(), serializeUserData(emptyUserData(), NOW), CONFIG),
    );
    expect(restored).toEqual(emptyUserData());
  });

  it('conserva l event log in modo che il reducer ripieghi lo stesso stato', () => {
    const data = makeUserData({
      events: [
        makeEvent({ id: 'a', playerId: 6, teamId: 'leo', price: 140, phase: 'A' }),
        makeEvent({ id: 'b', playerId: 2, teamId: 'sq2', price: 90, phase: 'D' }),
      ],
    });
    const restored = unwrap(
      importUserData(emptyUserData(), serializeUserData(data, NOW), CONFIG),
    );
    expect(reduce(restored.events, CONFIG)).toEqual(reduce(data.events, CONFIG));
  });

  it('conserva i campi che JSON tende a perdere: tag null, stringhe vuote, archived', () => {
    const data = makeUserData({
      playerNotes: [
        makePlayerNote(5, '', null, false, NOW),
        makePlayerNote(6, 'x', 'evita', true, NOW),
      ],
      teamNotes: [makeTeamNote('Como', '', NOW)],
      objectives: makeObjectives('', [], NOW),
    });
    const restored = unwrap(
      importUserData(emptyUserData(), serializeUserData(data, NOW), CONFIG),
    );
    expect(restored.playerNotes[0]).toEqual({
      playerId: 5,
      text: '',
      tag: null,
      archived: false,
      updatedAt: NOW,
    });
    expect(restored.playerNotes[1]?.archived).toBe(true);
    expect(restored.teamNotes[0]?.text).toBe('');
    expect(restored.objectives).toEqual(emptyObjectives(NOW));
  });
});

// ---------------------------------------------------------------------------
// Merge non distruttivo
// ---------------------------------------------------------------------------

describe('§3.1 — merge non distruttivo', () => {
  it('cio che esiste e non e nel file resta', () => {
    const current = makeUserData({
      lineups: [makeLineup('Roma', [makeSlot('por', [50], 'POR')], '4-3-3', NOW)],
      playerNotes: [makePlayerNote(50, 'nota locale', 'obiettivo', false, NOW)],
      teamNotes: [makeTeamNote('Roma', 'gioca a due punte', NOW)],
      events: [makeEvent({ id: 'locale', playerId: 50, teamId: 'leo', price: 5, phase: 'P' })],
    });
    const incoming = makeUserData({
      lineups: [makeLineup('Inter', [makeSlot('por', [1], 'POR')], '4-3-3', NOW)],
      playerNotes: [makePlayerNote(1, 'dal file', null, false, NOW)],
      teamNotes: [makeTeamNote('Inter', 'dal file', NOW)],
      events: [makeEvent({ id: 'dal-file', playerId: 1, teamId: 'sq2', price: 9, phase: 'P' })],
    });

    const merged = unwrap(importUserData(current, serializeUserData(incoming, NOW), CONFIG));
    expect(merged.lineups.map((l) => l.teamCode).sort()).toEqual(['Inter', 'Roma']);
    expect(merged.playerNotes.map((n) => n.playerId).sort()).toEqual([1, 50]);
    expect(merged.teamNotes.map((n) => n.teamCode).sort()).toEqual(['Inter', 'Roma']);
    expect(merged.events.map((e) => e.id).sort()).toEqual(['dal-file', 'locale']);
  });

  it('un import parziale non cancella le collezioni assenti dal file', () => {
    const current = populated();
    const result = importUserData(
      current,
      envelope({ playerNotes: [{ playerId: 1, text: 'aggiornata', updatedAt: NEWER }] }),
      CONFIG,
    );
    const merged = unwrap(result);

    expect(merged.lineups).toEqual(current.lineups);
    expect(merged.teamNotes).toEqual(current.teamNotes);
    expect(merged.objectives).toEqual(current.objectives);
    expect(merged.events).toEqual(current.events);
    expect(merged.playerNotes).toHaveLength(3);
    expect(merged.playerNotes.find((n) => n.playerId === 1)?.text).toBe('aggiornata');
    expect(merged.playerNotes.find((n) => n.playerId === 3)?.tag).toBe('evita');

    if (result.ok) {
      expect(result.summary.lineups.untouched).toBe(true);
      expect(result.summary.playerNotes).toEqual({
        added: 0,
        updated: 1,
        skipped: 0,
        untouched: false,
      });
      expect(result.summary.objectivesReplaced).toBe(false);
    }
  });

  it('un file con collezioni vuote esplicite non cancella nulla', () => {
    const current = populated();
    const merged = unwrap(
      importUserData(
        current,
        envelope({ lineups: [], playerNotes: [], teamNotes: [], events: [] }),
        CONFIG,
      ),
    );
    expect(merged.lineups).toEqual(current.lineups);
    expect(merged.playerNotes).toEqual(current.playerNotes);
    expect(merged.events).toEqual(current.events);
  });

  it('non muta lo stato corrente passato in ingresso', () => {
    const current = populated();
    const snapshot = JSON.parse(JSON.stringify(current)) as UserData;
    importUserData(current, serializeUserData(populated(), NOW), CONFIG);
    expect(current).toEqual(snapshot);
  });

  it('mantiene l ordine corrente e mette le novita in coda', () => {
    const current = makeUserData({
      playerNotes: [makePlayerNote(3), makePlayerNote(1), makePlayerNote(2)],
    });
    const incoming = makeUserData({
      playerNotes: [
        makePlayerNote(9, 'nuovo', null, false, NEWER),
        makePlayerNote(1, 'aggiornato', null, false, NEWER),
      ],
    });
    const merged = unwrap(importUserData(current, serializeUserData(incoming, NOW), CONFIG));
    expect(merged.playerNotes.map((n) => n.playerId)).toEqual([3, 1, 2, 9]);
  });

  it('riordina l event log per ts, poi per id: la piega dipende dall ordine', () => {
    const current = makeUserData({
      events: [makeEvent({ id: 'c', playerId: 3, teamId: 'leo', price: 1, phase: 'D', ts: 300 })],
    });
    const incoming = makeUserData({
      events: [
        makeEvent({ id: 'b', playerId: 2, teamId: 'leo', price: 1, phase: 'D', ts: 200 }),
        makeEvent({ id: 'a', playerId: 1, teamId: 'leo', price: 1, phase: 'P', ts: 100 }),
        makeEvent({ id: 'a2', playerId: 4, teamId: 'leo', price: 1, phase: 'C', ts: 100 }),
      ],
    });
    const merged = unwrap(importUserData(current, serializeUserData(incoming, NOW), CONFIG));
    expect(merged.events.map((e) => e.id)).toEqual(['a', 'a2', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Correzione 2 — updatedAt: vince il piu' recente, i saltati si dichiarano
// ---------------------------------------------------------------------------

describe('§3.1 — risoluzione per updatedAt', () => {
  it('un file piu recente sovrascrive', () => {
    const current = makeUserData({
      playerNotes: [makePlayerNote(1, 'vecchia', 'evita', false, OLD)],
      teamNotes: [makeTeamNote('Inter', 'vecchia', OLD)],
      lineups: [makeLineup('Inter', [makeSlot('por', [1])], '4-3-3', OLD)],
    });
    const incoming = makeUserData({
      playerNotes: [makePlayerNote(1, 'nuova', 'obiettivo', false, NEWER)],
      teamNotes: [makeTeamNote('Inter', 'nuova', NEWER)],
      lineups: [
        makeLineup('Inter', [makeSlot('por', [1]), makeSlot('pc', [6])], '3-5-2', NEWER),
      ],
    });

    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    const merged = unwrap(result);
    expect(merged.playerNotes[0]?.text).toBe('nuova');
    expect(merged.playerNotes[0]?.tag).toBe('obiettivo');
    expect(merged.teamNotes[0]?.text).toBe('nuova');
    expect(merged.lineups[0]?.module).toBe('3-5-2');
    expect(merged.lineups[0]?.slots).toHaveLength(2);
    if (result.ok) expect(result.summary.skippedRecords).toEqual([]);
  });

  it('un file piu VECCHIO non sovrascrive, e il record salta', () => {
    const current = makeUserData({
      playerNotes: [makePlayerNote(1, 'lavoro nuovo', 'obiettivo', false, NEWER)],
      teamNotes: [makeTeamNote('Inter', 'nota nuova', NEWER)],
      lineups: [makeLineup('Inter', [makeSlot('por', [1])], '4-3-3', NEWER)],
    });
    const incoming = makeUserData({
      playerNotes: [makePlayerNote(1, 'backup di ieri', null, false, OLD)],
      teamNotes: [makeTeamNote('Inter', 'nota di ieri', OLD)],
      lineups: [makeLineup('Inter', [], '3-5-2', OLD)],
    });

    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    const merged = unwrap(result);

    expect(merged.playerNotes[0]?.text).toBe('lavoro nuovo');
    expect(merged.teamNotes[0]?.text).toBe('nota nuova');
    expect(merged.lineups[0]?.module).toBe('4-3-3');

    if (result.ok) {
      expect(result.summary.playerNotes).toEqual({
        added: 0,
        updated: 0,
        skipped: 1,
        untouched: false,
      });
      expect(result.summary.skippedRecords).toEqual([
        { collection: 'lineups', key: 'Inter', currentUpdatedAt: NEWER, incomingUpdatedAt: OLD },
        { collection: 'playerNotes', key: '1', currentUpdatedAt: NEWER, incomingUpdatedAt: OLD },
        { collection: 'teamNotes', key: 'Inter', currentUpdatedAt: NEWER, incomingUpdatedAt: OLD },
      ]);
    }
  });

  it('a parita di updatedAt vince lo store: reimportare e un no-op', () => {
    const current = makeUserData({
      playerNotes: [makePlayerNote(1, 'corrente', 'evita', false, NOW)],
    });
    const incoming = makeUserData({
      playerNotes: [makePlayerNote(1, 'dal file', 'obiettivo', false, NOW)],
    });
    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    const merged = unwrap(result);
    expect(merged.playerNotes[0]?.text).toBe('corrente');
    if (result.ok) expect(result.summary.skippedRecords).toHaveLength(1);
  });

  it('un record senza updatedAt vale 0 e perde contro qualsiasi cosa esista', () => {
    const current = makeUserData({ playerNotes: [makePlayerNote(1, 'corrente', null, false, 1)] });
    const result = importUserData(
      current,
      envelope({ playerNotes: [{ playerId: 1, text: 'senza timestamp' }] }),
      CONFIG,
    );
    const merged = unwrap(result);
    expect(merged.playerNotes[0]?.text).toBe('corrente');
    if (result.ok) {
      expect(result.summary.skippedRecords[0]).toEqual({
        collection: 'playerNotes',
        key: '1',
        currentUpdatedAt: 1,
        incomingUpdatedAt: 0,
      });
    }
  });

  it('la regola si applica record per record, non a tutta la collezione', () => {
    const current = makeUserData({
      playerNotes: [
        makePlayerNote(1, 'corrente recente', null, false, NEWER),
        makePlayerNote(2, 'corrente vecchia', null, false, OLD),
      ],
    });
    const incoming = makeUserData({
      playerNotes: [
        makePlayerNote(1, 'file vecchio', null, false, OLD),
        makePlayerNote(2, 'file recente', null, false, NEWER),
        makePlayerNote(3, 'file nuovo record', null, false, OLD),
      ],
    });
    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    const merged = unwrap(result);
    expect(merged.playerNotes.find((n) => n.playerId === 1)?.text).toBe('corrente recente');
    expect(merged.playerNotes.find((n) => n.playerId === 2)?.text).toBe('file recente');
    expect(merged.playerNotes.find((n) => n.playerId === 3)?.text).toBe('file nuovo record');
    if (result.ok) {
      expect(result.summary.playerNotes).toEqual({
        added: 1,
        updated: 1,
        skipped: 1,
        untouched: false,
      });
    }
  });

  it('gli obiettivi seguono la stessa regola: piu recenti vincono', () => {
    const current = makeUserData({
      objectives: makeObjectives('piano corrente', [{ playerId: 1, priority: 1, note: 'a' }], NOW),
    });

    const newer = importUserData(
      current,
      serializeUserData(makeUserData({ objectives: makeObjectives('piano nuovo', [], NEWER) }), NOW),
      CONFIG,
    );
    expect(unwrap(newer).objectives.text).toBe('piano nuovo');
    if (newer.ok) expect(newer.summary.objectivesReplaced).toBe(true);

    const older = importUserData(
      current,
      serializeUserData(
        makeUserData({ objectives: makeObjectives('piano di ieri', [], OLD) }),
        NOW,
      ),
      CONFIG,
    );
    expect(unwrap(older).objectives.text).toBe('piano corrente');
    if (older.ok) {
      expect(older.summary.objectivesReplaced).toBe(false);
      expect(older.summary.skippedRecords).toEqual([
        {
          collection: 'objectives',
          key: 'objectives',
          currentUpdatedAt: NOW,
          incomingUpdatedAt: OLD,
        },
      ]);
    }
  });

  it('obiettivi assenti dal file restano quelli correnti, senza finire tra i saltati', () => {
    const current = makeUserData({ objectives: makeObjectives('piano corrente', [], NOW) });
    const result = importUserData(current, envelope({}), CONFIG);
    expect(unwrap(result).objectives).toEqual(current.objectives);
    if (result.ok) {
      expect(result.summary.objectivesReplaced).toBe(false);
      expect(result.summary.skippedRecords).toEqual([]);
    }
  });

  it('gli eventi non seguono updatedAt: sono immutabili, si fondono per id', () => {
    const current = makeUserData({
      events: [makeEvent({ id: 'ev1', playerId: 1, teamId: 'leo', price: 30, phase: 'P' })],
    });
    const incoming = makeUserData({
      events: [makeEvent({ id: 'ev1', playerId: 1, teamId: 'leo', price: 30, phase: 'P' })],
    });
    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    if (result.ok) {
      expect(result.summary.events).toEqual({
        added: 0,
        updated: 1,
        skipped: 0,
        untouched: false,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Correzione 1 — dry-run del reducer prima di applicare
// ---------------------------------------------------------------------------

describe('§5.5 — le aspettative nel backup', () => {
  const rows = [
    { playerId: 2, matches: 34, goals: 4, assists: 6, yellows: 7, reds: 0, updatedAt: NOW },
    { playerId: 3, matches: 28, goals: 1, assists: 1, yellows: 5, reds: 1, updatedAt: NOW },
  ];

  it('sopravvivono a un giro completo di export e import', () => {
    const json = serializeUserData(makeUserData({ expectations: rows }), NOW);
    const result = importUserData(emptyUserData(), json, CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expectations).toEqual(rows);
    expect(result.summary.expectations.added).toBe(2);
  });

  it('a parita di giocatore vince la riga piu recente, non il file', () => {
    // Il caso vero: hai rivisto Yildiz stamattina e poi importi il backup di
    // ieri sera. La revisione di stamattina deve restare.
    const current = makeUserData({
      expectations: [{ ...(rows[0] as (typeof rows)[number]), goals: 12, updatedAt: NOW + 1000 }],
    });
    const file = serializeUserData(makeUserData({ expectations: rows }), NOW);
    const result = importUserData(current, file, CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expectations[0]?.goals).toBe(12);
    expect(result.summary.expectations.skipped).toBe(1);
    expect(result.summary.skippedRecords).toContainEqual({
      collection: 'expectations',
      key: '2',
      currentUpdatedAt: NOW + 1000,
      incomingUpdatedAt: NOW,
    });
  });

  it('una collezione assente lascia intatte le aspettative gia inserite', () => {
    // Un backup scritto prima che la feature esistesse non deve cancellarle.
    const current = makeUserData({ expectations: rows });
    const result = importUserData(current, envelope({ lineups: [] }), CONFIG);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.expectations).toEqual(rows);
    expect(result.summary.expectations.untouched).toBe(true);
  });

  it('rifiuta contatori negativi o con la virgola', () => {
    // Mezzo gol nel file diventerebbe mezzo gol nel tasso di reparto, e da li
    // nel prezzo consigliato di ogni altro giocatore.
    for (const bad of [{ goals: -1 }, { matches: 2.5 }]) {
      const result = importUserData(
        emptyUserData(),
        envelope({ expectations: [{ ...rows[0], ...bad }] }),
        CONFIG,
      );
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.reason).toBe('INVALID_PAYLOAD');
    }
  });
});

describe('§3.1 — dry-run dei conflitti prima di applicare', () => {
  it('un import pulito non segnala conflitti', () => {
    const result = importUserData(emptyUserData(), serializeUserData(populated(), NOW), CONFIG);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.conflicts.rejectedCount).toBe(0);
      expect(result.conflicts.appliedCount).toBe(2);
      expect(result.conflicts.rejected).toEqual([]);
      expect(result.conflicts.newlyRejected).toEqual([]);
    }
  });

  it('dichiara quanti eventi verranno scartati, PRIMA di applicare', () => {
    // Stesso giocatore assegnato a due squadre diverse, con id evento diversi:
    // il merge non puo' scartarne nessuno, il reducer ne applica uno solo.
    const current = makeUserData({
      events: [
        makeEvent({ id: 'mio', playerId: 6, teamId: 'leo', price: 100, phase: 'A', ts: 1000 }),
      ],
    });
    const incoming = makeUserData({
      events: [
        makeEvent({ id: 'file', playerId: 6, teamId: 'sq2', price: 80, phase: 'A', ts: 2000 }),
      ],
    });

    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.conflicts.rejectedCount).toBe(1);
    expect(result.conflicts.appliedCount).toBe(1);
    expect(result.conflicts.rejected[0]?.eventId).toBe('file');
    expect(result.conflicts.rejected[0]?.reason).toBe('PLAYER_ALREADY_ASSIGNED');
    expect(result.conflicts.fromFile).toBe(1);
    expect(result.conflicts.fromCurrent).toBe(0);

    // Il dato e' comunque completo: nessun evento e' stato buttato via.
    expect(result.data.events.map((e) => e.id)).toEqual(['mio', 'file']);
  });

  it('segnala il caso grave: un import che invalida assegnazioni gia registrate', () => {
    // L'evento del file ha ts anteriore, quindi dopo il riordino passa per primo
    // e a essere scartato e' quello che l'utente aveva gia' in casa.
    const current = makeUserData({
      events: [
        makeEvent({ id: 'mio', playerId: 6, teamId: 'leo', price: 100, phase: 'A', ts: 5000 }),
      ],
    });
    const incoming = makeUserData({
      events: [
        makeEvent({ id: 'file', playerId: 6, teamId: 'sq2', price: 80, phase: 'A', ts: 1000 }),
      ],
    });

    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.conflicts.rejectedCount).toBe(1);
    expect(result.conflicts.rejected[0]?.eventId).toBe('mio');
    expect(result.conflicts.fromCurrent).toBe(1);
    expect(result.conflicts.fromFile).toBe(0);
    expect(result.conflicts.newlyRejected.map((r) => r.eventId)).toEqual(['mio']);
  });

  it('non conta come nuovo un conflitto che esisteva gia nello store', () => {
    const current = makeUserData({
      events: [
        makeEvent({ id: 'a', playerId: 6, teamId: 'leo', price: 100, phase: 'A', ts: 1000 }),
        makeEvent({ id: 'b', playerId: 6, teamId: 'sq2', price: 90, phase: 'A', ts: 2000 }),
      ],
    });
    const result = importUserData(current, envelope({ playerNotes: [] }), CONFIG);
    if (!result.ok) return;
    expect(result.conflicts.rejectedCount).toBe(1);
    expect(result.conflicts.newlyRejected).toEqual([]);
  });

  it('segnala gli eventi di giocatori che il listone corrente non conosce', () => {
    const incoming = makeUserData({
      events: [
        makeEvent({ id: 'ignoto', playerId: 9999, teamId: 'leo', price: 10, phase: 'A' }),
      ],
    });
    const result = importUserData(emptyUserData(), serializeUserData(incoming, NOW), CONFIG);
    if (!result.ok) return;
    expect(result.conflicts.rejectedCount).toBe(1);
    expect(result.conflicts.rejected[0]?.reason).toBe('UNKNOWN_PLAYER');
    expect(result.conflicts.fromFile).toBe(1);
    // Il dato resta nel log: sara' valido di nuovo dopo il re-import del listone.
    expect(result.data.events).toHaveLength(1);
  });

  it('il dry-run non applica niente: lo stato corrente e intatto', () => {
    const current = makeUserData({
      events: [
        makeEvent({ id: 'mio', playerId: 6, teamId: 'leo', price: 100, phase: 'A', ts: 5000 }),
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(current)) as UserData;
    const incoming = makeUserData({
      events: [
        makeEvent({ id: 'file', playerId: 6, teamId: 'sq2', price: 80, phase: 'A', ts: 1000 }),
      ],
    });
    importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    expect(current).toEqual(snapshot);
  });

  it('appliedCount combacia con la piega vera dei dati restituiti', () => {
    const current = makeUserData({
      events: [
        makeEvent({ id: 'a', playerId: 1, teamId: 'leo', price: 10, phase: 'P', ts: 1 }),
        makeEvent({ id: 'b', playerId: 2, teamId: 'leo', price: 10, phase: 'D', ts: 2 }),
      ],
    });
    const incoming = makeUserData({
      events: [
        makeEvent({ id: 'c', playerId: 4, teamId: 'sq2', price: 10, phase: 'C', ts: 3 }),
        makeEvent({ id: 'd', playerId: 2, teamId: 'sq3', price: 10, phase: 'D', ts: 4 }),
      ],
    });
    const result = importUserData(current, serializeUserData(incoming, NOW), CONFIG);
    if (!result.ok) return;
    const state = reduce(result.data.events, CONFIG);
    expect(result.conflicts.appliedCount).toBe(state.appliedEventIds.length);
    expect(result.conflicts.rejectedCount).toBe(state.rejections.length);
    expect(result.conflicts.rejectedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Fallimenti — non devono corrompere nulla
// ---------------------------------------------------------------------------

describe('§3.1 — import che fallisce non corrompe lo stato', () => {
  const current = populated();

  function expectRejected(raw: unknown, reason: string, detail: RegExp): void {
    const before = JSON.parse(JSON.stringify(current)) as UserData;
    const result = importUserData(current, raw, CONFIG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.reason).toBe(reason);
      expect(result.error.detail).toMatch(detail);
    }
    expect(current).toEqual(before);
  }

  it('JSON malformato', () => {
    expectRejected('{"app": "fanta-auction', 'INVALID_JSON', /non e' JSON valido/);
    expectRejected('', 'INVALID_JSON', /non e' JSON valido/);
    expectRejected('non sono json', 'INVALID_JSON', /non e' JSON valido/);
  });

  it('JSON valido ma non un oggetto', () => {
    expectRejected('[]', 'NOT_AN_OBJECT', /oggetto JSON/);
    expectRejected('42', 'NOT_AN_OBJECT', /oggetto JSON/);
    expectRejected('null', 'NOT_AN_OBJECT', /oggetto JSON/);
    expectRejected('"stringa"', 'NOT_AN_OBJECT', /oggetto JSON/);
  });

  it('backup di un altra applicazione', () => {
    expectRejected(
      JSON.stringify({ app: 'altra-app', schemaVersion: 1, data: {} }),
      'UNKNOWN_FORMAT',
      /non e' un backup di fanta-auction-assistant/,
    );
    expectRejected(JSON.stringify({ schemaVersion: 1, data: {} }), 'UNKNOWN_FORMAT', /campo "app"/);
  });

  it('versione di schema sconosciuta', () => {
    expectRejected(
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 2, data: {} }),
      'UNSUPPORTED_SCHEMA',
      /Versione di schema 2 non supportata/,
    );
    expectRejected(
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 99, data: {} }),
      'UNSUPPORTED_SCHEMA',
      /Import annullato, nulla e' stato modificato/,
    );
  });

  it('versione di schema illeggibile', () => {
    for (const schemaVersion of ['uno', 1.5, undefined]) {
      expectRejected(
        JSON.stringify({ app: BACKUP_FORMAT, schemaVersion, data: {} }),
        'UNSUPPORTED_SCHEMA',
        /illeggibile/,
      );
    }
  });

  it('payload con collezione del tipo sbagliato', () => {
    expectRejected(
      envelope({ lineups: 'non un array' }),
      'INVALID_PAYLOAD',
      /data\.lineups: atteso un array/,
    );
    expectRejected(envelope(7), 'INVALID_PAYLOAD', /data: atteso un oggetto/);
  });

  it('record malformato, con il percorso esatto nel messaggio', () => {
    const cases: readonly (readonly [unknown, RegExp])[] = [
      [{ lineups: [{ module: '4-3-3' }] }, /data\.lineups\[0\]\.teamCode: atteso una stringa/],
      [
        { lineups: [{ teamCode: 'Inter', slots: [{ roleLabel: 'POR' }] }] },
        /data\.lineups\[0\]\.slots\[0\]\.slotId/,
      ],
      [
        { lineups: [{ teamCode: 'Inter', slots: [{ slotId: 'a', candidates: ['x'] }] }] },
        /candidates\[0\]: atteso un id intero/,
      ],
      [{ lineups: [{ teamCode: 'Inter', updatedAt: 1.5 }] }, /\.updatedAt: atteso un intero/],
      [{ playerNotes: [{ text: 'orfana' }] }, /data\.playerNotes\[0\]\.playerId/],
      [
        { playerNotes: [{ playerId: 1, tag: 'sconosciuto' }] },
        /data\.playerNotes\[0\]\.tag: atteso uno tra obiettivo, alternativa, evita/,
      ],
      [{ teamNotes: [{ text: 'orfana' }] }, /data\.teamNotes\[0\]\.teamCode/],
      [{ objectives: { targets: [{ note: 'senza id' }] } }, /data\.objectives\.targets\[0\]/],
      [{ events: [{ id: 'x', ts: 1, playerId: 1, teamId: 'leo', price: 1 }] }, /\.phase: atteso/],
      [
        { events: [{ id: 'x', ts: 1, playerId: 1, teamId: 'leo', price: 1, phase: 'Z' }] },
        /\.phase: atteso uno tra P, D, C, A/,
      ],
      [
        { events: [{ id: 'x', ts: 1.5, playerId: 1, teamId: 'leo', price: 1, phase: 'P' }] },
        /\.ts: atteso un intero/,
      ],
      [
        { events: [{ id: 'x', ts: 1, playerId: 1, teamId: 'leo', price: Infinity, phase: 'P' }] },
        /\.price: atteso un numero finito/,
      ],
      [{ playerNotes: [{ playerId: 1, archived: 'si' }] }, /\.archived: atteso un booleano/],
      [{ playerNotes: [{ playerId: 1, text: 42 }] }, /\.text: atteso una stringa/],
      [{ playerNotes: ['non un oggetto'] }, /data\.playerNotes\[0\]: atteso un oggetto/],
    ];

    for (const [data, detail] of cases) {
      expectRejected(envelope(data), 'INVALID_PAYLOAD', detail);
    }
  });

  it('un record malformato annulla TUTTO l import, non solo quel record', () => {
    const result = importUserData(
      current,
      envelope({
        playerNotes: [
          { playerId: 1, text: 'buona', tag: null, archived: false, updatedAt: NEWER },
          { text: 'rotta' },
        ],
        teamNotes: [{ teamCode: 'Lazio', text: 'buona anche questa', updatedAt: NEWER }],
      }),
      CONFIG,
    );
    expect(result.ok).toBe(false);
    expect(current.teamNotes.some((n) => n.teamCode === 'Lazio')).toBe(false);
  });

  it('un backup senza la chiave data non cancella niente e non fallisce', () => {
    const result = importUserData(
      current,
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 1, exportedAt: NOW }),
      CONFIG,
    );
    const merged = unwrap(result);
    expect(merged).toEqual(current);
    if (result.ok) {
      expect(result.summary.lineups.untouched).toBe(true);
      expect(result.summary.events.untouched).toBe(true);
      expect(result.summary.objectivesReplaced).toBe(false);
    }
  });

  it('nemmeno un errore inatteso esce dalla funzione', () => {
    const boobyTrapped = {
      app: BACKUP_FORMAT,
      schemaVersion: 1,
      get data(): unknown {
        throw new TypeError('property esplosiva');
      },
    };
    expectRejected(boobyTrapped, 'INVALID_PAYLOAD', /Struttura del backup illeggibile.*esplosiva/);

    const throwsNonError = {
      app: BACKUP_FORMAT,
      schemaVersion: 1,
      get data(): unknown {
        throw 'stringa nuda';
      },
    };
    expectRejected(throwsNonError, 'INVALID_PAYLOAD', /illeggibile: stringa nuda/);
  });

  it('accetta i campi opzionali assenti con default sensati', () => {
    const merged = unwrap(
      importUserData(
        emptyUserData(),
        envelope({
          lineups: [{ teamCode: 'Inter' }],
          playerNotes: [{ playerId: 1 }],
          teamNotes: [{ teamCode: 'Inter' }],
          objectives: {},
          events: [],
        }),
        CONFIG,
      ),
    );
    expect(merged.lineups[0]).toEqual({
      teamCode: 'Inter',
      module: '',
      slots: [],
      updatedAt: 0,
    });
    expect(merged.playerNotes[0]).toEqual({
      playerId: 1,
      text: '',
      tag: null,
      archived: false,
      updatedAt: 0,
    });
    expect(merged.teamNotes[0]).toEqual({ teamCode: 'Inter', text: '', updatedAt: 0 });
    expect(merged.objectives).toEqual(emptyObjectives());
  });

  it('una priority assente ricade sull ordine di lettura', () => {
    const merged = unwrap(
      importUserData(
        emptyUserData(),
        envelope({ objectives: { text: 'x', targets: [{ playerId: 7 }, { playerId: 8 }] } }),
        CONFIG,
      ),
    );
    expect(merged.objectives.targets).toEqual([
      { playerId: 7, priority: 0, note: '' },
      { playerId: 8, priority: 1, note: '' },
    ]);
  });

  it('exportedAt illeggibile non fa fallire l import, va a 0', () => {
    const result = importUserData(
      emptyUserData(),
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 1, exportedAt: 'ieri', data: {} }),
      CONFIG,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary.exportedAt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Auto-backup
// ---------------------------------------------------------------------------

describe('§3.1 — auto-backup all apertura', () => {
  it('scarica se non c e mai stato un backup', () => {
    expect(shouldAutoBackup(null, NOW)).toBe(true);
  });

  it('scarica se l ultimo risale a piu di un giorno', () => {
    expect(shouldAutoBackup(NOW - BACKUP_MAX_AGE_MS - 1, NOW)).toBe(true);
    expect(shouldAutoBackup(NOW - BACKUP_MAX_AGE_MS, NOW)).toBe(true);
  });

  it('non scarica se e recente', () => {
    expect(shouldAutoBackup(NOW - 1, NOW)).toBe(false);
    expect(shouldAutoBackup(NOW - BACKUP_MAX_AGE_MS + 1, NOW)).toBe(false);
    expect(shouldAutoBackup(NOW, NOW)).toBe(false);
  });

  it('la soglia e configurabile', () => {
    expect(shouldAutoBackup(NOW - 5000, NOW, 1000)).toBe(true);
    expect(shouldAutoBackup(NOW - 500, NOW, 1000)).toBe(false);
  });
});
