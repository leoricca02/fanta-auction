/**
 * Rigenera `src/data/calendar.ts` dal calendario di Fantacalcio.it.
 *
 *   node scripts/build-calendar.mjs
 *
 * Una pagina per giornata, `/serie-a/calendario/N`, renderizzata lato server.
 * Ogni partita e' un microdato schema.org `SportsEvent`: le due squadre stanno
 * in `<meta itemprop="name">` dentro `homeTeam` e `awayTeam`, la data in
 * `startDate`, e il risultato c'e' solo se la partita si e' giocata.
 *
 * La stessa pagina contiene anche il widget "prossimo turno", che ripete dieci
 * partite di un'altra giornata: si distingue perche' e' `size-compact` mentre
 * il calendario vero e' `size-large`. Lo script prende solo i secondi e poi
 * verifica che tutti dichiarino la giornata che ha chiesto.
 *
 * Difensivo come gli altri parser. Un calendario mezzo letto e' peggio di
 * nessun calendario, perche' produce griglie plausibili e sbagliate: qui si
 * muore se una giornata non ha dieci partite, se una squadra gioca due volte
 * nello stesso turno, se qualcuno non arriva a 19 in casa e 19 fuori, o se i
 * nomi dei club non sono quelli del listone.
 */
import { existsSync, writeFileSync } from 'node:fs';

const SEASON = '2026-27';
const BASE = 'https://www.fantacalcio.it/serie-a/calendario';
const MATCHDAYS = 38;
const TEAMS = 20;
const LISTONE = 'data/lista_calciatori_classic.xlsx';

/** Pagine scaricate in parallelo. Basso: non c'e' fretta. */
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

function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&[a-z]+;/gi, (e) => ENTITIES[e] ?? e);
}

async function fetchPage(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/**
 * I blocchi partita del calendario vero, gia' isolati uno per uno.
 *
 * Si taglia su `match-pill` e si tiene `size-large`: il widget del prossimo
 * turno usa `size-compact` e sparisce qui, prima che qualcuno provi a leggerlo.
 */
function largeMatchBlocks(html) {
  return html
    .split('class="match-pill')
    .slice(1)
    .filter((chunk) => /^[^>]*size-large/.test(chunk))
    .map((chunk) => {
      // Il microdato si chiude con il nome dell'evento ("Serie A 2026-27 - 3°
      // giornata - ..."): tagliare li' impedisce di leggere il risultato della
      // partita successiva in un turno giocato a meta'.
      const end = chunk.indexOf('content="Serie A');
      return end < 0 ? chunk : chunk.slice(0, end);
    });
}

/** Il nome della squadra dentro il `<label>` di `itemprop`. */
function teamName(block, side, matchday) {
  const at = block.indexOf(`itemprop="${side}Team"`);
  if (at < 0) throw new Error(`Giornata ${matchday}: manca ${side}Team in una partita.`);
  const m = /<meta itemprop="name" content="([^"]+)"/.exec(block.slice(at));
  if (m === null) throw new Error(`Giornata ${matchday}: nome ${side} illeggibile.`);
  return decodeEntities(m[1]).trim();
}

function parseMatchday(html, matchday) {
  const blocks = largeMatchBlocks(html);
  if (blocks.length !== TEAMS / 2) {
    throw new Error(`Giornata ${matchday}: ${blocks.length} partite invece di ${TEAMS / 2}.`);
  }

  return blocks.map((block) => {
    const week = /<div class="matchweek">\s*(\d+)\s*<\/div>/.exec(block);
    if (week === null || Number(week[1]) !== matchday) {
      throw new Error(
        `Giornata ${matchday}: una partita dichiara la giornata ${week === null ? '?' : week[1]}.`,
      );
    }
    const date = /<meta itemprop="startDate" content="(\d{4}-\d{2}-\d{2})"/.exec(block);
    if (date === null) throw new Error(`Giornata ${matchday}: partita senza data.`);

    // Il risultato non distingue niente: la fonte stampa `0 - 0` anche sulle
    // partite di maggio. Lo stato invece si: `0` da giocare, `4` giocata. Un
    // terzo codice e' un caso che non conosco, e va guardato invece che
    // indovinato.
    const status = /data-match-status="(\d+)"/.exec(block);
    if (status === null || (status[1] !== '0' && status[1] !== '4')) {
      throw new Error(
        `Giornata ${matchday}: stato partita "${status === null ? '?' : status[1]}" sconosciuto.`,
      );
    }
    const played = status[1] === '4';

    return {
      matchday,
      home: teamName(block, 'home', matchday),
      away: teamName(block, 'away', matchday),
      date: date[1],
      played,
    };
  });
}

/** Struttura del girone all'italiana. Qui si scopre un calendario monco. */
function validate(fixtures) {
  const teams = [...new Set(fixtures.flatMap((f) => [f.home, f.away]))].sort();
  if (teams.length !== TEAMS) {
    throw new Error(`${teams.length} squadre invece di ${TEAMS}: ${teams.join(', ')}`);
  }

  const home = new Map(teams.map((t) => [t, 0]));
  const away = new Map(teams.map((t) => [t, 0]));
  const pairs = new Set();

  for (let day = 1; day <= MATCHDAYS; day += 1) {
    const round = fixtures.filter((f) => f.matchday === day);
    if (round.length !== TEAMS / 2) {
      throw new Error(`Giornata ${day}: ${round.length} partite nel file finale.`);
    }
    const seen = new Set();
    for (const f of round) {
      for (const team of [f.home, f.away]) {
        if (seen.has(team)) throw new Error(`Giornata ${day}: ${team} gioca due volte.`);
        seen.add(team);
      }
      const pair = `${f.home}|${f.away}`;
      if (pairs.has(pair)) throw new Error(`${f.home}-${f.away} si gioca due volte in casa.`);
      pairs.add(pair);
      home.set(f.home, home.get(f.home) + 1);
      away.set(f.away, away.get(f.away) + 1);
    }
  }

  for (const team of teams) {
    if (home.get(team) !== MATCHDAYS / 2 || away.get(team) !== MATCHDAYS / 2) {
      throw new Error(`${team}: ${home.get(team)} in casa, ${away.get(team)} fuori.`);
    }
  }

  return teams;
}

/**
 * I nomi dei club devono essere quelli del listone, perche' la griglia aggancia
 * le rose per nome. Se il listone non c'e' si avvisa e si tira dritto: lo
 * script deve poter girare anche su una macchina senza il file.
 */
async function checkAgainstListone(teams) {
  if (!existsSync(LISTONE)) {
    console.warn(`! ${LISTONE} assente: nomi dei club non verificati.`);
    return;
  }
  const { default: XLSX } = await import('xlsx');
  const wb = XLSX.readFile(LISTONE);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const header = rows.findIndex((r) => Array.isArray(r) && r.includes('Sq.'));
  if (header < 0) throw new Error(`${LISTONE}: colonna "Sq." non trovata.`);
  const col = rows[header].indexOf('Sq.');

  const listone = new Set();
  for (const row of rows.slice(header + 1)) {
    const team = row?.[col];
    if (typeof team === 'string' && team.trim() !== '') listone.add(team.trim());
  }

  const missing = teams.filter((t) => !listone.has(t));
  const extra = [...listone].filter((t) => !teams.includes(t));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `Nomi dei club diversi dal listone.\n  solo nel calendario: ${missing.join(', ') || '-'}` +
        `\n  solo nel listone:    ${extra.join(', ') || '-'}`,
    );
  }
}

/** Scarica con concorrenza limitata mantenendo l'ordine delle giornate. */
async function fetchAll() {
  const days = Array.from({ length: MATCHDAYS }, (_, i) => i + 1);
  const out = new Array(MATCHDAYS);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (let i = next; i < days.length; i = next) {
        next = i + 1;
        const day = days[i];
        out[i] = parseMatchday(await fetchPage(`${BASE}/${day}`), day);
        process.stdout.write(`\r  giornate ${out.filter(Boolean).length}/${MATCHDAYS}`);
      }
    }),
  );
  process.stdout.write('\n');
  return out.flat();
}

function render(fixtures, teams) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = fixtures
    .map(
      (f) =>
        `  { matchday: ${f.matchday}, home: '${f.home}', away: '${f.away}', ` +
        `date: '${f.date}', played: ${f.played} },`,
    )
    .join('\n');

  return `/**
 * Calendario di Serie A ${SEASON.replace('-', '/')} da Fantacalcio.it. GENERATO,
 * non modificare a mano: rigenera con \`node scripts/build-calendar.mjs\`.
 *
 * Fonte: ${BASE}
 */
import type { Fixture } from '../domain/calendar';

export const CALENDAR_SOURCE_URL = '${BASE}';

/** Stagione del calendario, mostrata all'utente. */
export const CALENDAR_SEASON = '${SEASON.replace('-', '/')}';

/** Data di scarico: dice quante giornate risultano gia' giocate. */
export const CALENDAR_UPDATED_AT = '${today}';

/** I venti club, con i nomi del listone. */
export const CALENDAR_TEAMS: readonly string[] = [
${teams.map((t) => `  '${t}',`).join('\n')}
];

/** Tutte le 380 partite, in ordine di giornata. */
export const FIXTURES: readonly Fixture[] = [
${rows}
];
`;
}

async function main() {
  console.log(`Calendario Serie A ${SEASON} da ${BASE}`);
  const fixtures = await fetchAll();
  const teams = validate(fixtures);
  await checkAgainstListone(teams);

  writeFileSync('src/data/calendar.ts', render(fixtures, teams));
  const played = fixtures.filter((f) => f.played).length;
  console.log(
    `src/data/calendar.ts: ${fixtures.length} partite, ${teams.length} squadre, ` +
      `${played} gia' giocate.`,
  );
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
