import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, Coins, Trash2, Wand2 } from 'lucide-react';

import type { Expectation, Player } from '../../domain/types';
import { reduce } from '../../domain/reducer';
import {
  MIN_SAMPLE,
  dynamicPrice,
  isMovementRole,
  makeExpectationIndex,
  marketRates,
  valueOf,
} from '../../domain/valuation';
import { statsOf } from '../../domain/player-stats';
import { STATS_INDEX } from '../../data/stats-index';
import { STATS_SEASON } from '../../data/stats';
import { useAppStore } from '../../store/appStore';
import { cn } from '../../ui/cn';
import { InfoPopover, SectionTitle } from '../../ui/primitives';

/**
 * Aspettative e prezzo dinamico (§5.5), dentro la scheda giocatore.
 *
 * Cinque numeri che scrivi tu, un valore che ne esce, e il prezzo che quel
 * valore vale **a questo tavolo, adesso**. Il prezzo si muove da solo a ogni
 * martellata: e' il rapporto fra la tua aspettativa e i prezzi gia' battuti
 * nel reparto, non una previsione dell'applicazione.
 *
 * Non c'e' per i portieri, e non e' una dimenticanza: la loro asta si gioca su
 * porte inviolate e titolarita', e questa formula direbbe una cosa falsa.
 */

const FIELDS = [
  { key: 'matches', label: 'presenze', max: 38 },
  { key: 'goals', label: 'gol', max: 60 },
  { key: 'assists', label: 'assist', max: 40 },
  { key: 'yellows', label: 'gialli', max: 30 },
  { key: 'reds', label: 'rossi', max: 10 },
] as const satisfies readonly {
  readonly key: keyof Omit<Expectation, 'playerId' | 'updatedAt'>;
  readonly label: string;
  readonly max: number;
}[];

type FieldKey = (typeof FIELDS)[number]['key'];

/** Scrittura ritardata: i campi si battono a raffica, il disco non li insegue. */
const SAVE_DEBOUNCE_MS = 400;

export function ExpectationSection({ player }: { readonly player: Player }): JSX.Element | null {
  const userData = useAppStore((s) => s.userData);
  const leagueConfig = useAppStore((s) => s.leagueConfig);
  const enabled = useAppStore((s) => s.expectationsEnabled);
  const setExpectation = useAppStore((s) => s.setExpectation);
  const clearExpectation = useAppStore((s) => s.clearExpectation);

  const saved = userData.expectations.find((e) => e.playerId === player.id) ?? null;

  // Le caselle tengono il testo, non il numero: mentre cancelli "12" per
  // scrivere "9" la casella passa da "" e un `number` non sa rappresentarlo.
  const [draft, setDraft] = useState<Record<FieldKey, string>>(() => toDraft(saved));
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setDraft(toDraft(saved));
    // Solo al cambio di giocatore: riallineare a ogni salvataggio
    // sovrascriverebbe quello che stai battendo.
  }, [player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const state = useMemo(
    () => reduce(userData.events, leagueConfig()),
    [userData.events, leagueConfig],
  );
  const expectations = useMemo(
    () => makeExpectationIndex(userData.expectations),
    [userData.expectations],
  );
  const rates = useMemo(() => marketRates(state, expectations), [state, expectations]);

  if (!enabled || !isMovementRole(player.role)) return null;

  const rate = rates[player.role];
  const quote = dynamicPrice(player, expectations, rates);
  const value = saved === null ? null : valueOf(saved, player.role);
  const stats = statsOf(player.id, STATS_INDEX);

  function commit(next: Record<FieldKey, string>): void {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void setExpectation(player.id, {
        matches: readField(next.matches),
        goals: readField(next.goals),
        assists: readField(next.assists),
        yellows: readField(next.yellows),
        reds: readField(next.reds),
      });
    }, SAVE_DEBOUNCE_MS);
  }

  function handle(key: FieldKey, raw: string): void {
    // Solo cifre: il segno meno e la virgola non appartengono a un conteggio,
    // e rifiutarli qui e' piu' onesto che arrotondarli dopo di nascosto.
    const clean = raw.replace(/[^\d]/g, '').slice(0, 3);
    const next = { ...draft, [key]: clean };
    setDraft(next);
    commit(next);
  }

  /** Precompila dall'anno scorso. Un punto di partenza, non un verdetto. */
  function seedFromLastSeason(): void {
    if (stats === null) return;
    const next: Record<FieldKey, string> = {
      matches: String(stats.played),
      goals: String(stats.goals),
      assists: String(stats.assists),
      yellows: String(stats.yellow),
      reds: String(stats.red),
    };
    setDraft(next);
    commit(next);
  }

  return (
    <section className="flex flex-col gap-1.5">
      <SectionTitle
        icon={<Coins size={12} />}
        right={
          <div className="flex items-center gap-1">
            {stats !== null && (
              <button
                type="button"
                onClick={seedFromLastSeason}
                title={`Riempi con le cifre vere del ${STATS_SEASON}`}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
              >
                <Wand2 size={11} />
                {STATS_SEASON}
              </button>
            )}
            {saved !== null && (
              <button
                type="button"
                onClick={() => {
                  if (timer.current !== null) window.clearTimeout(timer.current);
                  setDraft(toDraft(null));
                  void clearExpectation(player.id);
                }}
                title="Togli l'aspettativa: il giocatore torna senza prezzo dinamico"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 size={11} />
                togli
              </button>
            )}
            <InfoPopover
              label="Come nasce il prezzo dinamico"
              trigger={
                <span className="inline-flex items-center rounded p-0.5 text-zinc-600 transition-colors hover:text-zinc-300">
                  <CircleHelp size={12} />
                </span>
              }
            >
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">
                Come nasce il prezzo
              </p>
              <p className="leading-snug">
                I cinque numeri sono i tuoi: quanto pensi che faccia quest&apos;anno. Diventano un
                valore con i bonus e malus del fantacalcio, e le presenze pesate per reparto — da
                un difensore compri titolarità, da un attaccante gol.
              </p>
              <p className="mt-1.5 leading-snug">
                Il prezzo è quel valore per quanto il tuo tavolo sta pagando un punto in questo
                reparto, misurato sulle aste già battute. Stessa aspettativa, stesso prezzo. Si
                muove a ogni martellata.
              </p>
              <p className="mt-1.5 leading-snug text-zinc-500">
                Sui nomi più cari il consiglio resta basso: è un pavimento, non un tetto.
              </p>
            </InfoPopover>
          </div>
        }
      >
        Aspettativa 2026/27
      </SectionTitle>

      <div className="grid grid-cols-5 gap-1">
        {FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-0.5">
            <input
              inputMode="numeric"
              value={draft[field.key]}
              onChange={(e) => handle(field.key, e.target.value)}
              placeholder="—"
              aria-label={field.label}
              className="field num px-1.5 py-1 text-center text-sm"
            />
            <span className="text-center text-[10px] lowercase tracking-wide text-zinc-600">
              {field.label}
            </span>
          </label>
        ))}
      </div>

      <PriceRow
        value={value}
        price={quote?.price ?? null}
        rate={quote?.rate ?? null}
        sample={rate.sample}
        source={rate.source}
        role={player.role}
      />
    </section>
  );
}

/**
 * La riga del prezzo. Ha quattro stati e li dice tutti a parole, perche' un
 * trattino solo non distingue "non l'hai valutato" da "il reparto non e'
 * ancora partito", e sono due cose da fare diverse.
 */
function PriceRow({
  value,
  price,
  rate,
  sample,
  source,
  role,
}: {
  readonly value: number | null;
  readonly price: number | null;
  readonly rate: number | null;
  readonly sample: number;
  readonly source: 'role' | 'warming' | 'none';
  readonly role: 'D' | 'C' | 'A';
}): JSX.Element {
  if (value === null || value <= 0) {
    return (
      <p className="rounded-lg border border-dashed border-white/[0.08] px-2.5 py-2 text-[11px] leading-snug text-zinc-600">
        {value === null
          ? 'Riempi i cinque numeri per avere un prezzo consigliato.'
          : 'Questa aspettativa vale zero: nessun prezzo da consigliare.'}
      </p>
    );
  }

  if (price === null || rate === null) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-2">
        <ValueChip value={value} />
        <p className="text-[11px] leading-snug text-zinc-500">
          {source === 'warming'
            ? `Il reparto ${role} è appena partito: ${sample} ${
                sample === 1 ? 'asta valutata' : 'aste valutate'
              } su ${MIN_SAMPLE}. Il prezzo arriva al terzo colpo.`
            : `Nessuna asta valutata nel reparto ${role}: il prezzo compare quando ${MIN_SAMPLE} giocatori che hai valutato saranno stati battuti.`}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-2.5 py-2">
      <ValueChip value={value} />
      <span className="num text-2xl font-bold leading-none text-emerald-300">{price}</span>
      <span className="text-[11px] leading-tight text-zinc-500">
        crediti
        <br />
        consigliati
      </span>
      <span className="num ml-auto text-right text-[10px] leading-tight text-zinc-600">
        tasso {rate.toFixed(2)}
        <br />
        su {sample} aste {role}
      </span>
    </div>
  );
}

function ValueChip({ value }: { readonly value: number }): JSX.Element {
  return (
    <span
      title="Valore della tua aspettativa"
      className={cn(
        'num shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5',
        'text-xs text-zinc-300',
      )}
    >
      V {value.toFixed(1)}
    </span>
  );
}

function toDraft(expectation: Expectation | null): Record<FieldKey, string> {
  if (expectation === null) {
    return { matches: '', goals: '', assists: '', yellows: '', reds: '' };
  }
  return {
    matches: String(expectation.matches),
    goals: String(expectation.goals),
    assists: String(expectation.assists),
    yellows: String(expectation.yellows),
    reds: String(expectation.reds),
  };
}

/** Casella vuota vale zero: si sta scrivendo un conteggio, e il vuoto e' nessuno. */
function readField(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}
