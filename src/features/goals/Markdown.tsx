import type { Block, Inline } from '../../domain/markdown';
import { parseSimpleMarkdown } from '../../domain/markdown';

/**
 * Disegna il markdown semplice di §5.3.
 *
 * Costruisce elementi React dalla struttura tipizzata del dominio: niente
 * `dangerouslySetInnerHTML`, quindi non esiste un percorso in cui quello che
 * scrivi nelle note finisca interpretato come markup.
 */

export interface MarkdownProps {
  readonly text: string;
  /** Densita' e colore del contenitore: la scheda giocatore lo vuole piu' fitto. */
  readonly className?: string;
}

export function Markdown({ text, className }: MarkdownProps): JSX.Element {
  const blocks = parseSimpleMarkdown(text);

  return (
    <div className={`flex flex-col gap-2 text-sm text-zinc-200 ${className ?? ''}`}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { readonly block: Block }): JSX.Element {
  switch (block.kind) {
    case 'heading': {
      const size =
        block.level === 1 ? 'text-base font-semibold' : block.level === 2 ? 'text-sm font-semibold' : 'text-sm font-medium';
      return (
        <p className={`${size} text-zinc-100`}>
          <InlineView content={block.content} />
        </p>
      );
    }
    case 'list':
      return (
        <ul className="ml-4 list-disc">
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineView content={item} />
            </li>
          ))}
        </ul>
      );
    case 'paragraph':
      return (
        <p>
          <InlineView content={block.content} />
        </p>
      );
  }
}

function InlineView({ content }: { readonly content: readonly Inline[] }): JSX.Element {
  return (
    <>
      {content.map((piece, i) => {
        switch (piece.kind) {
          case 'bold':
            return (
              <strong key={i} className="font-semibold text-zinc-50">
                {piece.text}
              </strong>
            );
          case 'italic':
            return (
              <em key={i} className="italic">
                {piece.text}
              </em>
            );
          case 'code':
            return (
              <code key={i} className="rounded bg-white/[0.06] px-1 text-[0.9em] text-emerald-300">
                {piece.text}
              </code>
            );
          case 'text':
            return <span key={i}>{piece.text}</span>;
        }
      })}
    </>
  );
}
