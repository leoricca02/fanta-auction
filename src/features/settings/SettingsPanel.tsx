import { useEffect, useRef, useState } from 'react';

import { reduce } from '../../domain/reducer';
import { useAppStore } from '../../store/appStore';
import { storageDurability, type StorageDurability } from '../../store/persist';
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

          <section className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-400">
              Backup dei dati
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Formazioni, note e obiettivi vivono in IndexedDB: una pulizia dati del browser li
              cancella senza avvisare. Scarica un backup ogni volta che finisci di lavorare.
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              Ultimo backup: <strong>{formatted(lastBackupAt)}</strong> · {userData.lineups.length}{' '}
              formazioni, {userData.teamNotes.length} note squadra, {userData.playerNotes.length}{' '}
              note giocatore <StorageStatus />
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
                className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.06]"
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

          <section className="rounded-lg border border-white/[0.08] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Export
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
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
                className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.06]"
              >
                .xlsx report
              </button>
              <button
                type="button"
                onClick={() => void exportPdf()}
                className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.06]"
              >
                .pdf rose
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-white/[0.08] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Listone
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              {listone === null ? (
                <>Nessun listone caricato.</>
              ) : (
                <>
                  <strong className="text-zinc-200">{listone.filename}</strong> ·{' '}
                  {listone.count} giocatori · caricato il {formatted(listone.importedAt)}
                </>
              )}
            </p>

            <div className="mt-3">
              <button
                type="button"
                onClick={() => listoneInput.current?.click()}
                className="rounded-lg border border-white/[0.12] px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/[0.06]"
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
    <div className="mt-4 rounded-lg border border-amber-800/60 bg-amber-950/20 p-3">
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
            className="rounded-lg border border-white/[0.12] px-3 py-1 text-xs text-zinc-300 hover:bg-white/[0.06]"
          >
            No
          </button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setArming(true)}
            className="rounded-lg border border-amber-700 px-3 py-1 text-xs text-amber-200 hover:bg-amber-900/40"
          >
            Annulla tutte le assegnazioni
          </button>
          <button
            type="button"
            onClick={() => void downloadBackup()}
            className="rounded-lg border border-white/[0.12] px-3 py-1 text-xs text-zinc-300 hover:bg-white/[0.06]"
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
    <section className="rounded-lg border border-rose-500/30/70 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-400">
        Ricomincia da capo
      </h2>
      <p className="mt-1 text-sm text-zinc-400">
        {vuoto
          ? 'Non c’è niente da cancellare: l’app è già come appena installata.'
          : 'Cancella tutto e riporta l’app allo stato di prima apertura. Non si annulla.'}
      </p>

      {!vuoto && (
        <>
          <ul className="mt-2 list-inside list-disc text-xs text-zinc-400">
            {cose.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>

          {arming ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-rose-300">
                Confermi? Tutto quello che c’è qui sopra sparisce.
              </span>
              <button
                type="button"
                onClick={() => {
                  void resetEverything();
                  setArming(false);
                }}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-rose-400"
              >
                Sì, cancella tutto
              </button>
              <button
                type="button"
                onClick={() => setArming(false)}
                className="rounded-lg border border-white/[0.12] px-3 py-1 text-xs text-zinc-300 hover:bg-white/[0.06]"
              >
                No
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadBackup()}
                className="rounded-lg border border-amber-700 px-3 py-1 text-xs text-amber-200 hover:bg-amber-900/40"
              >
                Scarica prima un backup
              </button>
              <button
                type="button"
                onClick={() => setArming(true)}
                className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-500/10"
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

/**
 * Se il browser ha concesso la persistenza dei dati. Inline nella riga del
 * backup e non a capo: la sezione e' gia' un avviso, e una riga in piu' qui
 * spingeva tutta la colonna verso il basso per dire una cosa secondaria.
 * Muto dove l'API non esiste.
 */
function StorageStatus(): JSX.Element | null {
  const [state, setState] = useState<StorageDurability>('unknown');

  useEffect(() => {
    let alive = true;
    void storageDurability().then((d) => {
      if (alive) setState(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'unknown') return null;

  return state === 'persistent' ? (
    <span className="text-emerald-400" title="Il browser non sfratta i dati da solo.">
      {' '}
      · archiviazione persistente
    </span>
  ) : (
    <span
      className="text-amber-400"
      title={
        "Il browser puo' cancellare i dati per liberare spazio: su iPad Safari lo fa dopo " +
        "sette giorni senza aprire l'app. Installala sulla home screen per ottenere la persistenza."
      }
    >
      {' '}
      · archiviazione sfrattabile
    </span>
  );
}
