import { create } from 'zustand';

import type { Lineup, Player, TeamNote, UserData } from '../domain/types';
import type { ImportResult } from '../domain/backup';
import {
  backupFilename,
  emptyUserData,
  importUserData,
  serializeUserData,
  shouldAutoBackup,
} from '../domain/backup';
import { makeLeagueConfig } from '../domain/config';
import { DEFAULT_MODULE, emptyLineup } from '../domain/modules';
import { parseListone } from '../parse/listone';
import * as store from './db';

/**
 * Stato applicativo (Zustand) sopra la persistenza Dexie.
 *
 * Ogni azione che modifica dati utente **scrive prima su IndexedDB e poi
 * aggiorna lo stato**: cio' che e' a schermo e' sempre gia' su disco.
 */

export interface ListoneInfo {
  readonly filename: string;
  readonly importedAt: number;
  readonly count: number;
}

/** Anteprima di un import in attesa di conferma (§3.1, correzione dry-run). */
export interface PendingImport {
  readonly filename: string;
  readonly result: Extract<ImportResult, { ok: true }>;
}

export interface AppState {
  readonly ready: boolean;
  readonly players: readonly Player[];
  readonly userData: UserData;
  readonly listone: ListoneInfo | null;
  readonly lastBackupAt: number | null;
  readonly pendingImport: PendingImport | null;
  readonly message: { readonly kind: 'ok' | 'error'; readonly text: string } | null;

  init: () => Promise<void>;
  importListone: (file: File) => Promise<void>;
  updateLineup: (teamCode: string, mutate: (lineup: Lineup) => Lineup) => Promise<Lineup>;
  saveTeamNote: (teamCode: string, text: string) => Promise<void>;
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

/** Scarica un testo come file. L'unico punto in cui il dominio tocca il browser. */
function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Coda di scrittura delle formazioni: un aggiornamento alla volta, in ordine. */
let lineupQueue: Promise<void> = Promise.resolve();

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  players: [],
  userData: emptyUserData(),
  listone: null,
  lastBackupAt: null,
  pendingImport: null,
  message: null,

  async init() {
    const [players, userData, filename, importedAt, count, lastBackupAt] = await Promise.all([
      store.loadPlayers(),
      store.loadUserData(),
      store.getMeta('listoneFilename'),
      store.getMeta('listoneImportedAt'),
      store.getMeta('listoneCount'),
      store.getMeta('lastBackupAt'),
    ]);

    const name = readStringMeta(filename);
    set({
      ready: true,
      players,
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

  updateLineup(teamCode, mutate) {
    // Le modifiche si accodano invece di partire tutte dallo stesso stato.
    // Senza questa serializzazione una raffica di Invio nell'editor perde
    // tutti i pick tranne l'ultimo: ogni gestore leggerebbe la formazione
    // com'era prima della scrittura ancora in volo.
    const next = lineupQueue.then(async () => {
      const state = get();
      const existing =
        state.userData.lineups.find((l) => l.teamCode === teamCode) ??
        emptyLineup(teamCode, DEFAULT_MODULE, Date.now());
      const updated = mutate(existing);

      await store.saveLineup(updated);
      set((current) => ({
        userData: {
          ...current.userData,
          lineups: current.userData.lineups.some((l) => l.teamCode === teamCode)
            ? current.userData.lineups.map((l) => (l.teamCode === teamCode ? updated : l))
            : [...current.userData.lineups, updated],
        },
      }));
      return updated;
    });

    lineupQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  },

  async saveTeamNote(teamCode, text) {
    const note: TeamNote = { teamCode, text, updatedAt: Date.now() };
    await store.saveTeamNote(note);
    set((state) => ({
      userData: {
        ...state.userData,
        teamNotes: state.userData.teamNotes.some((n) => n.teamCode === teamCode)
          ? state.userData.teamNotes.map((n) => (n.teamCode === teamCode ? note : n))
          : [...state.userData.teamNotes, note],
      },
    }));
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
