import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Gavel,
  Loader2,
  Settings,
  Shield,
  Target,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';

import { useAppStore } from './store/appStore';
import { LivePage } from './features/live/LivePage';
import { TeamsPage } from './features/teams/TeamsPage';
import { FreeAgentsPanel } from './features/free/FreeAgentsPanel';
import { GoalsPanel } from './features/goals/GoalsPanel';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { ImportConfirm } from './features/settings/ImportConfirm';
import { ListoneConfirm } from './features/settings/ListoneConfirm';
import { EASE } from './ui/primitives';
import { cn } from './ui/cn';

type Tab = 'live' | 'teams' | 'free' | 'goals' | 'settings';

interface TabDef {
  readonly id: Tab;
  readonly label: string;
  readonly Icon: typeof Gavel;
}

const TABS: readonly TabDef[] = [
  { id: 'live', label: 'Asta', Icon: Gavel },
  { id: 'teams', label: 'Squadre', Icon: Shield },
  { id: 'free', label: 'Svincolati', Icon: Users },
  { id: 'goals', label: 'Obiettivi', Icon: Target },
  { id: 'settings', label: 'Impostazioni', Icon: Settings },
];

/** Guscio dell'applicazione: le quattro sezioni di §5 piu' le impostazioni. */
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
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 size={16} className="animate-spin" />
        Carico i dati…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#09090b] text-zinc-200">
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-4 border-b border-white/[0.08] bg-zinc-950/70 px-4 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400 shadow-glow-emerald">
            <Gavel size={13} />
          </span>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Fanta Auction</h1>
        </div>

        <nav className="flex gap-0.5">
          {TABS.map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-lg border border-white/[0.08] bg-white/[0.06]"
                    transition={{ duration: 0.25, ease: EASE }}
                  />
                )}
                <Icon size={14} className="relative" />
                <span className="relative">{label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <AnimatePresence>
        {message !== null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="shrink-0 overflow-hidden"
          >
            <div
              className={cn(
                'flex items-center gap-2 border-b px-4 py-2 text-sm',
                message.kind === 'ok'
                  ? 'animate-flash-ok border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                  : 'animate-flash-err border-rose-500/20 bg-rose-500/10 text-rose-200',
              )}
            >
              {message.kind === 'ok' ? <Check size={14} /> : <TriangleAlert size={14} />}
              <span className="min-w-0 flex-1">{message.text}</span>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Chiudi il messaggio"
                className="rounded p-1 opacity-70 transition-opacity hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        {tab === 'live' && <LivePage />}
        {tab === 'teams' && <TeamsPage />}
        {tab === 'free' && <FreeAgentsPanel embedded />}
        {tab === 'goals' && <GoalsPanel embedded />}
        {tab === 'settings' && <SettingsPanel />}
      </main>

      <ImportConfirm />
      <ListoneConfirm />
    </div>
  );
}
