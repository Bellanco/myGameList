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
import { deleteDoc, doc } from 'firebase/firestore';
import { initializeFirebaseServices } from './firebaseClient';
import { deleteFriendship, getMyFriendships, invalidateMyFriendshipsCache } from './firebaseFriendshipRepository';
import { invalidateOwnProfileCache, invalidateSocialDirectoryCache } from './firebaseSocialRepository';
import { signOutSocialUser } from './firebaseAuthRepository';
import { closeSharedDatabase, SHARED_DB_NAME } from './idbConnectionRepository';
import { clearSyncConfig } from './gistConfigRepository';
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

  // 2) Documentos propios. En paralelo: son independientes entre sí y ninguno depende del anterior.
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

  // La base contiene juegos, tombstones, cola de sync, cachés sociales y la clave AES no exportable con la que se
  // descifra el token: se borra entera, no store a store.
  await closeSharedDatabase();
  await deleteSharedDatabase();
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

function deleteSharedDatabase(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.deleteDatabase(SHARED_DB_NAME);
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
