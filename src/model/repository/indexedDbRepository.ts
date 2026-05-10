import type { StoragePayload } from '../types/game';

const DB_NAME = 'myGameList';
const DB_VERSION = 1;
const STORE_NAME = 'appState';
const STATE_KEY = 'latest';

function supportsIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!supportsIndexedDb()) {
      reject(new Error('IndexedDB no soportado en este entorno'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir IndexedDB'));
  });
}

export async function loadIndexedDbState(): Promise<StoragePayload | null> {
  try {
    const db = await openDatabase();

    return await new Promise<StoragePayload | null>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);

      request.onsuccess = () => {
        resolve((request.result as StoragePayload | undefined) || null);
      };

      request.onerror = () => {
        resolve(null);
      };

      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
      transaction.onabort = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function saveIndexedDbState(payload: StoragePayload): Promise<boolean> {
  try {
    const db = await openDatabase();

    return await new Promise<boolean>((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put(payload, STATE_KEY);

      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };

      transaction.onerror = () => {
        db.close();
        resolve(false);
      };

      transaction.onabort = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}
