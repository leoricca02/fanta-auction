import { describe, expect, it } from 'vitest';

import { isBlankMarkdown, parseInline, parseSimpleMarkdown } from './markdown';

describe('parseInline', () => {
  it('lascia stare il testo semplice', () => {
    expect(parseInline('niente di speciale')).toEqual([
      { kind: 'text', text: 'niente di speciale' },
    ]);
  });

  it('riconosce grassetto, corsivo e codice', () => {
    expect(parseInline('**forte**')).toEqual([{ kind: 'bold', text: 'forte' }]);
    expect(parseInline('*piano*')).toEqual([{ kind: 'italic', text: 'piano' }]);
    expect(parseInline('`codice`')).toEqual([{ kind: 'code', text: 'codice' }]);
  });

  it('mescola testo e marcatori nell ordine giusto', () => {
    expect(parseInline('massimo **120** su *Lautaro*')).toEqual([
      { kind: 'text', text: 'massimo ' },
      { kind: 'bold', text: '120' },
      { kind: 'text', text: ' su ' },
      { kind: 'italic', text: 'Lautaro' },
    ]);
  });

  it('il grassetto vince sul corsivo, non si spezza a meta', () => {
    expect(parseInline('**due asterischi**')).toEqual([{ kind: 'bold', text: 'due asterischi' }]);
  });

  it('un asterisco solo resta testo', () => {
    expect(parseInline('3 * 4 = 12')).toEqual([{ kind: 'text', text: '3 * 4 = 12' }]);
    expect(parseInline('**')).toEqual([{ kind: 'text', text: '**' }]);
    expect(parseInline('``')).toEqual([{ kind: 'text', text: '``' }]);
  });

  it('la stringa vuota non produce niente', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('parseSimpleMarkdown', () => {
  it('un testo semplice e un paragrafo', () => {
    expect(parseSimpleMarkdown('prendo un portiere titolare')).toEqual([
      { kind: 'paragraph', content: [{ kind: 'text', text: 'prendo un portiere titolare' }] },
    ]);
  });

  it('le righe consecutive stanno nello stesso paragrafo', () => {
    const blocks = parseSimpleMarkdown('prima riga\nseconda riga');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'paragraph',
      content: [{ kind: 'text', text: 'prima riga seconda riga' }],
    });
  });

  it('una riga vuota separa due paragrafi', () => {
    const blocks = parseSimpleMarkdown('primo\n\nsecondo');
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === 'paragraph')).toBe(true);
  });

  it('riconosce i tre livelli di titolo', () => {
    const blocks = parseSimpleMarkdown('# uno\n## due\n### tre');
    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : null))).toEqual([1, 2, 3]);
    expect(blocks[0]).toMatchObject({ content: [{ kind: 'text', text: 'uno' }] });
  });

  it('raccoglie un elenco con - o con *', () => {
    const blocks = parseSimpleMarkdown('- primo\n- secondo\n* terzo');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.kind).toBe('list');
    if (blocks[0]?.kind === 'list') {
      expect(blocks[0].items).toHaveLength(3);
      expect(blocks[0].items[2]).toEqual([{ kind: 'text', text: 'terzo' }]);
    }
  });

  it('un elenco chiude il paragrafo che lo precede', () => {
    const blocks = parseSimpleMarkdown('la strategia:\n- prima cosa\n- seconda cosa');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list']);
  });

  it('un paragrafo dopo un elenco apre un blocco nuovo', () => {
    const blocks = parseSimpleMarkdown('- una\n- due\npoi il resto');
    expect(blocks.map((b) => b.kind)).toEqual(['list', 'paragraph']);
  });

  it('un titolo chiude sia paragrafi sia elenchi', () => {
    const blocks = parseSimpleMarkdown('testo\n- voce\n# titolo\naltro testo');
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'list', 'heading', 'paragraph']);
  });

  it('gestisce gli elenchi indentati', () => {
    const blocks = parseSimpleMarkdown('  - rientrato');
    expect(blocks[0]).toMatchObject({ kind: 'list' });
  });

  it('il markup inline funziona dentro titoli ed elenchi', () => {
    const blocks = parseSimpleMarkdown('# piano **serio**\n- non oltre `120`');
    expect(blocks[0]).toMatchObject({
      kind: 'heading',
      content: [
        { kind: 'text', text: 'piano ' },
        { kind: 'bold', text: 'serio' },
      ],
    });
    if (blocks[1]?.kind === 'list') {
      expect(blocks[1].items[0]).toEqual([
        { kind: 'text', text: 'non oltre ' },
        { kind: 'code', text: '120' },
      ]);
    }
  });

  it('testo vuoto o di soli spazi non produce blocchi', () => {
    expect(parseSimpleMarkdown('')).toEqual([]);
    expect(parseSimpleMarkdown('   \n\n  ')).toEqual([]);
  });

  it('regge una nota di strategia vera', () => {
    const testo = [
      '# Piano asta',
      '',
      'Non spendere più di **300** sul reparto difensivo.',
      'Meglio due difensori da 80 che uno da 160.',
      '',
      '## Portieri',
      '- uno titolare sicuro',
      '- due da `1` credito',
      '',
      'Il resto lo decido sul momento.',
    ].join('\n');

    const blocks = parseSimpleMarkdown(testo);
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'paragraph',
    ]);
  });
});

describe('isBlankMarkdown', () => {
  it('riconosce il testo che non ha niente da mostrare', () => {
    expect(isBlankMarkdown('')).toBe(true);
    expect(isBlankMarkdown('   \n  \t ')).toBe(true);
    expect(isBlankMarkdown('x')).toBe(false);
  });
});
