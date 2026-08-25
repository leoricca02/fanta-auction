import type { Tier } from '../../domain/tiers';

/**
 * Fascia della guida SosFanta, accanto al nome.
 *
 * Il colore e' una scala sola, dall'ambra dei top al rosso di chi va evitato,
 * con i `JOLLY` in viola perche' sono una categoria a se': in tabella l'occhio
 * deve leggere il colore prima dell'etichetta.
 *
 * `compact` accorcia l'etichetta: nella tabella svincolati una colonna larga
 * quanto "SOTTO AI SEMITOP" mangerebbe lo spazio della nota.
 */

const STYLE: Readonly<Record<Tier, string>> = {
  'SUPER TOP': 'bg-amber-400/20 text-amber-200 border-amber-400/40 shadow-glow-amber',
  TOP: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  SEMITOP: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  'SOTTO AI SEMITOP': 'bg-orange-500/10 text-orange-300/90 border-orange-500/20',
  'FASCIA ALTA': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'JOLLY 1ª FASCIA': 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  'POSSIBILI SORPRESE': 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  'FASCIA MEDIA': 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  INFORTUNATI: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/[0.25]',
  SCOMMESSE: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  'SOPRA AI LOW COST': 'bg-cyan-500/[0.12] text-cyan-300 border-cyan-500/[0.25]',
  'JOLLY 2ª FASCIA': 'bg-violet-500/[0.12] text-violet-300/90 border-violet-500/[0.25]',
  'LOW COST 1ª FASCIA': 'bg-blue-500/[0.12] text-blue-300 border-blue-500/[0.25]',
  'LOW COST 2ª FASCIA': 'bg-blue-500/[0.08] text-blue-300/80 border-blue-500/20',
  'LEGHE NUMEROSE': 'bg-white/[0.05] text-zinc-300 border-white/[0.1]',
  'JOLLY 3ª FASCIA': 'bg-violet-500/[0.08] text-violet-300/80 border-violet-500/20',
  'JOLLY 4ª FASCIA': 'bg-violet-500/[0.06] text-violet-300/70 border-violet-500/15',
  'A RISCHIO': 'bg-red-500/10 text-red-300 border-red-500/[0.25]',
  'DA EVITARE': 'bg-rose-500/15 text-rose-300 border-rose-500/35',
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
