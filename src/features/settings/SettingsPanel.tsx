import { useRef } from 'react';

import { useAppStore } from '../../store/appStore';

/**
 * Listone e backup (PRD §2, §3.1).
 *
 * Il backup e' il rischio numero uno del progetto: sta qui in cima, con la data
 * dell'ultimo salvataggio sempre visibile.
 */
export function SettingsPanel(): JSX.Element {
  const listone = useAppStore((s) => s.listone);
  const lastBackupAt = useAppStore((s) => s.lastBackupAt);
  const userData = useAppStore((s) => s.userData);
  const importListone = useAppStore((s) => s.importListone);
  const downloadBackup = useAppStore((s) => s.downloadBackup);
  const previewBackup = useAppStore((s) => s.previewBackup);

  const listoneInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const formatted = (ts: number | null): string =>
    ts === null ? 'mai' : new Date(ts).toLocaleString('it-IT');

  return (
    <div className="flex flex-col gap-6 p-6">
      <section className="max-w-2xl rounded border border-amber-800/60 bg-amber-950/20 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
          Backup dei dati
        </h2>
        <p className="mt-1 text-sm text-neutral-400">
          Formazioni, note e obiettivi vivono in IndexedDB: una pulizia dati del browser li
          cancella senza avvisare. Scarica un backup ogni volta che finisci di lavorare.
        </p>
        <p className="mt-2 text-sm text-neutral-300">
          Ultimo backup: <strong>{formatted(lastBackupAt)}</strong> · {userData.lineups.length}{' '}
          formazioni, {userData.teamNotes.length} note squadra, {userData.playerNotes.length} note
          giocatore
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void downloadBackup()}
            className="rounded bg-amber-700 px-3 py-1.5 text-sm text-white hover:bg-amber-600"
          >
            Scarica backup .json
          </button>
          <button
            type="button"
            onClick={() => backupInput.current?.click()}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Importa backup…
          </button>
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file !== undefined) void previewBackup(file);
            }}
          />
        </div>
      </section>

      <section className="max-w-2xl rounded border border-neutral-800 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Listone</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {listone === null ? (
            <>Nessun listone caricato.</>
          ) : (
            <>
              <strong className="text-neutral-200">{listone.filename}</strong> · {listone.count}{' '}
              giocatori · caricato il {formatted(listone.importedAt)}
            </>
          )}
        </p>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => listoneInput.current?.click()}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Carica .xlsx…
          </button>
          <input
            ref={listoneInput}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file !== undefined) void importListone(file);
            }}
          />
        </div>
      </section>
    </div>
  );
}
