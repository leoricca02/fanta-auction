import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import type { Role } from '../domain/types';
import { cn } from './cn';
import { roleTheme } from './roles';

/**
 * Mattoni dell'interfaccia, condivisi da tutte le schermate.
 *
 * Stanno insieme perche' sono la parte del design system che si vede: cambiare
 * qui il raggio di un badge o l'ombra di un pannello lo cambia ovunque, che e'
 * esattamente il punto. Nessuno di questi componenti conosce il dominio —
 * tranne `RoleBadge`, che conosce solo il tipo `Role`.
 */

/** Curva condivisa delle transizioni: sopra i 250ms all'asta si sente. */
export const EASE = [0.16, 1, 0.3, 1] as const;

// ---------------------------------------------------------------------------

export function Kbd({ children }: { readonly children: ReactNode }): JSX.Element {
  return <kbd className="kbd">{children}</kbd>;
}

/** Badge del ruolo con il suo glow. `size` cambia solo la densita'. */
export function RoleBadge({
  role,
  size = 'sm',
  glow = false,
  className,
}: {
  readonly role: Role;
  readonly size?: 'xs' | 'sm' | 'lg';
  readonly glow?: boolean;
  readonly className?: string;
}): JSX.Element {
  const theme = roleTheme(role);
  return (
    <span
      title={theme.label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md font-semibold leading-none',
        'transition-colors duration-150',
        theme.chip,
        glow && theme.glow,
        size === 'xs' && 'h-4 w-4 text-[10px]',
        size === 'sm' && 'h-5 w-5 text-[11px]',
        size === 'lg' && 'h-9 w-9 text-base',
        className,
      )}
    >
      {role}
    </span>
  );
}

/**
 * Contenitore in vetro. Il default e' la card, non il pannello a piena altezza.
 *
 * A staccarlo dal fondo sono il bordo e il filo di luce in alto, non un'ombra:
 * su un canvas gia' scuro un'ombra opaca annerisce e non solleva niente.
 */
export function Panel({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <div className={cn('glass rounded-xl shadow-panel ring-1 ring-white/5', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  icon,
  right,
  className,
}: {
  readonly children: ReactNode;
  readonly icon?: ReactNode;
  readonly right?: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {icon !== undefined && <span className="text-zinc-500">{icon}</span>}
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{children}</h3>
      {right !== undefined && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/**
 * Cifra critica: etichetta sopra, valore in mono tabellare, nota sotto.
 * `tone` colora il solo valore — le note restano sempre in grigio.
 */
export function Kpi({
  label,
  value,
  hint,
  tone,
  bar,
  barFill,
  title,
  className,
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: ReactNode;
  readonly tone?: string;
  readonly bar?: number;
  readonly barFill?: string;
  readonly title?: string;
  readonly className?: string;
}): JSX.Element {
  return (
    <div
      title={title}
      className={cn(
        'rounded-lg border border-hair bg-veil px-3 py-2',
        'transition-colors duration-150 hover:border-edge hover:bg-film',
        className,
      )}
    >
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cn('num mt-0.5 text-xl font-semibold text-zinc-100', tone)}>{value}</div>
      {bar !== undefined && (
        <Meter value={bar} fill={barFill ?? 'bg-emerald-500'} className="mt-1.5" />
      )}
      {hint !== undefined && <div className="mt-1 text-[11px] text-zinc-500">{hint}</div>}
    </div>
  );
}

/** Barra 0..1. Il riempimento e' una classe, cosi' il ruolo puo' colorarla. */
export function Meter({
  value,
  fill = 'bg-emerald-500',
  className,
}: {
  readonly value: number;
  readonly fill?: string;
  readonly className?: string;
}): JSX.Element {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  return (
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-scrim', className)}>
      <motion.div
        className={cn('h-full rounded-full', fill)}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.25, ease: EASE }}
      />
    </div>
  );
}

/** Bottone icona-solo, per le chiusure e le azioni di riga. */
export function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500',
        'transition-colors duration-150 hover:bg-scrim hover:text-zinc-200',
        'focus-ring',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Chiusura standard dei pannelli: icona piu' il tasto che fa lo stesso. */
export function CloseButton({ onClose }: { readonly onClose: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Chiudi"
      className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors duration-150 hover:bg-scrim hover:text-zinc-200"
    >
      <X size={14} />
      <Kbd>Esc</Kbd>
    </button>
  );
}

// ---------------------------------------------------------------------------

/**
 * Stato vuoto, a due livelli.
 *
 * Una riga di testo grigio dice *che* non c'e' niente. Ma "non c'e' niente" ha
 * sempre due letture — **e' rotto** oppure **non hai ancora fatto la cosa** —
 * e in un'app che si usa sotto pressione la seconda va detta esplicitamente,
 * altrimenti l'utente cerca il guasto invece di fare il gesto.
 *
 * Percio' due livelli, non uno: il titolo dice cosa manca, il suggerimento dice
 * cosa fare. L'icona e' tenue di proposito — deve dare forma al vuoto, non
 * riempirlo di attenzione: una lista vuota non e' un errore da segnalare.
 */
export function EmptyState({
  icon,
  title,
  hint,
  className,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  /** Il gesto che riempirebbe questo vuoto. */
  readonly hint?: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-hair px-4 py-8 text-center',
        className,
      )}
    >
      <span className="text-slate-600 [&_svg]:stroke-1">{icon}</span>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {hint !== undefined && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Un rettangolo che pulsa al posto di un dato che sta arrivando.
 *
 * Non e' uno spinner con un'altra faccia. Lo spinner dice "aspetta" e basta,
 * e per farlo **cancella la pagina**: quando i dati arrivano il layout salta,
 * e quel salto e' il motivo per cui un'app sembra lenta anche quando non lo e'.
 * Lo scheletro invece disegna gia' la forma di cio' che sta per comparire, il
 * riempimento non sposta niente, e la stessa attesa si percepisce piu' corta.
 *
 * Quindi la geometria non e' decorativa: uno scheletro che non combacia con la
 * cosa vera fa esattamente il danno che dovrebbe evitare.
 */
export function Skeleton({ className }: { readonly className?: string }): JSX.Element {
  return <span className={cn('block animate-pulse rounded bg-scrim', className)} />;
}

/**
 * Lo scheletro di una tabella: un'intestazione e `rows` righe.
 *
 * Le larghezze delle celle sono irregolari di proposito. Barre tutte uguali si
 * leggono come una griglia, cioe' come un elemento dell'interfaccia; irregolari
 * si leggono come testo non ancora a fuoco, che e' quello che sono.
 */
export function SkeletonTable({
  rows = 8,
  className,
}: {
  readonly rows?: number;
  readonly className?: string;
}): JSX.Element {
  const widths = ['w-32', 'w-24', 'w-40', 'w-28', 'w-36', 'w-20', 'w-32', 'w-28'];
  return (
    <div aria-hidden className={cn('flex flex-col gap-2 p-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className={cn('h-3', widths[i % widths.length])} />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="ml-auto h-3 w-10" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Guscio degli overlay laterali: backdrop sfocato, pannello che entra da
 * destra. Il click sul fondo chiude, il click dentro no.
 */
export function SlideOver({
  open,
  onClose,
  children,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-30 flex items-stretch justify-end bg-black/60 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-full"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Dialog centrato: stesso backdrop, apertura scalata. */
export function Modal({
  open,
  onClose,
  labelledBy,
  children,
  className,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly labelledBy?: string;
  readonly children: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={cn('glass w-full max-w-lg rounded-2xl p-5 shadow-pop', className)}
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------

/** Larghezza del pannello: sotto non ci sta una gerarchia, sopra sborda. */
const POPOVER_WIDTH = 256;

/**
 * Dettaglio che si apre sopra un badge: col mouse basta passarci, col dito si
 * tocca.
 *
 * Non e' un `title=`. Il tooltip del sistema operativo arriva dopo un secondo,
 * non si stila, e **col dito non esiste** — e questa app si usa anche da tablet
 * durante l'asta, che e' esattamente il momento in cui uno vuole sapere in che
 * ordine tirano i rigori senza aprire un'altra pagina.
 *
 * Tre modi di aprirlo, uno per ogni modo di usare l'app: `pointerenter` col
 * mouse, il tocco (che e' un `click`), il focus da tastiera. Si chiude con
 * Esc, che qui si ferma: la scheda dietro non deve chiudersi insieme.
 */
export function InfoPopover({
  label,
  trigger,
  children,
  className,
  panelClassName,
}: {
  /** Cosa legge uno screen reader sul bersaglio. */
  readonly label: string;
  readonly trigger: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly panelClassName?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  /** Da che lato aprirlo: deciso all'apertura, non a ogni render. */
  const [alignRight, setAlignRight] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  function show(): void {
    const box = wrap.current?.getBoundingClientRect();
    if (box !== undefined) setAlignRight(box.left + POPOVER_WIDTH > window.innerWidth - 8);
    setOpen(true);
  }

  // Un tocco fuori chiude: col dito non esiste il "porta via il mouse".
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: PointerEvent): void => {
      if (!(e.target instanceof Node) || wrap.current?.contains(e.target) !== true) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <span
      ref={wrap}
      className="relative inline-flex"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') show();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onFocus={show}
        onBlur={(e) => {
          if (!(e.relatedTarget instanceof Node) || wrap.current?.contains(e.relatedTarget) !== true)
            setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !open) return;
          // La scheda si chiude con Esc: qui si chiude solo il pannello.
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }}
        className={cn('focus-ring cursor-help rounded-md', className)}
      >
        {trigger}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            id={panelId}
            role="tooltip"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: EASE }}
            style={{ width: POPOVER_WIDTH }}
            className={cn(
              'absolute top-full z-40 mt-1 block max-h-64 overflow-y-auto rounded-lg',
              'border border-hair bg-elevated/95 p-2.5 text-left shadow-pop backdrop-blur-xl',
              alignRight ? 'right-0' : 'left-0',
              panelClassName,
            )}
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
