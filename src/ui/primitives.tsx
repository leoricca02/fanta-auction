import type { ReactNode } from 'react';
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

/** Contenitore in vetro. Il default e' la card, non il pannello a piena altezza. */
export function Panel({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): JSX.Element {
  return <div className={cn('glass rounded-xl shadow-panel', className)}>{children}</div>;
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
        'rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 transition-colors hover:border-white/[0.12]',
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
    <div className={cn('h-1 w-full overflow-hidden rounded-full bg-white/[0.07]', className)}>
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
        'transition-colors hover:bg-white/[0.06] hover:text-zinc-200',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500',
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
    >
      <X size={14} />
      <Kbd>Esc</Kbd>
    </button>
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
