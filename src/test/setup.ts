import 'fake-indexeddb/auto';

/**
 * IndexedDB in memoria per i test dello store.
 *
 * Senza, `src/store` non e' testabile sotto Node e resta l'unico pezzo di
 * logica non banale senza rete di sicurezza — proprio quello dove i bug sono
 * usciti davvero, due volte, entrambe race sulla coda di scrittura.
 */
