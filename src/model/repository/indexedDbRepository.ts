import { TAB_IDS, type DeletedItem, type GameItem, type StoragePayload, type TabData, type TabId } from '../types/game';
import type { LocalMeta, SyncOp } from '../types/local';
import type { SocialActivityEntry } from './socialGistRepository';
import { DELETED_STORE, GAMES_STORE, META_STORE, PROFILE_CACHE_STORE, SYNC_QUEUE_STORE, openSharedDatabase } from './idbConnectionRepository';
import { isOffline } from '../../core/utils/network';

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

/** Devuelve el `profileId` (pseudónimo público) creándolo de forma perezosa si no existe. Solo IndexedDB. */
export async function getOrCreateProfileId(): Promise<string> {
  const meta = await getLocalMeta();
  if (meta?.profileId) return meta.profileId;
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const profileId = c?.randomUUID ? c.randomUUID() : `pid-${Date.now()}-${Math.round(performance.now())}`;
  await patchLocalMeta({ profileId });
  return profileId;
}

/**
 * 6.2a — Estabiliza el `profileId` entre dispositivos. Dado el `profileId` canónico recuperado de
 * Firestore (`privateConfig`/`userMap`), lo siembra en `meta` ANTES de que se genere uno local nuevo.
 * El remoto canónico SIEMPRE gana: si existe y difiere del local, reconcilia (sana dispositivos que ya
 * hubieran divergido con un UUID aleatorio propio). Como `privateConfig` es un doc único por `uid`, todos
 * los dispositivos convergen al mismo valor. Si no hay remoto, conserva el local o crea el primero.
 * Devuelve el `profileId` efectivo.
 */
export async function seedProfileIdFromRemote(remoteProfileId: string | null | undefined): Promise<string> {
  const meta = await getLocalMeta();
  const local = (meta?.profileId || '').trim();
  const remote = (remoteProfileId || '').trim();
  if (remote && remote !== local) {
    await patchLocalMeta({ profileId: remote });
    return remote;
  }
  if (local) return local;
  return getOrCreateProfileId();
}

// Store `games` (v3): cada registro es un GameItem con su pestaña anotada como `_tab`.
// Aún no es la fuente de verdad (la app sigue en `appState`); lo puebla el runner (paso 08).
type GameRecord = GameItem & { _tab: TabId };

export async function putGameRecord(game: GameItem, tab: TabId): Promise<void> {
  // Escritor ajeno al espejo (lo usa el runner de migración del arranque, que corre en idle y puede solaparse
  // con un guardado del usuario): invalida el índice para que el siguiente espejo no dé por hecho lo que hay.
  invalidateGamesMirrorIndex();
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
  invalidateGamesMirrorIndex(); // escritor ajeno al espejo (ver `invalidateGamesMirrorIndex`)
  await idbPut<DeletedItem>(DELETED_STORE, item);
}
export async function getDeletedRecords(): Promise<DeletedItem[]> {
  return idbGetAll<DeletedItem>(DELETED_STORE);
}
export async function removeTombstone(id: number): Promise<void> {
  invalidateGamesMirrorIndex(); // escritor ajeno al espejo (ver `invalidateGamesMirrorIndex`)
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
/** Upsert: fija `_ts`, incrementa `_v`, revive (borra tombstone) y encola un SyncOp 'upsertGame'.
 * Las tres escrituras (games/deleted/syncQueue) van en UNA transacción multi-store: atómicas y sin
 * encadenar tres `oncomplete` sucesivos (antes eran 3 transacciones independientes). */
export async function upsertGame(game: GameItem, tab: TabId): Promise<GameItem> {
  invalidateGamesMirrorIndex(); // escritor ajeno al espejo (ver `invalidateGamesMirrorIndex`)
  const next: GameItem = { ...game, _ts: Date.now(), _v: (game._v ?? 0) + 1 };
  const op: SyncOp = { id: newOpId(), createdAt: Date.now(), attempts: 0, nextRetry: null, type: 'upsertGame', payload: { id: next.id, tab } };
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, DELETED_STORE, SYNC_QUEUE_STORE], 'readwrite');
    tx.objectStore(GAMES_STORE).put({ ...next, _tab: tab });
    tx.objectStore(DELETED_STORE).delete(next.id);
    tx.objectStore(SYNC_QUEUE_STORE).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('upsertGame failed'));
    tx.onabort = () => reject(tx.error || new Error('upsertGame aborted'));
  });
  return next;
}

/** Borrado: quita del store `games`, escribe tombstone en `deleted` y encola un SyncOp 'deleteGame'.
 * Las tres escrituras van en UNA transacción multi-store (antes 3 transacciones independientes). */
export async function deleteGame(id: number): Promise<void> {
  invalidateGamesMirrorIndex(); // escritor ajeno al espejo (ver `invalidateGamesMirrorIndex`)
  const ts = Date.now();
  const op: SyncOp = { id: newOpId(), createdAt: ts, attempts: 0, nextRetry: null, type: 'deleteGame', payload: { id } };
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, DELETED_STORE, SYNC_QUEUE_STORE], 'readwrite');
    tx.objectStore(GAMES_STORE).delete(id);
    tx.objectStore(DELETED_STORE).put({ id, _ts: ts, deletedAt: ts });
    tx.objectStore(SYNC_QUEUE_STORE).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('deleteGame failed'));
    tx.onabort = () => reject(tx.error || new Error('deleteGame aborted'));
  });
}

// ---------------------------------------------------------------------------
// ESPEJO INCREMENTAL del store `games` (dual-write).
//
// El espejo corre en CADA guardado. Reemplazar el store entero (clear + un put por juego) significaba que
// editar la nota de un juego costaba tantas escrituras como juegos hay en la biblioteca: con 800, 800 puts por
// pulsar "Guardar". Ahora se escribe solo lo que cambia.
//
// Cómo se sabe qué cambió sin volver a leer el store (leerlo entero costaría lo mismo que escribirlo): se
// recuerda EN MEMORIA lo espejado en esta sesión, y se compara contra `_ts`. Ese es el marcador de versión LWW
// que TODA ruta de edición estrena, y de él ya dependen dos sitios más (`tabGamesEqual` en el view-model, para
// decidir si hay cambios, y el merge CRDT): si `_ts` no se movió, el contenido de ese juego no cambió.
//
// El índice es una CACHÉ, no la verdad. Cuando no se sabe qué hay en el store —primer espejo de la sesión, un
// error en la transacción anterior, u otro escritor (la migración del arranque, `upsertGame`)— vale `null` y la
// siguiente pasada vuelve a reemplazarlo todo. Esa es la posición segura: reemplazar de más es lento, pero
// escribir de menos dejaría el store divergiendo de `appState` en silencio, y `appState` es el único que puede
// perder datos aquí (ver la nota de `gamesUpdatedAt` más abajo).
// ---------------------------------------------------------------------------

/** id → clave de versión de lo espejado (`tab:_ts:_v`). `null` = contenido del store desconocido. */
let mirroredGames: Map<number, string> | null = null;
/** id → `_ts` de las tumbas espejadas. `null` = desconocido. */
let mirroredDeleted: Map<number, number> | null = null;

/**
 * Olvida el índice del espejo: la siguiente pasada reemplazará el store completo.
 *
 * Lo llama TODO el que escriba en `games`/`deleted` por su cuenta (la migración del arranque, `upsertGame`,
 * `deleteGame`…). Sin esto, el índice afirmaría que en el store hay algo que ya no está y el espejo se saltaría
 * escrituras necesarias.
 */
export function invalidateGamesMirrorIndex(): void {
  mirroredGames = null;
  mirroredDeleted = null;
}

type MirrorSnapshot = {
  games: Map<number, { record: GameRecord; key: string }>;
  deleted: Map<number, DeletedItem>;
};

/** Normaliza un `TabData` a lo que va literalmente a los stores, con su clave de versión. */
function toMirrorSnapshot(data: TabData): MirrorSnapshot {
  const games = new Map<number, { record: GameRecord; key: string }>();
  for (const tab of TAB_IDS) {
    for (const game of data[tab] || []) {
      const id = Number(game?.id);
      if (!(id > 0)) continue;
      games.set(id, {
        record: { ...game, _tab: tab },
        key: `${tab}:${Number(game._ts) || 0}:${Number(game._v) || 0}`,
      });
    }
  }

  const deleted = new Map<number, DeletedItem>();
  for (const tomb of data.deleted || []) {
    const id = Number(tomb?.id);
    if (!(id > 0)) continue;
    const ts = Number(tomb._ts) || 0;
    deleted.set(id, { id, _ts: ts, deletedAt: Number(tomb.deletedAt ?? ts) || ts });
  }

  return { games, deleted };
}

/**
 * Encola en `tx` las escrituras que llevan `games`/`deleted` al estado de `next`. Con `previous` a `null`
 * reemplaza (clear + todo); con un índice previo, solo la diferencia.
 */
function queueMirrorWrites(
  tx: IDBTransaction,
  next: MirrorSnapshot,
  previous: { games: Map<number, string>; deleted: Map<number, number> } | null,
): void {
  const games = tx.objectStore(GAMES_STORE);
  const deleted = tx.objectStore(DELETED_STORE);

  if (!previous) {
    games.clear();
    deleted.clear();
    for (const entry of next.games.values()) games.put(entry.record);
    for (const tomb of next.deleted.values()) deleted.put(tomb);
    return;
  }

  for (const [id, entry] of next.games) {
    if (previous.games.get(id) !== entry.key) games.put(entry.record);
  }
  for (const id of previous.games.keys()) {
    if (!next.games.has(id)) games.delete(id);
  }
  for (const [id, tomb] of next.deleted) {
    if (previous.deleted.get(id) !== tomb._ts) deleted.put(tomb);
  }
  for (const id of previous.deleted.keys()) {
    if (!next.deleted.has(id)) deleted.delete(id);
  }
}

/**
 * Reemplazo COMPLETO de `games` + `deleted` a partir de un `TabData`. NO encola SyncOps (la sincronización por
 * gist sigue operando sobre TabData/appState durante la transición) y NO toca `gamesUpdatedAt`.
 */
export async function replaceGamesStoreFromTabData(data: TabData): Promise<void> {
  const db = await openSharedDatabase();
  const next = toMirrorSnapshot(data);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, DELETED_STORE], 'readwrite');
    try {
      queueMirrorWrites(tx, next, null); // puede lanzar en síncrono; ver la nota en `mirrorTabDataToGames`
    } catch (error) {
      invalidateGamesMirrorIndex();
      try { tx.abort(); } catch { /* la transacción ya podía estar muerta */ }
      reject(error instanceof Error ? error : new Error('replaceGamesStoreFromTabData failed'));
      return;
    }
    tx.oncomplete = () => {
      // Deja el índice sincronizado: quien reemplaza el store SABE lo que ha quedado dentro.
      mirroredGames = new Map([...next.games].map(([id, entry]) => [id, entry.key]));
      mirroredDeleted = new Map([...next.deleted].map(([id, tomb]) => [id, tomb._ts]));
      resolve();
    };
    tx.onerror = () => {
      invalidateGamesMirrorIndex();
      reject(tx.error || new Error('replaceGamesStoreFromTabData failed'));
    };
    tx.onabort = () => {
      invalidateGamesMirrorIndex();
      reject(tx.error || new Error('replaceGamesStoreFromTabData aborted'));
    };
  });
}

/**
 * Espejo + sello de `gamesUpdatedAt`, que es la marca con la que el arranque decide si el store `games` está más
 * fresco que `appState` y puede servir de recuperación.
 *
 * Las tres escrituras van en UNA transacción (antes eran dos: los stores y luego el patch de la meta). Además de
 * ahorrar un viaje, cierra la ventana en la que el sello podía quedar escrito sobre un espejo a medias: un fallo
 * ahora no deja NADA, y `gamesUpdatedAt` nunca puede afirmar que el store está al día si no lo está.
 */
export async function mirrorTabDataToGames(data: TabData, updatedAt: number): Promise<void> {
  const db = await openSharedDatabase();
  const next = toMirrorSnapshot(data);
  const previous = mirroredGames && mirroredDeleted ? { games: mirroredGames, deleted: mirroredDeleted } : null;

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([GAMES_STORE, DELETED_STORE, META_STORE], 'readwrite');

    // Encolar puede fallar SÍNCRONAMENTE (una clave inválida da `DataError`, un valor no clonable
    // `DataCloneError`), y entonces la transacción se quedaría a medias —con el `clear` ya encolado, por
    // ejemplo— y aun así llegaría a `oncomplete`, que daría el índice por bueno. Eso es precisamente la
    // desincronización silenciosa que el índice no puede permitirse: se aborta y se olvida.
    // Encolar puede fallar SÍNCRONAMENTE (una clave inválida da `DataError`, un valor no clonable
    // `DataCloneError`), y entonces la transacción se quedaría a medias —con el `clear` ya encolado, por
    // ejemplo— y aun así llegaría a `oncomplete`, que daría el índice por bueno. Eso es precisamente la
    // desincronización silenciosa que el índice no puede permitirse: se aborta y se olvida.
    try {
      queueMirrorWrites(tx, next, previous);

      const meta = tx.objectStore(META_STORE);
      const metaRequest = meta.get(META_KEY);
      metaRequest.onsuccess = () => {
        const current = (metaRequest.result as LocalMeta | undefined) ?? null;
        meta.put({ ...(current || {}), gamesUpdatedAt: updatedAt, _key: META_KEY } as LocalMeta);
      };
    } catch (error) {
      invalidateGamesMirrorIndex();
      try { tx.abort(); } catch { /* la transacción ya podía estar muerta */ }
      reject(error instanceof Error ? error : new Error('mirrorTabDataToGames failed'));
      return;
    }

    tx.oncomplete = () => {
      mirroredGames = new Map([...next.games].map(([id, entry]) => [id, entry.key]));
      mirroredDeleted = new Map([...next.deleted].map(([id, tomb]) => [id, tomb._ts]));
      resolve();
    };
    tx.onerror = () => {
      invalidateGamesMirrorIndex();
      reject(tx.error || new Error('mirrorTabDataToGames failed'));
    };
    tx.onabort = () => {
      invalidateGamesMirrorIndex();
      reject(tx.error || new Error('mirrorTabDataToGames aborted'));
    };
  });
}

// ---------------------------------------------------------------------------
// Caché de las listas de juegos de OTROS perfiles (store `profileCache`, v3).
// TTL de 1 día: es el tope para servir la caché en modo degradado (sin token o ante fallo de red). En el camino
// normal con token, loadForeignProfileGames revalida con If-None-Match (el ETag guardado aquí): un 304 no gasta
// rate-limit y refresca la marca de tiempo; un 200 trae títulos nuevos. keyPath = `profileId`.
// ---------------------------------------------------------------------------
const PROFILE_GAMES_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedProfileGames {
  profileId: string; // keyPath del store
  gamesGistId: string; // invalida la caché si el perfil cambia de gist de listados
  cachedAt: number;
  games: TabData;
  etag?: string | null; // ETag del gist para revalidación condicional (If-None-Match) — evita títulos rancios
}

/**
 * Devuelve los juegos cacheados de un perfil si siguen frescos (<24h) y corresponden al mismo `gamesGistId`.
 * Con `allowExpired` los devuelve aunque hayan caducado (último recurso cuando no hay token para releer).
 */
export async function getCachedProfileGames(
  profileId: string,
  gamesGistId: string,
  options?: { allowExpired?: boolean },
): Promise<TabData | null> {
  try {
    const rec = await idbGet<CachedProfileGames>(PROFILE_CACHE_STORE, profileId);
    if (!rec || rec.gamesGistId !== gamesGistId) return null;
    const fresh = Date.now() - rec.cachedAt < PROFILE_GAMES_TTL_MS;
    if (!fresh && !options?.allowExpired) return null;
    return rec.games;
  } catch {
    return null;
  }
}

/**
 * Devuelve el registro de caché COMPLETO (juegos + ETag + si sigue fresco) para el mismo `gamesGistId`, sin filtrar
 * por caducidad. Se usa para la revalidación condicional: aunque haya caducado, su ETag sirve para pedir un 304.
 */
export async function getCachedProfileGamesEntry(
  profileId: string,
  gamesGistId: string,
): Promise<{ games: TabData; etag: string | null; fresh: boolean } | null> {
  try {
    const rec = await idbGet<CachedProfileGames>(PROFILE_CACHE_STORE, profileId);
    if (!rec || rec.gamesGistId !== gamesGistId) return null;
    return { games: rec.games, etag: rec.etag ?? null, fresh: Date.now() - rec.cachedAt < PROFILE_GAMES_TTL_MS };
  } catch {
    return null;
  }
}

export async function putCachedProfileGames(
  profileId: string,
  gamesGistId: string,
  games: TabData,
  etag: string | null = null,
): Promise<void> {
  try {
    await idbPut<CachedProfileGames>(PROFILE_CACHE_STORE, { profileId, gamesGistId, cachedAt: Date.now(), games, etag });
  } catch {
    // best-effort: que no se pueda escribir la caché no debe romper la carga del perfil.
  }
}

export async function invalidateProfileGames(profileId: string): Promise<void> {
  try {
    await idbDelete(PROFILE_CACHE_STORE, profileId);
  } catch {
    // best-effort.
  }
}

// ---------------------------------------------------------------------------
// Caché persistente del DIRECTORIO social ya ensamblado (perfiles + actividad + posts). Reutiliza el store
// `profileCache` con una clave reservada por gist propio (`__dir__:<ownGistId>`), que no colisiona con los
// profileId (UUID) de la caché de juegos. TTL 30 min: dentro de la ventana, la navegación (feed→detalle→feed) y los
// re-render sirven de IndexedDB sin releer los ~N gists sociales; el refresco manual (forceRefresh) la reescribe.
// ---------------------------------------------------------------------------
// TTL POR DEFECTO (rango bronce). El llamador pasa el suyo según el rango de QUIEN MIRA: plata 15 min, oro 10,
// mithril 12 s. Ver `PROFILE_TIER_FEED_TTL_MS` en core/constants/tiers.ts.
const SOCIAL_DIRECTORY_TTL_MS = 30 * 60 * 1000;
const SOCIAL_DIRECTORY_KEY_PREFIX = '__dir__:';
/**
 * Versión de la FORMA de las entradas cacheadas. Una caché escrita con otra versión se ignora, aunque siga
 * dentro del TTL.
 *
 * Hace falta porque el TTL solo caduca por tiempo: si cambia lo que la hidratación guarda en cada entrada, el
 * usuario sigue viendo datos con la forma vieja hasta 30 minutos y no hay forma de forzarlo desde la UI. Pasó al
 * subir el tope de actividad por perfil de 40 a 320: la pestaña Reseñas seguía sin fecha publicada para las
 * reseñas recortadas. SUBIRLA al cambiar campos o topes de lo que se cachea.
 *   1 = sin versión (implícita).
 *   2 = actividad por perfil hasta 320 entradas (antes 40).
 *   3 = cada entrada trae `tier` (punto de rango en las tarjetas del directorio).
 *   4 = F4: cada entrada trae `moves` (mensajes de lista). Sin subirla, quien tuviera caché fresca no vería
 *       ningún movimiento hasta 30 minutos después, y sin forma de forzarlo desde la interfaz.
 */
const SOCIAL_DIRECTORY_CACHE_VERSION = 4;

interface CachedSocialDirectory<T> {
  profileId: string; // keyPath del store
  cachedAt: number;
  version?: number;
  entries: T[];
}

/**
 * `ttlMs` sale del RANGO de quien mira (`PROFILE_TIER_FEED_TTL_MS`): cuanto más alto, más a menudo se releen el
 * directorio y los gists sociales de sus amigos. Por defecto, el de bronce, que es la cadencia de siempre.
 */
export async function getCachedSocialDirectory<T>(
  ownGistId: string,
  ttlMs: number = SOCIAL_DIRECTORY_TTL_MS,
  options?: { allowExpired?: boolean },
): Promise<T[] | null> {
  if (!ownGistId) return null;
  try {
    const rec = await idbGet<CachedSocialDirectory<T>>(PROFILE_CACHE_STORE, SOCIAL_DIRECTORY_KEY_PREFIX + ownGistId);
    if (!rec) return null;
    if (rec.version !== SOCIAL_DIRECTORY_CACHE_VERSION) return null;
    // SIN RED el TTL no se aplica: caducar la caché solo tiene sentido si hay a dónde ir a por algo más nuevo.
    // Offline, la alternativa a servir el directorio de hace una hora es un feed vacío con un error de red, así
    // que se sirve lo que haya y la interfaz avisa de que es lo último guardado (`SOCIAL_UI.offline`). La versión
    // de FORMA de arriba sigue invalidando: eso no es rancio, es ilegible.
    // `allowExpired` es la otra mitad de lo mismo: `navigator.onLine` puede decir que hay red y no haberla (wifi
    // sin salida, portal cautivo), y en ese caso quien se come el fallo es el llamador, que pide la caché igual.
    if (!options?.allowExpired && !isOffline() && Date.now() - rec.cachedAt >= Math.max(0, ttlMs)) return null;
    return rec.entries;
  } catch {
    return null;
  }
}

export async function putCachedSocialDirectory<T>(ownGistId: string, entries: T[]): Promise<void> {
  if (!ownGistId) return;
  try {
    await idbPut<CachedSocialDirectory<T>>(PROFILE_CACHE_STORE, {
      profileId: SOCIAL_DIRECTORY_KEY_PREFIX + ownGistId,
      cachedAt: Date.now(),
      version: SOCIAL_DIRECTORY_CACHE_VERSION,
      entries,
    });
  } catch {
    // best-effort.
  }
}

// Invalida la caché del directorio. Se llama al cambiar el grafo de amistad (aceptar/eliminar): como el directorio
// solo lee el gist social de tus AMIGOS, un cambio de amistad altera qué actividad debe aparecer en el feed y hay
// que releer sin esperar al TTL de 30 min.
export async function invalidateCachedSocialDirectory(ownGistId: string): Promise<void> {
  if (!ownGistId) return;
  try {
    await idbDelete(PROFILE_CACHE_STORE, SOCIAL_DIRECTORY_KEY_PREFIX + ownGistId);
  } catch {
    // best-effort.
  }
}

// ---------------------------------------------------------------------------
// Caché persistente del PERFIL PROPIO ya resuelto (nombre + visibilidad + actividad). Reutiliza el store
// `profileCache` con clave reservada por gist propio (`__profile__:<ownGistId>`). TTL corto: al volver a navegar a la
// pantalla social dentro de la ventana se sirve de IndexedDB sin releer el gist propio ni consultar Firestore. El
// guardado del perfil invalida esta caché para reflejar los cambios. keyPath = `profileId`.
// ---------------------------------------------------------------------------
const SOCIAL_PROFILE_TTL_MS = 5 * 60 * 1000;
const SOCIAL_PROFILE_KEY_PREFIX = '__profile__:';

export interface CachedSocialProfileData {
  name: string;
  hiddenTabs: TabId[];
  hideReplayable: boolean;
  hideRetry: boolean;
  hideGameTime: boolean;
  showPhoto: boolean;
  profileExists: boolean;
  activity: SocialActivityEntry[];
}

interface CachedSocialProfile extends CachedSocialProfileData {
  profileId: string; // keyPath del store
  cachedAt: number;
}

export async function getCachedSocialProfile(
  ownGistId: string,
  options?: { allowExpired?: boolean },
): Promise<CachedSocialProfileData | null> {
  if (!ownGistId) return null;
  try {
    const rec = await idbGet<CachedSocialProfile>(PROFILE_CACHE_STORE, SOCIAL_PROFILE_KEY_PREFIX + ownGistId);
    if (!rec) return null;
    // Mismo criterio que el directorio: sin red, la caché caducada es lo único que hay, y con ella el espacio
    // social ABRE (perfil, visibilidad y actividad propia) en lugar de fallar al leer el gist.
    if (!options?.allowExpired && !isOffline() && Date.now() - rec.cachedAt >= SOCIAL_PROFILE_TTL_MS) return null;
    return {
      name: rec.name,
      hiddenTabs: rec.hiddenTabs,
      hideReplayable: rec.hideReplayable,
      hideRetry: rec.hideRetry,
      hideGameTime: rec.hideGameTime,
      showPhoto: rec.showPhoto,
      profileExists: rec.profileExists,
      activity: rec.activity,
    };
  } catch {
    return null;
  }
}

/**
 * Lee SOLO la identidad del perfil (el nombre guardado) IGNORANDO el TTL de `getCachedSocialProfile`.
 * Ese TTL fuerza re-lectura del gist remoto (actividad, etc.), pero el nombre guardado no "caduca": para gatear el
 * botón de Cuenta basta con que el registro exista en este dispositivo (se escribe al abrir Social o al guardar el
 * perfil). Devuelve `null` solo si nunca se ha abierto Social aquí. No sustituye a `getCachedSocialProfile`.
 */
export async function peekCachedSocialProfileIdentity(
  ownGistId: string,
): Promise<{ name: string } | null> {
  if (!ownGistId) return null;
  try {
    const rec = await idbGet<CachedSocialProfile>(PROFILE_CACHE_STORE, SOCIAL_PROFILE_KEY_PREFIX + ownGistId);
    if (!rec) return null;
    return { name: rec.name };
  } catch {
    return null;
  }
}

export async function putCachedSocialProfile(ownGistId: string, data: CachedSocialProfileData): Promise<void> {
  if (!ownGistId) return;
  try {
    await idbPut<CachedSocialProfile>(PROFILE_CACHE_STORE, {
      profileId: SOCIAL_PROFILE_KEY_PREFIX + ownGistId,
      cachedAt: Date.now(),
      ...data,
    });
  } catch {
    // best-effort.
  }
}

export async function invalidateCachedSocialProfile(ownGistId: string): Promise<void> {
  if (!ownGistId) return;
  try {
    await idbDelete(PROFILE_CACHE_STORE, SOCIAL_PROFILE_KEY_PREFIX + ownGistId);
  } catch {
    // best-effort.
  }
}
