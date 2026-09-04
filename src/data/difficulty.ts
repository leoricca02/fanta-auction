/**
 * Classificazione delle squadre di Serie A per la griglia di alternanza:
 * quanto e' dura affrontarle, separatamente per i portieri e per gli attaccanti.
 *
 * **Non e' generata da uno script e non e' calcolata**: e' la classificazione di
 * FantaLab, letta dalla loro griglia il 2026-09-02 incrociando la riga della
 * Juventus con il calendario ufficiale — trentotto caselle, ogni colore
 * ricondotto all'avversario di quella giornata. Le due occorrenze di ogni club
 * (andata e ritorno, casa e fuori) hanno sempre lo stesso colore: la difficolta'
 * **non dipende dal campo**, dipende solo da chi affronti.
 *
 * La Juventus non compare nella loro griglia quando e' lei la riga: e' rossa in
 * entrambi i reparti.
 *
 * Si aggiorna a mano. Se una stagione cambia le venti squadre — o se FantaLab
 * rivede un giudizio a mercato finito — questa tabella e' l'unico posto da
 * toccare, e `domain/calendar.ts` non ha nessun'altra fonte di difficolta'.
 */
import type { TeamDifficulty } from '../domain/calendar';

/** Da dove viene la classificazione, mostrata all'utente. */
export const DIFFICULTY_SOURCE = 'FantaLab · griglia portieri e attaccanti';

/** Data della lettura: dice quanto e' vecchio il giudizio. */
export const DIFFICULTY_UPDATED_AT = '2026-09-02';

/**
 * I venti club con il nome del listone. `P` e' la difficolta' per il portiere
 * che li affronta, `A` quella per l'attaccante.
 */
export const TEAM_DIFFICULTY: readonly TeamDifficulty[] = [
  { team: 'Atalanta', P: 'media', A: 'media' },
  { team: 'Bologna', P: 'media', A: 'media' },
  { team: 'Cagliari', P: 'facile', A: 'facile' },
  { team: 'Como', P: 'difficile', A: 'difficile' },
  { team: 'Fiorentina', P: 'media', A: 'facile' },
  { team: 'Frosinone', P: 'facile', A: 'facile' },
  { team: 'Genoa', P: 'facile', A: 'facile' },
  { team: 'Inter', P: 'difficile', A: 'difficile' },
  { team: 'Juventus', P: 'difficile', A: 'difficile' },
  { team: 'Lazio', P: 'media', A: 'media' },
  { team: 'Lecce', P: 'facile', A: 'facile' },
  { team: 'Milan', P: 'difficile', A: 'difficile' },
  { team: 'Monza', P: 'facile', A: 'facile' },
  { team: 'Napoli', P: 'difficile', A: 'difficile' },
  { team: 'Parma', P: 'facile', A: 'facile' },
  { team: 'Roma', P: 'difficile', A: 'difficile' },
  { team: 'Sassuolo', P: 'facile', A: 'facile' },
  { team: 'Torino', P: 'facile', A: 'facile' },
  { team: 'Udinese', P: 'media', A: 'facile' },
  { team: 'Venezia', P: 'facile', A: 'facile' },
];
