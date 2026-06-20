import type { StoragePayload } from '../types/game';
import type { LocalMeta } from '../types/local';
import { META_STORE, openSharedDatabase } from './idbConnectionRepository';

const STORE_NAME = 'appState';
const STATE_KEY = 'latest';
const META_KEY = 'singleton';

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

// ---------------------------------------------------------------------------
// Helpers genéricos sobre los stores destino (v3). La app sigue usando `appState`
// como fuente de verdad durante la transición; estos helpers los consumen los pasos
// posteriores (03/06/07/08) a medida que se pueblan los stores nuevos.
// ---------------------------------------------------------------------------

export async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openSharedDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) || []);
    req.onerror = () => reject(req.error || new Error(`getAll failed: ${storeName}`));
  });
}

export async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openSharedDatabase();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error || new Error(`get failed: ${storeName}`));
  });
}

export async function idbPut<T>(storeName: string, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openSharedDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (key === undefined) store.put(value);
    else store.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`put failed: ${storeName}`));
    tx.onabort = () => reject(tx.error || new Error(`put aborted: ${storeName}`));
  });
}

export async function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openSharedDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error(`delete failed: ${storeName}`));
    tx.onabort = () => reject(tx.error || new Error(`delete aborted: ${storeName}`));
  });
}

// LocalMeta (store `meta`, keyPath '_key', único registro 'singleton').
export async function getLocalMeta(): Promise<LocalMeta | null> {
  try {
    const meta = await idbGet<LocalMeta>(META_STORE, META_KEY);
    return meta ?? null;
  } catch {
    return null;
  }
}

export async function setLocalMeta(meta: LocalMeta): Promise<void> {
  await idbPut<LocalMeta>(META_STORE, { ...meta, _key: META_KEY });
}

export async function patchLocalMeta(patch: Partial<LocalMeta>): Promise<void> {
  const db = await openSharedDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    const getReq = store.get(META_KEY);
    getReq.onsuccess = () => {
      const current = (getReq.result as LocalMeta | undefined) ?? null;
      const next = { ...(current || {}), ...patch, _key: META_KEY } as LocalMeta;
      store.put(next);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('patchLocalMeta failed'));
    tx.onabort = () => reject(tx.error || new Error('patchLocalMeta aborted'));
  });
}
