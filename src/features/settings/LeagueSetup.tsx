import { useState } from 'react';

import { useAppStore } from '../../store/appStore';

/**
 * Setup dei 12 partecipanti (PRD §3).
 *
 * Le sigle sono di tre lettere e sono la chiave con cui la command bar assegna:
 * "sq2" non e' il nome di nessuno, e sotto asta un prefisso ambiguo e' un
 * acquisto messo alla squadra sbagliata. Vanno compilate prima di cominciare.
 */
export function LeagueSetup(): JSX.Element {
  const teams = useAppStore((s) => s.teams);
  const setTeams = useAppStore((s) => s.setTeams);
  const eventsCount = useAppStore((s) => s.userData.events.length);

  const [rows, setRows] = useState(() => teams.map((t) => ({ name: t.name, abbr: t.abbr })));
  const [userIndex, setUserIndex] = useState(() => Math.max(0, teams.findIndex((t) => t.isUser)));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(index: number, patch: Partial<{ name: string; abbr: string }>): void {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    setSaved(false);
    setError(null);
  }

  async function save(): Promise<void> {
    try {
      await setTeams(
        rows.map((r) => [r.name.trim(), r.abbr.trim().toLowerCase()] as const),
        userIndex,
      );
      setSaved(true);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setSaved(false);
    }
  }

  const duplicates = new Set(
    rows
      .map((r) => r.abbr.trim().toLowerCase())
      .filter((abbr, i, all) => abbr !== '' && all.indexOf(abbr) !== i),
  );

  return (
    <section className="rounded-lg border border-white/[0.08] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Partecipanti
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        Nomi e sigle dei 12. La sigla è di 3 lettere e serve alla command bar:{' '}
        <code className="text-zinc-300">dimarco 60 mrc</code>.
      </p>

      {eventsCount > 0 && (
        <p className="mt-2 rounded-lg border border-white/[0.12] px-2 py-1 text-xs text-zinc-400">
          Ci sono già {eventsCount} assegnazioni registrate. Rinominare una squadra o cambiarne la
          sigla non le tocca: restano agganciate alla <em>riga</em> di questo elenco, non al nome.
          Non riordinare le righe.
        </p>
      )}

      <ol className="mt-3 flex flex-col gap-1">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="userTeam"
              checked={userIndex === i}
              onChange={() => {
                setUserIndex(i);
                setSaved(false);
              }}
              title="Questa è la tua squadra"
            />
            <input
              value={row.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={`Squadra ${i + 1}`}
              className="flex-1 rounded bg-white/[0.03] px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-zinc-800"
            />
            <input
              value={row.abbr}
              onChange={(e) => update(i, { abbr: e.target.value.slice(0, 3) })}
              maxLength={3}
              placeholder="sig"
              className={`w-16 rounded bg-white/[0.03] px-2 py-1 text-center text-sm uppercase text-zinc-100 outline-none ring-1 ${
                duplicates.has(row.abbr.trim().toLowerCase())
                  ? 'ring-red-600'
                  : row.abbr.trim().length === 3
                    ? 'ring-zinc-800'
                    : 'ring-amber-700'
              }`}
            />
          </li>
        ))}
      </ol>

      {error !== null && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      {saved && <p className="mt-2 text-xs text-emerald-400">Salvato.</p>}

      <button
        type="button"
        onClick={() => void save()}
        className="mt-3 rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600"
      >
        Salva partecipanti
      </button>
    </section>
  );
}
