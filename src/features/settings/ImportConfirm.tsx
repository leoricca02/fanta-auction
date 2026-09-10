import { useAppStore } from '../../store/appStore';

/**
 * Conferma di un import di backup (PRD §3.1).
 *
 * Mostra **prima** di applicare: cosa entra, cosa e' stato saltato perche' piu'
 * vecchio di quello che c'e' gia', e quanti eventi il reducer scartera'. Niente
 * viene scritto finche' non si conferma.
 */
export function ImportConfirm(): JSX.Element | null {
  const pending = useAppStore((s) => s.pendingImport);
  const confirmImport = useAppStore((s) => s.confirmImport);
  const cancelImport = useAppStore((s) => s.cancelImport);

  if (pending === null) return null;

  const { summary, conflicts } = pending.result;
  const rows: readonly (readonly [string, { added: number; updated: number; skipped: number; untouched: boolean }])[] = [
    ['Formazioni', summary.lineups],
    ['Note giocatore', summary.playerNotes],
    ['Note squadra', summary.teamNotes],
    ['Eventi d asta', summary.events],
  ];

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        className="glass max-h-full w-full max-w-lg animate-pop-in overflow-y-auto rounded-2xl p-5 shadow-pop"
      >
        <h2 className="text-base font-semibold text-zinc-100">
          Importare “{pending.filename}”?
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Niente e' ancora stato scritto. Questa e' l'anteprima del risultato.
        </p>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-1">Collezione</th>
              <th className="pb-1 text-right">Nuovi</th>
              <th className="pb-1 text-right">Aggiornati</th>
              <th className="pb-1 text-right">Saltati</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300">
            {rows.map(([label, s]) => (
              <tr key={label}>
                <td className="py-0.5">{label}</td>
                <td className="py-0.5 text-right num">{s.untouched ? '—' : s.added}</td>
                <td className="py-0.5 text-right num">{s.untouched ? '—' : s.updated}</td>
                <td className="py-0.5 text-right num text-amber-400">
                  {s.untouched ? '—' : s.skipped}
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-0.5">Obiettivi</td>
              <td className="py-0.5 text-right" colSpan={3}>
                {summary.objectivesReplaced ? 'sostituiti dal file' : 'lasciati come sono'}
              </td>
            </tr>
          </tbody>
        </table>

        {summary.skippedRecords.length > 0 && (
          <div className="mt-4 rounded-lg border border-hair p-3">
            <p className="text-xs font-medium text-amber-400">
              {summary.skippedRecords.length} record del file sono piu' vecchi di quelli che hai
              gia': restano i tuoi.
            </p>
            <ul className="mt-1 max-h-24 overflow-y-auto text-xs text-zinc-500">
              {summary.skippedRecords.map((r) => (
                <li key={`${r.collection}:${r.key}`}>
                  {r.collection} · {r.key}
                </li>
              ))}
            </ul>
          </div>
        )}

        {conflicts.rejectedCount > 0 && (
          <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
            <p className="text-sm font-medium text-rose-300">
              {conflicts.rejectedCount}{' '}
              {conflicts.rejectedCount === 1 ? 'evento verra scartato' : 'eventi verranno scartati'}{' '}
              dal ricalcolo dello stato di lega.
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {conflicts.fromFile} dal file, {conflicts.fromCurrent} gia' presenti. Restano tutti
              nel log: nessun dato viene perso.
            </p>
            {conflicts.newlyRejected.length > 0 && (
              <p className="mt-2 text-xs font-medium text-rose-300">
                Attenzione: {conflicts.newlyRejected.length}{' '}
                {conflicts.newlyRejected.length === 1
                  ? 'assegnazione che oggi e valida smettera di esserlo'
                  : 'assegnazioni che oggi sono valide smetteranno di esserlo'}
                .
              </p>
            )}
            <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-zinc-400">
              {conflicts.rejected.map((r) => (
                <li key={r.eventId}>· {r.detail}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelImport}
            className="rounded-lg border border-rim px-3 py-1.5 text-sm text-zinc-300 hover:bg-scrim"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => void confirmImport()}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
          >
            Importa
          </button>
        </div>
      </div>
    </div>
  );
}
