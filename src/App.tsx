import { useEffect, useState } from 'react';

import { useAppStore } from './store/appStore';
import { TeamsPage } from './features/teams/TeamsPage';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { ImportConfirm } from './features/settings/ImportConfirm';

type Tab = 'teams' | 'settings';

/**
 * Guscio dell'applicazione.
 *
 * M2: Squadre (editor formazioni) e Impostazioni (listone, backup).
 * Asta live, svincolati e obiettivi arrivano da M3 in poi.
 */
export function App(): JSX.Element {
  const ready = useAppStore((s) => s.ready);
  const init = useAppStore((s) => s.init);
  const message = useAppStore((s) => s.message);
  const dismiss = useAppStore((s) => s.dismiss);
  const listone = useAppStore((s) => s.listone);

  const [tab, setTab] = useState<Tab>('teams');

  useEffect(() => {
    void init();
  }, [init]);

  // Solo a caricamento finito: prima che `init` risolva `listone` e' sempre
  // null, e senza questa guardia ogni refresh atterrerebbe su Impostazioni.
  useEffect(() => {
    if (ready && listone === null) setTab('settings');
  }, [ready, listone]);

  if (!ready) {
    return <div className="p-8 text-sm text-neutral-500">Carico i dati…</div>;
  }

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      <header className="flex shrink-0 items-center gap-4 border-b border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold tracking-wide text-neutral-100">Fanta Auction</h1>
        <nav className="flex gap-1">
          {(
            [
              ['teams', 'Squadre'],
              ['settings', 'Impostazioni'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded px-3 py-1 text-sm ${
                tab === id ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:bg-neutral-900'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {message !== null && (
        <div
          className={`flex shrink-0 items-center justify-between px-4 py-2 text-sm ${
            message.kind === 'ok' ? 'bg-emerald-900/50 text-emerald-100' : 'bg-red-900/50 text-red-100'
          }`}
        >
          <span>{message.text}</span>
          <button type="button" onClick={dismiss} className="px-2 text-xs opacity-70">
            chiudi
          </button>
        </div>
      )}

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {tab === 'teams' ? <TeamsPage /> : <SettingsPanel />}
      </main>

      <ImportConfirm />
    </div>
  );
}
