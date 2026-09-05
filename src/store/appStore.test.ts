import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from './appStore';
import { db } from './db';
import { emptyUserData } from '../domain/backup';
import { makeTeams } from '../domain/config';
import { reduce } from '../domain/reducer';
import { findPlayer, readListoneBytes } from '../test/fixtures';

/**
 * Test dello store: la coda di scrittura, le assegnazioni, il re-import.
 *
 * E' l'unico strato non banale che parla con IndexedDB, e senza `fake-indexeddb`
 * non era testabile sotto Node. Sono anche i due bug che sono usciti davvero —
 * entrambi race sulla coda — e che avevo visto solo guardando l'app girare.
 */

/** Un `File` finto: lo store legge solo `name`, `arrayBuffer()` e `text()`. */
function fakeFile(name: string, bytes: Uint8Array): File {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return {
    name,
    arrayBuffer: () => Promise.resolve(buffer),
    text: () => Promise.resolve(new TextDecoder().decode(bytes)),
  } as unknown as File;
}

function listoneFile(): File {
  return fakeFile('lista_calciatori_classic.xlsx', readListoneBytes());
}

/** Svuota disco e memoria: ogni test parte da un'app appena installata. */
async function resetAll(): Promise<void> {
  await db.delete();
  await db.open();
  useAppStore.setState({
    ready: false,
    players: [],
    teams: makeTeams(),
    userData: emptyUserData(),
    listone: null,
    lastBackupAt: null,
    pendingImport: null,
    pendingListone: null,
    expectationsEnabled: true,
    message: null,
  });
}

/** Simula un refresh: butta via la memoria e ricarica da IndexedDB. */
async function reload(): Promise<void> {
  useAppStore.setState({
    ready: false,
    players: [],
    teams: makeTeams(),
    userData: emptyUserData(),
    listone: null,
  });
  await useAppStore.getState().init();
}

const store = () => useAppStore.getState();

beforeEach(async () => {
  await resetAll();
});

describe('init e caricamento del listone', () => {
  it('parte vuoto e diventa pronto', async () => {
    await store().init();
    expect(store().ready).toBe(true);
    expect(store().players).toEqual([]);
    expect(store().listone).toBeNull();
  });

  it('il primo import applica direttamente e persiste tutto', async () => {
    await store().init();
    await store().importListone(listoneFile());

    expect(store().players).toHaveLength(533);
    expect(store().listone?.count).toBe(533);
    expect(store().pendingListone).toBeNull();
    expect(store().message?.kind).toBe('ok');

    // Anche il file sorgente, che serve all'export nativo di §6.1.
    expect(await db.sourceFiles.get('listone')).not.toBeUndefined();
  });

  it('sopravvive a un refresh', async () => {
    await store().init();
    await store().importListone(listoneFile());
    await reload();

    expect(store().players).toHaveLength(533);
    expect(store().listone?.filename).toBe('lista_calciatori_classic.xlsx');
  });

  it('un file illeggibile lascia lo stato intatto e lo dice', async () => {
    await store().init();
    await store().importListone(listoneFile());
    await store().importListone(fakeFile('rotto.xlsx', new Uint8Array([1, 2, 3])));

    expect(store().players).toHaveLength(533);
    expect(store().message?.kind).toBe('error');
    expect(store().pendingListone).toBeNull();
  });
});

describe('assegnazioni', () => {
  beforeEach(async () => {
    await store().init();
    await store().importListone(listoneFile());
  });

  function portiere(i = 0) {
    return store().players.filter((p) => p.role === 'P')[i] as { id: number; name: string };
  }

  it('registra un acquisto e lo scrive su disco prima di mostrarlo', async () => {
    const outcome = await store().assign(portiere().id, 'leo', 30, 'P');
    expect(outcome.ok).toBe(true);

    expect(store().userData.events).toHaveLength(1);
    // Gia' su IndexedDB, non solo in memoria.
    expect(await db.events.count()).toBe(1);
  });

  it('un acquisto sopravvive al refresh', async () => {
    await store().assign(portiere().id, 'leo', 30, 'P');
    await reload();

    expect(store().userData.events).toHaveLength(1);
    const state = reduce(store().userData.events, store().leagueConfig());
    expect(state.teamsById['leo']?.credits).toBe(770);
  });

  it('rifiuta il doppione e NON scrive niente', async () => {
    await store().assign(portiere().id, 'leo', 30, 'P');
    const outcome = await store().assign(portiere().id, 'sq2', 40, 'P');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.rejection.reason).toBe('PLAYER_ALREADY_ASSIGNED');
    expect(store().userData.events).toHaveLength(1);
    expect(await db.events.count()).toBe(1);
  });

  it('rifiuta il prezzo oltre il tetto senza scrivere', async () => {
    const outcome = await store().assign(portiere().id, 'leo', 800, 'P');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.rejection.reason).toBe('INSUFFICIENT_CREDITS');
    expect(await db.events.count()).toBe(0);
  });

  it('la coda serializza: acquisti lanciati insieme si registrano tutti', async () => {
    // E' il bug che nell'editor formazioni faceva perdere dieci pick su undici:
    // senza coda ogni chiamata parte dallo stesso stato e l'ultima vince.
    // Tre portieri sulla stessa squadra riempiono i suoi tre slot P: se la
    // serializzazione non funzionasse ne resterebbe uno solo.
    const portieri = store().players.filter((p) => p.role === 'P').slice(0, 3);
    await Promise.all(portieri.map((p) => store().assign(p.id, 'leo', 10, 'P')));

    expect(store().userData.events).toHaveLength(3);
    expect(await db.events.count()).toBe(3);
    const state = reduce(store().userData.events, store().leagueConfig());
    expect(state.rejections).toEqual([]);
    expect(state.teamsById['leo']?.credits).toBe(770);
    expect(state.teamsById['leo']?.slotsFreeByRole.P).toBe(0);
  });

  it('la coda serializza anche fra squadre diverse', async () => {
    const portieri = store().players.filter((p) => p.role === 'P').slice(0, 5);
    const sigle = store().teams.slice(0, 5).map((t) => t.id);
    await Promise.all(
      portieri.map((p, i) => store().assign(p.id, sigle[i] as string, 10, 'P')),
    );

    expect(await db.events.count()).toBe(5);
    expect(reduce(store().userData.events, store().leagueConfig()).rejections).toEqual([]);
  });

  it('la coda regge anche quando qualche acquisto viene rifiutato', async () => {
    const p1 = portiere(0);
    const p2 = portiere(1);
    const results = await Promise.all([
      store().assign(p1.id, 'leo', 10, 'P'),
      store().assign(p1.id, 'sq2', 20, 'P'), // stesso giocatore
      store().assign(p2.id, 'sq2', 15, 'P'),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(await db.events.count()).toBe(2);
  });

  it('undo e redo passano da disco', async () => {
    await store().assign(portiere().id, 'leo', 30, 'P');
    const id = store().userData.events[0]?.id as string;

    await store().undoAssignment(id);
    await reload();
    expect(store().userData.events[0]?.undone).toBe(true);

    await store().redoAssignment(id);
    await reload();
    expect(store().userData.events[0]?.undone).toBe(false);
  });

  it('undoLast e redoLast agiscono sull ultimo', async () => {
    const portieri = store().players.filter((p) => p.role === 'P').slice(0, 2);
    await store().assign(portieri[0]?.id ?? 0, 'leo', 10, 'P');
    await store().assign(portieri[1]?.id ?? 0, 'leo', 20, 'P');

    await store().undoLast();
    expect(store().userData.events[1]?.undone).toBe(true);
    expect(store().userData.events[0]?.undone).toBe(false);

    await store().redoLast();
    expect(store().userData.events[1]?.undone).toBe(false);
  });

  it('undoAllAssignments azzera lo stato di lega senza cancellare il log', async () => {
    const portieri = store().players.filter((p) => p.role === 'P').slice(0, 3);
    for (const p of portieri) await store().assign(p.id, 'leo', 10, 'P');

    await store().undoAllAssignments();
    await reload();

    expect(store().userData.events).toHaveLength(3);
    expect(store().userData.events.every((e) => e.undone)).toBe(true);
    expect(reduce(store().userData.events, store().leagueConfig()).slotsFilled).toBe(0);
  });

  it('clearAuctionLog cancella anche i colpi gia annullati', async () => {
    const portieri = store().players.filter((p) => p.role === 'P').slice(0, 3);
    for (const p of portieri) await store().assign(p.id, 'leo', 10, 'P');
    await store().undoAssignment(store().userData.events[0]?.id ?? '');

    await store().clearAuctionLog();
    await reload();

    expect(store().userData.events).toHaveLength(0);
    expect(reduce(store().userData.events, store().leagueConfig()).slotsFilled).toBe(0);
  });

  it('clearAuctionLog non tocca le aspettative', async () => {
    const portieri = store().players.filter((p) => p.role === 'P').slice(0, 1);
    await store().assign(portieri[0]?.id ?? 0, 'leo', 10, 'P');
    await store().setExpectation(1, { matches: 30, goals: 10 });

    await store().clearAuctionLog();
    await reload();

    expect(store().userData.events).toHaveLength(0);
    expect(store().userData.expectations).toHaveLength(1);
  });
});

describe('note e obiettivi', () => {
  beforeEach(async () => {
    await store().init();
    await store().importListone(listoneFile());
  });

  it('scrivere il testo non azzera il tag', async () => {
    await store().setPlayerNote(1, { tag: 'evita' });
    await store().setPlayerNote(1, { text: 'rigorista' });
    await reload();

    const note = store().userData.playerNotes.find((n) => n.playerId === 1);
    expect(note).toMatchObject({ text: 'rigorista', tag: 'evita' });
  });

  it('una patch che non cambia niente non scrive', async () => {
    await store().setPlayerNote(1, { text: 'x' });
    const before = store().userData.playerNotes[0]?.updatedAt;
    await store().setPlayerNote(1, { text: 'x' });
    expect(store().userData.playerNotes[0]?.updatedAt).toBe(before);
  });

  it('note digitate in rapida successione non si sovrascrivono', async () => {
    await Promise.all([
      store().setPlayerNote(1, { text: 'a' }),
      store().setPlayerNote(2, { text: 'b' }),
      store().setPlayerNote(3, { text: 'c' }),
    ]);
    expect(store().userData.playerNotes).toHaveLength(3);
    expect(await db.playerNotes.count()).toBe(3);
  });

  it('aggiungere un target mette il tag solo se non c e gia', async () => {
    await store().setPlayerNote(1, { tag: 'evita' });
    await store().addObjectiveTarget(1);
    await store().addObjectiveTarget(2);
    await reload();

    expect(store().userData.playerNotes.find((n) => n.playerId === 1)?.tag).toBe('evita');
    expect(store().userData.playerNotes.find((n) => n.playerId === 2)?.tag).toBe('obiettivo');
    expect(store().userData.objectives.targets).toHaveLength(2);
  });

  it('togliere un target non tocca il tag', async () => {
    await store().addObjectiveTarget(1);
    await store().removeObjectiveTarget(1);
    await reload();

    expect(store().userData.objectives.targets).toEqual([]);
    expect(store().userData.playerNotes.find((n) => n.playerId === 1)?.tag).toBe('obiettivo');
  });

  it('il testo degli obiettivi persiste', async () => {
    await store().setObjectivesText('un portiere titolare e due punte');
    await reload();
    expect(store().userData.objectives.text).toBe('un portiere titolare e due punte');
  });
});

describe('setTeams', () => {
  beforeEach(async () => {
    await store().init();
    await store().importListone(listoneFile());
  });

  it('rinominare una squadra non stacca i suoi acquisti', async () => {
    // Il bug: l'id coincideva con la sigla, quindi cambiarla faceva sparire
    // in silenzio ogni acquisto di quella squadra.
    const portiere = store().players.find((p) => p.role === 'P') as { id: number };
    await store().assign(portiere.id, 'sq2', 40, 'P');

    const seeds = store().teams.map((t) =>
      t.abbr === 'sq2' ? (['Marco Rossi', 'mrc'] as const) : ([t.name, t.abbr] as const),
    );
    await store().setTeams(seeds);
    await reload();

    const team = store().teams.find((t) => t.abbr === 'mrc');
    expect(team?.id).toBe('sq2');
    expect(team?.name).toBe('Marco Rossi');

    const state = reduce(store().userData.events, store().leagueConfig());
    expect(state.rejections).toEqual([]);
    expect(state.teamsById['sq2']?.credits).toBe(760);
  });

  it('rifiuta sigle non valide senza toccare lo stato', async () => {
    const prima = store().teams;
    const seeds = store().teams.map((t) => [t.name, t.abbr] as const);
    const rotte = [...seeds];
    rotte[1] = ['X', 'ab'] as const;

    await expect(store().setTeams(rotte)).rejects.toThrow(/3 lettere/);
    expect(store().teams).toEqual(prima);
  });
});

describe('re-import del listone', () => {
  beforeEach(async () => {
    await store().init();
    await store().importListone(listoneFile());
  });

  it('un re-import chiede sempre conferma e non applica niente da solo', async () => {
    await store().importListone(listoneFile());

    expect(store().pendingListone).not.toBeNull();
    expect(store().pendingListone?.plan.firstImport).toBe(false);
    expect(store().players).toHaveLength(533);
  });

  it('annullare non lascia tracce', async () => {
    await store().importListone(listoneFile());
    store().cancelListoneImport();
    expect(store().pendingListone).toBeNull();
  });

  it('confermare applica e persiste', async () => {
    await store().importListone(listoneFile());
    await store().confirmListoneImport();
    await reload();

    expect(store().pendingListone).toBeNull();
    expect(store().players).toHaveLength(533);
  });

  it('e bloccato con assegnazioni attive, e si sblocca annullandole', async () => {
    const portiere = store().players.find((p) => p.role === 'P') as { id: number };
    await store().assign(portiere.id, 'leo', 30, 'P');

    await store().importListone(listoneFile());
    expect(store().pendingListone).toBeNull();
    expect(store().message?.kind).toBe('error');
    expect(store().message?.text).toMatch(/bloccato/);

    await store().undoAllAssignments();
    await store().importListone(listoneFile());
    expect(store().pendingListone).not.toBeNull();
  });
});

describe('aspettative e prezzo dinamico (§5.5)', () => {
  async function withListone(): Promise<void> {
    await store().init();
    await store().importListone(listoneFile());
  }

  it("scrive un'aspettativa e la ritrova dopo un refresh", async () => {
    await withListone();
    const player = findPlayer(store().players, 'Dimarco');

    await store().setExpectation(player.id, {
      matches: 32,
      goals: 4,
      assists: 6,
      yellows: 5,
      reds: 0,
    });
    await reload();

    const saved = store().userData.expectations.find((e) => e.playerId === player.id);
    expect(saved).toMatchObject({ matches: 32, goals: 4, assists: 6, yellows: 5, reds: 0 });
  });

  it('normalizza a interi non negativi', async () => {
    // La UI ha campi numerici, e un campo numerico accetta -3 e 2,5 senza
    // protestare. Mezzo gol finirebbe dritto nel tasso di reparto.
    await withListone();
    const player = findPlayer(store().players, 'Dimarco');

    await store().setExpectation(player.id, { matches: 2.6, goals: -3, assists: 1 });

    const saved = store().userData.expectations.find((e) => e.playerId === player.id);
    expect(saved).toMatchObject({ matches: 3, goals: 0, assists: 1 });
  });

  it('non riscrive quando la patch non cambia niente', async () => {
    await withListone();
    const player = findPlayer(store().players, 'Dimarco');

    await store().setExpectation(player.id, { matches: 30 });
    const first = store().userData.expectations.find((e) => e.playerId === player.id);

    await store().setExpectation(player.id, { matches: 30 });
    const second = store().userData.expectations.find((e) => e.playerId === player.id);

    // Stesso oggetto: senza il controllo, ogni blur riscriverebbe la riga con
    // un `updatedAt` nuovo, che poi vince i confronti in import.
    expect(second).toBe(first);
  });

  it('clearExpectation toglie la riga', async () => {
    await withListone();
    const player = findPlayer(store().players, 'Dimarco');

    await store().setExpectation(player.id, { matches: 30 });
    await store().clearExpectation(player.id);
    await reload();

    expect(store().userData.expectations).toHaveLength(0);
  });

  it('spegnere la feature non cancella nessuna aspettativa', async () => {
    // E' la promessa fatta in Impostazioni: e' un interruttore, non una
    // rimozione. Se questo test cade, quella schermata sta mentendo.
    await withListone();
    const player = findPlayer(store().players, 'Dimarco');
    await store().setExpectation(player.id, { matches: 32, goals: 4 });

    await store().setExpectationsEnabled(false);
    expect(store().expectationsEnabled).toBe(false);
    expect(store().userData.expectations).toHaveLength(1);

    await reload();
    expect(store().expectationsEnabled).toBe(false);
    expect(store().userData.expectations).toHaveLength(1);

    await store().setExpectationsEnabled(true);
    await reload();
    expect(store().expectationsEnabled).toBe(true);
    expect(store().userData.expectations[0]).toMatchObject({ matches: 32, goals: 4 });
  });

  it("parte acceso su un'app appena installata", async () => {
    await store().init();
    expect(store().expectationsEnabled).toBe(true);
  });
});

describe('resetEverything', () => {
  it('riporta l app allo stato di prima installazione, su disco e in memoria', async () => {
    await store().init();
    await store().importListone(listoneFile());
    const portiere = store().players.find((p) => p.role === 'P') as { id: number };
    await store().assign(portiere.id, 'leo', 30, 'P');
    await store().setPlayerNote(portiere.id, { text: 'nota', tag: 'obiettivo' });
    await store().setObjectivesText('un piano');
    await store().setTeams(
      store().teams.map((t, i) => (i === 1 ? (['Rinominata', 'rnm'] as const) : ([t.name, t.abbr] as const))),
    );

    await store().resetEverything();

    expect(store().players).toEqual([]);
    expect(store().listone).toBeNull();
    expect(store().userData).toEqual(emptyUserData());
    expect(store().teams.map((t) => t.abbr)).toEqual(makeTeams().map((t) => t.abbr));

    // E davvero su disco: un refresh non deve resuscitare niente.
    await reload();
    expect(store().players).toEqual([]);
    expect(store().userData.events).toEqual([]);
    expect(store().userData.playerNotes).toEqual([]);
    expect(store().listone).toBeNull();
    expect(await db.events.count()).toBe(0);
    expect(await db.players.count()).toBe(0);
    expect(await db.sourceFiles.count()).toBe(0);
  });

  it('su un app gia vuota non fa danni', async () => {
    await store().init();
    await store().resetEverything();
    await reload();
    expect(store().ready).toBe(true);
    expect(store().players).toEqual([]);
  });

  it('dopo il reset si puo ricaricare il listone da zero', async () => {
    await store().init();
    await store().importListone(listoneFile());
    await store().resetEverything();
    await store().importListone(listoneFile());

    // Torna a essere un primo import: nessuna conferma da dare.
    expect(store().pendingListone).toBeNull();
    expect(store().players).toHaveLength(533);
  });
});

describe('backup', () => {
  beforeEach(async () => {
    await store().init();
    await store().importListone(listoneFile());
  });

  it('import di un backup: anteprima, conferma, persistenza', async () => {
    const lautaro = findPlayer(store().players, 'Martinez L.');
    await store().setPlayerNote(lautaro.id, { text: 'da prendere', tag: 'obiettivo' });

    const json = JSON.stringify({
      app: 'fanta-auction-assistant',
      schemaVersion: 1,
      exportedAt: Date.now(),
      data: {
        teamNotes: [{ teamCode: 'Inter', text: 'gioca a tre', updatedAt: Date.now() + 1000 }],
      },
    });

    await store().previewBackup(fakeFile('backup.json', new TextEncoder().encode(json)));
    expect(store().pendingImport).not.toBeNull();
    expect(store().pendingImport?.result.conflicts.rejectedCount).toBe(0);

    await store().confirmImport();
    await reload();

    expect(store().userData.teamNotes).toHaveLength(1);
    // La nota che c'era prima non e' stata travolta dall'import parziale.
    expect(store().userData.playerNotes.find((n) => n.playerId === lautaro.id)?.tag).toBe(
      'obiettivo',
    );
  });

  it('un backup malformato non tocca niente', async () => {
    await store().setPlayerNote(1, { text: 'mia' });
    const before = store().userData;

    await store().previewBackup(fakeFile('rotto.json', new TextEncoder().encode('{ nope')));

    expect(store().pendingImport).toBeNull();
    expect(store().message?.kind).toBe('error');
    expect(store().userData).toEqual(before);
  });
});
