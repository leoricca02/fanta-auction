/**
 * Tipi del dominio. Nessuna logica, nessuna dipendenza.
 *
 * Confine architetturale (PRD §7): questo modulo e tutti quelli in /src/domain
 * non importano React, non importano Zustand, non toccano IndexedDB.
 */

/** Ruolo Classic. L'asta procede per ruoli sequenziali P -> D -> C -> A (PRD §1). */
export type Role = 'P' | 'D' | 'C' | 'A';

/** Ordine di fase dell'asta. L'ordine e' significativo. */
export const PHASE_ORDER = ['P', 'D', 'C', 'A'] as const satisfies readonly Role[];

/** Marcatura di studio su un giocatore (PRD §3). */
export type Tag = 'obiettivo' | 'alternativa' | 'evita';

export const TAGS = ['obiettivo', 'alternativa', 'evita'] as const satisfies readonly Tag[];

/** Esito di §4.1. */
export type LineupStatus = 'TITOLARE' | 'BALLOTTAGGIO' | 'PANCHINA' | 'NON_INSERITO';

/**
 * Giocatore come esce dal listone. Appartiene al listone ed e' integralmente
 * sostituibile a ogni re-import (PRD §2).
 *
 * `quot` e `fvm` sono **dati grezzi**: servono a ordinare e filtrare (§5.2, §5.4).
 * Nessun valore derivato da queste colonne esiste nel dominio — il modello di
 * prezzo della 1.0 e' stato eliminato.
 */
export interface Player {
  /** Colonna `#`. ID stabile di Fantacalcio.it: tutti i dati utente si agganciano qui. */
  readonly id: number;
  /** Colonna `Nome`, grezza, per il display. */
  readonly name: string;
  /** `name` normalizzato per la fuzzy search: minuscolo, senza accenti. */
  readonly searchKey: string;
  /** Colonna `Sq.`, club di Serie A. Combacia con `Lineup.teamCode`. */
  readonly team: string;
  /** Colonna `R.`. */
  readonly role: Role;
  /** Colonna `Under`. */
  readonly under: number;
  /** Colonna `QUOT.`, grezza. Solo ordinamento e filtro. */
  readonly quot: number;
  /** Colonna `FVM/1000`, grezza. Solo ordinamento e filtro. */
  readonly fvm: number;
}

// ---------------------------------------------------------------------------
// Dati utente — l'intero valore dell'applicazione (PRD §3.1)
// ---------------------------------------------------------------------------

/** Uno slot della formazione. Due o piu' candidati sono un ballottaggio. */
export interface LineupSlot {
  readonly slotId: string;
  /** Etichetta libera del ruolo posizionale: 'POR', 'DC', 'EST', 'MED', 'TRQ', 'PC'... */
  readonly roleLabel: string;
  /** Id dei giocatori candidati, ordinati. 1 = titolare, 2+ = ballottaggio. */
  readonly candidates: readonly number[];
  readonly note: string;
}

export interface Lineup {
  /** Club di Serie A, combacia con `Player.team`. */
  readonly teamCode: string;
  /** Modulo scelto, es. '4-3-3'. */
  readonly module: string;
  readonly slots: readonly LineupSlot[];
  readonly updatedAt: number;
}

export interface TeamNote {
  readonly teamCode: string;
  readonly text: string;
  /** Ultima modifica. In import vince il record piu' recente, non il file. */
  readonly updatedAt: number;
}

export interface PlayerNote {
  readonly playerId: number;
  readonly text: string;
  readonly tag: Tag | null;
  /** Superstite di un re-import: il giocatore e' uscito dalla Serie A (PRD §2). */
  readonly archived: boolean;
  /** Ultima modifica. In import vince il record piu' recente, non il file. */
  readonly updatedAt: number;
}

/**
 * Aspettativa di rendimento per la stagione che deve iniziare (§5.5).
 *
 * E' quello che **tu** pensi che un giocatore fara': non una previsione
 * dell'applicazione, non un dato derivato dal listone. Ci si aggancia il
 * prezzo dinamico, che la mette in rapporto con i prezzi battuti al tavolo.
 *
 * Solo giocatori di movimento: l'asta dei portieri si gioca su altro, e una
 * riga di aspettativa per un portiere non vorrebbe dire niente. Chi non ha
 * una riga qui non ha prezzo dinamico, ed e' il caso normale — le si compila
 * per i nomi che si vogliono davvero, non per seicento.
 *
 * Sopravvive a un re-import del listone come ogni altro dato utente (§2).
 */
export interface Expectation {
  /** Id Fantacalcio.it, combacia con `Player.id`. */
  readonly playerId: number;
  /** Presenze a voto attese. */
  readonly matches: number;
  readonly goals: number;
  readonly assists: number;
  readonly yellows: number;
  readonly reds: number;
  /** Ultima modifica. In import vince il record piu' recente, non il file. */
  readonly updatedAt: number;
}

export interface ObjectiveTarget {
  readonly playerId: number;
  /** Ordinamento manuale. */
  readonly priority: number;
  readonly note: string;
}

/** Istanza unica. */
export interface Objectives {
  /** Note generali di strategia, testo libero. */
  readonly text: string;
  readonly targets: readonly ObjectiveTarget[];
  /** Ultima modifica. In import vince il record piu' recente, non il file. */
  readonly updatedAt: number;
}

// ---------------------------------------------------------------------------
// Lega ed event log
// ---------------------------------------------------------------------------

export interface FantaTeam {
  readonly id: string;
  readonly name: string;
  /** 3 lettere, univoche, per la command bar (PRD §3). */
  readonly abbr: string;
  /** Esattamente una squadra ha `true`. */
  readonly isUser: boolean;
}

/**
 * Evento di assegnazione. Append-only: nessun hard delete, l'annullamento
 * si esprime con `undone: true` (PRD §3).
 */
export interface AssignmentEvent {
  readonly id: string;
  readonly ts: number;
  readonly playerId: number;
  readonly teamId: string;
  /** Prezzo effettivamente pagato. Non e' una stima: e' il dato battuto all'asta. */
  readonly price: number;
  /** Fase in cui e' avvenuta l'assegnazione. Deve coincidere col ruolo del giocatore. */
  readonly phase: Role;
  readonly undone: boolean;
}

/** Configurazione di lega. `reduce(events, config)` legge tutto da qui. */
export interface LeagueConfig {
  readonly teams: readonly FantaTeam[];
  /** Crediti iniziali per squadra (800 nella lega di riferimento). */
  readonly creditsPerTeam: number;
  /** Slot per squadra e per ruolo (3 P, 8 D, 8 C, 6 A). */
  readonly slotsByRole: Readonly<Record<Role, number>>;
  /** Listone corrente. */
  readonly players: readonly Player[];
}

/**
 * Tutto cio' che l'utente ha prodotto a mano. E' il contenuto del backup di
 * §3.1 ed e' l'unica cosa che un re-import del listone non tocca mai.
 */
export interface UserData {
  readonly lineups: readonly Lineup[];
  readonly playerNotes: readonly PlayerNote[];
  readonly teamNotes: readonly TeamNote[];
  readonly objectives: Objectives;
  readonly expectations: readonly Expectation[];
  readonly events: readonly AssignmentEvent[];
}

/** Un record per ruolo, sempre completo. */
export type ByRole<T> = Readonly<Record<Role, T>>;
