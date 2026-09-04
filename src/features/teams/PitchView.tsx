import { useMemo } from 'react';
import { motion } from 'framer-motion';

import type { Lineup, LineupSlot, Player, Role } from '../../domain/types';
import { moduleByName } from '../../domain/modules';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { EASE } from '../../ui/primitives';

/**
 * La formazione disegnata sul campo.
 *
 * La lista di undici righe e' l'attrezzo per **compilare**: si apre il primo
 * slot e si battono undici Invii. Ma per **leggere** una formazione gia' fatta
 * la lista e' lo strumento sbagliato, perche' undici righe uguali non hanno
 * forma, e la forma e' esattamente cio' che si vuole sapere: dove sono i
 * ballottaggi, se il 3-5-2 ha davvero cinque uomini in mezzo, quale fascia e'
 * scoperta. Due viste sullo stesso dato, due domande diverse.
 *
 * **La geometria non e' inventata qui.** Ogni slot del modulo porta gia' un
 * campo `line` — 0 la porta, 1 la difesa, poi il centrocampo, infine l'attacco
 * — dichiarato in `buildModule` e commentato "serve solo al layout". Era li'
 * da sempre e non lo usava nessuno: questa vista e' il layout per cui era
 * stato scritto. Quindi un modulo nuovo si disegna da se', senza toccare
 * questo file.
 *
 * Il campo si guarda **dal basso**, come in televisione: il portiere sotto,
 * l'attacco in alto. Le righe si spartiscono l'altezza in parti uguali invece
 * di stare a distanze "realistiche": qui non si simula un campo, si legge una
 * formazione, e una linea di cinque schiacciata contro un'altra si conta peggio.
 */

export interface PitchViewProps {
  readonly lineup: Lineup;
  readonly byId: ReadonlyMap<number, Player>;
  /** Slot servito dal picker adesso, o `null`. */
  readonly openSlot: string | null;
  /** Id schierati in piu' slot: stesso segnale rosso della lista. */
  readonly duplicated: ReadonlySet<number>;
  readonly onOpenSlot: (slotId: string) => void;
  readonly onOpenCard: (playerId: number) => void;
}

export function PitchView({
  lineup,
  byId,
  openSlot,
  duplicated,
  onOpenSlot,
  onOpenCard,
}: PitchViewProps): JSX.Element {
  /**
   * Le righe di campo, dal fondo verso l'attacco.
   *
   * Se il modulo non e' fra quelli noti — non dovrebbe succedere, ma il dato
   * arriva da IndexedDB e potrebbe essere piu' vecchio del codice — si ripiega
   * su una riga sola: meglio una formazione appiattita che una schermata vuota.
   */
  const rows = useMemo(() => {
    const definition = moduleByName(lineup.module);
    const byLine = new Map<number, LineupSlot[]>();
    const bySlotId = new Map(lineup.slots.map((s) => [s.slotId, s]));

    if (definition === null) return [lineup.slots];

    for (const template of definition.slots) {
      const slot = bySlotId.get(template.slotId);
      if (slot === undefined) continue;
      const bucket = byLine.get(template.line);
      if (bucket === undefined) byLine.set(template.line, [slot]);
      else bucket.push(slot);
    }
    /*
      `.reverse()` non e' un dettaglio: e' l'orientamento del campo.

      Il modulo elenca ogni linea **da destra a sinistra** — `defenderLabels`
      lo dichiara: `['DD', 'DC', 'DC', 'DS']`, il terzino destro per primo. Su
      un campo guardato da dietro la propria porta, con l'attacco in alto, la
      destra della squadra e' la destra dello schermo: quindi il primo slot
      dell'elenco deve finire **a destra**, non a sinistra.

      Senza questa riga il DD compare a sinistra, l'AD a destra dell'AS, e il
      primo EST che si compila e' quello sbagliato: la formazione e' giusta nei
      dati e ribaltata sotto gli occhi, che e' il modo peggiore di sbagliare.
    */
    return [...byLine.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, slots]) => [...slots].reverse());
  }, [lineup]);

  return (
    <div className="relative h-full min-h-[24rem] w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0D1F17] to-[#091410]">
      <PitchLines />

      {/* `flex-col-reverse`: la prima riga del modulo e' la porta, e va in fondo. */}
      <div className="relative flex h-full flex-col-reverse justify-around gap-1 px-3 py-4">
        {rows.map((slots, i) => (
          <div key={i} className="flex items-center justify-evenly gap-1">
            {slots.map((slot) => (
              <PitchNode
                key={slot.slotId}
                slot={slot}
                byId={byId}
                active={openSlot === slot.slotId}
                duplicated={duplicated}
                onOpen={() => onOpenSlot(slot.slotId)}
                onOpenCard={onOpenCard}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Le righe del campo: cerchio di centrocampo, aree, linea mediana.
 *
 * Sono geometria pura in `border-white/10` — a quell'opacita' si vedono ma non
 * competono con i nodi, che sono l'unica cosa da leggere. `pointer-events-none`
 * perche' stanno sopra il fondo e sotto i giocatori, e non devono intercettare
 * il clic destinato a uno slot.
 */
function PitchLines(): JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Perimetro, rientrato: il campo non tocca il bordo della card. */}
      <div className="absolute inset-2 rounded-sm border border-white/10" />
      {/* Linea di meta' campo e cerchio. */}
      <div className="absolute inset-x-2 top-1/2 border-t border-white/10" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
      <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
      {/* Area di rigore in basso, dalla parte del portiere. */}
      <div className="absolute bottom-2 left-1/2 h-16 w-40 -translate-x-1/2 border-x border-t border-white/10" />
      <div className="absolute bottom-2 left-1/2 h-7 w-20 -translate-x-1/2 border-x border-t border-white/10" />
      {/* Area avversaria: piu' corta, e' fuori dall'inquadratura utile. */}
      <div className="absolute left-1/2 top-2 h-10 w-40 -translate-x-1/2 border-x border-b border-white/10" />
    </div>
  );
}

/**
 * Il nome per il nodo: tutto il cognome, senza l'iniziale di disambiguazione.
 *
 * Il listone scrive `Martinez L.` per distinguere due Martinez, ma scrive anche
 * `Kolo Muani` e `Nico Paz`, che sono cognomi in due parole. Tagliare alla
 * prima parola risolveva il primo caso e rompeva il secondo — sul campo
 * comparivano "Kolo" e "Nico", che non sono nomi di nessuno.
 *
 * La regola giusta e' quella di `rosterKey` nel dominio: si tolgono **solo** le
 * parole finali di una o due lettere, che sono iniziali puntate e non cognomi.
 */
function shortName(name: string): string {
  const words = name.split(' ').filter((w) => w !== '');
  while (words.length > 1) {
    const last = words[words.length - 1] ?? '';
    if (last.replace(/[^\p{L}\p{N}]/gu, '').length > 2) break;
    words.pop();
  }
  return words.join(' ') || name;
}

/**
 * Un uomo sul campo, o il posto dove ne manca uno.
 *
 * **Lo slot vuoto e' un progetto, non un buco.** Cerchio tratteggiato con la
 * sigla del ruolo in filigrana: dice *cosa ci va*, non solo che manca qualcosa,
 * ed e' la differenza fra una casella grigia e un disegno da completare. Undici
 * cerchi tratteggiati con le sigle giuste sono gia' la formazione, prima ancora
 * di avere un nome dentro.
 *
 * Il ballottaggio porta l'anello ambra e un `+n`: sul campo non c'e' spazio per
 * due nomi, e sapere che quel posto e' incerto conta piu' di sapere chi sono i
 * due. Il nome per esteso resta nel `title` e nella vista a lista.
 */
function PitchNode({
  slot,
  byId,
  active,
  duplicated,
  onOpen,
  onOpenCard,
}: {
  readonly slot: LineupSlot;
  readonly byId: ReadonlyMap<number, Player>;
  readonly active: boolean;
  readonly duplicated: ReadonlySet<number>;
  readonly onOpen: () => void;
  readonly onOpenCard: (playerId: number) => void;
}): JSX.Element {
  const first = slot.candidates[0];
  const player = first === undefined ? undefined : byId.get(first);
  const contested = slot.candidates.length > 1;
  const clashing = slot.candidates.some((id) => duplicated.has(id));
  const names = slot.candidates.map((id) => byId.get(id)?.name ?? `#${id}`);

  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5">
      <button
        type="button"
        onClick={onOpen}
        title={
          names.length === 0
            ? `${slot.roleLabel} — nessuno schierato`
            : `${slot.roleLabel} — ${names.join(' / ')}`
        }
        className={cn(
          'focus-ring relative flex h-11 w-11 items-center justify-center rounded-full border text-[10px] font-semibold transition-all duration-150',
          player === undefined
            ? 'border-dashed border-slate-600 bg-slate-800/30 text-slate-500 hover:border-slate-400 hover:text-slate-300'
            : 'border-white/15 bg-elevated/90 text-zinc-100 hover:border-white/35',
          contested && 'border-amber-500/50',
          clashing && 'ring-1 ring-rose-500',
          active && 'border-emerald-500/70 shadow-glow-emerald',
        )}
      >
        {active && (
          <motion.span
            layoutId="pitch-active"
            transition={{ duration: 0.18, ease: EASE }}
            className="absolute -inset-1 rounded-full ring-2 ring-emerald-500/40"
          />
        )}
        {player === undefined ? (
          <span className="num text-xs text-slate-600">{slot.roleLabel}</span>
        ) : (
          <RoleDot role={player.role} />
        )}
        {contested && (
          <span className="num absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/25 px-1 text-[9px] font-bold text-amber-200">
            +{slot.candidates.length - 1}
          </span>
        )}
      </button>

      {/*
        Sotto il nodo ci va solo cio' che il cerchio non contiene: cognome e
        quotazione. Lo slot vuoto porta gia' la sigla dentro, e ripeterla qui
        sarebbe la stessa parola scritta due volte a mezzo centimetro.
      */}
      {player !== undefined && (
        <span className="flex max-w-[5.5rem] flex-col items-center leading-tight">
          <button
            type="button"
            onClick={() => onOpenCard(player.id)}
            title={`Apri la scheda di ${player.name}`}
            className="focus-ring max-w-full truncate rounded text-[10px] font-medium text-zinc-200 transition-colors hover:text-white"
          >
            {shortName(player.name)}
          </button>
          <span className="num text-[9px] text-zinc-500" title="Quotazione di listino">
            {player.quot}
          </span>
        </span>
      )}
    </div>
  );
}

/** Il ruolo di listino, non quello dello slot: dice chi e', non dove gioca. */
function RoleDot({ role }: { readonly role: Role }): JSX.Element {
  const theme = roleTheme(role);
  return <span className={cn('text-xs font-bold', theme.text)}>{role}</span>;
}
