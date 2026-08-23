import type { Lineup, LineupSlot, Role } from './types';

/**
 * Moduli e generazione degli slot (PRD §5.2).
 *
 * L'editor e' il collo di bottiglia del progetto: 20 squadre da compilare a
 * mano, obiettivo due minuti l'una. Qui sta la parte pura — dal nome del modulo
 * agli slot, e dallo slot ai ruoli Classic ammessi nel picker — cosi' che la UI
 * non debba fare altro che disegnare e raccogliere tasti.
 *
 * **Id degli slot.** Sono `P1`, `D1..Dn`, `C1..Cn`, `A1..An`: dipendono dal
 * reparto e dalla posizione nel reparto, non dal modulo. Cambiare modulo
 * conserva quindi tutto cio' che continua a starci, invece di azzerare il
 * lavoro gia' fatto.
 */

export class ModuleError extends Error {
  override readonly name = 'ModuleError';
}

/** Giocatori di movimento in una formazione. */
export const OUTFIELD_COUNT = 10;

export interface SlotTemplate {
  readonly slotId: string;
  /** Etichetta posizionale mostrata nell'editor: POR, DC, MED, TRQ, PC... */
  readonly roleLabel: string;
  /** Ruoli Classic ammessi nel picker di questo slot (PRD §5.2). */
  readonly roles: readonly Role[];
  /** Riga di campo, 0 = porta. Serve solo al layout. */
  readonly line: number;
}

export interface ModuleDefinition {
  readonly name: string;
  readonly slots: readonly SlotTemplate[];
}

/** Moduli offerti dall'elenco dell'editor. */
export const MODULE_NAMES: readonly string[] = [
  '4-3-3',
  '3-5-2',
  '4-2-3-1',
  '3-4-2-1',
  '4-4-2',
  '3-4-3',
  '4-3-1-2',
  '5-3-2',
  '4-1-4-1',
  '4-2-4',
];

export const DEFAULT_MODULE = '4-3-3';

/** Etichette dei difensori, dal lato destro a quello sinistro. */
function defenderLabels(count: number): string[] {
  if (count === 3) return ['DC', 'DC', 'DC'];
  if (count === 4) return ['DD', 'DC', 'DC', 'DS'];
  if (count === 5) return ['DD', 'DC', 'DC', 'DC', 'DS'];
  return Array.from({ length: count }, () => 'DIF');
}

function midfieldLabels(count: number): string[] {
  if (count === 1) return ['MED'];
  if (count === 2) return ['MED', 'MED'];
  if (count === 3) return ['MEZ', 'MED', 'MEZ'];
  if (count === 4) return ['EST', 'MED', 'MED', 'EST'];
  if (count === 5) return ['EST', 'MEZ', 'MED', 'MEZ', 'EST'];
  return Array.from({ length: count }, () => 'CEN');
}

function attackLabels(count: number): string[] {
  if (count === 1) return ['PC'];
  if (count === 2) return ['PC', 'PC'];
  if (count === 3) return ['AD', 'PC', 'AS'];
  if (count === 4) return ['AD', 'PC', 'PC', 'AS'];
  return Array.from({ length: count }, () => 'ATT');
}

/**
 * Le ali di un tridente sono spesso schierate a centrocampo nel listone
 * Classic, quindi il loro picker accetta anche i centrocampisti.
 */
function attackRoles(label: string): readonly Role[] {
  return label === 'AD' || label === 'AS' ? ['A', 'C'] : ['A'];
}

/** Spezza '4-2-3-1' in `[4, 2, 3, 1]`, validando la somma. */
export function parseModuleName(name: string): number[] {
  const parts = name.split('-');
  if (parts.length < 3) {
    throw new ModuleError(`Modulo "${name}" non valido: attese almeno tre linee.`);
  }
  const lines = parts.map((part) => {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 1) {
      throw new ModuleError(`Modulo "${name}" non valido: "${part}" non e' un numero di reparto.`);
    }
    return n;
  });
  const total = lines.reduce((acc, n) => acc + n, 0);
  if (total !== OUTFIELD_COUNT) {
    throw new ModuleError(
      `Modulo "${name}" non valido: ${total} giocatori di movimento invece di ${OUTFIELD_COUNT}.`,
    );
  }
  return lines;
}

/**
 * Genera gli slot di un modulo.
 *
 * La prima linea sono i difensori, l'ultima gli attaccanti; le linee in mezzo
 * sono centrocampo, e l'ultima di queste — quando ce n'e' piu' di una — e' la
 * linea di trequarti, il cui picker accetta sia `C` sia `A`.
 */
export function buildModule(name: string): ModuleDefinition {
  const lines = parseModuleName(name);
  const defenders = lines[0] as number;
  const attackers = lines[lines.length - 1] as number;
  const midLines = lines.slice(1, -1);

  const slots: SlotTemplate[] = [
    { slotId: 'P1', roleLabel: 'POR', roles: ['P'], line: 0 },
  ];

  defenderLabels(defenders).forEach((roleLabel, i) => {
    slots.push({ slotId: `D${i + 1}`, roleLabel, roles: ['D'], line: 1 });
  });

  let midIndex = 0;
  midLines.forEach((count, lineIndex) => {
    const isTrequarti = midLines.length > 1 && lineIndex === midLines.length - 1;
    const labels = isTrequarti
      ? Array.from({ length: count }, () => 'TRQ')
      : midfieldLabels(count);
    labels.forEach((roleLabel) => {
      midIndex += 1;
      slots.push({
        slotId: `C${midIndex}`,
        roleLabel,
        roles: isTrequarti ? ['C', 'A'] : ['C'],
        line: 2 + lineIndex,
      });
    });
  });

  attackLabels(attackers).forEach((roleLabel, i) => {
    slots.push({
      slotId: `A${i + 1}`,
      roleLabel,
      roles: attackRoles(roleLabel),
      line: 2 + midLines.length,
    });
  });

  return { name, slots };
}

const MODULE_CACHE = new Map<string, ModuleDefinition>();

/** `true` se il nome descrive un modulo con 10 giocatori di movimento. */
export function isValidModuleName(name: string): boolean {
  try {
    parseModuleName(name);
    return true;
  } catch {
    return false;
  }
}

/** Definizione di un modulo, memoizzata. `null` se il nome non e' valido. */
export function moduleByName(name: string): ModuleDefinition | null {
  const cached = MODULE_CACHE.get(name);
  if (cached !== undefined) return cached;
  if (!isValidModuleName(name)) return null;
  const built = buildModule(name);
  MODULE_CACHE.set(name, built);
  return built;
}

/** Slot vuoti pronti per un nuovo `Lineup`. */
export function emptySlotsFor(name: string): LineupSlot[] {
  const definition = moduleByName(name);
  if (definition === null) throw new ModuleError(`Modulo "${name}" sconosciuto.`);
  return definition.slots.map((s) => ({
    slotId: s.slotId,
    roleLabel: s.roleLabel,
    candidates: [],
    note: '',
  }));
}

export function emptyLineup(teamCode: string, moduleName: string, now: number): Lineup {
  return {
    teamCode,
    module: moduleName,
    slots: emptySlotsFor(moduleName),
    updatedAt: now,
  };
}

export interface ModuleChange {
  readonly lineup: Lineup;
  /**
   * Giocatori usciti dalla formazione perche' il nuovo modulo non ha piu' il
   * loro slot. La UI deve dirlo: e' lavoro che sparisce.
   */
  readonly dropped: readonly number[];
}

/**
 * Cambia modulo conservando tutto cio' che continua a starci.
 *
 * Gli slot si riconoscono per `slotId`, quindi passando da 4-3-3 a 3-5-2 i
 * primi tre difensori restano al loro posto e solo il quarto viene perso.
 */
export function applyModule(lineup: Lineup, moduleName: string, now: number): ModuleChange {
  const slots = emptySlotsFor(moduleName);
  const previous = new Map(lineup.slots.map((s) => [s.slotId, s]));
  const kept = new Set<string>();

  const merged = slots.map<LineupSlot>((slot) => {
    const old = previous.get(slot.slotId);
    if (old === undefined) return slot;
    kept.add(slot.slotId);
    return { ...slot, candidates: [...old.candidates], note: old.note };
  });

  const dropped: number[] = [];
  for (const old of lineup.slots) {
    if (kept.has(old.slotId)) continue;
    for (const id of old.candidates) if (!dropped.includes(id)) dropped.push(id);
  }

  return {
    lineup: { ...lineup, module: moduleName, slots: merged, updatedAt: now },
    dropped,
  };
}

// ---------------------------------------------------------------------------
// Modifiche a un singolo slot
// ---------------------------------------------------------------------------

function mapSlot(
  lineup: Lineup,
  slotId: string,
  now: number,
  change: (slot: LineupSlot) => LineupSlot,
): Lineup {
  let touched = false;
  const slots = lineup.slots.map((slot) => {
    if (slot.slotId !== slotId) return slot;
    touched = true;
    return change(slot);
  });
  if (!touched) return lineup;
  return { ...lineup, slots, updatedAt: now };
}

/**
 * Aggiunge un candidato allo slot. Il secondo giocatore nello stesso slot **e'**
 * il ballottaggio: nessun comando dedicato (PRD §5.2).
 *
 * Un giocatore gia' presente in quello slot non viene duplicato; se e' altrove
 * nella formazione viene prima tolto da li', cosi' l'editor non produce da solo
 * il dato sporco che §4.1 deve poi gestire.
 */
export function addCandidate(
  lineup: Lineup,
  slotId: string,
  playerId: number,
  now: number,
): Lineup {
  const target = lineup.slots.find((s) => s.slotId === slotId);
  if (target === undefined) return lineup;
  if (target.candidates.includes(playerId)) return lineup;

  const slots = lineup.slots.map<LineupSlot>((slot) => {
    if (slot.slotId === slotId) {
      return { ...slot, candidates: [...slot.candidates, playerId] };
    }
    if (!slot.candidates.includes(playerId)) return slot;
    return { ...slot, candidates: slot.candidates.filter((id) => id !== playerId) };
  });

  return { ...lineup, slots, updatedAt: now };
}

export function removeCandidate(
  lineup: Lineup,
  slotId: string,
  playerId: number,
  now: number,
): Lineup {
  return mapSlot(lineup, slotId, now, (slot) => ({
    ...slot,
    candidates: slot.candidates.filter((id) => id !== playerId),
  }));
}

export function clearSlot(lineup: Lineup, slotId: string, now: number): Lineup {
  return mapSlot(lineup, slotId, now, (slot) => ({ ...slot, candidates: [] }));
}

export function setSlotNote(
  lineup: Lineup,
  slotId: string,
  note: string,
  now: number,
): Lineup {
  return mapSlot(lineup, slotId, now, (slot) => ({ ...slot, note }));
}

/** Primo slot senza candidati, per l'avanzamento automatico del picker. */
export function firstEmptySlot(lineup: Lineup, after?: string): string | null {
  const start = after === undefined ? 0 : lineup.slots.findIndex((s) => s.slotId === after) + 1;
  for (let i = start; i < lineup.slots.length; i++) {
    const slot = lineup.slots[i] as LineupSlot;
    if (slot.candidates.length === 0) return slot.slotId;
  }
  return null;
}

/** Ruoli ammessi in uno slot; `['P','D','C','A']` se il modulo e' sconosciuto. */
export function rolesForSlot(moduleName: string, slotId: string): readonly Role[] {
  const definition = moduleByName(moduleName);
  const template = definition?.slots.find((s) => s.slotId === slotId);
  return template?.roles ?? ['P', 'D', 'C', 'A'];
}
