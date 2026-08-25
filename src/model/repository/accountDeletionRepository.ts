// L3 — Borrado de cuenta (derecho de supresión, RGPD art. 17).
//
// Elimina TODO lo que este servicio guarda del usuario: su perfil público, sus amistades, su configuración
// privada y pública, el mapa de pseudónimo, y los datos de ESTE dispositivo (listas locales, cola de sync,
// cachés, token cifrado y la clave que lo descifra).
//
// Lo que NO se toca, a propósito: los Gists de GitHub. Viven en la cuenta del usuario, no en este servicio;
// borrarlos con su token sería destruir datos alojados en un tercero por decisión nuestra. La UI lo dice y
// enlaza a GitHub para que lo haga quien es dueño de ellos.
//
// Cada paso es best-effort y se acumulan los fallos en vez de abortar: dejar la sesión abierta y los datos
// locales intactos porque una amistad no se pudo borrar sería el peor resultado posible para el usuario.
import { deleteDoc, doc } from 'firebase/firestore/lite';
import { initializeFirebaseServices } from './firebaseClient';
import { deleteFriendship, getMyFriendships, invalidateMyFriendshipsCache } from './firebaseFriendshipRepository';
import { invalidateOwnProfileCache, invalidateSocialDirectoryCache } from './firebaseSocialRepository';
import { signOutSocialUser } from './firebaseAuthRepository';
import { closeSharedDatabase, SHARED_DB_NAME } from './idbConnectionRepository';
import { clearSyncConfig } from './gistConfigRepository';
import { DEVICE_KEY_DB_NAME } from '../../core/security/crypto';
import {
  GIST_CFG_KEY,
  IMPORT_FIELDS_KEY,
  SOCIAL_GIST_CFG_KEY,
  STORAGE_KEY,
} from '../../core/constants/storageKeys';

/** Colecciones con un documento por uid que pertenecen íntegramente al usuario. */
const OWNED_COLLECTIONS = ['profiles', 'privateConfig', 'publicConfig', 'userMap'] as const;

export interface AccountDeletionResult {
  /** true si TODO el borrado remoto se completó; false si algo quedó pendiente (se informa al usuario). */
  remoteComplete: boolean;
  /** Motivos de los pasos remotos fallidos, para diagnóstico. */
  failures: string[];
}

/**
 * Borra los datos remotos del usuario y limpia el dispositivo. Nunca lanza: el resultado indica si quedó algo.
 */
export async function deleteOwnAccount(uid: string): Promise<AccountDeletionResult> {
  const failures: string[] = [];

  if (uid) {
    await deleteRemoteData(uid, failures);
  }

  // La sesión se cierra SIEMPRE, aunque el borrado remoto haya fallado a medias: seguir con sesión iniciada tras
  // pedir el borrado es lo que el usuario no espera.
  try {
    await signOutSocialUser();
  } catch (error) {
    failures.push(`sesión: ${describe(error)}`);
  }

  await wipeLocalData();

  return { remoteComplete: failures.length === 0, failures };
}

async function deleteRemoteData(uid: string, failures: string[]): Promise<void> {
  const services = await initializeFirebaseServices().catch(() => null);
  if (!services) {
    // Sin Firebase configurado no hay nada remoto que borrar (uso puramente local): no es un fallo.
    return;
  }

  // 1) Amistades: un doc por par. Se borran todas (aceptadas y pendientes en ambos sentidos) porque el doc
  //    contiene también la identidad denormalizada del usuario que se va.
  try {
    const friendships = await getMyFriendships(uid, { forceRefresh: true });
    const all = [...friendships.friends, ...friendships.incoming, ...friendships.outgoing];
    const results = await Promise.allSettled(all.map((item) => deleteFriendship({ myUid: uid, docId: item.docId })));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      failures.push(`amistades: ${failed} de ${all.length} no se pudieron borrar`);
    }
  } catch (error) {
    failures.push(`amistades: ${describe(error)}`);
  }

  // 2) Enlaces públicos de reseñas. VAN ANTES que el borrado del perfil: una vez borrado, la Function ya no
  //    puede leer el rango ni la identidad, y las reseñas se quedarían publicadas hasta caducar solas. Es la
  //    parte del derecho de supresión que más se nota, porque es lo único que estaba a la vista de cualquiera.
  try {
    const { removeAllMyShares } = await import('./shareRepository');
    await removeAllMyShares();
  } catch (error) {
    failures.push(`enlaces compartidos: ${describe(error)}`);
  }

  // 3) Documentos propios. En paralelo: son independientes entre sí y ninguno depende del anterior.
  const docResults = await Promise.allSettled(
    OWNED_COLLECTIONS.map((collectionName) => deleteDoc(doc(services.firestore, collectionName, uid))),
  );
  docResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      failures.push(`${OWNED_COLLECTIONS[index]}: ${describe(result.reason)}`);
    }
  });

  // 3) Cachés en memoria que aún apuntan a lo borrado.
  invalidateOwnProfileCache(uid);
  invalidateMyFriendshipsCache(uid);
  invalidateSocialDirectoryCache();
}

/**
 * Limpia el rastro local. Se conserva SOLO la decisión sobre la analítica: es una preferencia de privacidad de
 * este navegador, no un dato de la cuenta, y volver a preguntar a quien acaba de rechazarla sería lo contrario
 * de respetarla.
 */
async function wipeLocalData(): Promise<void> {
  clearSyncConfig(); // limpia además el token en memoria del módulo de config
  removeLocal([STORAGE_KEY, GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY, IMPORT_FIELDS_KEY]);

  // La base contiene juegos, tombstones, cola de sync y cachés sociales: se borra entera, no store a store.
  await closeSharedDatabase();
  await deleteDatabase(SHARED_DB_NAME);

  // La clave AES no exportable vive en SU PROPIA base (`mygamelist-secure`, ver `core/security/crypto`), así que
  // borrar la de arriba NO se la llevaba: quedaba una clave huérfana en el dispositivo después de borrar la
  // cuenta. Sin el ciphertext no descifra nada, pero el derecho de supresión se cumple o no se cumple.
  await deleteDatabase(DEVICE_KEY_DB_NAME);

  // Cache Storage (service worker). El shell y los `/assets/*` son públicos y se volverían a descargar, pero
  // hasta ahora se borraba todo MENOS esto, y una caché de respuestas de `/api/*` sobrevivía al borrado. Ya no se
  // guardan (ver `public/service-worker.js`), y esto remata lo que dejaron las versiones anteriores.
  await deleteAllCaches();
}

/** Borra todas las cachés del origen. Best-effort: sin Cache Storage (o sin permiso) no hay nada que limpiar. */
async function deleteAllCaches(): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  } catch {
    // no bloqueante: el resto del borrado ya se ha hecho
  }
}

function removeLocal(keys: string[]): void {
  keys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // sin localStorage no hay nada que limpiar
    }
  });
}

function deleteDatabase(name: string): Promise<void> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.deleteDatabase(name);
    } catch {
      resolve();
      return;
    }
    // `onblocked` ocurre si hay OTRA pestaña con la base abierta: el borrado se completará cuando se cierre, y
    // no tiene sentido dejar al usuario esperando por ello.
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
