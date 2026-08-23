import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import type { Lineup, LineupSlot, Player, Role } from '../../domain/types';
import {
  DEFAULT_MODULE,
  MODULE_NAMES,
  addCandidate,
  applyModule,
  clearSlot,
  emptyLineup,
  firstEmptySlot,
  removeCandidate,
  rolesForSlot,
  setSlotNote,
} from '../../domain/modules';
import { duplicatedCandidates } from '../../domain/lineup';
import { offRoleCandidates, slotCandidates } from '../../domain/free-agents';
import { SlotPicker } from './SlotPicker';

/**
 * Editor di formazione (PRD §5.2) — il collo di bottiglia del progetto.
 *
 * Il flusso pensato per i due minuti a squadra: si sceglie il modulo, si apre
 * il primo slot e si batte Invio undici volte. Ogni Invio assegna il giocatore
 * in cima — che, essendo l'elenco ordinato per `QUOT.` decrescente, e' quasi
 * sempre il titolare — e passa da solo allo slot vuoto successivo.
 *
 * Tre scelte tengono in piedi quel flusso, tutte nate da bug visti girare
 * davvero con undici Invii consecutivi:
 *
 * 1. **Il picker e' uno solo e non si smonta mai** finche' si compila. Vive
 *    accanto alla lista degli slot e cambia contenuto. Montarlo e smontarlo a
 *    ogni avanzamento restituiva il focus al bottone dello slot precedente,
 *    che sull'Invio dopo riapriva se stesso: la raffica finiva su slot
 *    sbagliati.
 * 2. **La formazione in lavorazione sta in un ref**, non nello stato React.
 *    Tra un tasto e l'altro React non ri-renderizza, quindi leggere la prop o
 *    uno `useState` restituiva sempre la stessa formazione: il picker
 *    riproponeva lo stesso nome e `addCandidate` lo trascinava lungo tutti gli
 *    slot del reparto, lasciandoli vuoti tranne l'ultimo.
 * 3. **Le modifiche passano da `onUpdate`, che le accoda nello store**, e
 *    l'avanzamento non aspetta la scrittura.
 *
 * **Deroga dichiarata al "scrivi prima di renderizzare".** Qui il render segue
 * il ref, quindi puo' precedere di qualche millisecondo la `put` su IndexedDB.
 * La scrittura parte comunque subito e nell'ordine giusto. Il vincolo resta
 * pieno dove e' nato: l'event log dell'asta, dove serve alla crash recovery.
 */

export interface LineupEditorProps {
  readonly teamCode: string;
  readonly players: readonly Player[];
  readonly lineup: Lineup | null;
  readonly note: string;
  /** Applica una modifica alla formazione e restituisce quella aggiornata. */
  readonly onUpdate: (mutate: (lineup: Lineup) => Lineup) => Promise<Lineup>;
  readonly onNoteChange: (text: string) => void;
  /** Apre la scheda di §5.1 sul giocatore cliccato. */
  readonly onOpenCard: (playerId: number) => void;
}

export function LineupEditor({
  teamCode,
  players,
  lineup,
  note,
  onUpdate,
  onNoteChange,
  onOpenCard,
}: LineupEditorProps): JSX.Element {
  const [noteDraft, setNoteDraft] = useState(note);
  const [dropped, setDropped] = useState<readonly string[]>([]);
  const slotRefs = useRef(new Map<string, HTMLButtonElement>());
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    setNoteDraft(note);
  }, [note]);

  const persisted = useMemo(
    () => lineup ?? emptyLineup(teamCode, DEFAULT_MODULE, 0),
    [lineup, teamCode],
  );

  /** Vista di lavoro, aggiornata sincronicamente a ogni tasto. */
  const draft = useRef<Lineup>(persisted);
  const openSlotRef = useRef<string | null>(null);

  useEffect(() => {
    // Risincronizza al cambio squadra, e quando un aggiornamento esterno
    // (import di backup) e' piu' recente di quello in lavorazione.
    if (
      persisted.teamCode !== draft.current.teamCode ||
      persisted.updatedAt > draft.current.updatedAt
    ) {
      draft.current = persisted;
      openSlotRef.current = null;
      forceRender();
    }
  }, [persisted]);

  const current = draft.current;
  const openSlot = openSlotRef.current;

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);

  const usedIds = new Set<number>();
  for (const slot of current.slots) for (const id of slot.candidates) usedIds.add(id);

  const duplicated = new Set(duplicatedCandidates(current));
  const activeSlot = current.slots.find((s) => s.slotId === openSlot) ?? null;

  const activeRoles =
    activeSlot === null ? [] : rolesForSlot(current.module, activeSlot.slotId);

  // Chi e' gia' schierato altrove esce dalla lista: riproporlo in cima
  // farebbe spostare quel giocatore invece di riempire lo slot nuovo.
  const pickerCandidates =
    activeSlot === null ? [] : slotCandidates(players, teamCode, activeRoles, usedIds);

  // Il resto della rosa, per il fuori ruolo del picker: Dimarco e' listato
  // difensore ma nel 3-5-2 dell'Inter gioca esterno di centrocampo.
  const pickerOffRole =
    activeSlot === null ? [] : offRoleCandidates(players, teamCode, activeRoles, usedIds);

  function openPicker(slotId: string | null): void {
    openSlotRef.current = slotId;
    forceRender();
  }

  function closePicker(): void {
    const slotId = openSlotRef.current;
    openSlotRef.current = null;
    forceRender();
    if (slotId !== null) slotRefs.current.get(slotId)?.focus();
  }

  /** Applica una modifica al draft e la accoda alla persistenza. */
  function mutate(change: (lineup: Lineup) => Lineup): void {
    draft.current = change(draft.current);
    void onUpdate(change);
    forceRender();
  }

  function handlePick(playerId: number, stay: boolean): void {
    const slotId = openSlotRef.current;
    if (slotId === null) return;

    const now = Date.now();
    draft.current = addCandidate(draft.current, slotId, playerId, now);
    void onUpdate((l) => addCandidate(l, slotId, playerId, now));
    // Maiusc+Invio resta sullo slot per aggiungere il ballottaggio.
    if (!stay) openSlotRef.current = firstEmptySlot(draft.current, slotId);
    forceRender();
  }

  async function handleModule(name: string): Promise<void> {
    openSlotRef.current = null;
    let lost: readonly number[] = [];
    const now = Date.now();
    const change = (l: Lineup): Lineup => {
      const applied = applyModule(l, name, now);
      lost = applied.dropped;
      return applied.lineup;
    };
    draft.current = change(draft.current);
    forceRender();
    await onUpdate(change);
    setDropped(lost.map((id) => byId.get(id)?.name ?? `#${id}`));
  }

  const filled = current.slots.filter((s) => s.candidates.length > 0).length;

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-neutral-100">{teamCode}</h2>

        <select
          value={current.module}
          onChange={(e) => void handleModule(e.target.value)}
          className="rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
          aria-label="Modulo"
        >
          {MODULE_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <span className="text-sm tabular-nums text-neutral-400">
          {filled}/{current.slots.length} slot
        </span>

        <button
          type="button"
          onClick={() => openPicker(firstEmptySlot(current))}
          className="rounded bg-emerald-700 px-3 py-1 text-sm text-white hover:bg-emerald-600"
        >
          Compila dal primo slot vuoto
        </button>
      </header>

      {dropped.length > 0 && (
        <p className="rounded border border-amber-800 bg-amber-950/40 px-3 py-1.5 text-xs text-amber-200">
          Fuori dal nuovo modulo: {dropped.join(', ')}
          <button type="button" onClick={() => setDropped([])} className="ml-2 underline opacity-70">
            ok
          </button>
        </p>
      )}

      <div className="flex min-h-0 gap-4">
        <ol className="flex min-w-0 flex-1 flex-col gap-1">
          {current.slots.map((slot) => (
            <SlotRow
              key={slot.slotId}
              slot={slot}
              roles={rolesForSlot(current.module, slot.slotId)}
              byId={byId}
              duplicated={duplicated}
              active={openSlot === slot.slotId}
              pickerOpen={openSlot !== null}
              registerRef={(el) => {
                if (el === null) slotRefs.current.delete(slot.slotId);
                else slotRefs.current.set(slot.slotId, el);
              }}
              onOpen={() => openPicker(slot.slotId)}
              onOpenCard={onOpenCard}
              onRemove={(playerId) =>
                mutate((l) => removeCandidate(l, slot.slotId, playerId, Date.now()))
              }
              onClear={() => mutate((l) => clearSlot(l, slot.slotId, Date.now()))}
              onNote={(text) => mutate((l) => setSlotNote(l, slot.slotId, text, Date.now()))}
            />
          ))}
        </ol>

        {activeSlot !== null && (
          <SlotPicker
            slotId={activeSlot.slotId}
            label={activeSlot.roleLabel}
            candidates={pickerCandidates}
            offRole={pickerOffRole}
            usedIds={usedIds}
            onPick={handlePick}
            onClose={closePicker}
          />
        )}
      </div>

      <label className="mt-2 flex flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Nota squadra</span>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft !== note) onNoteChange(noteDraft);
          }}
          rows={3}
          placeholder="Come gioca, chi e' in dubbio, chi sta per partire..."
          className="rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none placeholder:text-neutral-600"
        />
      </label>
    </section>
  );
}

interface SlotRowProps {
  readonly slot: LineupSlot;
  /** Ruoli compatibili con lo slot: chi non c'e' dentro e' schierato fuori ruolo. */
  readonly roles: readonly Role[];
  readonly byId: ReadonlyMap<number, Player>;
  readonly duplicated: ReadonlySet<number>;
  /** Slot servito dal picker in questo momento. */
  readonly active: boolean;
  /** `true` se un picker e' aperto: il bottone non deve rubargli l'Invio. */
  readonly pickerOpen: boolean;
  readonly registerRef: (el: HTMLButtonElement | null) => void;
  readonly onOpen: () => void;
  readonly onOpenCard: (playerId: number) => void;
  readonly onRemove: (playerId: number) => void;
  readonly onClear: () => void;
  readonly onNote: (text: string) => void;
}

function SlotRow({
  slot,
  roles,
  byId,
  duplicated,
  active,
  pickerOpen,
  registerRef,
  onOpen,
  onOpenCard,
  onRemove,
  onClear,
  onNote,
}: SlotRowProps): JSX.Element {
  const [noteDraft, setNoteDraft] = useState(slot.note);
  useEffect(() => setNoteDraft(slot.note), [slot.note]);

  const contested = slot.candidates.length > 1;
  const allowed = new Set<Role>(roles);

  return (
    <li className="flex items-center gap-2">
      <span
        className={`w-10 shrink-0 text-xs font-medium ${
          active ? 'text-emerald-400' : 'text-neutral-500'
        }`}
      >
        {slot.roleLabel}
      </span>

      <button
        ref={registerRef}
        type="button"
        onClick={onOpen}
        onKeyDown={(e) => {
          // Con un picker aperto l'Invio appartiene al picker, mai al bottone.
          if (pickerOpen) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            onClear();
          }
        }}
        className={`flex min-h-[30px] flex-1 items-center gap-1 rounded border px-2 py-1 text-left text-sm ${
          active
            ? 'border-emerald-500 bg-neutral-800'
            : slot.candidates.length === 0
              ? 'border-dashed border-neutral-700 text-neutral-600'
              : 'border-neutral-700 bg-neutral-800/60 text-neutral-100'
        } focus:border-emerald-500 focus:outline-none`}
      >
        {slot.candidates.length === 0 ? (
          <span className="text-neutral-600">vuoto</span>
        ) : (
          slot.candidates.map((id) => (
            <span
              key={id}
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${
                contested ? 'bg-amber-900/60 text-amber-100' : 'bg-emerald-900/60 text-emerald-100'
              } ${duplicated.has(id) ? 'ring-1 ring-red-500' : ''}`}
            >
              {(() => {
                const role = byId.get(id)?.role;
                if (role === undefined || allowed.has(role)) return null;
                return (
                  <span
                    className="shrink-0 rounded bg-amber-800/70 px-1 text-[10px] font-semibold text-amber-100"
                    title={`Listato ${role}, schierato qui fuori ruolo`}
                  >
                    {role}
                  </span>
                );
              })()}
              <span
                role="button"
                tabIndex={-1}
                title="Apri la scheda"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCard(id);
                }}
                className="cursor-pointer underline decoration-dotted underline-offset-2"
              >
                {byId.get(id)?.name ?? `#${id}`}
              </span>
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Togli ${byId.get(id)?.name ?? id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(id);
                }}
                className="cursor-pointer text-neutral-400 hover:text-white"
              >
                ×
              </span>
            </span>
          ))
        )}
        {contested && <span className="ml-auto text-[11px] text-amber-400">ballottaggio</span>}
      </button>

      <input
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          if (noteDraft !== slot.note) onNote(noteDraft);
        }}
        placeholder="nota"
        className="w-40 shrink-0 rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-300 outline-none placeholder:text-neutral-700"
      />
    </li>
  );
}
