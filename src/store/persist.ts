/**
 * Durata dei dati nel browser.
 *
 * Tutta l'app vive in IndexedDB, e IndexedDB e' sfrattabile: Safari cancella i
 * dati di un sito non visitato da sette giorni, Chrome li butta quando lo
 * spazio stringe. `navigator.storage.persist()` chiede l'esenzione — Safari la
 * concede alle app aggiunte alla home screen, Chrome a quelle installate o con
 * abbastanza interazione — e da li' in poi solo l'utente puo' cancellare.
 *
 * Nessuna delle due chiamate e' garantita dall'ambiente (jsdom non le ha, i
 * browser vecchi nemmeno): fallire e' normale e non deve fermare l'avvio.
 */

/** Esito della richiesta: `unknown` se il browser non espone l'API. */
export type StorageDurability = 'persistent' | 'best-effort' | 'unknown';

function api(): StorageManager | null {
  if (typeof navigator === 'undefined') return null;
  const storage = navigator.storage as StorageManager | undefined;
  if (storage === undefined || typeof storage.persist !== 'function') return null;
  return storage;
}

/** Chiede al browser di non sfrattare i dati. Idempotente. */
export async function requestPersistentStorage(): Promise<StorageDurability> {
  const storage = api();
  if (storage === null) return 'unknown';
  try {
    if (await storage.persisted()) return 'persistent';
    return (await storage.persist()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}

/** Legge lo stato senza chiedere nulla: per mostrarlo in Impostazioni. */
export async function storageDurability(): Promise<StorageDurability> {
  const storage = api();
  if (storage === null) return 'unknown';
  try {
    return (await storage.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unknown';
  }
}
