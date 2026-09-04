import { describe, expect, it } from 'vitest';

import type { UnavailableKind, UnavailableNote } from './injuries';
import { injuryOf, makeInjuryIndex, unavailableLabel } from './injuries';
import { normalizeQuery } from './search';
import type { Player } from './types';
import { INJURY_NOTES } from '../data/injuries';
import { makePlayer, realListone } from '../test/fixtures';

function p(id: number, name: string, team: string): Player {
  return { ...makePlayer({ id, role: 'C', quot: 10 }), name, team, searchKey: normalizeQuery(name) };
}

function note(
  team: string,
  name: string,
  text: string,
  matchday: number | null = null,
  kind: UnavailableKind = 'infortunato',
): UnavailableNote {
  return { team, kind, name, text, matchday };
}

describe('makeInjuryIndex', () => {
  it('aggancia dentro la rosa del club', () => {
    const index = makeInjuryIndex(
      [p(1, 'Buongiorno', 'Napoli')],
      [note('Napoli', 'Buongiorno', 'menisco, in dubbio per la 12a', 12)],
    );
    expect(injuryOf(1, index)?.matchday).toBe(12);
    expect(injuryOf(1, index)?.text).toBe('menisco, in dubbio per la 12a');
  });

  it('non inventa un infortunio per chi non ce l ha', () => {
    const index = makeInjuryIndex([p(1, 'Bastoni', 'Inter')], []);
    expect(injuryOf(1, index)).toBeNull();
  });

  /** L'omonimo di un altro club non prende l'infortunio: la rosa e' il filtro. */
  it('non travasa l infortunio sull omonimo di un altra squadra', () => {
    const players = [p(1, 'Thuram', 'Inter'), p(2, 'Thuram', 'Juventus')];
    const index = makeInjuryIndex(players, [note('Juventus', 'Thuram', 'operato', 17)]);
    expect(injuryOf(1, index)).toBeNull();
    expect(injuryOf(2, index)?.matchday).toBe(17);
  });

  /** Due omonimi nella stessa rosa: meglio nessuno che quello sbagliato. */
  it('rifiuta l omonimia dentro la stessa rosa', () => {
    const players = [p(1, 'Martinez', 'Inter'), p(2, 'Martinez', 'Inter')];
    const index = makeInjuryIndex(players, [note('Inter', 'Martinez', 'fuori due mesi')]);
    expect(injuryOf(1, index)).toBeNull();
    expect(injuryOf(2, index)).toBeNull();
  });

  it('ignora un nome che quella rosa non ha piu', () => {
    const index = makeInjuryIndex([p(1, 'Bastoni', 'Inter')], [note('Inter', 'Kean', 'operato')]);
    expect(index.size).toBe(0);
  });

  it('via le iniziali di disambiguazione della fonte', () => {
    const index = makeInjuryIndex(
      [p(1, 'Sulemana K.', 'Atalanta')],
      [note('Atalanta', 'Sulemana K.', 'collaterale, in dubbio per la 6a', 6)],
    );
    expect(injuryOf(1, index)?.matchday).toBe(6);
  });

  /** Chi e' fermo e squalificato insieme: vale l'infortunio, che non finisce da solo. */
  it('tiene la riga piu grave quando ce ne sono due', () => {
    const players = [p(1, 'Rovella', 'Lazio')];
    const index = makeInjuryIndex(players, [
      note('Lazio', 'Rovella', '', null, 'squalificato'),
      note('Lazio', 'Rovella', 'polpaccio', 6),
    ]);
    expect(injuryOf(1, index)?.kind).toBe('infortunato');
    const reversed = makeInjuryIndex(players, [
      note('Lazio', 'Rovella', 'polpaccio', 6),
      note('Lazio', 'Rovella', '', null, 'squalificato'),
    ]);
    expect(injuryOf(1, reversed)?.kind).toBe('infortunato');
  });
});

describe('unavailableLabel', () => {
  it('mette la giornata quando la fonte la scrive', () => {
    expect(unavailableLabel({ kind: 'infortunato', text: '', matchday: 13 })).toBe(
      'infortunato · rientro 13a',
    );
  });

  it('resta il solo motivo quando la giornata non c e', () => {
    expect(unavailableLabel({ kind: 'squalificato', text: '', matchday: null })).toBe(
      'squalificato',
    );
  });
});

/** Il file e' generato da `scripts/build-injuries.mjs`. */
describe('src/data/injuries.ts', () => {
  it('ha venti squadre al massimo e tutte nel listone', () => {
    const clubs = new Set(realListone().map((p) => normalizeQuery(p.team)));
    for (const n of INJURY_NOTES) expect(clubs.has(normalizeQuery(n.team)), n.team).toBe(true);
  });

  it('non nomina due volte lo stesso uomo con lo stesso motivo', () => {
    const keys = INJURY_NOTES.map((n) => `${n.team}|${n.kind}|${n.name.toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ogni infortunato ha una descrizione, non solo un nome', () => {
    for (const n of INJURY_NOTES) {
      if (n.kind !== 'infortunato') continue;
      expect(n.text.trim().length, n.name).toBeGreaterThan(10);
    }
  });

  /**
   * Sensore, non formalita': la giornata e' la cifra su cui si decide se un
   * infortunato si prende a saldo. Se la fonte smettesse di scriverla, o se la
   * frase cambiasse forma, il chip resterebbe muto senza fallire da nessuna
   * parte — e questo test e' l'unico posto che se ne accorgerebbe.
   */
  it('legge la giornata di rientro dalla quasi totalita degli infortuni', () => {
    const injured = INJURY_NOTES.filter((n) => n.kind === 'infortunato');
    const withDay = injured.filter((n) => n.matchday !== null);
    expect(withDay.length).toBeGreaterThanOrEqual(injured.length - 2);
  });

  /**
   * Sensore: l'aggancio e' dentro la rosa, quindi chi non aggancia ha cambiato
   * club fra la pubblicazione della pagina e il listone. Se ne restano fuori
   * tanti, e' la convenzione dei nomi che e' cambiata, non il mercato.
   */
  it('aggancia al listone reale la gran parte delle righe', () => {
    const index = makeInjuryIndex(realListone(), INJURY_NOTES);
    expect(index.size).toBeGreaterThanOrEqual(Math.round(INJURY_NOTES.length * 0.9));
  });
});
