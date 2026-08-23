/**
 * Markdown semplice per le note di strategia (PRD §5.3).
 *
 * Deliberatamente minuscolo: titoli, elenchi, grassetto, corsivo, codice. Non
 * e' un parser Markdown e non prova a esserlo — serve a rileggere quattro
 * appunti sotto asta, non a impaginare.
 *
 * **Non produce HTML.** Restituisce una struttura tipizzata che la UI disegna
 * con elementi React: cosi' non esiste un percorso in cui il testo che scrivi
 * finisca interpretato come markup.
 */

export type Inline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'bold'; readonly text: string }
  | { readonly kind: 'italic'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string };

export type Block =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly content: readonly Inline[] }
  | { readonly kind: 'paragraph'; readonly content: readonly Inline[] }
  | { readonly kind: 'list'; readonly items: readonly (readonly Inline[])[] };

/** `**grassetto**`, `*corsivo*`, `` `codice` ``. Il resto e' testo. */
const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

export function parseInline(raw: string): Inline[] {
  const out: Inline[] = [];
  for (const piece of raw.split(INLINE_PATTERN)) {
    if (piece === '') continue;
    if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
      out.push({ kind: 'bold', text: piece.slice(2, -2) });
    } else if (piece.startsWith('`') && piece.endsWith('`') && piece.length > 2) {
      out.push({ kind: 'code', text: piece.slice(1, -1) });
    } else if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) {
      out.push({ kind: 'italic', text: piece.slice(1, -1) });
    } else {
      out.push({ kind: 'text', text: piece });
    }
  }
  return out;
}

function headingLevel(line: string): 1 | 2 | 3 | null {
  if (line.startsWith('### ')) return 3;
  if (line.startsWith('## ')) return 2;
  if (line.startsWith('# ')) return 1;
  return null;
}

function listItem(line: string): string | null {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('- ')) return trimmed.slice(2);
  if (trimmed.startsWith('* ')) return trimmed.slice(2);
  return null;
}

/**
 * Spezza il testo in blocchi.
 *
 * Le righe consecutive di un paragrafo restano insieme; una riga vuota lo
 * chiude. Gli elenchi si accumulano finche' le righe cominciano con `-` o `*`.
 */
export function parseSimpleMarkdown(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = (): void => {
    if (items.length === 0) return;
    blocks.push({ kind: 'list', items: items.map(parseInline) });
    items = [];
  };
  const flushAll = (): void => {
    flushParagraph();
    flushList();
  };

  for (const line of text.split('\n')) {
    if (line.trim() === '') {
      flushAll();
      continue;
    }

    const level = headingLevel(line);
    if (level !== null) {
      flushAll();
      blocks.push({ kind: 'heading', level, content: parseInline(line.slice(level + 1)) });
      continue;
    }

    const item = listItem(line);
    if (item !== null) {
      flushParagraph();
      items.push(item);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

/** `true` se il testo non contiene niente da mostrare. */
export function isBlankMarkdown(text: string): boolean {
  return text.trim() === '';
}
