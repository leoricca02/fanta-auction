import { useEffect, useMemo, useState } from 'react';

import { lineupCompletion, makeLineupIndex } from '../../domain/lineup';
import { useAppStore } from '../../store/appStore';
import { PlayerCard } from '../player/PlayerCard';
import { LineupEditor } from './LineupEditor';

/**
 * Schermata Squadre (PRD §5.2): elenco dei club a sinistra con l'indicatore di
 * completamento, editor a destra. L'indicatore serve a sapere quali mancano
 * senza aprirle una per una.
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
      <div className="p-8 text-sm text-neutral-400">
        Nessun listone caricato. Vai in <strong className="text-neutral-200">Impostazioni</strong> e
        carica <code className="text-neutral-200">lista_calciatori_classic.xlsx</code>.
      </div>
    );
  }

  const note = userData.teamNotes.find((n) => n.teamCode === selected)?.text ?? '';

  return (
    <div className="flex min-h-0 flex-1">
      <nav className="flex w-56 shrink-0 flex-col border-r border-neutral-800">
        <div className="border-b border-neutral-800 px-3 py-2 text-xs text-neutral-500">
          {done}/{teamCodes.length} complete
        </div>
        <ul className="flex-1 overflow-y-auto">
          {completions.map((completion) => (
            <li key={completion.teamCode}>
              <button
                type="button"
                onClick={() => setSelected(completion.teamCode)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  selected === completion.teamCode
                    ? 'bg-neutral-800 text-neutral-100'
                    : 'text-neutral-400 hover:bg-neutral-900'
                }`}
              >
                <span className="flex-1 truncate">{completion.teamCode}</span>
                <span
                  className="h-1.5 w-10 shrink-0 rounded bg-neutral-800"
                  aria-label={`${Math.round(completion.ratio * 100)}%`}
                >
                  <span
                    className="block h-full rounded bg-emerald-600"
                    style={{ width: `${Math.round(completion.ratio * 100)}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-neutral-500">
                  {completion.filledSlots}/{completion.totalSlots || 11}
                </span>
              </button>
            </li>
          ))}
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
        <PlayerCard
          key={cardPlayer.id}
          player={cardPlayer}
          onClose={() => setCardPlayerId(null)}
        />
      )}
    </div>
  );
}
