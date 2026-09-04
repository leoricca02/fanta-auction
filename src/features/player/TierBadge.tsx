import type { Tier } from '../../domain/tiers';

/**
 * Fascia della guida SosFanta, accanto al nome.
 *
 * Il colore e' una scala sola, dall'ambra dei top al rosso di chi va evitato,
 * con i `JOLLY` in viola perche' sono una categoria a se': in tabella l'occhio
 * deve leggere il colore prima dell'etichetta.
 *
 * **La finitura e' satinata, e non e' un vezzo.** Ogni pillola ha un gradiente
 * obliquo fra due punti della stessa tinta: e' quel millimetro di variazione a
 * far leggere la pastiglia come un oggetto invece che come un rettangolo
 * colorato, e in una colonna di venti fasce e' cio' che le separa. Le fasce
 * alte hanno lo scarto piu' largo — l'oro di `SUPER TOP` passa da ambra a
 * giallo — e piu' si scende piu' il gradiente si stringe, finche' le ultime
 * sono quasi piatte. La lucentezza *e'* la gerarchia.
 *
 * `compact` accorcia l'etichetta: nella tabella svincolati una colonna larga
 * quanto "SOTTO AI SEMITOP" mangerebbe lo spazio della nota.
 */

const STYLE: Readonly<Record<Tier, string>> = {
  'SUPER TOP':
    'bg-gradient-to-br from-amber-400/25 via-yellow-300/20 to-amber-500/15 text-amber-100 border-amber-300/50 shadow-glow-amber',
  TOP: 'bg-gradient-to-br from-amber-400/20 to-yellow-600/15 text-amber-200 border-amber-400/40',
  SEMITOP: 'bg-gradient-to-br from-orange-400/20 to-orange-600/12 text-orange-200 border-orange-400/35',
  'SOTTO AI SEMITOP':
    'bg-gradient-to-br from-orange-400/12 to-orange-600/[0.08] text-orange-300/90 border-orange-500/25',
  'FASCIA ALTA': 'bg-gradient-to-br from-emerald-400/20 to-emerald-600/12 text-emerald-200 border-emerald-400/35',
  'JOLLY 1ª FASCIA': 'bg-gradient-to-br from-violet-400/25 to-violet-600/15 text-violet-200 border-violet-400/45',
  'POSSIBILI SORPRESE': 'bg-gradient-to-br from-teal-400/18 to-teal-600/10 text-teal-200 border-teal-400/30',
  'FASCIA MEDIA': 'bg-gradient-to-br from-sky-400/18 to-sky-600/10 text-sky-200 border-sky-400/30',
  INFORTUNATI: 'bg-gradient-to-br from-yellow-400/12 to-yellow-600/[0.06] text-yellow-300 border-yellow-500/25',
  SCOMMESSE: 'bg-gradient-to-br from-fuchsia-400/20 to-fuchsia-600/12 text-fuchsia-200 border-fuchsia-400/35',
  'SOPRA AI LOW COST': 'bg-gradient-to-br from-cyan-400/14 to-cyan-600/[0.08] text-cyan-300 border-cyan-500/25',
  'JOLLY 2ª FASCIA': 'bg-gradient-to-br from-violet-400/14 to-violet-600/[0.08] text-violet-300/90 border-violet-500/25',
  'LOW COST 1ª FASCIA': 'bg-gradient-to-br from-blue-400/14 to-blue-600/[0.08] text-blue-300 border-blue-500/25',
  'LOW COST 2ª FASCIA': 'bg-gradient-to-br from-blue-400/[0.09] to-blue-600/[0.05] text-blue-300/80 border-blue-500/20',
  'LEGHE NUMEROSE': 'bg-gradient-to-br from-slate-300/15 to-slate-400/[0.08] text-slate-200 border-slate-300/30',
  'JOLLY 3ª FASCIA': 'bg-gradient-to-br from-violet-400/[0.09] to-violet-600/[0.05] text-violet-300/80 border-violet-500/20',
  'JOLLY 4ª FASCIA': 'bg-gradient-to-br from-violet-400/[0.07] to-violet-600/[0.04] text-violet-300/70 border-violet-500/15',
  'A RISCHIO': 'bg-gradient-to-br from-red-400/12 to-red-600/[0.07] text-red-300 border-red-500/25',
  'DA EVITARE': 'bg-gradient-to-br from-rose-400/18 to-rose-600/10 text-rose-200 border-rose-400/40',
  MERCATO: 'bg-transparent text-zinc-500 border-dashed border-zinc-700',
};

const SHORT: Readonly<Record<Tier, string>> = {
  'SUPER TOP': 'SUPER TOP',
  TOP: 'TOP',
  SEMITOP: 'SEMITOP',
  'SOTTO AI SEMITOP': 'SOTTO SEMI',
  'FASCIA ALTA': 'ALTA',
  'JOLLY 1ª FASCIA': 'JOLLY 1ª',
  'POSSIBILI SORPRESE': 'SORPRESA',
  'FASCIA MEDIA': 'MEDIA',
  INFORTUNATI: 'INFORT.',
  SCOMMESSE: 'SCOMMESSA',
  'SOPRA AI LOW COST': 'SOPRA LC',
  'JOLLY 2ª FASCIA': 'JOLLY 2ª',
  'LOW COST 1ª FASCIA': 'LOW COST 1ª',
  'LOW COST 2ª FASCIA': 'LOW COST 2ª',
  'LEGHE NUMEROSE': 'NUMEROSE',
  'JOLLY 3ª FASCIA': 'JOLLY 3ª',
  'JOLLY 4ª FASCIA': 'JOLLY 4ª',
  'A RISCHIO': 'RISCHIO',
  'DA EVITARE': 'EVITARE',
  MERCATO: 'MERCATO',
};

export interface TierBadgeProps {
  readonly tier: Tier;
  readonly compact?: boolean;
}

export function TierBadge({ tier, compact = false }: TierBadgeProps): JSX.Element {
  return (
    <span
      className={`inline-block shrink-0 rounded-md border px-1.5 py-0.5 font-medium leading-none ${
        compact ? 'text-[10px]' : 'text-[11px]'
      } ${STYLE[tier]}`}
      title={`Fascia SosFanta: ${tier}`}
    >
      {compact ? SHORT[tier] : tier}
    </span>
  );
}
