import { create } from 'zustand';

import type {
  AssignmentEvent,
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
import { makeLeagueConfig, makeTeams } from '../domain/config';
import type { EventRejection } from '../domain/reducer';
import { lastActiveEvent, lastUndoneEvent, redoEvent, reduce, undoEvent } from '../domain/reducer';
import { DEFAULT_MODULE, emptyLineup } from '../domain/modules';
import type { PlayerNotePatch } from '../domain/notes';
import { applyNotePatch, isNoOpPatch } from '../domain/notes';
import type { AddTargetOptions } from '../domain/objectives';
import { addTarget, removeTarget } from '../domain/objectives';
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
  readonly message: { readonly kind: 'ok' | 'error'; readonly text: string } | null;

  /** Lega corrente: squadre, crediti, slot, listone. */
  leagueConfig: () => LeagueConfig;

  init: () => Promise<void>;
  importListone: (file: File) => Promise<void>;
  setTeams: (
    seeds: readonly (readonly [name: string, abbr: string])[],
    userIndex?: number,
  ) => Promise<void>;
  assign: (playerId: number, teamId: string, price: number, phase: Role) => Promise<AssignOutcome>;
  undoAssignment: (eventId: string) => Promise<void>;
  redoAssignment: (eventId: string) => Promise<void>;
  undoLast: () => Promise<void>;
  redoLast: () => Promise<void>;
  updateLineup: (teamCode: string, mutate: (lineup: Lineup) => Lineup) => Promise<Lineup>;
  saveTeamNote: (teamCode: string, text: string) => Promise<void>;
  setPlayerNote: (playerId: number, patch: PlayerNotePatch) => Promise<void>;
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
  notify: (kind: 'ok' | 'error', text: string) => void;
  dismiss: () => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  players: [],
  teams: makeTeams(),
  userData: emptyUserData(),
  listone: null,
  lastBackupAt: null,
  pendingImport: null,
  message: null,

  leagueConfig() {
    return makeLeagueConfig(get().players, { teams: get().teams });
  },

  async init() {
    const [players, userData, storedTeams, filename, importedAt, count, lastBackupAt] =
      await Promise.all([
      store.loadPlayers(),
      store.loadUserData(),
      store.loadTeams(),
      store.getMeta('listoneFilename'),
      store.getMeta('listoneImportedAt'),
      store.getMeta('listoneCount'),
      store.getMeta('lastBackupAt'),
    ]);

    const name = readStringMeta(filename);
    set({
      ready: true,
      players,
      teams: storedTeams.length > 0 ? storedTeams : makeTeams(),
      userData,
      lastBackupAt: readNumberMeta(lastBackupAt),
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
      await get().downloadBackup();
    }
  },

  async importListone(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseListone(bytes);
      const now = Date.now();

      await store.replacePlayers(parsed.players);
      // Il file originale resta com'e': l'export nativo di §6.1 ci riscrive
      // dentro invece di rigenerarlo.
      await store.saveSourceFile(file.name, bytes);
      await store.setMeta('listoneFilename', file.name);
      await store.setMeta('listoneImportedAt', now);
      await store.setMeta('listoneCount', parsed.players.length);

      set({
        players: parsed.players,
        listone: { filename: file.name, importedAt: now, count: parsed.players.length },
        message: {
          kind: 'ok',
          text:
            `Listone caricato: ${parsed.players.length} giocatori, ` +
            `${parsed.excludedCount} fuori lista esclusi.`,
        },
      });
    } catch (cause) {
      set({
        message: {
          kind: 'error',
          text: cause instanceof Error ? cause.message : String(cause),
        },
      });
    }
  },

  setTeams(seeds, userIndex = 0) {
    return enqueue(async () => {
      const teams = makeTeams(seeds, userIndex);
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

  notify(kind, text) {
    set({ message: { kind, text } });
  },

  dismiss() {
    set({ message: null });
  },
}));
