import { planTouchesUserData } from '../../domain/listone-diff';
import { useAppStore } from '../../store/appStore';

/**
 * Conferma di un re-import del listone (PRD §2).
 *
 * Mostra il diff **prima** di applicarlo, e soprattutto dice cosa costa: quali
 * giocatori su cui hai lavorato escono dalla Serie A, quali formazioni perdono
 * qualcuno, quanti slot restano vuoti. Le note non si cancellano mai — si
 * archiviano — ma le formazioni sì, e vederlo dopo sarebbe troppo tardi.
 */
export function ListoneConfirm(): JSX.Element | null {
  const pending = useAppStore((s) => s.pendingListone);
  const confirmListoneImport = useAppStore((s) => s.confirmListoneImport);
  const cancelListoneImport = useAppStore((s) => s.cancelListoneImport);

  if (pending === null) return null;

  const { diff, impact } = pending.plan;
  const harmless = !planTouchesUserData(pending.plan);

  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        className="glass max-h-full w-full max-w-2xl animate-pop-in overflow-y-auto rounded-2xl p-5 shadow-pop"
      >
        <h2 className="text-base font-semibold text-zinc-100">
          Sostituire il listone con “{pending.filename}”?
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Niente è ancora stato scritto. Le note dei giocatori usciti vengono archiviate, non
          cancellate.
        </p>

        {harmless && (
          <p className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Nessun tuo dato viene toccato: formazioni, note e obiettivi restano come sono.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <Stat label="confermati" value={diff.kept} />
          <Stat label="nuovi" value={diff.added.length} tone="ok" />
          <Stat label="usciti" value={diff.removed.length} tone="warn" />
          <Stat label="cambio squadra" value={diff.teamChanged.length} />
        </dl>

        {diff.quotChanged.length > 0 && (
          <Section title={`Quotazione variata oltre il 20% (${diff.quotChanged.length})`}>
            <ul className="max-h-32 overflow-y-auto text-xs text-zinc-400">
              {diff.quotChanged.map((change) => (
                <li key={change.player.id}>
                  {change.player.name}: {change.from} → {change.to}{' '}
                  <span className={change.deltaPct > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    ({change.deltaPct > 0 ? '+' : ''}
                    {change.deltaPct.toFixed(0)}%)
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {impact.removedWithData.length > 0 && (
          <Section
            title={`${impact.removedWithData.length} usciti su cui avevi lavorato`}
            tone="warn"
          >
            <ul className="max-h-40 overflow-y-auto text-xs text-zinc-300">
              {impact.removedWithData.map(({ player, reasons }) => (
                <li key={player.id}>
                  <span className="text-zinc-100">{player.name}</span>{' '}
                  <span className="text-zinc-500">({player.team})</span>{' '}
                  <span className="text-amber-400">— {reasons.join(', ')}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {impact.teamChangedInLineup.length > 0 && (
          <Section
            title={`${impact.teamChangedInLineup.length} schierati che hanno cambiato squadra`}
            tone="warn"
          >
            <ul className="max-h-32 overflow-y-auto text-xs text-zinc-300">
              {impact.teamChangedInLineup.map((change) => (
                <li key={change.player.id}>
                  {change.player.name}: {change.from} → {change.to}
                  <span className="text-zinc-500"> — esce dalla formazione del {change.from}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {impact.lineupsTouched.length > 0 && (
          <Section title="Formazioni da ritoccare" tone="warn">
            <p className="text-xs text-zinc-300">
              {impact.lineupsTouched.join(', ')} —{' '}
              <strong className="text-amber-300">
                {impact.slotsEmptied} slot {impact.slotsEmptied === 1 ? 'resterà vuoto' : 'resteranno vuoti'}
              </strong>
              .
            </p>
          </Section>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelListoneImport}
            className="rounded-lg border border-rim px-3 py-1.5 text-sm text-zinc-300 hover:bg-scrim"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => void confirmListoneImport()}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
          >
            {harmless ? 'Aggiorna il listone' : 'Sostituisci il listone'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone?: 'ok' | 'warn';
}): JSX.Element {
  const color =
    tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-zinc-100';
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`text-lg num ${color}`}>{value}</dd>
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  readonly title: string;
  readonly tone?: 'warn';
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <section
      className={`mt-4 rounded-lg border p-3 ${
        tone === 'warn' ? 'border-amber-800 bg-amber-950/25' : 'border-hair'
      }`}
    >
      <h3
        className={`text-xs font-medium ${tone === 'warn' ? 'text-amber-300' : 'text-zinc-400'}`}
      >
        {title}
      </h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}
