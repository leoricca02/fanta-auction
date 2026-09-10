import { useMemo, useState } from 'react';

import type { Check, CheckLevel } from '../../domain/readiness';
import { computeReadiness } from '../../domain/readiness';
import { useAppStore } from '../../store/appStore';

/**
 * "Sei pronto?" — la checklist pre-asta (§5.5).
 *
 * Sta in cima alle impostazioni perche' e' da qui che si rimedia: listone,
 * partecipanti e backup sono tutti in questa pagina, e le formazioni sono a un
 * clic. Ogni voce dice il numero e cosa fare; niente consigli senza un dato
 * accanto.
 *
 * Chiusa mostra una riga sola — quante voci sono a posto e la prima che non lo
 * e'. Aperta, tutte. Lo stato sta nel componente: e' una schermata che si guarda
 * la sera prima, non un'impostazione da ricordare.
 */

const DOT: Readonly<Record<CheckLevel, string>> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  todo: 'bg-rose-500',
};

const RING: Readonly<Record<CheckLevel, string>> = {
  ok: 'border-hair',
  warn: 'border-amber-900/70',
  todo: 'border-rose-900/70',
};

export function ReadinessCheck(): JSX.Element {
  const players = useAppStore((s) => s.players);
  const teams = useAppStore((s) => s.teams);
  const userData = useAppStore((s) => s.userData);
  const lastBackupAt = useAppStore((s) => s.lastBackupAt);

  const [open, setOpen] = useState(false);

  const readiness = useMemo(
    () =>
      computeReadiness({
        players,
        teamsConfigured: teams.length,
        hasUserTeam: teams.some((t) => t.isUser),
        lineups: userData.lineups,
        notes: userData.playerNotes,
        objectives: userData.objectives,
        lastBackupAt,
        now: Date.now(),
      }),
    [players, teams, userData, lastBackupAt],
  );

  const firstOpenItem = readiness.checks.find((c) => c.level !== 'ok') ?? null;

  return (
    <section
      className={`rounded-lg border p-4 ${
        readiness.ready ? 'border-hair' : 'border-amber-800/60 bg-amber-950/10'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          Sei pronto?
        </h2>

        {/* Una pallina per voce: lo stato si legge senza aprire niente. */}
        <span className="flex gap-1">
          {readiness.checks.map((c) => (
            <span key={c.id} className={`h-2 w-2 rounded-full ${DOT[c.level]}`} title={c.label} />
          ))}
        </span>

        <span className="text-xs num text-zinc-500">
          {readiness.done}/{readiness.total} a posto
        </span>

        <span className="ml-auto text-xs text-zinc-500">{open ? 'chiudi' : 'apri'}</span>
      </button>

      {!open && firstOpenItem !== null && (
        <p className="mt-2 text-xs text-zinc-400">
          <span className="text-zinc-200">{firstOpenItem.label}:</span> {firstOpenItem.detail}
        </p>
      )}
      {!open && firstOpenItem === null && (
        <p className="mt-2 text-xs text-emerald-400">
          Tutto in ordine: listone, partecipanti, formazioni, obiettivi, appunti e backup.
        </p>
      )}

      {open && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {readiness.checks.map((c) => (
            <CheckRow key={c.id} check={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CheckRow({ check }: { readonly check: Check }): JSX.Element {
  return (
    <li className={`rounded-lg border bg-veil px-3 py-2 ${RING[check.level]}`}>
      <div className="flex items-baseline gap-2">
        <span className={`h-2 w-2 shrink-0 translate-y-[-1px] rounded-full ${DOT[check.level]}`} />
        <span className="text-xs font-medium text-zinc-200">{check.label}</span>
        <span className="text-xs text-zinc-400">{check.detail}</span>
      </div>
      {check.action !== '' && (
        <p className="mt-1 pl-4 text-[11px] text-zinc-500">{check.action}</p>
      )}
    </li>
  );
}
