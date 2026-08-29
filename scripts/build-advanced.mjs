/**
 * Rigenera `src/data/advanced-stats.ts` dal dump Sofascore della 2025/26.
 *
 *   node scripts/build-advanced.mjs
 *
 * ## Perche' c'e' un dump e non una fetch
 *
 * Sofascore e' l'unica fonte gratuita che pubblica anticipi, contrasti, falli e
 * duelli aerei della Serie A, ed e' anche l'unica dietro Cloudflare: da riga di
 * comando risponde 403, da un browser vero risponde 200. Il file
 * `data/sofascore-2025-26.txt` e' quel 200, salvato una volta sola.
 *
 * Per rifarlo (stagione nuova o cifre corrette a posteriori), da un browser
 * aperto su sofascore.com, con il season id preso da
 * `/api/v1/unique-tournament/23/seasons` (23 = Serie A; 76457 = 2025/26):
 *
 *   /api/v1/unique-tournament/23/season/76457/statistics
 *     ?limit=100&offset=N&accumulation=total&order=-rating
 *     &fields=interceptions,tackles,fouls,aerialDuelsWon,minutesPlayed,
 *             appearances,yellowCards,saves,rating
 *
 * per N = 0, 100, ... fino a esaurire `pages`, salvando una riga per giocatore:
 *
 *   slug|anticipi|contrasti|falli|duelliAereiVinti|minuti|presenze|gialli|parate
 *
 * ## L'aggancio
 *
 * Sofascore non conosce l'id di Fantacalcio.it: si aggancia **per nome**, e i
 * due lati lo scrivono in modi opposti — "Esposito Se." contro
 * "sebastiano-esposito", e a volte lo slug e' girato ("yildiz-kenan"). Le
 * regole sono nel commento di `matchOne`, ognuna nata da un caso vero.
 *
 * Lo script muore se resta anche un solo caso ambiguo: meglio nessun file che
 * le statistiche di un giocatore attaccate al nome di un altro.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'https://www.sofascore.com/tournament/football/italy/serie-a/23';
const SEASON_LABEL = '2025/26';
const SEASON_ID = 76457;

function normalize(raw) {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // L'apostrofo sparisce, non diventa uno spazio: "N'Dicka" e' "ndicka" per
    // Sofascore, e uno spazio spezzerebbe il cognome in due parole finte.
    .replace(/['’]/g, '')
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

/**
 * Cognome e abbreviazione come li scrive Fantacalcio.it.
 *
 * L'abbreviazione si riconosce dal punto finale, non dalla lunghezza: accanto a
 * "Martinez L." esistono "Esposito Se." e "Moreno Alb.", perche' la fonte la
 * allunga finche' non distingue. E va tenuta intera: "Pellegrini Lo." e
 * "Pellegrini Lu." hanno la stessa iniziale e due sole lettere le separano.
 */
function splitName(name) {
  const abbrev = /\s([A-Za-z]{1,4}(?:\.[A-Za-z]{1,4})*\.)$/.exec(name);
  const surname = normalize(abbrev === null ? name : name.slice(0, abbrev.index));
  // "F.P." sono due nomi, non uno: le parti restano separate, cosi' "Esposito
  // F.P." trova "francesco-pio-esposito" dove un "fp" attaccato non trova nulla.
  const initials =
    abbrev === null ? [] : normalize(abbrev[1]).split(' ').filter((x) => x !== '');
  return { surname, initials };
}

/** Le parole `words` compaiono di fila in `tokens`? Restituisce l'indice o -1. */
function runIndex(tokens, words) {
  for (let i = 0; i + words.length <= tokens.length; i += 1) {
    let hit = true;
    for (let k = 0; k < words.length; k += 1) if (tokens[i + k] !== words[k]) hit = false;
    if (hit) return i;
  }
  return -1;
}

/**
 * I candidati Sofascore per un nostro giocatore, dal criterio piu' stretto al
 * piu' largo. Si scende di livello solo quando quello sopra non trova niente,
 * cosi' la larghezza non porta via precisione.
 *
 *  1. il cognome intero, parola per parola, dentro lo slug;
 *  2. l'ultima parola del cognome — "Zambo Anguissa" sta in "frank-anguissa";
 *  3. il cognome senza spazi **in testa o in coda** allo slug senza trattini —
 *     "Delprato" sta in "enrico-del-prato". In testa o in coda e non ovunque:
 *     "Ramon" sta dentro "mat-t-ramon-i" e non c'entra niente con Tramoni.
 */
function candidatesFor(surname, rows) {
  const words = surname.split(' ');
  const exact = rows.filter((r) => runIndex(r.tokens, words) >= 0);
  if (exact.length > 0) return exact;

  const last = words.at(-1) ?? '';
  const byLast = rows.filter((r) => r.tokens.includes(last));
  if (byLast.length > 0) return byLast;

  const glued = words.join('');
  const byGlue = rows.filter((r) => {
    const whole = r.tokens.join('');
    return whole.startsWith(glued) || whole.endsWith(glued);
  });
  if (byGlue.length > 0) return byGlue;

  // Ultimo appiglio: la prima parola di un cognome doppio, che la fonte a volte
  // tronca — "Akpa Akpro" da noi e' "jean-akpa" da loro.
  const first = words[0] ?? '';
  return words.length > 1 ? rows.filter((r) => r.tokens.includes(first)) : [];
}

/**
 * Da piu' candidati a uno solo, con i criteri in ordine di forza. Ognuno esiste
 * per un caso vero della 2025/26, citato accanto.
 */
function narrow(player, cands, usePlayed) {
  let out = cands;

  // 1. L'abbreviazione, per intero: "Pellegrini Lo." -> lorenzo-pellegrini.
  //
  //    Se nessuno combacia, l'abbreviazione **esclude**, non tace: "Vasquez D."
  //    non e' "johan-vasquez", e lasciarglielo prendere significa toglierlo al
  //    "Vasquez" nudo, che e' proprio Johan. L'unica eccezione e' lo slug fatto
  //    del solo cognome, dove un nome da confrontare non c'e'.
  if (player.initials.length > 0) {
    const byInitial = out.filter((r) =>
      player.initials.every((part) => r.tokens.some((t) => t.startsWith(part))),
    );
    out =
      byInitial.length > 0
        ? byInitial
        : out.filter((r) => r.tokens.length === player.surname.split(' ').length);
  }

  // 2. Il posto del cognome nello slug. Sofascore scrive "nome-cognome", e il
  //    cognome in coda vale piu' del cognome in testa: fra "aaron-martin" e
  //    "martin-baturina", il nostro "Martin" e' il primo. Qualche slug e'
  //    girato ("yildiz-kenan"), ed e' il ripiego subito sotto.
  if (out.length > 1) {
    const words = player.surname.split(' ');
    const tail = out.filter((r) => runIndex(r.tokens, words) === r.tokens.length - words.length);
    const head = out.filter((r) => runIndex(r.tokens, words) === 0);
    if (tail.length > 0) out = tail;
    else if (head.length > 0) out = head;
  }

  // 3. Lo slug che e' esattamente il cognome: "Pedro" -> pedro, non ze-pedro.
  if (out.length > 1) {
    const bare = out.filter((r) => r.slug === player.surname.replace(/ /g, '-'));
    if (bare.length === 1) out = bare;
  }

  // 4. Il portiere para: "Silvestri" (P) -> marco-silvestri, non de-silvestri.
  if (out.length > 1 && player.role === 'P') {
    const keepers = out.filter((r) => r.saves > 0);
    if (keepers.length > 0) out = keepers;
  }

  // 5. Le presenze. Sofascore conta ogni apparizione, Fantacalcio.it solo le
  //    partite a voto, quindi le sue sono sempre >= alle nostre: fra due
  //    Ferguson vince quello che ci somiglia di piu' senza starci sotto.
  if (usePlayed && out.length > 1 && player.played > 0) {
    const cost = (r) => (r.appearances >= player.played ? 0 : 1000) + Math.abs(r.appearances - player.played);
    const best = Math.min(...out.map(cost));
    out = out.filter((r) => cost(r) === best);
  }

  return out;
}

const ROOT = new URL('..', import.meta.url);

const statsFile = readFileSync(new URL('src/data/stats.ts', ROOT), 'utf8');
const ours = [
  ...statsFile.matchAll(
    /\{ id: (\d+), name: '((?:[^'\\]|\\.)*)', team: '((?:[^'\\]|\\.)*)', role: '(.)', played: (\d+)/g,
  ),
].map((m) => {
  const name = m[2].replace(/\\'/g, "'");
  return {
    id: Number(m[1]),
    name,
    team: m[3].replace(/\\'/g, "'"),
    role: m[4],
    played: Number(m[5]),
    ...splitName(name),
  };
});
if (ours.length === 0) throw new Error('src/data/stats.ts: nessuna riga letta, il formato e cambiato.');

const dumpFile = readFileSync(new URL('data/sofascore-2025-26.txt', ROOT), 'utf8');
const rows = dumpFile
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l !== '')
  .map((line, i) => {
    const p = line.split('|');
    if (p.length !== 9) throw new Error(`dump riga ${i + 1}: attese 9 colonne, trovate ${p.length}.`);
    const n = (v, what) => {
      const x = Number(v);
      if (!Number.isFinite(x)) throw new Error(`dump riga ${i + 1}: ${what} illeggibile "${v}".`);
      return x;
    };
    return {
      slug: p[0],
      tokens: p[0].split('-'),
      interceptions: n(p[1], 'anticipi'),
      tackles: n(p[2], 'contrasti'),
      fouls: n(p[3], 'falli'),
      aerialDuelsWon: n(p[4], 'duelli aerei'),
      minutes: n(p[5], 'minuti'),
      appearances: n(p[6], 'presenze'),
      yellow: n(p[7], 'ammonizioni'),
      saves: n(p[8], 'parate'),
    };
  });

console.log(`Nostri: ${ours.length} | Sofascore: ${rows.length}`);

// Tre turni, dal piu' sicuro al piu' incerto, perche' chi ha un indizio forte
// non si faccia portare via la riga da chi ne ha solo uno debole. Senza turni
// "Tramoni M." resta a mani vuote perche' un omonimo con piu' presenze gli ha
// gia' preso "matteo-tramoni" con la sola somiglianza delle presenze.
const taken = new Map();
const matched = [];
const ambiguous = [];
const missing = [];

function claim(player, picked) {
  taken.set(picked.slug, player.id);
  matched.push({ player, adv: picked });
}

/**
 * I due che nessuna regola puo' prendere, verificati a mano confrontando
 * presenze, minuti e ruolo. Stanno qui in chiaro invece che dentro una regola
 * larga: due eccezioni dichiarate costano meno di una regola che, per prenderle,
 * aggancerebbe anche qualcun altro per sbaglio.
 */
const BY_HAND = new Map([
  // Jacobo Ramon Naveros: noi lo chiamiamo col primo cognome, Sofascore col
  // secondo. 32 presenze da una parte e 32 dall'altra.
  [6869, 'jacobo-naveros'],
  // Milan Djuric: la D con il tratto sparisce nello slug e resta "uric".
  [5471, 'milan-uric'],
]);

const bySlug = new Map(rows.map((r) => [r.slug, r]));
for (const [id, slug] of BY_HAND) {
  const player = ours.find((p) => p.id === id);
  const row = bySlug.get(slug);
  // Se una delle due parti sparisce dopo una rigenerazione, l'eccezione non ha
  // piu' senso e va rivista invece di restare li' a non fare niente.
  if (player === undefined) throw new Error(`Eccezione a mano: id ${id} non e' piu' in stats.ts.`);
  if (row === undefined) throw new Error(`Eccezione a mano: slug "${slug}" non e' piu' nel dump.`);
  claim(player, row);
}

const named = ours.filter((p) => p.surname !== '' && !BY_HAND.has(p.id));
const rounds = [
  // 1. Chi porta l'abbreviazione: "Pellegrini Lo." non puo' sbagliare bersaglio.
  named.filter((p) => p.initials.length > 0),
  // 2. I nomi nudi, che vincono per posizione, slug esatto o ruolo.
  named.filter((p) => p.initials.length === 0),
];

const leftovers = [];
for (const round of rounds) {
  for (const player of round) {
    const free = candidatesFor(player.surname, rows).filter((r) => !taken.has(r.slug));
    const picked = narrow(player, free, false);
    if (picked.length === 1) claim(player, picked[0]);
    else leftovers.push(player);
  }
}

// 3. Quello che resta: qui le presenze sono l'ultimo appiglio, e chi ne ha di
//    piu' sceglie per primo perche' il titolare e' quasi sempre quello giusto.
for (const player of leftovers.sort((a, b) => b.played - a.played)) {
  const free = candidatesFor(player.surname, rows).filter((r) => !taken.has(r.slug));
  const picked = narrow(player, free, true);

  if (picked.length === 0) {
    if (player.played > 0) missing.push(`${player.name} (${player.team}, ${player.played} pres.)`);
    continue;
  }
  if (picked.length > 1) {
    ambiguous.push(`${player.name} (${player.team}) -> ${picked.map((r) => r.slug).join(' / ')}`);
    continue;
  }
  claim(player, picked[0]);
}

console.log(`Agganciati: ${matched.length}`);
console.log(`Senza riscontro, ma con presenze: ${missing.length}`);
for (const line of missing) console.log('  ' + line);

if (ambiguous.length > 0) {
  console.error(`\nAmbigui: ${ambiguous.length}`);
  for (const line of ambiguous) console.error('  ' + line);
  throw new Error('Aggancio ambiguo: meglio nessun file che le cifre di un altro.');
}

matched.sort((a, b) => a.player.id - b.player.id);

const body = matched
  .map(
    ({ player, adv }) =>
      `  { id: ${player.id}, slug: '${adv.slug}', minutes: ${adv.minutes}, appearances: ${adv.appearances},` +
      ` interceptions: ${adv.interceptions}, tackles: ${adv.tackles}, fouls: ${adv.fouls},` +
      ` aerialDuelsWon: ${adv.aerialDuelsWon}, yellow: ${adv.yellow}, saves: ${adv.saves} },`,
  )
  .join('\n');

const out = `/**
 * Statistiche avanzate Serie A ${SEASON_LABEL} da Sofascore. GENERATO, non
 * modificare a mano: rigenera con \`node scripts/build-advanced.mjs\`.
 *
 * Fonte: ${SOURCE} (season id ${SEASON_ID})
 */
import type { AdvancedStats } from '../domain/advanced-stats';

export const ADVANCED_SOURCE_URL = '${SOURCE}';

/** Stagione a cui si riferiscono le cifre. La stessa di \`stats.ts\`. */
export const ADVANCED_SEASON = '${SEASON_LABEL}';

/** Data di scarico, per capire quanto e' vecchio il file. */
export const ADVANCED_UPDATED_AT = '${new Date().toISOString().slice(0, 10)}';

export const ADVANCED_STATS: readonly AdvancedStats[] = [
${body}
];
`;

writeFileSync(new URL('src/data/advanced-stats.ts', ROOT), out, 'utf8');
console.log(`\nScritto src/data/advanced-stats.ts: ${matched.length} giocatori.`);
