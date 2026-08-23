/**
 * Parsing della command bar (PRD §5.1).
 *
 * Un solo input, nessuno switch di modalita': e' la presenza della sigla a
 * distinguere la valutazione dall'assegnazione.
 *
 *   dimarco              cerca soltanto
 *   dimarco 60           valutazione: chi puo' ancora battermi a 60
 *   dimarco 60 mrc       assegnazione: Dimarco a MRC per 60
 *   martinez l. 118 leo  il nome puo' contenere spazi e punteggiatura
 *
 * Il prezzo si riconosce come ultimo token numerico, la sigla come token finale
 * di tre lettere. Cosi' "martinez l." resta tutto nella query anche se finisce
 * con una parola corta.
 */

export type Command =
  | { readonly kind: 'empty' }
  | { readonly kind: 'search'; readonly query: string }
  | { readonly kind: 'evaluate'; readonly query: string; readonly price: number }
  | {
      readonly kind: 'assign';
      readonly query: string;
      readonly price: number;
      readonly abbr: string;
    }
  | { readonly kind: 'error'; readonly detail: string };

/** Sigla di lega: esattamente tre lettere (PRD §3). */
const ABBR_PATTERN = /^[a-z]{3}$/;

function isInteger(token: string): boolean {
  return /^\d+$/.test(token);
}

/**
 * Interpreta il testo digitato.
 *
 * @param knownAbbrs sigle valide di lega, gia' in minuscolo. Servono a
 *   distinguere una sigla da una parola del nome, e a dire subito che una
 *   sigla non esiste invece di assegnare alla squadra sbagliata.
 */
export function parseCommand(raw: string, knownAbbrs: ReadonlySet<string>): Command {
  const tokens = raw.trim().split(/\s+/).filter((t) => t !== '');
  if (tokens.length === 0) return { kind: 'empty' };

  const last = tokens[tokens.length - 1] as string;
  const lastLower = last.toLowerCase();
  const secondLast = tokens.length >= 2 ? (tokens[tokens.length - 2] as string) : null;

  // Forma completa: <nome...> <prezzo> <sigla>
  if (secondLast !== null && isInteger(secondLast) && !isInteger(last)) {
    const query = tokens.slice(0, -2).join(' ');
    const price = Number(secondLast);

    if (query === '') {
      return { kind: 'error', detail: 'Manca il nome del giocatore.' };
    }
    if (!ABBR_PATTERN.test(lastLower)) {
      return {
        kind: 'error',
        detail: `"${last}" non e' una sigla: servono esattamente tre lettere.`,
      };
    }
    if (!knownAbbrs.has(lastLower)) {
      return {
        kind: 'error',
        detail: `Sigla "${lastLower}" sconosciuta. In lega ci sono: ${[...knownAbbrs].sort().join(', ')}.`,
      };
    }
    if (price < 1) {
      return { kind: 'error', detail: 'Il prezzo deve essere almeno 1 credito.' };
    }
    return { kind: 'assign', query, price, abbr: lastLower };
  }

  // Forma con prezzo ma senza sigla: <nome...> <prezzo>
  if (isInteger(last)) {
    const query = tokens.slice(0, -1).join(' ');
    const price = Number(last);
    if (query === '') {
      return { kind: 'error', detail: 'Manca il nome del giocatore.' };
    }
    if (price < 1) {
      return { kind: 'error', detail: 'Il prezzo deve essere almeno 1 credito.' };
    }
    return { kind: 'evaluate', query, price };
  }

  return { kind: 'search', query: tokens.join(' ') };
}

/** Query da usare per la ricerca, qualunque sia la forma del comando. */
export function commandQuery(command: Command): string {
  switch (command.kind) {
    case 'search':
    case 'evaluate':
    case 'assign':
      return command.query;
    case 'empty':
    case 'error':
      return '';
  }
}

/** Prezzo digitato, `null` se non ancora presente. */
export function commandPrice(command: Command): number | null {
  return command.kind === 'evaluate' || command.kind === 'assign' ? command.price : null;
}
