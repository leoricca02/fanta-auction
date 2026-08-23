import type { PlayerNote, Tag } from './types';

/**
 * Modifiche a una nota giocatore (PRD §3, §5.1).
 *
 * La nota si scrive a pezzi — il testo mentre digiti, il tag con un click —
 * quindi la modifica e' una patch parziale. La distinzione che conta:
 *
 * - campo **assente**  -> lascia com'e'
 * - `tag: null`        -> togli il tag
 *
 * Senza questa distinzione, salvare il testo azzererebbe il tag ogni volta.
 */

export interface PlayerNotePatch {
  readonly text?: string;
  readonly tag?: Tag | null;
  readonly archived?: boolean;
}

export function emptyPlayerNote(playerId: number, updatedAt = 0): PlayerNote {
  return { playerId, text: '', tag: null, archived: false, updatedAt };
}

/**
 * Applica la patch alla nota esistente, o ne crea una nuova se non c'e'.
 * Restituisce sempre un oggetto nuovo: `existing` non viene mai mutata.
 */
export function applyNotePatch(
  existing: PlayerNote | null,
  patch: PlayerNotePatch,
  playerId: number,
  now: number,
): PlayerNote {
  const base = existing ?? emptyPlayerNote(playerId);
  return {
    playerId,
    text: patch.text ?? base.text,
    // `undefined` significa "non toccare", `null` significa "togli".
    tag: patch.tag !== undefined ? patch.tag : base.tag,
    archived: patch.archived ?? base.archived,
    updatedAt: now,
  };
}

/** `true` se la patch non cambierebbe niente: evita una scrittura inutile. */
export function isNoOpPatch(existing: PlayerNote | null, patch: PlayerNotePatch): boolean {
  if (existing === null) return false;
  if (patch.text !== undefined && patch.text !== existing.text) return false;
  if (patch.tag !== undefined && patch.tag !== existing.tag) return false;
  if (patch.archived !== undefined && patch.archived !== existing.archived) return false;
  return true;
}

/**
 * Una nota vuota su ogni fronte non vale la pena di essere conservata: e' cio'
 * che resta quando cancelli il testo e togli il tag.
 */
export function isBlankNote(note: PlayerNote): boolean {
  return note.text.trim() === '' && note.tag === null && !note.archived;
}
