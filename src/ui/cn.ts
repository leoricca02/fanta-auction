import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Composizione delle classi Tailwind.
 *
 * `clsx` risolve i condizionali, `twMerge` risolve i conflitti: l'ultima classe
 * dello stesso gruppo vince. Serve perche' quasi ogni componente qui accetta
 * una `className` dall'esterno, e senza merge un `px-3` del chiamante finiva
 * dietro il `px-2` di default senza avere effetto.
 */
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs));
}
