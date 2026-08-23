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
import type { UserData } from './types';
import { reduce } from './reducer';
import {
  makeEvent,
  makeLineup,
  makeObjectives,
  makePlayerNote,
  makeSlot,
  makeTeamNote,
  makeUserData,
  realConfig,
  resetEventCounter,
} from '../test/fixtures';

beforeEach(() => resetEventCounter());

const NOW = 1_760_000_000_000;

/** Dati utente pieni: una di ogni cosa che il backup deve trasportare. */
function populated(): UserData {
  return makeUserData({
    lineups: [
      makeLineup('Inter', [
        makeSlot('por', [1], 'POR', 'sempre lui'),
        makeSlot('dc1', [2, 3], 'DC', 'ballottaggio aperto'),
      ]),
      makeLineup('Milan', [makeSlot('por', [10], 'POR')], '3-5-2', NOW - 5),
    ],
    playerNotes: [
      makePlayerNote(1, 'para tutto', 'obiettivo'),
      makePlayerNote(2, 'rientra dopo la sosta', 'alternativa'),
      makePlayerNote(3, 'fuori rosa', 'evita', true),
    ],
    teamNotes: [makeTeamNote('Inter', 'gioca a tre dietro'), makeTeamNote('Milan', '')],
    objectives: makeObjectives('prendo un portiere titolare e due punte', [
      { playerId: 1, priority: 1, note: 'prioritario' },
      { playerId: 10, priority: 2, note: 'ripiego' },
    ]),
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

  it('contiene tutte e cinque le collezioni di dati utente', () => {
    const backup = exportUserData(populated(), NOW);
    expect(Object.keys(backup.data).sort()).toEqual([
      'events',
      'lineups',
      'objectives',
      'playerNotes',
      'teamNotes',
    ]);
    expect(backup.data.lineups).toHaveLength(2);
    expect(backup.data.playerNotes).toHaveLength(3);
    expect(backup.data.teamNotes).toHaveLength(2);
    expect(backup.data.events).toHaveLength(2);
    expect(backup.data.objectives.targets).toHaveLength(2);
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
    expect(typeof json).toBe('string');
    expect(json).toContain('"app": "fanta-auction-assistant"');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('backupFilename e ordinabile cronologicamente e non contiene caratteri illegali', () => {
    const name = backupFilename(NOW);
    expect(name).toMatch(/^fanta-auction-backup-[\dT-]+\.json$/);
    expect(backupFilename(NOW) < backupFilename(NOW + 86_400_000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Round-trip — il test che conta
// ---------------------------------------------------------------------------

describe('§3.1 — round-trip', () => {
  it('export -> import su store vuoto restituisce lo stato identico', () => {
    const data = populated();
    const restored = unwrap(importUserData(emptyUserData(), serializeUserData(data, NOW)));
    expect(restored).toEqual(data);
  });

  it('regge anche passando l oggetto invece della stringa', () => {
    const data = populated();
    const restored = unwrap(importUserData(emptyUserData(), exportUserData(data, NOW)));
    expect(restored).toEqual(data);
  });

  it('e idempotente: reimportare lo stesso file non cambia nulla', () => {
    const data = populated();
    const json = serializeUserData(data, NOW);
    const once = unwrap(importUserData(emptyUserData(), json));
    const twice = unwrap(importUserData(once, json));
    expect(twice).toEqual(once);
  });

  it('sopravvive a un giro completo di serializzazione su dati vuoti', () => {
    const restored = unwrap(importUserData(emptyUserData(), serializeUserData(emptyUserData(), NOW)));
    expect(restored).toEqual(emptyUserData());
  });

  it('conserva l event log in modo che il reducer ripieghi lo stesso stato', () => {
    const config = realConfig();
    const lautaro = config.players.find((p) => p.name === 'Martinez L.');
    const dimarco = config.players.find((p) => p.name === 'Dimarco');
    const data = makeUserData({
      events: [
        makeEvent({ id: 'a', playerId: lautaro?.id ?? 0, teamId: 'leo', price: 140, phase: 'A' }),
        makeEvent({ id: 'b', playerId: dimarco?.id ?? 0, teamId: 'sq2', price: 90, phase: 'D' }),
      ],
    });
    const restored = unwrap(importUserData(emptyUserData(), serializeUserData(data, NOW)));
    expect(reduce(restored.events, config)).toEqual(reduce(data.events, config));
  });

  it('conserva i campi che JSON tende a perdere: tag null, stringhe vuote, archived', () => {
    const data = makeUserData({
      playerNotes: [makePlayerNote(5, '', null, false), makePlayerNote(6, 'x', 'evita', true)],
      teamNotes: [makeTeamNote('Como', '')],
      objectives: makeObjectives(''),
    });
    const restored = unwrap(importUserData(emptyUserData(), serializeUserData(data, NOW)));
    expect(restored.playerNotes[0]).toEqual({
      playerId: 5,
      text: '',
      tag: null,
      archived: false,
    });
    expect(restored.playerNotes[1]?.archived).toBe(true);
    expect(restored.teamNotes[0]?.text).toBe('');
    expect(restored.objectives).toEqual(emptyObjectives());
  });
});

// ---------------------------------------------------------------------------
// Merge non distruttivo
// ---------------------------------------------------------------------------

describe('§3.1 — merge non distruttivo', () => {
  it('cio che esiste e non e nel file resta', () => {
    const current = makeUserData({
      lineups: [makeLineup('Roma', [makeSlot('por', [50], 'POR')])],
      playerNotes: [makePlayerNote(50, 'nota locale', 'obiettivo')],
      teamNotes: [makeTeamNote('Roma', 'gioca a due punte')],
      events: [makeEvent({ id: 'locale', playerId: 50, teamId: 'leo', price: 5, phase: 'P' })],
    });
    const incoming = makeUserData({
      lineups: [makeLineup('Inter', [makeSlot('por', [1], 'POR')])],
      playerNotes: [makePlayerNote(1, 'dal file')],
      teamNotes: [makeTeamNote('Inter', 'dal file')],
      events: [makeEvent({ id: 'dal-file', playerId: 1, teamId: 'sq2', price: 9, phase: 'P' })],
    });

    const merged = unwrap(importUserData(current, serializeUserData(incoming, NOW)));
    expect(merged.lineups.map((l) => l.teamCode).sort()).toEqual(['Inter', 'Roma']);
    expect(merged.playerNotes.map((n) => n.playerId).sort()).toEqual([1, 50]);
    expect(merged.teamNotes.map((n) => n.teamCode).sort()).toEqual(['Inter', 'Roma']);
    expect(merged.events.map((e) => e.id).sort()).toEqual(['dal-file', 'locale']);
  });

  it('cio che e presente nel file sovrascrive', () => {
    const current = makeUserData({
      lineups: [makeLineup('Inter', [makeSlot('por', [1], 'POR')], '4-3-3', 1)],
      playerNotes: [makePlayerNote(1, 'vecchia', 'evita')],
      teamNotes: [makeTeamNote('Inter', 'vecchia')],
    });
    const incoming = makeUserData({
      lineups: [makeLineup('Inter', [makeSlot('por', [1]), makeSlot('pc', [9])], '3-5-2', 2)],
      playerNotes: [makePlayerNote(1, 'nuova', 'obiettivo')],
      teamNotes: [makeTeamNote('Inter', 'nuova')],
    });

    const merged = unwrap(importUserData(current, serializeUserData(incoming, NOW)));
    expect(merged.lineups).toHaveLength(1);
    expect(merged.lineups[0]?.module).toBe('3-5-2');
    expect(merged.lineups[0]?.slots).toHaveLength(2);
    expect(merged.playerNotes).toHaveLength(1);
    expect(merged.playerNotes[0]?.text).toBe('nuova');
    expect(merged.playerNotes[0]?.tag).toBe('obiettivo');
    expect(merged.teamNotes[0]?.text).toBe('nuova');
  });

  it('un import parziale non cancella le collezioni assenti dal file', () => {
    const current = populated();
    const partial = {
      app: BACKUP_FORMAT,
      schemaVersion: USER_DATA_SCHEMA_VERSION,
      exportedAt: NOW,
      data: { playerNotes: [{ playerId: 1, text: 'aggiornata', tag: null, archived: false }] },
    };

    const result = importUserData(current, JSON.stringify(partial));
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
      expect(result.summary.playerNotes).toEqual({ added: 0, updated: 1, untouched: false });
      expect(result.summary.objectivesReplaced).toBe(false);
    }
  });

  it('un file con collezioni vuote esplicite non cancella comunque nulla di suo', () => {
    // `[]` significa "il file non porta record", non "svuota".
    const current = populated();
    const emptyPayload = {
      app: BACKUP_FORMAT,
      schemaVersion: USER_DATA_SCHEMA_VERSION,
      exportedAt: NOW,
      data: { lineups: [], playerNotes: [], teamNotes: [], events: [] },
    };
    const merged = unwrap(importUserData(current, JSON.stringify(emptyPayload)));
    expect(merged.lineups).toEqual(current.lineups);
    expect(merged.playerNotes).toEqual(current.playerNotes);
    expect(merged.events).toEqual(current.events);
  });

  it('gli obiettivi sono istanza unica: presenti sostituiscono, assenti restano', () => {
    const current = makeUserData({
      objectives: makeObjectives('piano vecchio', [{ playerId: 1, priority: 1, note: 'a' }]),
    });
    const withObjectives = unwrap(
      importUserData(
        current,
        serializeUserData(makeUserData({ objectives: makeObjectives('piano nuovo') }), NOW),
      ),
    );
    expect(withObjectives.objectives).toEqual({ text: 'piano nuovo', targets: [] });

    const without = unwrap(
      importUserData(
        current,
        JSON.stringify({
          app: BACKUP_FORMAT,
          schemaVersion: USER_DATA_SCHEMA_VERSION,
          exportedAt: NOW,
          data: {},
        }),
      ),
    );
    expect(without.objectives).toEqual(current.objectives);
  });

  it('non muta lo stato corrente passato in ingresso', () => {
    const current = populated();
    const snapshot = JSON.parse(JSON.stringify(current)) as UserData;
    importUserData(current, serializeUserData(populated(), NOW));
    expect(current).toEqual(snapshot);
  });

  it('mantiene l ordine corrente e mette le novita in coda', () => {
    const current = makeUserData({
      playerNotes: [makePlayerNote(3), makePlayerNote(1), makePlayerNote(2)],
    });
    const incoming = makeUserData({
      playerNotes: [makePlayerNote(9, 'nuovo'), makePlayerNote(1, 'aggiornato')],
    });
    const merged = unwrap(importUserData(current, serializeUserData(incoming, NOW)));
    expect(merged.playerNotes.map((n) => n.playerId)).toEqual([3, 1, 2, 9]);
  });

  it('riordina l event log per ts, poi per id: la piega dipende dall ordine', () => {
    const current = makeUserData({
      events: [makeEvent({ id: 'c', playerId: 3, teamId: 'leo', price: 1, phase: 'P', ts: 300 })],
    });
    const incoming = makeUserData({
      events: [
        makeEvent({ id: 'b', playerId: 2, teamId: 'leo', price: 1, phase: 'P', ts: 200 }),
        makeEvent({ id: 'a', playerId: 1, teamId: 'leo', price: 1, phase: 'P', ts: 100 }),
        makeEvent({ id: 'a2', playerId: 4, teamId: 'leo', price: 1, phase: 'P', ts: 100 }),
      ],
    });
    const merged = unwrap(importUserData(current, serializeUserData(incoming, NOW)));
    expect(merged.events.map((e) => e.id)).toEqual(['a', 'a2', 'b', 'c']);
  });

  it('il summary conta correttamente aggiunti e aggiornati', () => {
    const current = makeUserData({ playerNotes: [makePlayerNote(1), makePlayerNote(2)] });
    const incoming = makeUserData({
      playerNotes: [makePlayerNote(2, 'agg'), makePlayerNote(7), makePlayerNote(8)],
    });
    const result = importUserData(current, serializeUserData(incoming, NOW));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.playerNotes).toEqual({ added: 2, updated: 1, untouched: false });
      expect(result.summary.schemaVersion).toBe(USER_DATA_SCHEMA_VERSION);
      expect(result.summary.exportedAt).toBe(NOW);
    }
  });
});

// ---------------------------------------------------------------------------
// Fallimenti — non devono corrompere nulla
// ---------------------------------------------------------------------------

describe('§3.1 — import che fallisce non corrompe lo stato', () => {
  const current = populated();

  /** Ogni caso di errore riceve lo stesso stato di partenza e non deve toccarlo. */
  function expectRejected(raw: unknown, reason: string, detail: RegExp): void {
    const before = JSON.parse(JSON.stringify(current)) as UserData;
    const result = importUserData(current, raw);
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
    expectRejected(
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 'uno', data: {} }),
      'UNSUPPORTED_SCHEMA',
      /Versione di schema illeggibile/,
    );
    expectRejected(
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 1.5, data: {} }),
      'UNSUPPORTED_SCHEMA',
      /illeggibile/,
    );
    expectRejected(
      JSON.stringify({ app: BACKUP_FORMAT, data: {} }),
      'UNSUPPORTED_SCHEMA',
      /illeggibile/,
    );
  });

  it('payload con collezione del tipo sbagliato', () => {
    expectRejected(
      JSON.stringify({
        app: BACKUP_FORMAT,
        schemaVersion: 1,
        data: { lineups: 'non un array' },
      }),
      'INVALID_PAYLOAD',
      /data\.lineups: atteso un array/,
    );
    expectRejected(
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 1, data: 7 }),
      'INVALID_PAYLOAD',
      /data: atteso un oggetto/,
    );
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
      expectRejected(
        JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 1, data }),
        'INVALID_PAYLOAD',
        detail,
      );
    }
  });

  it('un record malformato annulla TUTTO l import, non solo quel record', () => {
    const result = importUserData(
      current,
      JSON.stringify({
        app: BACKUP_FORMAT,
        schemaVersion: 1,
        data: {
          playerNotes: [
            { playerId: 1, text: 'buona', tag: null, archived: false },
            { text: 'rotta' },
          ],
          teamNotes: [{ teamCode: 'Lazio', text: 'buona anche questa' }],
        },
      }),
    );
    expect(result.ok).toBe(false);
    expect(current.teamNotes.some((n) => n.teamCode === 'Lazio')).toBe(false);
  });

  it('accetta i campi opzionali assenti con default sensati', () => {
    const merged = unwrap(
      importUserData(
        emptyUserData(),
        JSON.stringify({
          app: BACKUP_FORMAT,
          schemaVersion: 1,
          data: {
            lineups: [{ teamCode: 'Inter' }],
            playerNotes: [{ playerId: 1 }],
            teamNotes: [{ teamCode: 'Inter' }],
            objectives: {},
            events: [],
          },
        }),
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
    });
    expect(merged.teamNotes[0]).toEqual({ teamCode: 'Inter', text: '' });
    expect(merged.objectives).toEqual(emptyObjectives());
  });

  it('una priority assente ricade sull ordine di lettura', () => {
    const merged = unwrap(
      importUserData(
        emptyUserData(),
        JSON.stringify({
          app: BACKUP_FORMAT,
          schemaVersion: 1,
          data: { objectives: { text: 'x', targets: [{ playerId: 7 }, { playerId: 8 }] } },
        }),
      ),
    );
    expect(merged.objectives.targets).toEqual([
      { playerId: 7, priority: 0, note: '' },
      { playerId: 8, priority: 1, note: '' },
    ]);
  });

  it('un backup senza la chiave data non cancella niente e non fallisce', () => {
    const result = importUserData(
      current,
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 1, exportedAt: NOW }),
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
    // Un oggetto gia' deserializzato puo' arrivare da qualsiasi parte: se una
    // sua property esplode in lettura, l'import deve comunque fallire in modo
    // pulito invece di propagare l'eccezione dentro la UI.
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

  it('exportedAt illeggibile non fa fallire l import, va a 0', () => {
    const result = importUserData(
      emptyUserData(),
      JSON.stringify({ app: BACKUP_FORMAT, schemaVersion: 1, exportedAt: 'ieri', data: {} }),
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
