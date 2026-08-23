import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

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
 *
 * **Fuori ruolo.** Nessuno slot e' chiuso: sotto ai compatibili puo' comparire
 * il resto della rosa del club, qualsiasi ruolo — un portiere in attacco se e'
 * quello che serve. Il listone elenca Dimarco difensore, ma nel 3-5-2 gioca
 * esterno di centrocampo: il ruolo di listino e' la lista da cui lo compri, non
 * la posizione in cui la sua squadra lo schiera.
 *
 * La sezione compare in due modi, entrambi in coda ai compatibili: appena si
 * digita, ristretta a chi corrisponde alla ricerca; oppure per intero con
 * `Tab`, per sfogliare la rosa quando il nome non lo si ricorda. Mai in cima e
 * mai a riposo, cosi' il flusso a raffica di Invii non cambia.
 */

export interface SlotPickerProps {
  /** Slot servito adesso. Cambiandolo il picker si azzera senza smontarsi. */
  readonly slotId: string;
  readonly label: string;
  readonly candidates: readonly Player[];
  /**
   * Giocatori del club di ruolo non compatibile con lo slot. Mostrati in coda,
   * solo a ricerca non vuota.
   */
  readonly offRole: readonly Player[];
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
  offRole,
  usedIds,
  onPick,
  onClose,
}: SlotPickerProps): JSX.Element {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  /** `Tab`: mostra tutta la rosa del club anche senza cercare. */
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const inRole = useMemo(() => {
    const normalized = normalizeName(query);
    return candidates.filter((p) => matches(p, normalized));
  }, [candidates, query]);

  // A ricerca vuota e senza `Tab` il fuori ruolo sarebbe mezza rosa sotto ogni
  // slot: rumore che nessuno ha chiesto. Serve un gesto, cercare o premere Tab.
  const outOfRole = useMemo(() => {
    if (query === '' && !showAll) return [];
    const normalized = normalizeName(query);
    return offRole.filter((p) => matches(p, normalized));
  }, [offRole, query, showAll]);

  // Un solo elenco per la tastiera: l'indice scorre i compatibili e prosegue
  // nel fuori ruolo, cosi' le frecce attraversano l'intestazione senza saltarla.
  const visible = useMemo(() => [...inRole, ...outOfRole], [inRole, outOfRole]);

  useEffect(() => setIndex(0), [query]);

  // Il picker non si smonta passando da uno slot all'altro: si riazzera e si
  // ripiglia il focus. Smontarlo faceva tornare il focus al bottone dello slot
  // precedente, che sull'Invio successivo riapriva se stesso — e la raffica di
  // undici Invii finiva su slot sbagliati.
  useEffect(() => {
    setQuery('');
    setIndex(0);
    setShowAll(false);
    inputRef.current?.focus();
  }, [slotId]);

  useEffect(() => {
    // Per posizione tra le voci, non tra i figli della lista: l'intestazione
    // del fuori ruolo e' un `li` e sfaserebbe il conteggio.
    const active = listRef.current?.querySelectorAll('[data-option]')[index];
    if (active instanceof HTMLElement) active.scrollIntoView({ block: 'nearest' });
  }, [index, visible.length]);

  function handleKey(event: React.KeyboardEvent): void {
    // Tab non sposta il focus: qui apre e chiude il resto della rosa. Uscire dal
    // picker si fa con Esc, che riporta il focus sullo slot.
    if (event.key === 'Tab') {
      event.preventDefault();
      setShowAll((v) => !v);
      setIndex(0);
      return;
    }
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
      <div className="flex items-center gap-2 border-b border-neutral-800 p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${label} — digita per filtrare`}
          className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-pressed={showAll}
          onClick={() => {
            setShowAll((v) => !v);
            setIndex(0);
            inputRef.current?.focus();
          }}
          title="Mostra tutta la rosa, ruoli compresi quelli non compatibili (Tab)"
          className={`shrink-0 rounded px-2 py-1 text-[11px] ${
            showAll
              ? 'bg-amber-800/70 text-amber-100'
              : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
        >
          tutta la rosa
        </button>
      </div>

      <ul ref={listRef} className="max-h-[60vh] flex-1 overflow-y-auto">
        {visible.map((player, i) => (
          <Fragment key={player.id}>
            {i === inRole.length && (
              <li className="border-t border-neutral-800 px-2 pb-0.5 pt-2 text-[11px] uppercase tracking-wide text-amber-600/90">
                Fuori ruolo — {label} non e' il loro ruolo di listino
              </li>
            )}
            <li>
              <button
                data-option
                type="button"
                tabIndex={-1}
                onMouseEnter={() => setIndex(i)}
                onClick={(e) => onPick(player.id, e.shiftKey)}
                className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-sm ${
                  i === index ? 'bg-emerald-800/60' : 'hover:bg-neutral-800'
                }`}
              >
                <span
                  className={`w-6 shrink-0 text-xs ${
                    i >= inRole.length ? 'font-semibold text-amber-500' : 'text-neutral-500'
                  }`}
                >
                  {player.role}
                </span>
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
          </Fragment>
        ))}
        {visible.length === 0 && (
          <li className="px-2 py-3 text-sm text-neutral-500">
            {query === ''
              ? 'Nessun giocatore disponibile in questo club.'
              : 'Nessun giocatore, in nessun ruolo, corrisponde.'}
          </li>
        )}
        {outOfRole.length === 0 && !showAll && (
          <li className="border-t border-neutral-800 px-2 py-1.5 text-[11px] text-neutral-600">
            Cerca un nome, o premi <span className="text-neutral-400">Tab</span>, per schierare
            qui chiunque altro della rosa.
          </li>
        )}
      </ul>

      <div className="border-t border-neutral-800 px-2 py-1 text-[11px] text-neutral-500">
        Invio assegna e passa oltre · Maiusc+Invio aggiunge il ballottaggio · Tab tutta la
        rosa · Esc chiude
      </div>
    </div>
  );
}
