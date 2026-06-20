const DB_NAME = 'myGameList';
const DB_VERSION = 3;

// Stores existentes (v2) — se conservan tal cual.
const STORE_NAME = 'appState';
const CRYPTO_STORE_NAME = 'cryptoKeys';

// Stores destino añadidos en v3 (vacíos hasta que los pasos posteriores los pueblen).
export const GAMES_STORE = 'games';
export const META_STORE = 'meta';
export const SYNC_QUEUE_STORE = 'syncQueue';
export const CHUNK_CACHE_STORE = 'chunkCache';
export const PROFILE_CACHE_STORE = 'profileCache';
export const CONFLICTS_STORE = 'conflicts';

let _dbPromise: Promise<IDBDatabase> | null = null;

function supportsIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

/**
 * Crea los object stores destino de forma idempotente. Seguro de ejecutar viniendo de cualquier
 * versión anterior: solo crea lo que falta y NUNCA toca `appState` ni `cryptoKeys`.
 */
function ensureStores(db: IDBDatabase): void {
  // v2 (conservar)
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME);
  }
  if (!db.objectStoreNames.contains(CRYPTO_STORE_NAME)) {
    db.createObjectStore(CRYPTO_STORE_NAME);
  }

  // v3 (destino de la migración)
  if (!db.objectStoreNames.contains(GAMES_STORE)) {
    const games = db.createObjectStore(GAMES_STORE, { keyPath: 'id' });
    // Nota: IndexedDB no admite booleanos como clave de índice, así que `shared` no se indexa
    // (el filtrado por compartidos se hará en memoria o con un flag indexable en el paso que lo use).
    games.createIndex('tab', 'tab');
    games.createIndex('_ts', '_ts');
  }
  if (!db.objectStoreNames.contains(META_STORE)) {
    db.createObjectStore(META_STORE, { keyPath: '_key' });
  }
  if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
    const queue = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
    queue.createIndex('type', 'type');
    queue.createIndex('createdAt', 'createdAt');
    queue.createIndex('nextRetry', 'nextRetry');
  }
  if (!db.objectStoreNames.contains(CHUNK_CACHE_STORE)) {
    const chunks = db.createObjectStore(CHUNK_CACHE_STORE, { keyPath: 'gistId' });
    chunks.createIndex('cachedAt', 'cachedAt');
  }
  if (!db.objectStoreNames.contains(PROFILE_CACHE_STORE)) {
    const profiles = db.createObjectStore(PROFILE_CACHE_STORE, { keyPath: 'profileId' });
    profiles.createIndex('cachedAt', 'cachedAt');
  }
  if (!db.objectStoreNames.contains(CONFLICTS_STORE)) {
    const conflicts = db.createObjectStore(CONFLICTS_STORE, { keyPath: 'id' });
    conflicts.createIndex('gameId', 'gameId');
    conflicts.createIndex('resolved', 'resolved');
  }
}

export function openSharedDatabase(): Promise<IDBDatabase> {
  if (_dbPromise) {
    return _dbPromise;
  }

  const promise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!supportsIndexedDb()) {
      reject(new Error('IndexedDB no soportado en este entorno'));
      _dbPromise = null;
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      ensureStores(request.result);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      _dbPromise = null;
      reject(request.error || new Error('No se pudo abrir IndexedDB'));
    };
    request.onblocked = () => {
      _dbPromise = null;
      reject(new Error('Migración de IndexedDB bloqueada. Cierra otras pestañas de la aplicación.'));
    };
  }).catch((error) => {
    _dbPromise = null;
    throw error;
  });

  _dbPromise = promise;
  return promise;
}
