import type { ObjectiveTarget, PlayerNote, UserData } from './types';

/**
 * Lista obiettivi (PRD §5.3) e sua interazione col tag di §4.3.
 *
 * **Regola dei tag.** Aggiungere un target imposta `tag: 'obiettivo'` **solo se
 * il giocatore non ha gia' un tag**: una marcatura esistente — `alternativa` o
 * `evita` — e' un giudizio dell'utente e non viene sovrascritta da un gesto di
 * lista. Rimuovere un target **non tocca il tag**: il tag e' studio, la lista
 * e' piano, e cancellare il secondo non deve cancellare il primo.
 *
 * Il tag conta nel contatore "liberi per ruolo con tag obiettivo" di §4.3;
 * la lista porta priorita' e nota per riga. Restano due cose distinte.
 */

/** Priorita' successiva a quelle in uso, per accodare un nuovo target. */
export function nextPriority(targets: readonly ObjectiveTarget[]): number {
  if (targets.length === 0) return 1;
  return Math.max(...targets.map((t) => t.priority)) + 1;
}

export interface AddTargetOptions {
  readonly note?: string;
  /** Se assente, il target va in coda. */
  readonly priority?: number;
  readonly now?: number;
}

/**
 * Aggiunge (o aggiorna) un target e allinea il tag del giocatore.
 *
 * Se il giocatore e' gia' in lista, ne aggiorna nota e priorita' conservando
 * la posizione. La nota del giocatore, se creata da qui, nasce vuota: e' il
 * tag a portare l'informazione, non il testo.
 */
export function addTarget(
  data: UserData,
  playerId: number,
  options: AddTargetOptions = {},
): UserData {
  const now = options.now ?? Date.now();
  const existing = data.objectives.targets.find((t) => t.playerId === playerId);

  const target: ObjectiveTarget = {
    playerId,
    priority: options.priority ?? existing?.priority ?? nextPriority(data.objectives.targets),
    note: options.note ?? existing?.note ?? '',
  };

  const targets =
    existing === undefined
      ? [...data.objectives.targets, target]
      : data.objectives.targets.map((t) => (t.playerId === playerId ? target : t));

  return {
    ...data,
    objectives: { ...data.objectives, targets, updatedAt: now },
    playerNotes: withObjectiveTag(data.playerNotes, playerId, now),
  };
}

/**
 * Toglie un target dalla lista. **Non tocca il tag del giocatore**: se serve
 * rimuoverlo, e' un gesto separato e deliberato sulla scheda.
 */
export function removeTarget(data: UserData, playerId: number, now?: number): UserData {
  if (!data.objectives.targets.some((t) => t.playerId === playerId)) return data;
  return {
    ...data,
    objectives: {
      ...data.objectives,
      targets: data.objectives.targets.filter((t) => t.playerId !== playerId),
      updatedAt: now ?? Date.now(),
    },
  };
}

export function isTarget(data: UserData, playerId: number): boolean {
  return data.objectives.targets.some((t) => t.playerId === playerId);
}

/** Target ordinati per priorita' crescente, poi per id: ordine totale. */
export function sortedTargets(data: UserData): ObjectiveTarget[] {
  return [...data.objectives.targets].sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : a.playerId - b.playerId,
  );
}

/**
 * Imposta `tag: 'obiettivo'` solo dove non c'e' gia' un tag. Restituisce
 * l'array originale se non c'e' niente da cambiare, cosi' un `addTarget` su un
 * giocatore gia' marcato non produce una scrittura inutile.
 */
function withObjectiveTag(
  notes: readonly PlayerNote[],
  playerId: number,
  now: number,
): PlayerNote[] {
  const existing = notes.find((n) => n.playerId === playerId);

  if (existing === undefined) {
    return [
      ...notes,
      { playerId, text: '', tag: 'obiettivo', archived: false, updatedAt: now },
    ];
  }
  if (existing.tag !== null) return [...notes];

  return notes.map((n) =>
    n.playerId === playerId ? { ...n, tag: 'obiettivo', updatedAt: now } : n,
  );
}
