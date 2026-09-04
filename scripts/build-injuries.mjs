/**
 * Rigenera `src/data/injuries.ts` dalla tabella indisponibili di SosFanta.
 *
 *   node scripts/build-injuries.mjs
 *
 * La fonte e' una tabella, non una guida: una pagina sola, venti blocchi, e per
 * ogni blocco tre elenchi — infortunati, squalificati, diffidati. E' il posto in
 * cui SosFanta scrive **quando torna**, con la giornata:
 *
 *     <p><strong>ATALANTA</strong></p>
 *     <p><em>Infortunati:</em></p>
 *     <p><strong>Hien</strong> - Fuori per una lesione ..., in dubbio per la 6a.</p>
 *     <p><em>Squalificati:</em> -</p>
 *     <p><em>Diffidati:</em> -</p>
 *
 * Sostituisce la vecchia sorgente degli infortuni, che erano i paragrafi di
 * commento della fascia `INFORTUNATI` nella guida all'asta: quella commentava
 * otto big a settembre e taceva su tutti gli altri, questa li elenca tutti e
 * dice la giornata. Il commento della guida non c'e' piu' da nessuna parte, ed
 * e' una scelta: due frasi sullo stesso infortunio, scritte in due momenti
 * diversi, si contraddicono e la piu' vecchia vince quando e' la piu' lunga.
 *
 * Come `build-specialists.mjs` legge il listone, ma solo per i **nomi dei
 * club**: servono a riconoscere le intestazioni e a scrivere il club come lo
 * scrive il listone, cosi' che a runtime l'aggancio avvenga dentro la rosa.
 * L'aggancio nome -> giocatore lo fa il dominio, non questo script.
 *
 * Difensivo come gli altri: se le venti squadre non ci sono tutte, o se non
 * aggancia nessun infortunato, muore nominando il problema invece di scrivere
 * un file vuoto — che qui sarebbe il piu' insidioso dei bug, perche' "nessuno
 * infortunato" e' un risultato plausibile a leggersi.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import XLSX from 'xlsx';

const SOURCE_URL =
  'https://www.sosfanta.com/indisponibili-e-squalificati/tabella-indisponibili-seriea-fantacalcio-asta-infortunati-tempi-recupero-squalificati-diffidati/';

/**
 * Le tre sezioni di ogni blocco, con l'etichetta che le apre nella pagina.
 * L'ordine e' quello della fonte ed e' anche quello in cui si mostrano.
 */
const SECTIONS = [
  { label: 'Infortunati', kind: 'infortunato' },
  { label: 'Squalificati', kind: 'squalificato' },
  { label: 'Diffidati', kind: 'diffidato' },
];

/** Le venti squadre devono esserci tutte: una in meno e' un blocco perso. */
const EXPECTED_TEAMS = 20;

const LISTONE = new URL('../data/lista_calciatori_classic.xlsx', import.meta.url);

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&nbsp;': ' ',
};

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e] ?? e);
}

function stripHtml(fragment) {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Come `normalizeQuery` del dominio: minuscolo, senza accenti, senza segni. */
function normalize(raw) {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/[đð]/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/þ/g, 'th')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** I venti club del listone, per riconoscere le intestazioni della tabella. */
function readClubs() {
  const wb = XLSX.read(readFileSync(LISTONE));
  const rows = XLSX.utils
    .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    .slice(1)
    .filter((r) => r[0] !== undefined && r[0] !== '');

  const clubs = new Map();
  for (const row of rows) clubs.set(normalize(String(row[3])), String(row[3]));
  if (clubs.size !== EXPECTED_TEAMS) {
    throw new Error(`Il listone ha ${clubs.size} club invece di ${EXPECTED_TEAMS}.`);
  }
  return clubs;
}

/**
 * Paragrafi del corpo dell'articolo, con il grassetto ancora riconoscibile.
 *
 * Il `<strong>` non e' decorazione: distingue l'intestazione di squadra e il
 * nome del giocatore dal resto della riga. Quindi qui, a differenza degli altri
 * script, i paragrafi escono come coppie `{ strong, text }`.
 */
function articleParagraphs(html, url) {
  const start = html.indexOf('article-body');
  if (start === -1) throw new Error(`${url}: blocco "article-body" non trovato.`);
  const body = html.slice(start);
  const paragraphs = [];
  for (const [, inner] of body.matchAll(/<p[^>]*>(.*?)<\/p>/gs)) {
    const text = stripHtml(inner);
    if (text === '') continue;
    const strong = /<strong[^>]*>(.*?)<\/strong>/s.exec(inner);
    paragraphs.push({ strong: strong === null ? null : stripHtml(strong[1]), text });
  }
  if (paragraphs.length === 0) throw new Error(`${url}: nessun paragrafo, il markup e' cambiato.`);
  return paragraphs;
}

/**
 * Divide i paragrafi in blocchi per squadra.
 *
 * L'intestazione e' un paragrafo che, normalizzato, **e'** il nome di un club
 * del listone — la stessa regola di `build-specialists.mjs`, per lo stesso
 * motivo: regge a un cambio di maiuscole, di emoji o di grassetto.
 */
function splitByTeam(paragraphs, clubs, url) {
  const blocks = [];
  const seen = new Set();
  let current = null;
  for (const para of paragraphs) {
    const club = clubs.get(normalize(para.text));
    if (club !== undefined) {
      // Un'intestazione ripetuta e' rumore di coda pagina, non un blocco nuovo.
      if (seen.has(club)) {
        current = null;
        continue;
      }
      seen.add(club);
      current = { team: club, lines: [] };
      blocks.push(current);
      continue;
    }
    if (current !== null) current.lines.push(para);
  }
  if (blocks.length !== EXPECTED_TEAMS) {
    throw new Error(
      `${url}: ${blocks.length} squadre riconosciute invece di ${EXPECTED_TEAMS}. ` +
        `Controllare le intestazioni: devono combaciare con i club del listone.`,
    );
  }
  return blocks;
}

/**
 * La giornata di rientro, quando la fonte la scrive.
 *
 * `in dubbio per la 6a` e `rientro previsto per la 6a` sono le due forme viste;
 * la seconda e' piu' netta della prima, ma tradurre quella sfumatura in un
 * campo vorrebbe dire fingere che "in dubbio" sia una data. Qui si prende solo
 * il numero, e la frase intera resta accanto a dirlo con le sue parole.
 */
function readMatchday(text) {
  const m = /\bper la (\d{1,2})[ªa]\b/i.exec(text);
  return m === null ? null : Number(m[1]);
}

/**
 * Le voci di una sezione di un blocco.
 *
 * Due forme, entrambe accettate. Gli infortunati sono un paragrafo per uomo,
 * `<strong>Nome</strong> - descrizione`, che segue l'etichetta. Squalificati e
 * diffidati, quando ci sono, stanno sulla riga dell'etichetta separati da
 * virgola, perche' una giornata di squalifica non ha una descrizione. Un `-`
 * dopo l'etichetta vuol dire che quella sezione e' vuota, ed e' il caso normale
 * fuori dal campionato.
 */
function readSection(block, section, otherLabels) {
  const prefix = new RegExp(`^${section.label}\\s*:`, 'i');
  const at = block.lines.findIndex((p) => prefix.test(p.text));
  if (at === -1) return null;

  const entries = [];
  const inline = block.lines[at].text.replace(prefix, '').trim();
  if (inline !== '' && inline !== '-') {
    for (const name of inline.split(',').map((n) => n.trim()).filter((n) => n !== '')) {
      entries.push({ name, text: '', matchday: null });
    }
  }

  for (const para of block.lines.slice(at + 1)) {
    if (otherLabels.some((re) => re.test(para.text))) break;
    // Senza grassetto non c'e' un nome da isolare: e' una riga di servizio.
    if (para.strong === null || para.strong === '') continue;
    const text = para.text.slice(para.strong.length).replace(/^\s*[-–—]\s*/, '').trim();
    entries.push({ name: para.strong, text, matchday: readMatchday(text) });
  }
  return entries;
}

const clubs = readClubs();
const html = await fetchPage(SOURCE_URL);
const blocks = splitByTeam(articleParagraphs(html, SOURCE_URL), clubs, SOURCE_URL);

const all = [];
for (const block of blocks) {
  const printed = [];
  for (const section of SECTIONS) {
    const others = SECTIONS.filter((s) => s !== section).map(
      (s) => new RegExp(`^${s.label}\\s*:`, 'i'),
    );
    const entries = readSection(block, section, others);
    if (entries === null) {
      throw new Error(`${SOURCE_URL}: ${block.team} non ha la riga "${section.label}:".`);
    }
    for (const e of entries) all.push({ team: block.team, kind: section.kind, ...e });
    if (entries.length > 0) {
      printed.push(
        `${section.kind}: ${entries
          .map((e) => (e.matchday === null ? e.name : `${e.name} (${e.matchday}a)`))
          .join(', ')}`,
      );
    }
  }
  console.log(`${block.team.padEnd(12)} ${printed.join('  |  ') || '—'}`);
}

const injured = all.filter((e) => e.kind === 'infortunato');
if (injured.length === 0) {
  throw new Error(
    `${SOURCE_URL}: nessun infortunato letto in venti squadre. ` +
      `O la pagina ha cambiato impaginazione, o si e' scaricata la versione sbagliata.`,
  );
}

/** Apostrofo escapato a mano: niente sequenze di escape annidate. */
const BACKSLASH = String.fromCharCode(92);
const quoted = (v) => `'${v.split("'").join(`${BACKSLASH}'`)}'`;

const body = all
  .map(
    (e) =>
      `  {\n    team: ${quoted(e.team)},\n    kind: '${e.kind}',\n    name: ${quoted(
        e.name,
      )},\n    text: ${quoted(e.text)},\n    matchday: ${e.matchday ?? 'null'},\n  },`,
  )
  .join('\n');

const out = `/**
 * Indisponibili di Serie A: infortunati, squalificati, diffidati, con la
 * giornata di rientro quando la fonte la scrive. GENERATO, non modificare a
 * mano: rigenera con \`node scripts/build-injuries.mjs\`.
 *
 * Fonte: ${SOURCE_URL}
 */
import type { UnavailableNote } from '../domain/injuries';

export const INJURIES_SOURCE_URL = '${SOURCE_URL}';

/** Data di scarico della tabella: un infortunio invecchia in fretta. */
export const INJURIES_UPDATED_AT = '${new Date().toISOString().slice(0, 10)}';

export const INJURY_NOTES: readonly UnavailableNote[] = [
${body}
];
`;

writeFileSync(new URL('../src/data/injuries.ts', import.meta.url), out, 'utf8');
console.log(
  `\nScritto src/data/injuries.ts: ${all.length} voci ` +
    `(${injured.length} infortunati, ${all.length - injured.length} fra squalificati e diffidati).`,
);
