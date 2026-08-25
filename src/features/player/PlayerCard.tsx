import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Gem,
  ListOrdered,
  Pencil,
  ShieldCheck,
  Star,
  StarOff,
  StickyNote,
  Target,
  TriangleAlert,
  Users,
} from 'lucide-react';

import type { Player, Tag } from '../../domain/types';
import { TAGS } from '../../domain/types';
import { lineupPlacement, makeLineupIndex } from '../../domain/lineup';
import { isTarget } from '../../domain/objectives';
import { makeTierIndex, tierOf } from '../../domain/tiers';
import { TIER_BLOCKS } from '../../data/tiers';
import { useAppStore } from '../../store/appStore';
import { Markdown } from '../goals/Markdown';
import { cn } from '../../ui/cn';
import { roleTheme } from '../../ui/roles';
import { CloseButton, EASE, RoleBadge, SectionTitle } from '../../ui/primitives';
import { LineupBadge } from './LineupBadge';
import { TierBadge } from './TierBadge';

/**
 * Scheda giocatore (PRD §5.1).
 *
 * Un solo pannello con tutto quello che serve nei cinque secondi della
 * chiamata: nota editabile inline, tag, formazione completa della sua squadra
 * con lo slot del giocatore evidenziato e i ballottaggi, nota della squadra.
 *
 * Vive qui, fuori da /features/live, perche' M3 la riusa nell'overlay `?`.
 *
 * **Le cifre della griglia sono tutte grezze** — QUOT., FVM, under, fascia
 * della guida. Non c'e' nessun "prezzo massimo consigliato" e non ci sara':
 * il modello di prezzo della 1.0 e' morto con la 1.0 (PRD §2), e una cifra
 * inventata accanto a quattro misurate sarebbe la piu' pericolosa delle cinque.
 */

const TAG_STYLE: Readonly<Record<Tag, string>> = {
  obiettivo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 shadow-glow-emerald',
  alternativa: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  evita: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

const TAG_ICON: Readonly<Record<Tag, typeof Target>> = {
  obiettivo: Target,
  alternativa: Eye,
  evita: TriangleAlert,
};

/**
 * §5.1 chiede la nota "salvata a ogni battuta", cioe' senza un tasto Salva.
 * Il debounce accorpa le battute ravvicinate in una sola scrittura; quello che
 * hai digitato viene comunque persistito all'uscita dal campo e allo smontaggio,
 * quindi non esiste una battuta che possa andare persa.
 */
const NOTE_DEBOUNCE_MS = 250;

export interface PlayerCardProps {
  readonly player: Player;
  readonly onClose: () => void;
}

export function PlayerCard({ player, onClose }: PlayerCardProps): JSX.Element {
  const players = useAppStore((s) => s.players);
  const userData = useAppStore((s) => s.userData);
  const setPlayerNote = useAppStore((s) => s.setPlayerNote);
  const saveTeamNote = useAppStore((s) => s.saveTeamNote);
  const addObjectiveTarget = useAppStore((s) => s.addObjectiveTarget);
  const removeObjectiveTarget = useAppStore((s) => s.removeObjectiveTarget);

  const note = userData.playerNotes.find((n) => n.playerId === player.id) ?? null;
  const teamNote = userData.teamNotes.find((n) => n.teamCode === player.team)?.text ?? '';

  const [draft, setDraft] = useState(note?.text ?? '');
  const [teamDraft, setTeamDraft] = useState(teamNote);
  /** La nota si scrive raramente e si rilegge sempre: di default si legge. */
  const [editingNote, setEditingNote] = useState((note?.text ?? '') === '');
  const pending = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(note?.text ?? '');
    setTeamDraft(teamNote);
    setEditingNote((note?.text ?? '') === '');
    noteRef.current?.focus();
    // Il giocatore cambia solo se la scheda viene riaperta su un altro nome.
  }, [player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Scrive subito quello che e' in attesa e annulla il timer. */
  function flush(): void {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      void setPlayerNote(player.id, { text: pending.current });
      pending.current = null;
    }
  }

  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleNote(text: string): void {
    setDraft(text);
    pending.current = text;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, NOTE_DEBOUNCE_MS);
  }

  const lineupIndex = useMemo(() => makeLineupIndex(userData.lineups), [userData.lineups]);
  const placement = lineupPlacement(player.id, player.team, lineupIndex);
  const lineup = lineupIndex.get(player.team) ?? null;
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  // Le fasce dipendono solo dal listone: un re-import le ricalcola, nient'altro.
  const tierIndex = useMemo(() => makeTierIndex(players, TIER_BLOCKS), [players]);
  const tier = tierOf(player.id, tierIndex);

  const target = isTarget(userData, player.id);
  const activeSlots = new Set(placement.slots.map((s) => s.slotId));
  const theme = roleTheme(player.role);

  return (
    <motion.div
      key={player.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="flex h-full w-[28rem] shrink-0 flex-col gap-4 overflow-y-auto border-l border-white/[0.08] bg-zinc-950/80 p-4 backdrop-blur-xl"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          flush();
          onClose();
        }
      }}
    >
      {/* Testata: ruolo con glow, nome in risalto, club. */}
      <header className="flex items-start gap-3">
        <motion.div layoutId={`role-${player.id}`}>
          <RoleBadge role={player.role} size="lg" glow />
        </motion.div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xl font-bold leading-tight tracking-tight text-zinc-100">
            {player.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-medium uppercase tracking-wide text-zinc-300">
              {player.team}
            </span>
            <span className={theme.text}>{theme.label}</span>
          </p>
        </div>
        <CloseButton
          onClose={() => {
            flush();
            onClose();
          }}
        />
      </header>

      {/* Badge rapidi: tutti derivati, nessuno digitato due volte. */}
      <QuickBadges
        placement={placement}
        tier={tier}
        tag={note?.tag ?? null}
        target={target}
      />

      {/* Griglia dei numeri: quattro cifre grezze, mono tabellare. */}
      <section className="grid grid-cols-2 gap-2">
        <Stat label="quot." value={player.quot} accent={theme.text} />
        <Stat label="fvm / 1000" value={player.fvm} />
        <Stat
          label="fascia guida"
          value={tier === null ? '—' : <TierBadge tier={tier} compact />}
          mono={tier === null}
        />
        <Stat label="under" value={player.under === 0 ? '—' : player.under} />
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionTitle icon={<Star size={12} />}>Tag</SectionTitle>
        <div className="flex gap-1">
          {TAGS.map((tag) => {
            const Icon = TAG_ICON[tag];
            const on = note?.tag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => void setPlayerNote(player.id, { tag: on ? null : tag })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-all',
                  on
                    ? TAG_STYLE[tag]
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200',
                )}
              >
                <Icon size={12} />
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionTitle
          icon={<StickyNote size={12} />}
          right={
            draft.trim() === '' ? undefined : (
              <button
                type="button"
                onClick={() => {
                  flush();
                  setEditingNote((v) => !v);
                }}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-300"
              >
                {editingNote ? <Eye size={11} /> : <Pencil size={11} />}
                {editingNote ? 'anteprima' : 'modifica'}
              </button>
            )
          }
        >
          Nota
        </SectionTitle>
        {editingNote || draft.trim() === '' ? (
          <textarea
            ref={noteRef}
            value={draft}
            onChange={(e) => handleNote(e.target.value)}
            onBlur={flush}
            rows={4}
            placeholder="Rigorista, spinge sempre, rientra dopo la sosta…  **grassetto**, *corsivo*, - elenchi"
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50 focus:bg-white/[0.05]"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setEditingNote(true);
              window.setTimeout(() => noteRef.current?.focus(), 0);
            }}
            title="Clicca per modificare"
            className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-white/20"
          >
            <Markdown text={draft} className="text-[13px] leading-snug" />
          </button>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={() =>
            void (target ? removeObjectiveTarget(player.id) : addObjectiveTarget(player.id))
          }
          className={cn(
            'inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all',
            target
              ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
              : 'bg-emerald-500 text-zinc-950 shadow-glow-emerald hover:bg-emerald-400',
          )}
        >
          {target ? <StarOff size={14} /> : <Star size={14} />}
          {target ? 'Togli dagli obiettivi' : 'Aggiungi agli obiettivi'}
        </button>
        {!target && note?.tag != null && (
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Il tag “{note.tag}” resta com’e’: aggiungere agli obiettivi non lo sovrascrive.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionTitle
          icon={<ListOrdered size={12} />}
          right={
            lineup === null ? undefined : (
              <span className="num text-[11px] text-zinc-500">{lineup.module}</span>
            )
          }
        >
          Formazione {player.team}
        </SectionTitle>
        {lineup === null ? (
          <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-4 text-center text-xs text-zinc-600">
            Non ancora compilata.
          </p>
        ) : (
          <ol className="flex flex-col gap-px overflow-hidden rounded-lg border border-white/[0.06]">
            {lineup.slots.map((slot) => {
              const mine = activeSlots.has(slot.slotId);
              return (
                <li
                  key={slot.slotId}
                  className={cn(
                    'flex items-baseline gap-2 px-2 py-1 text-xs transition-colors',
                    mine
                      ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/25'
                      : 'hover:bg-white/[0.03]',
                  )}
                >
                  <span className="w-9 shrink-0 font-medium uppercase tracking-wide text-zinc-600">
                    {slot.roleLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {slot.candidates.length === 0 ? (
                      <span className="text-zinc-700">—</span>
                    ) : (
                      slot.candidates.map((id, i) => (
                        <span key={id}>
                          {i > 0 && <span className="text-amber-500"> / </span>}
                          <span
                            className={
                              id === player.id
                                ? 'font-semibold text-emerald-300'
                                : 'text-zinc-300'
                            }
                          >
                            {byId.get(id)?.name ?? `#${id}`}
                          </span>
                        </span>
                      ))
                    )}
                  </span>
                  {slot.note !== '' && (
                    <span className="shrink-0 text-[10px] text-zinc-600">{slot.note}</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionTitle icon={<Users size={12} />}>Nota squadra {player.team}</SectionTitle>
        <textarea
          value={teamDraft}
          onChange={(e) => setTeamDraft(e.target.value)}
          onBlur={() => {
            if (teamDraft !== teamNote) void saveTeamNote(player.team, teamDraft);
          }}
          rows={2}
          placeholder="Come gioca, chi e’ in dubbio…"
          className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-sm text-zinc-300 outline-none transition-colors placeholder:text-zinc-600 focus:border-emerald-500/50"
        />
      </section>
    </motion.div>
  );
}

/** Una cifra della griglia. `mono` spegne il font tabellare per i contenuti non numerici. */
function Stat({
  label,
  value,
  accent,
  mono = true,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
  readonly accent?: string;
  readonly mono?: boolean;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div
        className={cn(
          'mt-0.5 flex min-h-[1.75rem] items-center text-lg font-semibold text-zinc-100',
          mono && 'num',
          accent,
        )}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * I badge rapidi. Tutti derivati da qualcosa che esiste gia': lo stato di
 * formazione, la fascia della guida, il tag. Nessuno e' un campo nuovo da
 * riempire a mano — un badge che va aggiornato a mano all'asta non lo aggiorna
 * nessuno, e mentire e' peggio che tacere.
 */
function QuickBadges({
  placement,
  tier,
  tag,
  target,
}: {
  readonly placement: ReturnType<typeof lineupPlacement>;
  readonly tier: ReturnType<typeof tierOf>;
  readonly tag: Tag | null;
  readonly target: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <LineupBadge status={placement.status} />

      {placement.status === 'TITOLARE' && (
        <Chip icon={<ShieldCheck size={11} />} className="border-emerald-500/30 text-emerald-400">
          titolare fisso
        </Chip>
      )}

      {tier === 'SCOMMESSE' && (
        <Chip icon={<Gem size={11} />} className="border-fuchsia-500/30 text-fuchsia-300">
          scommessa
        </Chip>
      )}

      {tier === 'INFORTUNATI' && (
        <Chip icon={<TriangleAlert size={11} />} className="border-yellow-500/30 text-yellow-300">
          infortunato
        </Chip>
      )}

      {target && (
        <Chip icon={<Target size={11} />} className="border-emerald-500/40 text-emerald-300">
          obiettivo
        </Chip>
      )}

      {tag !== null && !(target && tag === 'obiettivo') && (
        <Chip
          icon={<Star size={11} />}
          className={cn(
            tag === 'evita' ? 'border-rose-500/30 text-rose-300' : 'border-sky-500/30 text-sky-300',
          )}
        >
          {tag}
        </Chip>
      )}

      {placement.duplicated && (
        <Chip icon={<TriangleAlert size={11} />} className="border-rose-500/40 text-rose-300">
          in {placement.slots.length} slot
        </Chip>
      )}
    </div>
  );
}

function Chip({
  icon,
  children,
  className,
}: {
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border bg-white/[0.03] px-1.5 py-0.5 text-[11px] font-medium leading-none',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
