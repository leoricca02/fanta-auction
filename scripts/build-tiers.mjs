/**
 * Rigenera `src/data/tiers.ts` dalla guida all'asta di SosFanta.
 *
 *   node scripts/build-tiers.mjs
 *
 * La guida e' paginata per ruolo: pagina 1 portieri, 2 difensori, 3
 * centrocampisti, 4 attaccanti. Ogni fascia e' un `<p><strong>NOME FASCIA</strong>
 * - Nome1, Nome2, ...</p>`, e i paragrafi successivi sono il commento discorsivo
 * su ciascun giocatore, che qui non serve.
 *
 * Difensivo come il parser del listone: se una fascia non e' fra quelle note, o
 * se una pagina non produce nessun blocco, lo script muore nominando il
 * problema invece di scrivere un file monco.
 */
import { writeFileSync } from 'node:fs';

const BASE =
  'https://www.sosfanta.com/guida-asta-fantacalcio/guida-asta-fantacalcio-2026-2027-tutti-consigli-fasce-chi-prendere';

/** Pagina -> ruolo. L'ordine della guida e' P, D, C, A come l'asta. */
const PAGES = [
  { url: `${BASE}/`, role: 'P' },
  { url: `${BASE}/2/`, role: 'D' },
  { url: `${BASE}/3/`, role: 'C' },
  { url: `${BASE}/4/`, role: 'A' },
];

/** Deve combaciare con TIER_ORDER di src/domain/tiers.ts. */
const KNOWN_TIERS = new Set([
  'SUPER TOP',
  'TOP',
  'SEMITOP',
  'SOTTO AI SEMITOP',
  'FASCIA ALTA',
  'JOLLY 1ª FASCIA',
  'POSSIBILI SORPRESE',
  'FASCIA MEDIA',
  'INFORTUNATI',
  'SCOMMESSE',
  'SOPRA AI LOW COST',
  'JOLLY 2ª FASCIA',
  'LOW COST 1ª FASCIA',
  'LOW COST 2ª FASCIA',
  'LEGHE NUMEROSE',
  'JOLLY 3ª FASCIA',
  'JOLLY 4ª FASCIA',
  'A RISCHIO',
  'DA EVITARE',
  'MERCATO',
]);

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

function stripHtml(fragment) {
  return fragment
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e)
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function extractBlocks(html, role, url) {
  const blocks = [];
  for (const [, strong, rest] of html.matchAll(/<p>\s*<strong>(.*?)<\/strong>(.*?)<\/p>/gs)) {
    const tier = stripHtml(strong);
    const tail = stripHtml(rest);
    // I paragrafi di servizio ("GERARCHIA PORTIERI", link a FantaLab) hanno il
    // grassetto ma non l'elenco che segue il trattino.
    if (!tail.startsWith('-')) continue;
    if (!KNOWN_TIERS.has(tier)) {
      throw new Error(`${url}: fascia sconosciuta "${tier}". Aggiornare TIER_ORDER.`);
    }
    const names = tail
      .slice(1)
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n !== '');
    if (names.length === 0) throw new Error(`${url}: fascia "${tier}" senza giocatori.`);
    blocks.push({ role, tier, names });
  }
  if (blocks.length === 0) throw new Error(`${url}: nessuna fascia trovata, il markup e' cambiato.`);
  return blocks;
}

const all = [];
for (const page of PAGES) {
  const blocks = extractBlocks(await fetchPage(page.url), page.role, page.url);
  const count = blocks.reduce((n, b) => n + b.names.length, 0);
  console.log(`${page.role}: ${blocks.length} fasce, ${count} giocatori`);
  all.push(...blocks);
}

// Un nome in due fasce dello stesso ruolo renderebbe la fascia ambigua.
const seen = new Map();
for (const b of all) {
  for (const n of b.names) {
    const key = `${b.role}|${n.toLowerCase()}`;
    const prev = seen.get(key);
    if (prev !== undefined) throw new Error(`"${n}" (${b.role}) sia in ${prev} sia in ${b.tier}.`);
    seen.set(key, b.tier);
  }
}

/** Apostrofo escapato a mano: niente sequenze di escape annidate. */
const BACKSLASH = String.fromCharCode(92);
const quoted = (v) => `'${v.split("'").join(`${BACKSLASH}'`)}'`;

const body = all
  .map(
    (b) =>
      `  {\n    role: '${b.role}',\n    tier: '${b.tier}',\n    names: [${b.names
        .map(quoted)
        .join(', ')}],\n  },`,
  )
  .join('\n');

const out = `/**
 * Fasce della guida all'asta di SosFanta. GENERATO, non modificare a mano:
 * rigenera con \`node scripts/build-tiers.mjs\`.
 *
 * Fonte: ${BASE}
 */
import type { TierBlock } from '../domain/tiers';

export const TIERS_SOURCE_URL = '${BASE}';

/** Data di scarico della guida, mostrata all'utente per capire quanto e' vecchia. */
export const TIERS_UPDATED_AT = '${new Date().toISOString().slice(0, 10)}';

export const TIER_BLOCKS: readonly TierBlock[] = [
${body}
];
`;

writeFileSync(new URL('../src/data/tiers.ts', import.meta.url), out, 'utf8');
console.log(`Scritto src/data/tiers.ts: ${all.length} fasce, ${seen.size} giocatori.`);
