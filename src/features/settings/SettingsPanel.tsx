import { useRef, useState } from 'react';

import { reduce } from '../../domain/reducer';
import { useAppStore } from '../../store/appStore';
import { LeagueSetup } from './LeagueSetup';
import { ReadinessCheck } from './ReadinessCheck';

/**
 * Impostazioni: backup, export, partecipanti, listone (PRD §2, §3.1, §6).
 *
 * Due colonne su schermi larghi e scroll proprio: la lista dei 12 partecipanti
 * e' lunga, e al 100% di zoom su un portatile finiva sotto il bordo senza
 * possibilita' di raggiungerla.
 */
export function SettingsPanel(): JSX.Element {
  const listone = useAppStore((s) => s.listone);
  const lastBackupAt = useAppStore((s) => s.lastBackupAt);
  const userData = useAppStore((s) => s.userData);
  const importListone = useAppStore((s) => s.importListone);
  const downloadBackup = useAppStore((s) => s.downloadBackup);
  const previewBackup = useAppStore((s) => s.previewBackup);
  const exportNativeXlsx = useAppStore((s) => s.exportNativeXlsx);
  const exportReportXlsx = useAppStore((s) => s.exportReportXlsx);
  const exportPdf = useAppStore((s) => s.exportPdf);
  const eventsCount = useAppStore((s) => s.userData.events.length);

  const listoneInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const formatted = (ts: number | null): string =>
    ts === null ? 'mai' : new Date(ts).toLocaleString('it-IT');

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <ReadinessCheck />

          <section className="rounded border border-amber-800/60 bg-amber-950/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
              Backup dei dati
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Formazioni, note e obiettivi vivono in IndexedDB: una pulizia dati del browser li
              cancella senza avvisare. Scarica un backup ogni volta che finisci di lavorare.
            </p>
            <p className="mt-2 text-sm text-neutral-300">
              Ultimo backup: <strong>{formatted(lastBackupAt)}</strong> · {userData.lineups.length}{' '}
              formazioni, {userData.teamNotes.length} note squadra, {userData.playerNotes.length}{' '}
              note giocatore
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
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

          <section className="rounded border border-neutral-800 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Export
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              {eventsCount === 0
                ? 'Nessuna assegnazione registrata: i file usciranno con le colonne vuote.'
                : `${eventsCount} assegnazioni nel log.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void exportNativeXlsx()}
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
                title="Il listone originale con FantaSquadra e Costo compilate"
              >
                .xlsx nativo reimportabile
              </button>
              <button
                type="button"
                onClick={() => void exportReportXlsx()}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                .xlsx report
              </button>
              <button
                type="button"
                onClick={() => void exportPdf()}
                className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                .pdf rose
              </button>
            </div>
          </section>

          <section className="rounded border border-neutral-800 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
              Listone
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {listone === null ? (
                <>Nessun listone caricato.</>
              ) : (
                <>
                  <strong className="text-neutral-200">{listone.filename}</strong> ·{' '}
                  {listone.count} giocatori · caricato il {formatted(listone.importedAt)}
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

            <ResetAuction />
          </section>

          <DangerZone />
        </div>

        <LeagueSetup />
      </div>
    </div>
  );
}

/**
 * Annulla tutte le assegnazioni (§2).
 *
 * Il re-import si blocca ad asta iniziata, e senza questo bottone il blocco
 * sarebbe un vicolo cieco. Conferma in due passaggi perche' e' un gesto grosso,
 * anche se reversibile: gli eventi restano nel log come annullati.
 */
function ResetAuction(): JSX.Element | null {
  const userData = useAppStore((s) => s.userData);
  const leagueConfig = useAppStore((s) => s.leagueConfig);
  const undoAllAssignments = useAppStore((s) => s.undoAllAssignments);
  const downloadBackup = useAppStore((s) => s.downloadBackup);

  const [arming, setArming] = useState(false);

  const active = reduce(userData.events, leagueConfig()).appliedEventIds.length;
  if (active === 0) return null;

  return (
    <div className="mt-4 rounded border border-amber-800/60 bg-amber-950/20 p-3">
      <p className="text-xs text-amber-200">
        {active} assegnazioni attive. Il re-import del listone resta bloccato finché ce ne sono:
        cambiare il listone ad asta iniziata invaliderebbe l’event log.
      </p>

      {arming ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-amber-200">
            Confermi? Restano nel log e le puoi ripristinare una per una dall’asta.
          </span>
          <button
            type="button"
            onClick={() => {
              void undoAllAssignments();
              setArming(false);
            }}
            className="rounded bg-amber-700 px-3 py-1 text-xs text-white hover:bg-amber-600"
          >
            Sì, annullale tutte
          </button>
          <button
            type="button"
            onClick={() => setArming(false)}
            className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            No
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setArming(true)}
            className="rounded border border-amber-700 px-3 py-1 text-xs text-amber-200 hover:bg-amber-900/40"
          >
            Annulla tutte le assegnazioni
          </button>
          <button
            type="button"
            onClick={() => void downloadBackup()}
            className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Scarica prima un backup
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Cancellazione totale.
 *
 * E' l'unica operazione irreversibile dell'app — ovunque altro si annulla o si
 * archivia. Sta in fondo, dietro una conferma in due passaggi, e col bottone
 * del backup accanto: chi arriva qui dovrebbe avere una copia prima di premere.
 */
function DangerZone(): JSX.Element {
  const userData = useAppStore((s) => s.userData);
  const listone = useAppStore((s) => s.listone);
  const resetEverything = useAppStore((s) => s.resetEverything);
  const downloadBackup = useAppStore((s) => s.downloadBackup);

  const [arming, setArming] = useState(false);

  const cose = [
    listone !== null ? `il listone (${listone.count} giocatori)` : null,
    userData.lineups.length > 0 ? `${userData.lineups.length} formazioni` : null,
    userData.playerNotes.length > 0 ? `${userData.playerNotes.length} note giocatore` : null,
    userData.teamNotes.length > 0 ? `${userData.teamNotes.length} note squadra` : null,
    userData.objectives.targets.length > 0
      ? `${userData.objectives.targets.length} obiettivi`
      : null,
    userData.events.length > 0 ? `${userData.events.length} assegnazioni` : null,
  ].filter((x): x is string => x !== null);

  const vuoto = cose.length === 0;

  return (
    <section className="rounded border border-red-900/70 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400">
        Ricomincia da capo
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        {vuoto
          ? 'Non c’è niente da cancellare: l’app è già come appena installata.'
          : 'Cancella tutto e riporta l’app allo stato di prima apertura. Non si annulla.'}
      </p>

      {!vuoto && (
        <>
          <ul className="mt-2 list-inside list-disc text-xs text-neutral-400">
            {cose.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>

          {arming ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-red-300">
                Confermi? Tutto quello che c’è qui sopra sparisce.
              </span>
              <button
                type="button"
                onClick={() => {
                  void resetEverything();
                  setArming(false);
                }}
                className="rounded bg-red-800 px-3 py-1 text-xs text-white hover:bg-red-700"
              >
                Sì, cancella tutto
              </button>
              <button
                type="button"
                onClick={() => setArming(false)}
                className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                No
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadBackup()}
                className="rounded border border-amber-700 px-3 py-1 text-xs text-amber-200 hover:bg-amber-900/40"
              >
                Scarica prima un backup
              </button>
              <button
                type="button"
                onClick={() => setArming(true)}
                className="rounded border border-red-800 px-3 py-1 text-xs text-red-300 hover:bg-red-950/50"
              >
                Cancella tutto
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
