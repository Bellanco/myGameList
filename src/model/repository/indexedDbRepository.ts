import type { StoragePayload } from '../types/game';
import { openSharedDatabase } from './idbConnectionRepository';

const STORE_NAME = 'appState';
const STATE_KEY = 'latest';

export async function loadIndexedDbState(): Promise<StoragePayload | null> {
  try {
    const db = await openSharedDatabase();

    return await new Promise<StoragePayload | null>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);

      request.onsuccess = () => {
        const result = request.result as unknown;
        if (result && typeof result === 'object' && 'c' in result && 'v' in result) {
          resolve(result as StoragePayload);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };

      transaction.onerror = () => {
        console.warn('[IndexedDB] Error al leer estado:', transaction.error?.message);
      };
    });
  } catch {
    return null;
  }
}

export async function saveIndexedDbState(payload: StoragePayload): Promise<boolean> {
  try {
    const db = await openSharedDatabase();

    return await new Promise<boolean>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(payload, STATE_KEY);

      transaction.oncomplete = () => {
        resolve(true);
      };

      transaction.onerror = () => {
        const err = transaction.error;
        if (err?.name === 'QuotaExceededError') {
          console.warn('[IndexedDB] Cuota excedida. No se pudo guardar el estado.');
        } else {
          console.warn('[IndexedDB] Error al guardar estado:', err?.message);
        }
        resolve(false);
      };

      transaction.onabort = () => {
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}
