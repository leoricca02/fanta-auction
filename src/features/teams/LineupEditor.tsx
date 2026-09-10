import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LayoutGrid, ListChecks, Shirt } from 'lucide-react';

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
import { cn } from '../../ui/cn';
import { SlotPicker } from './SlotPicker';
import { SetPiecePanel } from './SetPiecePanel';
import { PitchView } from './PitchView';

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
  /**
   * Lista o campo. La lista resta il default e non e' una preferenza estetica:
   * e' l'unica vista in cui gli slot stanno in colonna nell'ordine in cui il
   * picker li attraversa, ed e' quella su cui la raffica di undici Invii e'
   * stata costruita. Il campo si guarda, la lista si compila.
   */
  const [view, setView] = useState<'lista' | 'campo'>('lista');
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
        <h2 className="text-xl font-bold tracking-tight text-zinc-100">{teamCode}</h2>

        <select
          value={current.module}
          onChange={(e) => void handleModule(e.target.value)}
          className="num field px-2 py-1 text-sm"
          aria-label="Modulo"
        >
          {MODULE_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <span className="num text-sm text-zinc-400">
          {filled}/{current.slots.length} slot
        </span>

        <button
          type="button"
          onClick={() => {
            // Compilare da campo non ha senso: il picker avanza in colonna.
            setView('lista');
            openPicker(firstEmptySlot(current));
          }}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 shadow-glow-emerald transition-all duration-100 hover:bg-emerald-400 active:scale-[0.98]"
        >
          <ListChecks size={14} />
          Compila dal primo slot vuoto
        </button>

        <div className="ml-auto flex items-center gap-0.5 rounded-lg border border-hair bg-film p-0.5">
          <ViewTab active={view === 'lista'} onClick={() => setView('lista')} icon={<LayoutGrid size={12} />}>
            lista
          </ViewTab>
          <ViewTab
            active={view === 'campo'}
            onClick={() => {
              closePicker();
              setView('campo');
            }}
            icon={<Shirt size={12} />}
          >
            campo
          </ViewTab>
        </div>
      </header>

      {dropped.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          Fuori dal nuovo modulo: {dropped.join(', ')}
          <button type="button" onClick={() => setDropped([])} className="ml-2 underline opacity-70">
            ok
          </button>
        </p>
      )}

      <div className="flex min-h-0 gap-4">
        {view === 'campo' ? (
          <div className="min-h-0 min-w-0 max-w-md flex-1">
            <PitchView
              lineup={current}
              byId={byId}
              openSlot={openSlot}
              duplicated={duplicated}
              onOpenSlot={openPicker}
              onOpenCard={onOpenCard}
            />
          </div>
        ) : (
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
        )}

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

      <SetPiecePanel teamCode={teamCode} players={players} onOpenCard={onOpenCard} />

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">Nota squadra</span>
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => {
            if (noteDraft !== note) onNoteChange(noteDraft);
          }}
          rows={3}
          placeholder="Come gioca, chi e' in dubbio, chi sta per partire..."
          className="field px-2.5 py-2 text-sm"
        />
      </label>
    </section>
  );
}

/** Una linguetta del selettore di vista. Due sole, e stanno sempre entrambe. */
function ViewTab({
  active,
  onClick,
  icon,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: JSX.Element;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150',
        active
          ? 'bg-scrim text-zinc-100'
          : 'text-zinc-500 hover:bg-film hover:text-zinc-300',
      )}
    >
      {icon}
      {children}
    </button>
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
        className={cn(
          'w-10 shrink-0 text-xs font-semibold uppercase tracking-wide',
          active ? 'text-emerald-400' : 'text-zinc-500',
        )}
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
        className={cn(
          'flex min-h-[32px] flex-1 items-center gap-1 rounded-lg border px-2 py-1 text-left text-sm transition-colors duration-150',
          active
            ? 'border-emerald-500/60 bg-emerald-500/[0.07] shadow-glow-emerald'
            : slot.candidates.length === 0
              ? // Slot vuoto: progetto, non buco. Tratteggio e fondo appena
                // accennato, come una pianta architettonica dove il muro c'e'
                // gia' ma non e' ancora costruito.
                'border-dashed border-slate-700 bg-slate-800/30 text-slate-500 hover:border-slate-500'
              : 'border-hair bg-film text-zinc-100 hover:border-edge',
          'focus:border-emerald-500/60 focus:outline-none',
        )}
      >
        {slot.candidates.length === 0 ? (
          // La sigla in filigrana dice *cosa* ci va, non solo che manca
          // qualcuno: undici slot vuoti con le sigle giuste sono gia' il modulo.
          <span className="num text-xs text-slate-600">{slot.roleLabel} da schierare</span>
        ) : (
          slot.candidates.map((id) => (
            <span
              key={id}
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs',
                contested
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
                duplicated.has(id) && 'ring-1 ring-rose-500',
              )}
            >
              {(() => {
                const role = byId.get(id)?.role;
                if (role === undefined || allowed.has(role)) return null;
                return (
                  <span
                    className="shrink-0 rounded border border-amber-500/40 bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-200"
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
                className="cursor-pointer text-zinc-500 transition-colors hover:text-zinc-100"
              >
                ×
              </span>
            </span>
          ))
        )}
        {contested && (
          <span className="ml-auto shrink-0 text-[11px] font-medium text-amber-400">
            ballottaggio
          </span>
        )}
      </button>

      <input
        value={noteDraft}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => {
          if (noteDraft !== slot.note) onNote(noteDraft);
        }}
        placeholder="nota"
        className="field w-40 shrink-0 px-2 py-1 text-xs text-zinc-300"
      />
    </li>
  );
}
