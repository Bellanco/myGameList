import { TAB_IDS, type DeletedItem, type GameItem, type StoragePayload, type TabData, type TabId } from '../types/game';
import type { LocalMeta, SyncOp } from '../types/local';
import { DELETED_STORE, GAMES_STORE, META_STORE, SYNC_QUEUE_STORE, openSharedDatabase } from './idbConnectionRepository';

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

// Store `games` (v3): cada registro es un GameItem con su pestaña anotada como `_tab`.
// Aún no es la fuente de verdad (la app sigue en `appState`); lo puebla el runner (paso 08).
type GameRecord = GameItem & { _tab: TabId };

export async function putGameRecord(game: GameItem, tab: TabId): Promise<void> {
  await idbPut<GameRecord>(GAMES_STORE, { ...game, _tab: tab });
}

export async function getAllGameRecords(): Promise<GameRecord[]> {
  return idbGetAll<GameRecord>(GAMES_STORE);
}

/** Reconstruye un `TabData` a partir del store `games` (agrupando por `_tab`) + tombstones del store `deleted`. */
export async function getGamesAsTabData(): Promise<TabData> {
  const records = await getAllGameRecords();
  const data: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() };
  for (const rec of records) {
    const tab = rec._tab;
    if (tab !== 'c' && tab !== 'v' && tab !== 'e' && tab !== 'p') continue;
    const clean = { ...rec } as Partial<GameRecord>;
    delete clean._tab;
    data[tab].push(clean as GameItem);
  }
  data.deleted = await getDeletedRecords();
  return data;
}

// --- Tombstones (store `deleted`, v4) ---
export async function putDeletedRecord(item: DeletedItem): Promise<void> {
  await idbPut<DeletedItem>(DELETED_STORE, item);
}
export async function getDeletedRecords(): Promise<DeletedItem[]> {
  return idbGetAll<DeletedItem>(DELETED_STORE);
}
export async function removeTombstone(id: number): Promise<void> {
  await idbDelete(DELETED_STORE, id);
}

// --- Cola de sync (store `syncQueue`) ---
function newOpId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `op-${Date.now()}-${Math.round(performance.now())}`;
}
export async function enqueueSyncOp(op: Omit<SyncOp, 'id' | 'createdAt' | 'attempts' | 'nextRetry'>): Promise<void> {
  await idbPut<SyncOp>(SYNC_QUEUE_STORE, { id: newOpId(), createdAt: Date.now(), attempts: 0, nextRetry: null, ...op });
}
export async function getSyncQueue(): Promise<SyncOp[]> {
  return idbGetAll<SyncOp>(SYNC_QUEUE_STORE);
}

// --- Escritura de juegos (store `games`) ---
/** Upsert: fija `_ts`, incrementa `_v`, revive (borra tombstone) y encola un SyncOp 'upsertGame'. */
export async function upsertGame(game: GameItem, tab: TabId): Promise<GameItem> {
  const next: GameItem = { ...game, _ts: Date.now(), _v: (game._v ?? 0) + 1 };
  await putGameRecord(next, tab);
  await removeTombstone(next.id);
  await enqueueSyncOp({ type: 'upsertGame', payload: { id: next.id, tab } });
  return next;
}

/** Borrado: quita del store `games`, escribe tombstone en `deleted` y encola un SyncOp 'deleteGame'. */
export async function deleteGame(id: number): Promise<void> {
  const ts = Date.now();
  await idbDelete(GAMES_STORE, id);
  await putDeletedRecord({ id, _ts: ts, deletedAt: ts });
  await enqueueSyncOp({ type: 'deleteGame', payload: { id } });
}

/**
 * Espejo (dual-write): reemplaza atómicamente el contenido de `games` + `deleted` para que reflejen
 * el `TabData` dado. NO encola SyncOps (la sincronización por gist sigue operando sobre TabData/appState
 * durante la transición). Mantiene el store `games` siempre al día con cada guardado.
 */
export async function replaceGamesStoreFromTabData(data: TabData): Promise<void> {
  const db = await openSharedDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, DELETED_STORE], 'readwrite');
    const games = tx.objectStore(GAMES_STORE);
    const deleted = tx.objectStore(DELETED_STORE);
    games.clear();
    deleted.clear();
    for (const tab of TAB_IDS) {
      for (const game of data[tab] || []) {
        if (!game || !(Number(game.id) > 0)) continue;
        games.put({ ...game, _tab: tab });
      }
    }
    for (const tomb of data.deleted || []) {
      if (!tomb || !(Number(tomb.id) > 0)) continue;
      const ts = Number(tomb._ts) || 0;
      deleted.put({ id: tomb.id, _ts: ts, deletedAt: Number(tomb.deletedAt ?? ts) || ts });
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('replaceGamesStoreFromTabData failed'));
    tx.onabort = () => reject(tx.error || new Error('replaceGamesStoreFromTabData aborted'));
  });
}

/** Espejo + registro del timestamp (`gamesUpdatedAt`) para poder elegir la fuente más fresca al cargar. */
export async function mirrorTabDataToGames(data: TabData, updatedAt: number): Promise<void> {
  await replaceGamesStoreFromTabData(data);
  await patchLocalMeta({ gamesUpdatedAt: updatedAt });
}
