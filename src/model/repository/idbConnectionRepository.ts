const DB_NAME = 'myGameList';
const DB_VERSION = 2;
const STORE_NAME = 'appState';
const CRYPTO_STORE_NAME = 'cryptoKeys';

let _dbPromise: Promise<IDBDatabase> | null = null;

function supportsIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

export function openSharedDatabase(): Promise<IDBDatabase> {
  if (_dbPromise) {
    return _dbPromise;
  }

  _dbPromise = new Promise((resolve, reject) => {
    if (!supportsIndexedDb()) {
      reject(new Error('IndexedDB no soportado en este entorno'));
      _dbPromise = null;
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(CRYPTO_STORE_NAME)) {
        db.createObjectStore(CRYPTO_STORE_NAME);
      }
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

  return _dbPromise;
}
