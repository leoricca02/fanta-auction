/**
 * Rigenera `src/data/specialists.ts` dalle pagine degli specialisti di SosFanta.
 *
 *   node scripts/build-specialists.mjs
 *
 * Le fonti sono due e sono fatte diversamente.
 *
 * **Punizioni e corner** sono elenchi gia' in gerarchia — `Punizioni: A, B, C` —
 * e finiscono nel file cosi' come sono scritti: l'aggancio al listone lo fa il
 * dominio a runtime, dentro la rosa del club.
 *
 * **I rigoristi** sono prosa: `Primo: Gianluca Scamacca e' il primissimo
 * candidato dal dischetto...`, `Note: alle sue spalle Samardzic (2 su 2)...`.
 * Non c'e' un elenco da leggere, quindi lo script ribalta il problema: prende la
 * rosa di quel club dal listone e cerca **quali dei suoi giocatori sono citati**,
 * nell'ordine in cui compaiono. Chi e' nel paragrafo `Primo` viene prima di chi
 * e' solo nelle `Note`. Un cognome che dentro quella rosa appartiene a due
 * uomini non viene preso: sarebbe una scelta a sorte.
 *
 * Percio' questo script, unico fra i tre, **legge il listone**: senza rosa la
 * prosa non e' interpretabile. Rigenera dopo aver aggiornato
 * `data/lista_calciatori_classic.xlsx`, non prima.
 *
 * Lo script stampa tutto quello che ha capito, squadra per squadra, prima di
 * scrivere: il parser della prosa non si verifica con un totale, si verifica
 * leggendolo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import XLSX from 'xlsx';

const RIGORISTI_URL =
  'https://www.sosfanta.com/asta-fantacalcio/fantacalcio-asta-tutti-rigoristi-seriea-venti-squadre-campionato/';
const PIAZZATI_URL =
  'https://www.sosfanta.com/asta-fantacalcio/serie-a-2026-2027-tiratori-punizioni-corner-specialisti-fantacalcio-asta/';

/**
 * Le fonti, un blocco per tipo. `label` e' l'etichetta che introduce l'elenco
 * nella pagina; `prose` dice di leggere i paragrafi discorsivi invece.
 */
const SOURCES = [
  { kind: 'rigori', url: RIGORISTI_URL, prose: true },
  { kind: 'punizioni', url: PIAZZATI_URL, prose: false, label: 'Punizioni' },
  { kind: 'corner', url: PIAZZATI_URL, prose: false, label: 'Corner' },
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

/** Come `rosterKey` del dominio: via le iniziali di disambiguazione finali. */
function rosterKey(raw) {
  const parts = normalize(raw).split(' ').filter((t) => t !== '');
  while (parts.length > 1 && parts[parts.length - 1].length <= 2) parts.pop();
  return parts.join(' ');
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** Rosa di Serie A dal listone: serve solo il nome e il club. */
function readRosters() {
  const wb = XLSX.read(readFileSync(LISTONE));
  const rows = XLSX.utils
    .sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
    .slice(1)
    .filter((r) => r[0] !== undefined && r[0] !== '');

  const rosters = new Map();
  for (const row of rows) {
    const name = String(row[1]);
    const team = String(row[3]);
    const key = normalize(team);
    const roster = rosters.get(key) ?? { name: team, players: [] };
    roster.players.push({ name, key: rosterKey(name) });
    rosters.set(key, roster);
  }
  if (rosters.size !== EXPECTED_TEAMS) {
    throw new Error(`Il listone ha ${rosters.size} club invece di ${EXPECTED_TEAMS}.`);
  }
  return rosters;
}

/**
 * Paragrafi del corpo dell'articolo. Fuori da `article-body` c'e' il menu del
 * sito, che contiene le sigle di tutte le squadre e manderebbe fuori strada il
 * riconoscimento delle intestazioni.
 */
function articleParagraphs(html, url) {
  const start = html.indexOf('article-body');
  if (start === -1) throw new Error(`${url}: blocco "article-body" non trovato.`);
  const body = html.slice(start);
  const paragraphs = [...body.matchAll(/<p[^>]*>(.*?)<\/p>/gs)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t !== '');
  if (paragraphs.length === 0) throw new Error(`${url}: nessun paragrafo, il markup e' cambiato.`);
  return paragraphs;
}

/**
 * Divide i paragrafi in blocchi per squadra.
 *
 * L'intestazione e' un paragrafo che, tolti emoji e punteggiatura, **e'** il
 * nome di un club: non "contiene", e'. Riconoscerla cosi' invece che
 * dall'emoji regge a un cambio di emoji, che e' la cosa piu' probabile che
 * cambi di anno in anno.
 */
function splitByTeam(paragraphs, rosters, url) {
  const blocks = [];
  const seen = new Set();
  let current = null;
  for (const text of paragraphs) {
    const asTeam = rosters.get(normalize(text));
    if (asTeam !== undefined) {
      // Un'intestazione ripetuta e' rumore di coda pagina, non un blocco nuovo.
      if (seen.has(asTeam.name)) {
        current = null;
        continue;
      }
      seen.add(asTeam.name);
      current = { team: asTeam.name, roster: asTeam.players, lines: [] };
      blocks.push(current);
      continue;
    }
    if (current !== null) current.lines.push(text);
  }
  if (blocks.length !== EXPECTED_TEAMS) {
    throw new Error(
      `${url}: ${blocks.length} squadre riconosciute invece di ${EXPECTED_TEAMS}. ` +
        `Controllare le intestazioni: devono combaciare con i club del listone.`,
    );
  }
  return blocks;
}

/** `Punizioni: A, B, C` -> `['A', 'B', 'C']`, nell'ordine della fonte. */
function readList(block, label, url) {
  const prefix = new RegExp(`^${label}\\s*:`, 'i');
  const line = block.lines.find((t) => prefix.test(t));
  if (line === undefined) {
    throw new Error(`${url}: ${block.team} non ha la riga "${label}:".`);
  }
  const names = line
    .replace(prefix, '')
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n !== '');
  if (names.length === 0) throw new Error(`${url}: ${block.team}, "${label}:" senza nomi.`);
  return names;
}

/**
 * Nomi della rosa citati nella prosa, in ordine di gerarchia.
 *
 * Prima chi compare in `Primo:`, poi chi compare solo in `Note:`, ciascun
 * gruppo nell'ordine in cui il testo li nomina. La citazione vale come parola
 * intera: `Mina` non aggancia `terMINAle`.
 */
function readProse(block, url) {
  const primo = block.lines.find((t) => /^Primo\s*:/i.test(t)) ?? '';
  const note = block.lines.find((t) => /^Note\s*:/i.test(t)) ?? '';
  if (primo === '' && note === '') {
    throw new Error(`${url}: ${block.team} non ha ne' "Primo:" ne' "Note:".`);
  }

  const ambiguous = new Set();
  const byKey = new Map();
  for (const p of block.roster) {
    if (p.key.length < 3) continue;
    if (byKey.has(p.key)) ambiguous.add(p.key);
    else byKey.set(p.key, p);
  }

  const found = [];
  for (const [text, tier] of [
    [normalize(primo), 0],
    [normalize(note), 1],
  ]) {
    if (text === '') continue;
    for (const [key, player] of byKey) {
      if (ambiguous.has(key)) continue;
      if (found.some((f) => f.name === player.name)) continue;
      const at = text.search(new RegExp(`(^| )${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`));
      if (at !== -1) found.push({ name: player.name, tier, at });
    }
  }
  found.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : a.at - b.at));
  if (found.length === 0) {
    throw new Error(
      `${url}: ${block.team}, nessun giocatore della rosa citato nella prosa. ` +
        `O il listone e' vecchio, o la convenzione dei nomi e' cambiata.`,
    );
  }
  return found.map((f) => f.name);
}

const rosters = readRosters();
const pages = new Map();
for (const source of SOURCES) {
  if (!pages.has(source.url)) pages.set(source.url, await fetchPage(source.url));
}

const all = [];
for (const source of SOURCES) {
  const blocks = splitByTeam(articleParagraphs(pages.get(source.url), source.url), rosters, source.url);
  console.log(`\n== ${source.kind} ==`);
  for (const block of blocks) {
    const names = source.prose ? readProse(block, source.url) : readList(block, source.label, source.url);
    console.log(`${block.team.padEnd(12)} ${names.join(', ')}`);
    all.push({ team: block.team, kind: source.kind, names });
  }
}

const BACKSLASH = String.fromCharCode(92);
const quoted = (v) => `'${v.split("'").join(`${BACKSLASH}'`)}'`;

const body = all
  .map(
    (b) =>
      `  { team: ${quoted(b.team)}, kind: '${b.kind}', names: [${b.names
        .map(quoted)
        .join(', ')}] },`,
  )
  .join('\n');

const out = `/**
 * Specialisti dei piazzati da SosFanta. GENERATO, non modificare a mano:
 * rigenera con \`node scripts/build-specialists.mjs\`.
 *
 * Punizioni e corner sono i nomi come li scrive la fonte. I rigoristi sono i
 * nomi **del listone**, perche' la fonte li racconta a parole e lo script li
 * riconosce leggendo la rosa: vedi lo script per il come e il perche'.
 *
 * Fonti:
 * - ${RIGORISTI_URL}
 * - ${PIAZZATI_URL}
 */
import type { SpecialistBlock } from '../domain/specialists';

export const SPECIALISTS_SOURCE_URLS = [
  '${RIGORISTI_URL}',
  '${PIAZZATI_URL}',
] as const;

/** Data di scarico delle pagine, mostrata all'utente. */
export const SPECIALISTS_UPDATED_AT = '${new Date().toISOString().slice(0, 10)}';

export const SPECIALIST_BLOCKS: readonly SpecialistBlock[] = [
${body}
];
`;

writeFileSync(new URL('../src/data/specialists.ts', import.meta.url), out, 'utf8');
const names = all.reduce((n, b) => n + b.names.length, 0);
console.log(`\nScritto src/data/specialists.ts: ${all.length} blocchi, ${names} nomi.`);
