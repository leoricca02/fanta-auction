import { describe, expect, it } from 'vitest';

import { applyNotePatch, emptyPlayerNote, isBlankNote, isNoOpPatch } from './notes';
import { makePlayerNote } from '../test/fixtures';

const NOW = 1_760_000_000_000;

describe('emptyPlayerNote', () => {
  it('nasce vuota, senza tag e non archiviata', () => {
    expect(emptyPlayerNote(7)).toEqual({
      playerId: 7,
      text: '',
      tag: null,
      archived: false,
      updatedAt: 0,
    });
  });

  it('accetta un timestamp esplicito', () => {
    expect(emptyPlayerNote(7, NOW).updatedAt).toBe(NOW);
  });
});

describe('applyNotePatch', () => {
  const existing = makePlayerNote(7, 'rigorista', 'obiettivo', false, 1);

  it('crea la nota se non esiste', () => {
    expect(applyNotePatch(null, { text: 'nuova' }, 7, NOW)).toEqual({
      playerId: 7,
      text: 'nuova',
      tag: null,
      archived: false,
      updatedAt: NOW,
    });
  });

  it('scrivere il testo NON azzera il tag', () => {
    // E' il caso che rompe tutto se la patch fosse una sostituzione secca:
    // ogni battuta sulla nota cancellerebbe la marcatura.
    const after = applyNotePatch(existing, { text: 'spinge sempre' }, 7, NOW);
    expect(after.text).toBe('spinge sempre');
    expect(after.tag).toBe('obiettivo');
    expect(after.archived).toBe(false);
  });

  it('cambiare il tag NON azzera il testo', () => {
    const after = applyNotePatch(existing, { tag: 'evita' }, 7, NOW);
    expect(after.tag).toBe('evita');
    expect(after.text).toBe('rigorista');
  });

  it('tag null toglie il tag, tag assente lo lascia', () => {
    expect(applyNotePatch(existing, { tag: null }, 7, NOW).tag).toBeNull();
    expect(applyNotePatch(existing, {}, 7, NOW).tag).toBe('obiettivo');
  });

  it('un testo vuoto esplicito cancella il testo', () => {
    expect(applyNotePatch(existing, { text: '' }, 7, NOW).text).toBe('');
  });

  it('archived si aggiorna solo se presente', () => {
    expect(applyNotePatch(existing, { archived: true }, 7, NOW).archived).toBe(true);
    expect(applyNotePatch(existing, {}, 7, NOW).archived).toBe(false);
  });

  it('aggiorna sempre updatedAt', () => {
    expect(applyNotePatch(existing, {}, 7, NOW).updatedAt).toBe(NOW);
  });

  it('non muta la nota esistente', () => {
    const snapshot = { ...existing };
    applyNotePatch(existing, { text: 'altro', tag: null }, 7, NOW);
    expect(existing).toEqual(snapshot);
  });

  it('una patch vuota su nota assente produce una nota vuota timbrata', () => {
    expect(applyNotePatch(null, {}, 9, NOW)).toEqual({
      playerId: 9,
      text: '',
      tag: null,
      archived: false,
      updatedAt: NOW,
    });
  });
});

describe('isNoOpPatch', () => {
  const existing = makePlayerNote(7, 'rigorista', 'obiettivo', false, 1);

  it('riconosce la patch che non cambia niente', () => {
    expect(isNoOpPatch(existing, {})).toBe(true);
    expect(isNoOpPatch(existing, { text: 'rigorista' })).toBe(true);
    expect(isNoOpPatch(existing, { tag: 'obiettivo', archived: false })).toBe(true);
  });

  it('riconosce ogni campo che cambia', () => {
    expect(isNoOpPatch(existing, { text: 'altro' })).toBe(false);
    expect(isNoOpPatch(existing, { tag: null })).toBe(false);
    expect(isNoOpPatch(existing, { tag: 'evita' })).toBe(false);
    expect(isNoOpPatch(existing, { archived: true })).toBe(false);
  });

  it('su nota assente non e mai un no-op: la nota va creata', () => {
    expect(isNoOpPatch(null, {})).toBe(false);
  });
});

describe('isBlankNote', () => {
  it('e vuota solo se lo sono testo, tag e archived', () => {
    expect(isBlankNote(emptyPlayerNote(1))).toBe(true);
    expect(isBlankNote(makePlayerNote(1, '   ', null, false))).toBe(true);
    expect(isBlankNote(makePlayerNote(1, 'x', null, false))).toBe(false);
    expect(isBlankNote(makePlayerNote(1, '', 'evita', false))).toBe(false);
    expect(isBlankNote(makePlayerNote(1, '', null, true))).toBe(false);
  });
});
