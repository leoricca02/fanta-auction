import { useEffect, useMemo, useRef, useState } from 'react';

import type { Player } from '../../domain/types';
import { normalizeName } from '../../parse/listone';

/**
 * Picker di uno slot (PRD §5.2).
 *
 * Mostra **solo i giocatori di quella squadra**, gia' pre-filtrati per ruolo
 * compatibile e ordinati per `QUOT.` decrescente: chi gioca sta quasi sempre in
 * cima, quindi il gesto tipico e' aprire e battere Invio.
 *
 * Tastiera: frecce per muoversi, Invio per assegnare e passare allo slot
 * successivo, Maiusc+Invio per restare sullo slot e aggiungere il ballottaggio,
 * Esc per chiudere.
 */

export interface SlotPickerProps {
  /** Slot servito adesso. Cambiandolo il picker si azzera senza smontarsi. */
  readonly slotId: string;
  readonly label: string;
  readonly candidates: readonly Player[];
  /** Id gia' schierati altrove nella formazione, marcati in elenco. */
  readonly usedIds: ReadonlySet<number>;
  readonly onPick: (playerId: number, stay: boolean) => void;
  readonly onClose: () => void;
}

function matches(player: Player, query: string): boolean {
  if (query === '') return true;
  return player.searchKey.includes(query) || normalizeName(player.team).includes(query);
}

export function SlotPicker({
  slotId,
  label,
  candidates,
  usedIds,
  onPick,
  onClose,
}: SlotPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = useMemo(() => {
    const normalized = normalizeName(query);
    return candidates.filter((p) => matches(p, normalized));
  }, [candidates, query]);

  useEffect(() => setIndex(0), [query]);

  // Il picker non si smonta passando da uno slot all'altro: si riazzera e si
  // ripiglia il focus. Smontarlo faceva tornare il focus al bottone dello slot
  // precedente, che sull'Invio successivo riapriva se stesso — e la raffica di
  // undici Invii finiva su slot sbagliati.
  useEffect(() => {
    setQuery('');
    setIndex(0);
    inputRef.current?.focus();
  }, [slotId]);

  useEffect(() => {
    const active = listRef.current?.children[index];
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' });
  }, [index]);

  function handleKey(event: React.KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((i) => Math.min(i + 1, visible.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const player = visible[index];
      if (player !== undefined) onPick(player.id, event.shiftKey);
    }
  }

  return (
    <div
      className="flex w-80 shrink-0 flex-col rounded border border-neutral-700 bg-neutral-900"
      onKeyDown={handleKey}
    >
      <div className="border-b border-neutral-800 p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${label} — digita per filtrare`}
          className="w-full rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
        />
      </div>

      <ul ref={listRef} className="max-h-[60vh] flex-1 overflow-y-auto">
        {visible.map((player, i) => (
          <li key={player.id}>
            <button
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setIndex(i)}
              onClick={(e) => onPick(player.id, e.shiftKey)}
              className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-sm ${
                i === index ? 'bg-emerald-800/60' : 'hover:bg-neutral-800'
              }`}
            >
              <span className="w-6 shrink-0 text-xs text-neutral-500">{player.role}</span>
              <span className="flex-1 truncate text-neutral-100">{player.name}</span>
              {usedIds.has(player.id) && (
                <span className="shrink-0 text-xs text-amber-500" title="gia' schierato altrove">
                  ●
                </span>
              )}
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                {player.quot}
              </span>
            </button>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-2 py-3 text-sm text-neutral-500">Nessun giocatore compatibile.</li>
        )}
      </ul>

      <div className="border-t border-neutral-800 px-2 py-1 text-[11px] text-neutral-500">
        Invio assegna e passa oltre · Maiusc+Invio aggiunge il ballottaggio · Esc chiude
      </div>
    </div>
  );
}
