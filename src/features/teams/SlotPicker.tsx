import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Search, UserSearch } from 'lucide-react';

import type { Player } from '../../domain/types';
import { listFantaAvg } from '../../domain/player-stats';
import { STATS_SEASON } from '../../data/stats';
import { STATS_INDEX } from '../../data/stats-index';
import { normalizeName } from '../../parse/listone';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { EmptyState, Kbd } from '../../ui/primitives';

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
 *
 * In coda a ogni riga la fantamedia della scorsa stagione (in verde) e la
 * QUOT.: compilando una formazione dire chi ha reso l'anno scorso e' meta' del
 * lavoro. Il trattino e' "non ha giocato in Serie A", non uno zero.
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
      className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-hair bg-elevated/85 shadow-pop backdrop-blur-xl"
      onKeyDown={handleKey}
    >
      {/*
        Lo slot bersaglio, scritto grande sopra il campo di ricerca.
        Compilando a raffica il picker resta montato e cambia contenuto sotto
        le dita: senza un'etichetta ferma e leggibile si perde il conto di
        quale slot si sta riempiendo, e undici Invii finiscono nel posto
        sbagliato senza che niente lo segnali.
      */}
      <div className="flex flex-col gap-2 border-b border-hair p-2">
        <div className="flex items-center gap-1.5">
          <span className="num rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
            {label}
          </span>
          <span className="text-[11px] text-zinc-600">stai riempiendo questo slot</span>
        </div>

        <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="digita per filtrare"
            className="field w-full py-1 pl-7 pr-2 text-sm"
          />
        </div>
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
          className={cn(
            'shrink-0 rounded-lg border px-2 py-1 text-[11px] transition-colors',
            showAll
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
              : 'border-hair bg-film text-zinc-400 hover:text-zinc-200',
          )}
        >
          tutta la rosa
        </button>
        </div>
      </div>

      <ul ref={listRef} className="max-h-[60vh] flex-1 overflow-y-auto">
        {visible.map((player, i) => (
          <Fragment key={player.id}>
            {i === inRole.length && (
              <li className="border-t border-hair px-2 pb-0.5 pt-2 text-[11px] uppercase tracking-wider text-amber-500/90">
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
                className={cn(
                  'relative flex w-full items-baseline gap-2 py-1 pl-2 pr-2 text-left text-sm transition-colors duration-150',
                  i === index
                    ? 'bg-emerald-500/[0.12] text-zinc-50'
                    : 'hover:bg-film',
                )}
              >
                {i === index && (
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 w-1 rounded-r',
                      roleTheme(player.role).bar,
                    )}
                  />
                )}
                <span
                  className={cn(
                    'w-6 shrink-0 text-xs font-semibold',
                    i >= inRole.length ? 'text-amber-400' : roleTheme(player.role).text,
                  )}
                >
                  {player.role}
                </span>
                <span className="flex-1 truncate text-zinc-100">{player.name}</span>
                {usedIds.has(player.id) && (
                  <span className="shrink-0 text-xs text-amber-400" title="gia' schierato altrove">
                    ●
                  </span>
                )}
                <span
                  className="num w-10 shrink-0 text-right text-xs text-emerald-300/80"
                  title={`Fantamedia ${STATS_SEASON}`}
                >
                  {listFantaAvg(player.id, STATS_INDEX) ?? '—'}
                </span>
                <span className="num w-8 shrink-0 text-right text-xs text-zinc-400">
                  {player.quot}
                </span>
                {/* Il tasto che lo prende, sulla riga che lo prenderebbe. */}
                <span
                  className={cn(
                    'shrink-0 transition-opacity duration-150',
                    i === index ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <Kbd>
                    <CornerDownLeft size={9} />
                  </Kbd>
                </span>
              </button>
            </li>
          </Fragment>
        ))}
        {visible.length === 0 && (
          <li className="p-2">
            <EmptyState
              icon={<UserSearch size={20} />}
              title={query === '' ? 'Rosa esaurita' : 'Nessuna corrispondenza'}
              hint={
                query === ''
                  ? 'Tutti i giocatori di questo club sono gia’ schierati altrove nella formazione.'
                  : 'Nessuno, in nessun ruolo, corrisponde a quello che hai scritto. Svuota la ricerca per rivedere la rosa.'
              }
              className="border-0 py-6"
            />
          </li>
        )}
        {outOfRole.length === 0 && !showAll && (
          <li className="border-t border-hair px-2 py-1.5 text-[11px] text-zinc-600">
            Cerca un nome, o premi <Kbd>Tab</Kbd>, per schierare qui chiunque altro della rosa.
          </li>
        )}
      </ul>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hair px-2 py-1.5 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1">
          <Kbd>Invio</Kbd> assegna e passa oltre
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⇧ Invio</Kbd> ballottaggio
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Tab</Kbd> tutta la rosa
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> chiude
        </span>
      </div>
    </div>
  );
}
