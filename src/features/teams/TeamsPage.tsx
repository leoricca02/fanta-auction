import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

import { lineupCompletion, makeLineupIndex } from '../../domain/lineup';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { EASE, Meter } from '../../ui/primitives';
import { PlayerCard } from '../player/PlayerCard';
import { LineupEditor } from './LineupEditor';

/**
 * Schermata Squadre (PRD §5.2): elenco dei club a sinistra con l'indicatore di
 * completamento, editor a destra. L'indicatore serve a sapere quali mancano
 * senza aprirle una per una.
 *
 * Il club finito porta una spunta invece della barra: venti barre tutte piene
 * si assomigliano, una spunta no — e l'unica domanda che si fa scorrendo
 * questa colonna e' "quali mi restano".
 */
export function TeamsPage(): JSX.Element {
  const players = useAppStore((s) => s.players);
  const userData = useAppStore((s) => s.userData);
  const updateLineup = useAppStore((s) => s.updateLineup);
  const saveTeamNote = useAppStore((s) => s.saveTeamNote);

  const teamCodes = useMemo(
    () => [...new Set(players.map((p) => p.team))].sort((a, b) => a.localeCompare(b, 'it')),
    [players],
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [cardPlayerId, setCardPlayerId] = useState<number | null>(null);
  useEffect(() => {
    setSelected((current) => current ?? teamCodes[0] ?? null);
  }, [teamCodes]);

  const lineupIndex = useMemo(() => makeLineupIndex(userData.lineups), [userData.lineups]);
  const completions = useMemo(
    () => teamCodes.map((code) => lineupCompletion(code, lineupIndex)),
    [teamCodes, lineupIndex],
  );

  const done = completions.filter((c) => c.hasLineup && c.filledSlots === c.totalSlots).length;
  const cardPlayer = players.find((p) => p.id === cardPlayerId) ?? null;

  if (teamCodes.length === 0) {
    return (
      <div className="p-8 text-sm text-zinc-400">
        Nessun listone caricato. Vai in <strong className="text-zinc-200">Impostazioni</strong> e
        carica{' '}
        <code className="rounded bg-white/[0.06] px-1 text-zinc-200">
          lista_calciatori_classic.xlsx
        </code>
        .
      </div>
    );
  }

  const note = userData.teamNotes.find((n) => n.teamCode === selected)?.text ?? '';

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-56 shrink-0 flex-col border-r border-white/[0.08] bg-white/[0.01]">
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2">
          <span className="num text-xs text-zinc-300">
            {done}/{teamCodes.length}
          </span>
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">complete</span>
          <Meter
            value={teamCodes.length === 0 ? 0 : done / teamCodes.length}
            className="ml-auto w-12"
          />
        </div>
        <ul className="flex-1 overflow-y-auto p-1">
          {completions.map((completion) => {
            const active = selected === completion.teamCode;
            const complete =
              completion.hasLineup && completion.filledSlots === completion.totalSlots;
            return (
              <li key={completion.teamCode}>
                <button
                  type="button"
                  onClick={() => setSelected(completion.teamCode)}
                  className={cn(
                    'relative flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                    active ? 'text-zinc-100' : 'text-zinc-400 hover:bg-white/[0.03]',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="club-pill"
                      transition={{ duration: 0.2, ease: EASE }}
                      className="absolute inset-0 rounded-lg border border-white/[0.08] bg-white/[0.06]"
                    />
                  )}
                  <span className="relative flex-1 truncate font-medium uppercase tracking-wide">
                    {completion.teamCode}
                  </span>
                  {complete ? (
                    <Check size={13} className="relative shrink-0 text-emerald-400" />
                  ) : (
                    <span className="relative shrink-0">
                      <Meter value={completion.ratio} className="w-10" />
                    </span>
                  )}
                  <span className="num relative w-8 shrink-0 text-right text-[11px] text-zinc-500">
                    {completion.filledSlots}/{completion.totalSlots || 11}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {selected !== null && (
        <LineupEditor
          key={selected}
          teamCode={selected}
          players={players}
          lineup={lineupIndex.get(selected) ?? null}
          note={note}
          onUpdate={(mutate) => updateLineup(selected, mutate)}
          onNoteChange={(text) => void saveTeamNote(selected, text)}
          onOpenCard={setCardPlayerId}
        />
      )}

      {cardPlayer !== null && (
        <PlayerCard key={cardPlayer.id} player={cardPlayer} onClose={() => setCardPlayerId(null)} />
      )}
    </div>
  );
}
