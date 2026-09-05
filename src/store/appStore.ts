import { create } from 'zustand';

import type {
  AssignmentEvent,
  Expectation,
  FantaTeam,
  LeagueConfig,
  Lineup,
  Objectives,
  Player,
  Role,
  TeamNote,
  UserData,
} from '../domain/types';
import type { ImportResult } from '../domain/backup';
import {
  backupFilename,
  emptyUserData,
  importUserData,
  serializeUserData,
  shouldAutoBackup,
} from '../domain/backup';
import { makeLeagueConfig, makeTeams, updateTeams } from '../domain/config';
import type { EventRejection } from '../domain/reducer';
import {
  lastActiveEvent,
  lastUndoneEvent,
  redoEvent,
  reduce,
  undoAll,
  undoEvent,
} from '../domain/reducer';
import { DEFAULT_MODULE, emptyLineup } from '../domain/modules';
import type { PlayerNotePatch } from '../domain/notes';
import { applyNotePatch, isNoOpPatch } from '../domain/notes';
import type { AddTargetOptions } from '../domain/objectives';
import { addTarget, removeTarget } from '../domain/objectives';
import type { ListoneImportPlan } from '../domain/listone-diff';
import { planListoneImport } from '../domain/listone-diff';
import { assignmentsFromState, buildNativeXlsx, nativeExportFilename } from '../export/native';
import { buildReportXlsx, reportFilename } from '../export/report';
import { downloadRosterPdf } from '../export/pdf';
import { parseListone } from '../parse/listone';
import * as store from './db';

/**
 * Stato applicativo (Zustand) sopra la persistenza Dexie.
 *
 * Ogni azione che modifica dati utente **scrive prima su IndexedDB e poi
 * aggiorna lo stato**: cio' che e' a schermo e' sempre gia' su disco.
 *
 * Tutte le scritture passano da una **coda unica**. Senza, due modifiche
 * ravvicinate — una raffica di Invio nell'editor, una nota digitata veloce —
 * partirebbero entrambe dallo stesso stato e l'ultima cancellerebbe la prima.
 */

export interface ListoneInfo {
  readonly filename: string;
  readonly importedAt: number;
  readonly count: number;
}

/** Anteprima di un import in attesa di conferma (§3.1). */
export interface PendingImport {
  readonly filename: string;
  readonly result: Extract<ImportResult, { ok: true }>;
}

/** Re-import del listone in attesa di conferma (§2). */
export interface PendingListone {
  readonly filename: string;
  readonly plan: ListoneImportPlan;
  readonly players: readonly Player[];
  readonly bytes: Uint8Array;
  readonly excludedCount: number;
}

/** Esito di un tentativo di assegnazione dalla command bar. */
export type AssignOutcome =
  | { readonly ok: true; readonly event: AssignmentEvent }
  | { readonly ok: false; readonly rejection: EventRejection };

export interface AppState {
  readonly ready: boolean;
  readonly players: readonly Player[];
  readonly teams: readonly FantaTeam[];
  readonly userData: UserData;
  readonly listone: ListoneInfo | null;
  readonly lastBackupAt: number | null;
  readonly pendingImport: PendingImport | null;
  readonly pendingListone: PendingListone | null;
  /**
   * §5.5 acceso o spento. Spento, l'applicazione e' esattamente quella di
   * prima della feature: niente scheda Aspettative, niente sezione nella
   * scheda giocatore, niente consigliato nel pannello d'asta. Le aspettative
   * gia' scritte restano su disco e nel backup.
   */
  readonly expectationsEnabled: boolean;
  readonly message: { readonly kind: 'ok' | 'error'; readonly text: string } | null;

  /** Lega corrente: squadre, crediti, slot, listone. */
  leagueConfig: () => LeagueConfig;

  init: () => Promise<void>;
  importListone: (file: File) => Promise<void>;
  confirmListoneImport: () => Promise<void>;
  cancelListoneImport: () => void;
  setTeams: (
    seeds: readonly (readonly [name: string, abbr: string])[],
    userIndex?: number,
  ) => Promise<void>;
  assign: (playerId: number, teamId: string, price: number, phase: Role) => Promise<AssignOutcome>;
  undoAssignment: (eventId: string) => Promise<void>;
  redoAssignment: (eventId: string) => Promise<void>;
  undoLast: () => Promise<void>;
  redoLast: () => Promise<void>;
  undoAllAssignments: () => Promise<void>;
  /** Cancella l'event log dell'asta. Hard delete: non si ripristina. */
  clearAuctionLog: () => Promise<void>;
  /** Accende o spegne §5.5. Non tocca le aspettative gia' inserite. */
  setExpectationsEnabled: (enabled: boolean) => Promise<void>;
  updateLineup: (teamCode: string, mutate: (lineup: Lineup) => Lineup) => Promise<Lineup>;
  saveTeamNote: (teamCode: string, text: string) => Promise<void>;
  setPlayerNote: (playerId: number, patch: PlayerNotePatch) => Promise<void>;
  /** Scrive o aggiorna l'aspettativa di un giocatore (§5.5). */
  setExpectation: (playerId: number, patch: ExpectationPatch) => Promise<void>;
  /** Toglie l'aspettativa: il giocatore torna senza prezzo dinamico. */
  clearExpectation: (playerId: number) => Promise<void>;
  setObjectivesText: (text: string) => Promise<void>;
  addObjectiveTarget: (playerId: number, options?: AddTargetOptions) => Promise<void>;
  removeObjectiveTarget: (playerId: number) => Promise<void>;
  exportNativeXlsx: () => Promise<void>;
  exportReportXlsx: () => Promise<void>;
  exportPdf: () => Promise<void>;
  downloadBackup: () => Promise<void>;
  previewBackup: (file: File) => Promise<void>;
  confirmImport: () => Promise<void>;
  cancelImport: () => void;
  /** Cancella tutto e riporta l app allo stato di prima installazione. */
  resetEverything: () => Promise<void>;
  notify: (kind: 'ok' | 'error', text: string) => void;
  dismiss: () => void;
}

/** Campi modificabili di un'aspettativa. Assenti = invariati. */
export type ExpectationPatch = Partial<Omit<Expectation, 'playerId' | 'updatedAt'>>;

/** Aspettativa vuota: tutti i contatori a zero, da riempire. */
export function emptyExpectation(playerId: number, updatedAt: number): Expectation {
  return { playerId, matches: 0, goals: 0, assists: 0, yellows: 0, reds: 0, updatedAt };
}

function readNumberMeta(value: string | number | null): number | null {
  return typeof value === 'number' ? value : null;
}

function readStringMeta(value: string | number | null): string | null {
  return typeof value === 'string' ? value : null;
}

/** Consegna un file al browser. L'unico punto in cui lo store tocca il DOM. */
function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename: string, text: string): void {
  triggerDownload(filename, new Blob([text], { type: 'application/json' }));
}

function downloadBytes(filename: string, bytes: Uint8Array): void {
  // Copia in un ArrayBuffer proprio: la view potrebbe puntare a un buffer
  // condiviso, che `Blob` non accetta.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  triggerDownload(filename, new Blob([buffer], { type: 'application/octet-stream' }));
}

/**
 * Coda di scrittura: un'operazione alla volta, in ordine di arrivo.
 * Ogni task legge lo stato dopo che il precedente lo ha aggiornato.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/** Sostituisce l'elemento con quella chiave, oppure lo accoda se non c'e'. */
function upsert<T>(list: readonly T[], item: T, sameKey: (candidate: T) => boolean): T[] {
  return list.some(sameKey) ? list.map((x) => (sameKey(x) ? item : x)) : [...list, item];
}

type SetState = (partial: Partial<AppState>) => void;

/**
 * Commit di un re-import (§2): listone nuovo e dati utente ripuliti, in una
 * sola passata. I dati utente si riscrivono per primi, perche' e' quello che
 * non si puo' ricostruire; il listone e' sempre riscaricabile.
 */
async function applyListone(pending: PendingListone, set: SetState): Promise<void> {
  const { plan, players, bytes, filename, excludedCount } = pending;
  const now = Date.now();

  await store.replaceUserData(plan.nextUserData);
  await store.replacePlayers(players);
  // Il file originale resta com'e': l'export nativo di §6.1 ci riscrive dentro
  // invece di rigenerarlo.
  await store.saveSourceFile(filename, bytes);
  await store.setMeta('listoneFilename', filename);
  await store.setMeta('listoneImportedAt', now);
  await store.setMeta('listoneCount', players.length);

  const { diff, impact } = plan;
  const parts = [`${players.length} giocatori, ${excludedCount} fuori lista esclusi`];
  if (!plan.firstImport) {
    parts.push(`${diff.added.length} nuovi, ${diff.removed.length} usciti`);
    if (impact.removedWithData.length > 0) {
      parts.push(`${impact.removedWithData.length} note archiviate`);
    }
    if (impact.slotsEmptied > 0) parts.push(`${impact.slotsEmptied} slot svuotati`);
  }

  set({
    players,
    userData: plan.nextUserData,
    pendingListone: null,
    listone: { filename, importedAt: now, count: players.length },
    message: { kind: 'ok', text: `Listone caricato: ${parts.join(' · ')}.` },
  });

}

export const useAppStore = create<AppState>((set, get) => ({
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

  leagueConfig() {
    return makeLeagueConfig(get().players, { teams: get().teams });
  },

  async init() {
    const [
      players,
      userData,
      storedTeams,
      filename,
      importedAt,
      count,
      lastBackupAt,
      expectations,
    ] = await Promise.all([
      store.loadPlayers(),
      store.loadUserData(),
      store.loadTeams(),
      store.getMeta('listoneFilename'),
      store.getMeta('listoneImportedAt'),
      store.getMeta('listoneCount'),
      store.getMeta('lastBackupAt'),
      store.getMeta('expectationsEnabled'),
    ]);

    const name = readStringMeta(filename);
    set({
      ready: true,
      players,
      teams: storedTeams.length > 0 ? storedTeams : makeTeams(),
      userData,
      lastBackupAt: readNumberMeta(lastBackupAt),
      // Chiave assente = acceso: chi non l'ha mai spento trova la feature al
      // suo posto, e solo una scelta esplicita la nasconde.
      expectationsEnabled: readNumberMeta(expectations) !== 0,
      listone:
        name === null
          ? null
          : {
              filename: name,
              importedAt: readNumberMeta(importedAt) ?? 0,
              count: readNumberMeta(count) ?? players.length,
            },
    });

    // §3.1 — auto-download all'apertura se l'ultimo backup e' vecchio.
    // Solo se c'e' qualcosa da salvare: un backup vuoto e' rumore.
    const hasWork =
      userData.lineups.length > 0 ||
      userData.playerNotes.length > 0 ||
      userData.teamNotes.length > 0 ||
      userData.events.length > 0;
    if (hasWork && shouldAutoBackup(readNumberMeta(lastBackupAt))) {
      // Un auto-backup che fallisce non deve impedire l'avvio: e' una rete di
      // sicurezza, non un prerequisito. Senza questo catch un download bloccato
      // lascerebbe l'app ferma su "Carico i dati..." con tutto il lavoro
      // dentro e nessun modo di arrivarci.
      try {
        await get().downloadBackup();
      } catch (cause) {
        set({
          message: {
            kind: 'error',
            text:
              `Backup automatico non riuscito (${
                cause instanceof Error ? cause.message : String(cause)
              }). Scaricane uno a mano da Impostazioni.`,
          },
        });
      }
    }
  },

  /**
   * Legge un listone e ne calcola il piano di import (§2).
   *
   * Non applica niente: mette il piano in `pendingListone` e aspetta conferma.
   * Solo il primo caricamento passa diretto, perche' non c'e' un listone
   * precedente con cui confrontarlo.
   */
  async importListone(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseListone(bytes);

      const plan = planListoneImport({
        current: get().players,
        next: parsed.players,
        data: get().userData,
        state: reduce(get().userData.events, get().leagueConfig()),
      });

      if (plan.blocked !== null) {
        set({
          pendingListone: null,
          message: {
            kind: 'error',
            text:
              `Re-import bloccato: ci sono ${plan.blocked.count} assegnazioni attive. ` +
              `Cambiare il listone ad asta iniziata invaliderebbe l'event log. ` +
              `Usa "Annulla tutte le assegnazioni" qui sotto, poi riprova.`,
          },
        });
        return;
      }

      const pending: PendingListone = {
        filename: file.name,
        plan,
        players: parsed.players,
        bytes,
        excludedCount: parsed.excludedCount,
      };

      // §2 vuole che il diff si mostri e si applichi su conferma, sempre.
      // L'unica eccezione e' il primo caricamento: non c'e' un prima con cui
      // confrontare, e far confermare "516 nuovi" sarebbe solo attrito.
      if (plan.firstImport) {
        await applyListone(pending, set);
        return;
      }
      set({ pendingListone: pending, message: null });
    } catch (cause) {
      set({
        pendingListone: null,
        message: {
          kind: 'error',
          text: cause instanceof Error ? cause.message : String(cause),
        },
      });
    }
  },

  async confirmListoneImport() {
    const pending = get().pendingListone;
    if (pending === null) return;
    await applyListone(pending, set);
  },

  cancelListoneImport() {
    set({ pendingListone: null });
  },

  setTeams(seeds, userIndex = 0) {
    return enqueue(async () => {
      // Rinominare non deve staccare gli acquisti gia' registrati: gli id
      // restano quelli, cambiano solo nome e sigla.
      const teams = updateTeams(get().teams, seeds, userIndex);
      await store.replaceTeams(teams);
      set({ teams });
    });
  },

  /**
   * Registra un'assegnazione (PRD §5.1).
   *
   * L'evento si valida contro lo stato ripiegato **prima** di scriverlo, e si
   * scrive su IndexedDB **prima** di aggiornare la vista: se il browser muore
   * subito dopo, l'acquisto c'e' gia'.
   */
  assign(playerId, teamId, price, phase) {
    return enqueue<AssignOutcome>(async () => {
      const config = get().leagueConfig();
      const events = get().userData.events;
      const event: AssignmentEvent = {
        id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.now(),
        playerId,
        teamId,
        price,
        phase,
        undone: false,
      };

      const state = reduce([...events, event], config);
      const rejection = state.rejections.find((r) => r.eventId === event.id);
      if (rejection !== undefined) return { ok: false, rejection };

      await store.saveEvent(event);
      set((current) => ({
        userData: { ...current.userData, events: [...current.userData.events, event] },
      }));
      return { ok: true, event };
    });
  },

  undoAssignment(eventId) {
    return enqueue(async () => {
      const events = undoEvent(get().userData.events, eventId);
      const changed = events.find((e) => e.id === eventId);
      if (changed === undefined) return;
      await store.saveEvent(changed);
      set((current) => ({ userData: { ...current.userData, events } }));
    });
  },

  redoAssignment(eventId) {
    return enqueue(async () => {
      const events = redoEvent(get().userData.events, eventId);
      const changed = events.find((e) => e.id === eventId);
      if (changed === undefined) return;
      await store.saveEvent(changed);
      set((current) => ({ userData: { ...current.userData, events } }));
    });
  },

  /**
   * Annulla ogni assegnazione attiva. Soft delete come tutti gli altri: gli
   * eventi restano nel log e si ripristinano uno per uno dall'asta.
   *
   * Serve a sbloccare il re-import del listone (§2). Senza, il blocco lascia
   * in un vicolo cieco: fermo, e senza un modo per sbloccarsi.
   */
  undoAllAssignments() {
    return enqueue(async () => {
      const before = get().userData.events;
      const events = undoAll(before);
      const changed = events.filter((event, i) => event !== before[i]);
      if (changed.length === 0) return;

      for (const event of changed) await store.saveEvent(event);
      set((current) => ({
        userData: { ...current.userData, events },
        message: {
          kind: 'ok',
          text:
            `${changed.length} assegnazioni annullate. Restano nel log: ` +
            `puoi ripristinarle una per una dall'asta.`,
        },
      }));
    });
  },

  /**
   * Cancella l'event log e riparte da zero (§5.1).
   *
   * E' l'altra meta' di `undoAllAssignments`, e la differenza e' tutta qui:
   * quella annulla, questa cancella. Una prova a vuoto lascia dietro di se'
   * una lista di colpi annullati che non e' storia di niente, e riaprire
   * "Ultime assegnazioni" su venti righe barrate della sessione di ieri
   * confonde e basta.
   *
   * Non si ripristina: chi chiama deve aver fatto confermare, e il backup
   * resta l'unica rete.
   */
  clearAuctionLog() {
    return enqueue(async () => {
      const count = get().userData.events.length;
      if (count === 0) return;

      await store.clearEvents();
      set((current) => ({
        userData: { ...current.userData, events: [] },
        message: {
          kind: 'ok',
          text: `Asta azzerata: ${count} ${count === 1 ? 'colpo cancellato' : 'colpi cancellati'} dal log.`,
        },
      }));
    });
  },

  setExpectationsEnabled(enabled) {
    return enqueue(async () => {
      await store.setMeta('expectationsEnabled', enabled ? 1 : 0);
      set({
        expectationsEnabled: enabled,
        message: {
          kind: 'ok',
          text: enabled
            ? 'Prezzo dinamico riacceso.'
            : 'Prezzo dinamico spento. Le aspettative restano salvate: riaccendendolo le ritrovi.',
        },
      });
    });
  },

  async undoLast() {
    const target = lastActiveEvent(get().userData.events);
    if (target !== null) await get().undoAssignment(target.id);
  },

  async redoLast() {
    const target = lastUndoneEvent(get().userData.events);
    if (target !== null) await get().redoAssignment(target.id);
  },

  updateLineup(teamCode, mutate) {
    return enqueue(async () => {
      const existing =
        get().userData.lineups.find((l) => l.teamCode === teamCode) ??
        emptyLineup(teamCode, DEFAULT_MODULE, Date.now());
      const updated = mutate(existing);

      await store.saveLineup(updated);
      set((current) => ({
        userData: {
          ...current.userData,
          lineups: upsert(current.userData.lineups, updated, (l) => l.teamCode === teamCode),
        },
      }));
      return updated;
    });
  },

  saveTeamNote(teamCode, text) {
    return enqueue(async () => {
      const note: TeamNote = { teamCode, text, updatedAt: Date.now() };
      await store.saveTeamNote(note);
      set((current) => ({
        userData: {
          ...current.userData,
          teamNotes: upsert(current.userData.teamNotes, note, (n) => n.teamCode === teamCode),
        },
      }));
    });
  },

  setPlayerNote(playerId, patch) {
    return enqueue(async () => {
      const existing = get().userData.playerNotes.find((n) => n.playerId === playerId) ?? null;
      // Niente scrittura se la patch non cambia niente: la nota si salva a
      // ogni battuta, e senza questo controllo ogni blur dopo il debounce
      // riscriverebbe una nota identica.
      if (isNoOpPatch(existing, patch)) return;

      const note = applyNotePatch(existing, patch, playerId, Date.now());
      await store.savePlayerNote(note);
      set((current) => ({
        userData: {
          ...current.userData,
          playerNotes: upsert(current.userData.playerNotes, note, (n) => n.playerId === playerId),
        },
      }));
    });
  },

  /**
   * Scrive l'aspettativa di un giocatore, creandola se non c'e'.
   *
   * I contatori si normalizzano qui: interi, mai negativi. La UI ha campi
   * numerici e un campo numerico accetta `-3` e `2.5` senza protestare, ma un
   * gol e mezzo non e' un'aspettativa e finirebbe dritto dentro il tasso di
   * reparto, spostando il prezzo di ogni altro giocatore.
   */
  setExpectation(playerId, patch) {
    return enqueue(async () => {
      const current = get().userData.expectations.find((e) => e.playerId === playerId);
      const base = current ?? emptyExpectation(playerId, 0);

      const clean = (value: number | undefined, fallback: number): number =>
        value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, Math.round(value));

      const next: Expectation = {
        playerId,
        matches: clean(patch.matches, base.matches),
        goals: clean(patch.goals, base.goals),
        assists: clean(patch.assists, base.assists),
        yellows: clean(patch.yellows, base.yellows),
        reds: clean(patch.reds, base.reds),
        updatedAt: Date.now(),
      };

      // Nessuna scrittura se non cambia niente: i campi si salvano a ogni
      // battuta e senza questo controllo ogni blur riscriverebbe la stessa riga
      // con un `updatedAt` nuovo, che poi vince i confronti in import.
      if (
        current !== undefined &&
        current.matches === next.matches &&
        current.goals === next.goals &&
        current.assists === next.assists &&
        current.yellows === next.yellows &&
        current.reds === next.reds
      ) {
        return;
      }

      await store.saveExpectation(next);
      set((state) => ({
        userData: {
          ...state.userData,
          expectations: upsert(state.userData.expectations, next, (e) => e.playerId === playerId),
        },
      }));
    });
  },

  clearExpectation(playerId) {
    return enqueue(async () => {
      if (!get().userData.expectations.some((e) => e.playerId === playerId)) return;
      await store.deleteExpectation(playerId);
      set((state) => ({
        userData: {
          ...state.userData,
          expectations: state.userData.expectations.filter((e) => e.playerId !== playerId),
        },
      }));
    });
  },

  setObjectivesText(text) {
    return enqueue(async () => {
      const objectives: Objectives = {
        ...get().userData.objectives,
        text,
        updatedAt: Date.now(),
      };
      await store.saveObjectives(objectives);
      set((current) => ({ userData: { ...current.userData, objectives } }));
    });
  },

  addObjectiveTarget(playerId, options) {
    // `addTarget` tocca sia gli obiettivi sia la nota del giocatore: mette il
    // tag solo se non ce n'e' gia' uno. Persisto entrambi.
    return enqueue(async () => {
      const before = get().userData;
      const after = addTarget(before, playerId, options ?? {});

      await store.saveObjectives(after.objectives);
      const note = after.playerNotes.find((n) => n.playerId === playerId);
      if (note !== undefined && note !== before.playerNotes.find((n) => n.playerId === playerId)) {
        await store.savePlayerNote(note);
      }
      set({ userData: after });
    });
  },

  removeObjectiveTarget(playerId) {
    // Il tag non si tocca: e' studio, la lista e' piano.
    return enqueue(async () => {
      const after = removeTarget(get().userData, playerId);
      await store.saveObjectives(after.objectives);
      set({ userData: after });
    });
  },

  async exportNativeXlsx() {
    const source = await store.loadSourceFile();
    if (source === null) {
      set({
        message: {
          kind: 'error',
          text: 'File sorgente non disponibile: ricarica il listone .xlsx e riprova.',
        },
      });
      return;
    }
    try {
      const config = get().leagueConfig();
      const state = reduce(get().userData.events, config);
      const result = buildNativeXlsx(source.bytes, assignmentsFromState(state, config));
      downloadBytes(nativeExportFilename(), result.bytes);
      set({
        message: {
          kind: 'ok',
          text:
            `Export nativo: ${result.written} righe compilate` +
            (result.missing.length > 0
              ? `, ${result.missing.length} assegnazioni senza riga nel listone corrente.`
              : '.'),
        },
      });
    } catch (cause) {
      set({
        message: { kind: 'error', text: cause instanceof Error ? cause.message : String(cause) },
      });
    }
  },

  async exportReportXlsx() {
    const config = get().leagueConfig();
    const state = reduce(get().userData.events, config);
    downloadBytes(reportFilename(), buildReportXlsx(state, config));
    set({ message: { kind: 'ok', text: 'Report scaricato.' } });
  },

  async exportPdf() {
    // Senza questo catch un fallimento di pdfmake finiva in una promise
    // rigettata e non gestita: il bottone non faceva niente e non lo diceva.
    try {
      const config = get().leagueConfig();
      const state = reduce(get().userData.events, config);
      await downloadRosterPdf(state, config);
      set({ message: { kind: 'ok', text: 'PDF delle rose scaricato.' } });
    } catch (cause) {
      set({
        message: {
          kind: 'error',
          text: `PDF non generato: ${cause instanceof Error ? cause.message : String(cause)}`,
        },
      });
    }
  },

  async downloadBackup() {
    const now = Date.now();
    downloadText(backupFilename(now), serializeUserData(get().userData, now));
    await store.setMeta('lastBackupAt', now);
    set({ lastBackupAt: now });
  },

  async previewBackup(file) {
    const text = await file.text();
    const config = makeLeagueConfig(get().players);
    const result = importUserData(get().userData, text, config);

    if (!result.ok) {
      set({
        pendingImport: null,
        message: { kind: 'error', text: `Import annullato — ${result.error.detail}` },
      });
      return;
    }
    set({ pendingImport: { filename: file.name, result }, message: null });
  },

  async confirmImport() {
    const pending = get().pendingImport;
    if (pending === null) return;
    await store.replaceUserData(pending.result.data);
    set({
      userData: pending.result.data,
      pendingImport: null,
      message: { kind: 'ok', text: `Backup "${pending.filename}" importato.` },
    });
  },

  cancelImport() {
    set({ pendingImport: null });
  },

  /**
   * Cancella tutto: listone, formazioni, note, obiettivi, event log, squadre.
   * L'app torna com'era alla prima apertura.
   *
   * Passa dalla coda come ogni altra scrittura, cosi' non puo' incrociarsi con
   * un salvataggio in volo e lasciare in giro meta' dei dati.
   */
  resetEverything() {
    return enqueue(async () => {
      await store.wipeEverything();
      set({
        players: [],
        teams: makeTeams(),
        userData: emptyUserData(),
        listone: null,
        lastBackupAt: null,
        expectationsEnabled: true,
        pendingImport: null,
        pendingListone: null,
        message: { kind: 'ok', text: 'Tutto cancellato. Ricomincia caricando il listone.' },
      });
    });
  },

  notify(kind, text) {
    set({ message: { kind, text } });
  },

  dismiss() {
    set({ message: null });
  },
}));
