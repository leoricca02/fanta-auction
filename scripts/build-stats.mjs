/**
 * Rigenera `src/data/stats.ts` dalle statistiche di Fantacalcio.it.
 *
 *   node scripts/build-stats.mjs
 *
 * La tabella di riepilogo e' renderizzata lato server e ogni riga porta l'id
 * Fantacalcio.it nell'href del giocatore: e' lo stesso `#` del listone, quindi
 * l'aggancio e' per id e non per nome. Niente omonimie, niente accenti.
 *
 * Le porte inviolate non stanno nel riepilogo. Si ricavano dalla pagina del
 * singolo portiere, che elenca le giornate una per una: partita con voto e
 * senza l'evento `concededGoals` = porta inviolata. Lo script verifica che
 * presenze e gol subiti ricavati per giornata combacino col riepilogo, cosi'
 * un cambio di markup non passa inosservato producendo numeri plausibili.
 *
 * Difensivo come gli altri parser: se una colonna sparisce o un totale non
 * torna, muore nominando il giocatore invece di scrivere un file monco.
 */
import { writeFileSync } from 'node:fs';

/** Stagione conclusa. La 2026/27 e' in corso e non e' un dato di giudizio. */
const SEASON = '2025-26';
const SEASON_LABEL = '2025/26';
const STATS_URL = `https://www.fantacalcio.it/statistiche-serie-a/${SEASON}/classic/riepilogo`;

/** Pagine portiere scaricate in parallelo. Basso: non c'e' fretta. */
const CONCURRENCY = 6;

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Entita' HTML, incluse le numeriche: la fonte scrive "Montip&#xF2;" e
 * "Ndoy&#xE9;", e quei nomi finiscono anche negli href da richiamare.
 */
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

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** "6,42" -> 6.42. La cella vuota o "-" e' zero: il giocatore non ha giocato. */
function num(raw, what, who) {
  const t = raw.trim();
  if (t === '' || t === '-') return 0;
  const v = Number(t.replace(',', '.'));
  if (!Number.isFinite(v)) throw new Error(`${who}: ${what} illeggibile "${raw}".`);
  return v;
}

/** "3 / 4" -> [3, 4]: rigori segnati su rigori calciati. */
function penalties(raw, who) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(raw.trim());
  if (m === null) throw new Error(`${who}: rigori illeggibili "${raw}".`);
  return [Number(m[1]), Number(m[2])];
}

/** 'hellas-verona' -> 'Hellas Verona'. Sui 20 club attuali torna il nome del listone. */
function teamName(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const ROLES = { p: 'P', d: 'D', c: 'C', a: 'A' };

function parseSummary(html) {
  const table = /<table id="stats".*?<\/table>/s.exec(html);
  if (table === null) throw new Error(`${STATS_URL}: tabella "stats" non trovata.`);
  const rows = table[0].match(/<tr class="player-row".*?<\/tr>/gs) ?? [];
  if (rows.length === 0) throw new Error(`${STATS_URL}: nessuna riga giocatore, il markup e' cambiato.`);

  return rows.map((row) => {
    const link = /href="([^"]*\/serie-a\/squadre\/([^/]+)\/[^/]+\/(\d+)\/[^"]*)"/.exec(row);
    if (link === null) throw new Error(`${STATS_URL}: riga senza link giocatore.`);
    const id = Number(link[3]);

    const nameMatch = /<a class="player-name player-link".*?<span>(.*?)<\/span>/s.exec(row);
    if (nameMatch === null) throw new Error(`#${id}: nome non trovato.`);
    const name = stripHtml(nameMatch[1]);

    const roleRaw = /data-filter-role-classic="([a-z]+)"/.exec(row)?.[1];
    const role = ROLES[roleRaw ?? ''];
    if (role === undefined) throw new Error(`${name}: ruolo classic sconosciuto "${roleRaw}".`);

    const cells = {};
    for (const m of row.matchAll(/<t[dh][^>]*data-col-key="([a-z]+)"[^>]*>(.*?)<\/t[dh]>/gs)) {
      cells[m[1]] = stripHtml(m[2]);
    }
    for (const key of ['pg', 'mv', 'mfv', 'gol', 'gs', 'rig', 'rp', 'ass', 'amm', 'esp']) {
      if (cells[key] === undefined) throw new Error(`${name}: colonna "${key}" mancante.`);
    }

    const [penScored, penTaken] = penalties(cells.rig, name);
    return {
      id,
      name,
      team: teamName(link[2]),
      role,
      url: decodeEntities(link[1]),
      played: num(cells.pg, 'presenze', name),
      avg: num(cells.mv, 'media voto', name),
      fantaAvg: num(cells.mfv, 'fantamedia', name),
      goals: num(cells.gol, 'gol', name),
      conceded: num(cells.gs, 'gol subiti', name),
      penScored,
      penTaken,
      penSaved: num(cells.rp, 'rigori parati', name),
      assists: num(cells.ass, 'assist', name),
      yellow: num(cells.amm, 'ammonizioni', name),
      red: num(cells.esp, 'espulsioni', name),
      cleanSheets: null,
    };
  });
}

/**
 * Porte inviolate del portiere, contate giornata per giornata.
 * Restituisce anche presenze e gol subiti visti dalla pagina: il chiamante li
 * confronta col riepilogo, che e' l'unico modo di accorgersi che il conteggio
 * ha smesso di significare quello che credevamo.
 */
function parseCleanSheets(html, who) {
  const table = /<table class="player-summary-table".*?<\/table>/s.exec(html);
  if (table === null) throw new Error(`${who}: tabella delle giornate non trovata.`);
  const rows = table[0].match(/<tr>.*?<\/tr>/gs) ?? [];

  let played = 0;
  let conceded = 0;
  let cleanSheets = 0;
  for (const row of rows) {
    const grade = /<span class="grade" data-value="([^"]*)"/.exec(row);
    // Niente voto: non e' sceso in campo, e una porta inviolata non e' sua.
    if (grade === null || grade[1].trim() === '') continue;
    played += 1;
    const goals = /data-key="concededGoals"[^>]*data-value="(\d+)"/.exec(row);
    const n = goals === null ? 0 : Number(goals[1]);
    conceded += n;
    if (n === 0) cleanSheets += 1;
  }
  return { played, conceded, cleanSheets };
}

/** Scarica `items` a ondate di `CONCURRENCY`, in ordine. */
async function mapLimit(items, worker) {
  const out = [];
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const slice = items.slice(i, i + CONCURRENCY);
    out.push(...(await Promise.all(slice.map(worker))));
  }
  return out;
}

const players = parseSummary(await fetchPage(STATS_URL));
console.log(`Riepilogo ${SEASON_LABEL}: ${players.length} giocatori.`);

const keepers = players.filter((p) => p.role === 'P' && p.played > 0);
console.log(`Porte inviolate: ${keepers.length} portieri da controllare...`);

await mapLimit(keepers, async (p) => {
  const seen = parseCleanSheets(await fetchPage(p.url), p.name);
  if (seen.played !== p.played) {
    throw new Error(`${p.name}: ${seen.played} giornate con voto ma il riepilogo ne dichiara ${p.played}.`);
  }
  if (seen.conceded !== p.conceded) {
    throw new Error(`${p.name}: ${seen.conceded} gol subiti per giornata ma il riepilogo ne dichiara ${p.conceded}.`);
  }
  p.cleanSheets = seen.cleanSheets;
});

const BACKSLASH = String.fromCharCode(92);
const quoted = (v) => `'${v.split("'").join(`${BACKSLASH}'`)}'`;

const body = players
  .map(
    (p) =>
      `  { id: ${p.id}, name: ${quoted(p.name)}, team: ${quoted(p.team)}, role: '${p.role}',` +
      ` played: ${p.played}, avg: ${p.avg}, fantaAvg: ${p.fantaAvg},` +
      ` goals: ${p.goals}, assists: ${p.assists}, conceded: ${p.conceded},` +
      ` cleanSheets: ${p.cleanSheets}, penScored: ${p.penScored}, penTaken: ${p.penTaken},` +
      ` penSaved: ${p.penSaved}, yellow: ${p.yellow}, red: ${p.red} },`,
  )
  .join('\n');

const out = `/**
 * Statistiche Serie A ${SEASON_LABEL} da Fantacalcio.it. GENERATO, non
 * modificare a mano: rigenera con \`node scripts/build-stats.mjs\`.
 *
 * Fonte: ${STATS_URL}
 */
import type { SeasonStats } from '../domain/player-stats';

export const STATS_SOURCE_URL = '${STATS_URL}';

/** Stagione a cui si riferiscono le cifre, mostrata all'utente. */
export const STATS_SEASON = '${SEASON_LABEL}';

/** Data di scarico, per capire quanto e' vecchio il file. */
export const STATS_UPDATED_AT = '${new Date().toISOString().slice(0, 10)}';

export const SEASON_STATS: readonly SeasonStats[] = [
${body}
];
`;

writeFileSync(new URL('../src/data/stats.ts', import.meta.url), out, 'utf8');
console.log(`Scritto src/data/stats.ts: ${players.length} giocatori, ${keepers.length} portieri con porte inviolate.`);
