import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import type { LeagueConfig } from '../domain/types';
import { PHASE_ORDER } from '../domain/types';
import type { LeagueState } from '../domain/reducer';
import { makePlayerIndex, teamState } from '../domain/reducer';

/**
 * Riepilogo stampabile delle 12 rose (PRD §6.4). Cosmetico, ultimo in ordine
 * di priorita'.
 *
 * La definizione del documento e' costruita da una funzione pura: pdfmake, che
 * pesa e trascina font, si carica solo al momento del download.
 */

export function buildRosterDocument(
  state: LeagueState,
  config: LeagueConfig,
  now: number = Date.now(),
): TDocumentDefinitions {
  const players = makePlayerIndex(config.players);

  const teamBlocks = config.teams.flatMap((team) => {
    const t = teamState(state, team.id);
    const body: string[][] = [['R', 'Giocatore', 'Club', 'Costo']];

    for (const role of PHASE_ORDER) {
      for (const entry of t.roster.filter((e) => e.role === role)) {
        const player = players.get(entry.playerId);
        body.push([
          role,
          player?.name ?? `#${entry.playerId}`,
          player?.team ?? '',
          String(entry.price),
        ]);
      }
    }
    if (body.length === 1) body.push(['—', 'nessun acquisto', '', '']);

    return [
      {
        text: `${team.name} (${team.abbr.toUpperCase()})`,
        style: 'team',
        margin: [0, 12, 0, 2] as [number, number, number, number],
      },
      {
        text: `${t.slotsFilled}/25 slot · ${t.spent} spesi · ${t.credits} residui`,
        style: 'meta',
      },
      {
        table: { headerRows: 1, widths: [14, '*', 90, 40], body },
        layout: 'lightHorizontalLines',
        fontSize: 9,
        margin: [0, 4, 0, 0] as [number, number, number, number],
      },
    ];
  });

  return {
    pageSize: 'A4',
    pageMargins: [32, 36, 32, 36],
    content: [
      { text: 'Fanta Auction — riepilogo rose', style: 'title' },
      {
        text: new Date(now).toLocaleString('it-IT'),
        style: 'meta',
        margin: [0, 0, 0, 8] as [number, number, number, number],
      },
      ...teamBlocks,
    ],
    styles: {
      title: { fontSize: 16, bold: true },
      team: { fontSize: 12, bold: true },
      meta: { fontSize: 8, color: '#666666' },
    },
    defaultStyle: { fontSize: 10 },
  };
}

export function pdfFilename(now: number = Date.now()): string {
  return `fanta-rose-${new Date(now).toISOString().slice(0, 10)}.pdf`;
}

/** Il virtual file system dei font, come lo espone `pdfmake/build/vfs_fonts`. */
export type FontVfs = Record<string, string>;

/**
 * Estrae il vfs dal modulo dei font.
 *
 * `vfs_fonts.js` e' CommonJS e fa `module.exports = vfs`, cioe' esporta
 * l'oggetto **direttamente**. Passando per l'import dinamico di Vite arriva
 * quindi sotto `default`, non sotto `.vfs` ne' sotto `.pdfMake.vfs` come nelle
 * versioni piu' vecchie. Sbagliare ramo qui produce un `vfs` undefined e un
 * download che non parte, quindi le tre forme sono gestite tutte e coperte da
 * test.
 */
export function resolveVfs(module: unknown): FontVfs {
  if (typeof module !== 'object' || module === null) {
    throw new ExportPdfError('Modulo dei font di pdfmake non caricato.');
  }
  const candidate = module as {
    default?: unknown;
    vfs?: unknown;
    pdfMake?: { vfs?: unknown };
  };

  const sources = [candidate.pdfMake?.vfs, candidate.vfs, candidate.default, candidate];
  for (const source of sources) {
    // Il vfs vero e' una mappa non vuota di nomi file -> base64.
    if (
      typeof source === 'object' &&
      source !== null &&
      Object.keys(source).some((key) => key.endsWith('.ttf'))
    ) {
      return source as FontVfs;
    }
  }
  throw new ExportPdfError(
    'Font di pdfmake non trovati: il modulo vfs_fonts non ha la forma attesa.',
  );
}

export class ExportPdfError extends Error {
  override readonly name = 'ExportPdfError';
}

interface PdfMakeStatic {
  vfs?: FontVfs;
  addVirtualFileSystem?: (vfs: FontVfs) => void;
  createPdf: (doc: TDocumentDefinitions) => { download: (filename: string) => void };
}

/** Estrae l'export di default di un modulo CommonJS visto da ESM. */
function unwrapDefault<T>(module: unknown): T {
  const candidate = module as { default?: unknown };
  return (candidate.default ?? module) as T;
}

/**
 * Genera e scarica il PDF. Importa pdfmake dinamicamente: e' la dipendenza piu'
 * pesante del bundle e serve solo a chi preme il bottone.
 */
export async function downloadRosterPdf(
  state: LeagueState,
  config: LeagueConfig,
  now: number = Date.now(),
): Promise<void> {
  const [pdfModule, fontsModule] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ]);

  const pdfMake = unwrapDefault<PdfMakeStatic>(pdfModule);
  const vfs = resolveVfs(fontsModule);

  // 0.2.x preferisce `addVirtualFileSystem`; l'assegnazione diretta resta il
  // ripiego per le build che non lo espongono.
  if (typeof pdfMake.addVirtualFileSystem === 'function') pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;

  pdfMake.createPdf(buildRosterDocument(state, config, now)).download(pdfFilename(now));
}
