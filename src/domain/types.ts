/**
 * Tipi del dominio. Nessuna logica, nessuna dipendenza.
 *
 * Confine architetturale (PRD §7): questo modulo e tutti quelli in /src/domain
 * non importano React, non importano Zustand, non toccano IndexedDB.
 */

/** Ruolo Classic. L'asta procede per ruoli sequenziali P -> D -> C -> A (PRD §1). */
export type Role = 'P' | 'D' | 'C' | 'A';

/** Ordine di fase dell'asta. L'ordine e' significativo: guida §4.3 e §4.5. */
export const PHASE_ORDER = ['P', 'D', 'C', 'A'] as const satisfies readonly Role[];

/** Tier di scarsita', 1 = migliore. Quintili di FVM/1000 dentro il ruolo. */
export type Tier = 1 | 2 | 3 | 4 | 5;

export const TIER_COUNT = 5;

/** Giocatore come esce dal parser del listone: solo campi presenti nel file. */
export interface ListonePlayer {
  /** Colonna `#`. ID stabile di Fantacalcio.it, chiave primaria (PRD §2.1). */
  readonly id: number;
  /** Colonna `Nome`, grezza, per il display. */
  readonly name: string;
  /** `name` normalizzato per la fuzzy search: accenti rimossi, minuscolo. */
  readonly searchKey: string;
  /** Colonna `Sq.`, club di Serie A. */
  readonly team: string;
  /** Colonna `R.`. */
  readonly role: Role;
  /** Colonna `Under`. */
  readonly under: number;
  /** Colonna `QUOT.`, quotazione grezza. Input della normalizzazione §4.1. */
  readonly quot: number;
  /** Colonna `FVM/1000`. Metrica di tiering primaria (PRD §2.1). */
  readonly fvm: number;
}

/** Giocatore arricchito con i campi derivati di §4.1 e dal tiering. */
export interface Player extends ListonePlayer {
  /** `round(quot * f)` — prezzo atteso di lega, §4.1. */
  readonly expectedPrice: number;
  readonly tier: Tier;
}

export interface FantaTeam {
  readonly id: string;
  readonly name: string;
  /** Sigla per la command bar, univoca (PRD §3.1). */
  readonly abbr: string;
  /** Esattamente una squadra ha `true` (PRD §3.1). */
  readonly isUser: boolean;
}

/**
 * Evento di assegnazione. Append-only: nessun hard delete, l'annullamento
 * si esprime con `undone: true` (PRD §3.2).
 */
export interface AssignmentEvent {
  readonly id: string;
  readonly ts: number;
  readonly playerId: number;
  readonly teamId: string;
  readonly price: number;
  /** Fase in cui e' avvenuta l'assegnazione. Deve coincidere col ruolo del giocatore. */
  readonly phase: Role;
  readonly undone: boolean;
}

/**
 * Dati dell'utente. Non vengono mai toccati da un re-import del listone
 * (PRD §2.3): sono joinati su `playerId`, che e' l'ID stabile.
 */
export interface UserNote {
  readonly playerId: number;
  readonly text: string;
  /** Tetto di disciplina: "non oltre". Non e' una stima di valore. */
  readonly maxBid: number | null;
  /** Stima di valore personale: alimenta `valore(p)` di §4.10. */
  readonly userValue: number | null;
  readonly starred: boolean;
  readonly archived: boolean;
}

/** Configurazione di lega. `reduce(events, config)` legge tutto da qui. */
export interface LeagueConfig {
  readonly teams: readonly FantaTeam[];
  /** Crediti iniziali per squadra (800 nella lega di riferimento). */
  readonly creditsPerTeam: number;
  /** Slot per squadra e per ruolo (3 P, 8 D, 8 C, 6 A). */
  readonly slotsByRole: Readonly<Record<Role, number>>;
  /** Listone gia' arricchito da §4.1 e dal tiering. */
  readonly players: readonly Player[];
}

/** Un record per ruolo, sempre completo. */
export type ByRole<T> = Readonly<Record<Role, T>>;
