// Auto-saneado del perfil legacy, ejecutado por el CLIENTE DEL PROPIO USUARIO al iniciar sesión.
//
// Por qué aquí y no en el panel de administración: los restos legacy del documento público (`email`,
// `social.gamesGistId`, `social.githubToken` en claro) no se pueden borrar sin más, porque para algunos usuarios
// son la ÚNICA copia que queda de su token y del id de su gist. Ponerlos a salvo significa escribir en
// `privateConfig`, que es owner-only: ni el administrador puede. El único actor capaz de hacer la migración
// completa es el propio dueño, y este módulo es lo que ejecuta su navegador cuando entra.
//
// ORDEN, que es lo único que importa aquí: PRESERVAR y luego BORRAR. Si el respaldo falla (offline, reglas,
// cifrado), NO se purga nada y se reintenta en el próximo arranque. Nunca al revés.
//
// Con esto, la purga manual del panel queda solo para quien no vuelve a entrar nunca.
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { initializeFirebaseServices } from './firebaseClient';
import { backupGithubToken, getPrivateConfig, setPrivateConfig } from './firebaseRepository';
import { getOwnProfileRef, invalidateOwnProfileCache, invalidateSocialDirectoryCache } from './firebaseSocialRepository';

export type LegacyHealStatus =
  /** No había nada que sanear (caso normal: ningún perfil nuevo tiene restos). */
  | 'clean'
  /** Se preservó lo necesario y se purgó el documento público. */
  | 'healed'
  /** El perfil no vive en `profiles/{uid}` (documento legacy con otro id): no se toca. */
  | 'foreign-doc'
  /** No se pudo completar (sin Firebase, sin sesión útil, o falló el respaldo): se reintentará. */
  | 'deferred';

export interface LegacyHealResult {
  status: LegacyHealStatus;
  /** El token en claro se respaldó cifrado en `privateConfig` durante esta pasada. */
  backedUpToken: boolean;
  /** El id del gist de juegos se sembró en `privateConfig` durante esta pasada. */
  seededGamesGistId: boolean;
}

function result(status: LegacyHealStatus, backedUpToken = false, seededGamesGistId = false): LegacyHealResult {
  return { status, backedUpToken, seededGamesGistId };
}

/**
 * Migra y limpia el perfil público del usuario indicado. Idempotente y sin escrituras cuando no hay nada que
 * hacer (el caso de la inmensa mayoría): una sola lectura, además cacheada por `getOwnProfileRef`.
 *
 * Nunca lanza: cualquier fallo devuelve `deferred` y deja el documento intacto.
 */
export async function healOwnLegacyProfile(uid: string): Promise<LegacyHealResult> {
  if (!uid) {
    return result('deferred');
  }

  try {
    const services = await initializeFirebaseServices();
    if (!services) {
      return result('deferred');
    }

    const profile = await getOwnProfileRef(uid);
    // Sin documento en `profiles/{uid}`: o no tiene perfil social (nada que sanear) o es un perfil legacy que
    // vive bajo otro id. Ese segundo caso NO se toca desde aquí: su `email` es la única forma de volver a
    // encontrarlo, y moverlo a `profiles/{uid}` es el cutover de identidad, no un saneado.
    if (!profile) {
      return result('foreign-doc');
    }

    const legacyToken = String(profile.githubToken || '').trim(); // audit-allow: LECTURA del token legacy para ponerlo a salvo cifrado antes de borrarlo
    const legacyGamesGistId = String(profile.gamesGistId || '').trim();
    const hasLegacyEmail = Boolean(String(profile.email || '').trim());

    if (!legacyToken && !legacyGamesGistId && !hasLegacyEmail) {
      return result('clean');
    }

    // ---- 1) PRESERVAR. Si algo de esto falla, se sale sin purgar. ----
    const privateConfig = await getPrivateConfig(uid).catch(() => null);
    let backedUpToken = false;
    let seededGamesGistId = false;

    if (legacyToken && !privateConfig?.encryptedGithubToken) {
      // Si el respaldo cifrado falla, propagar: purgar aquí le dejaría sin token en el próximo dispositivo.
      await backupGithubToken(uid, legacyToken);
      backedUpToken = true;
    }

    if (legacyGamesGistId && !String(privateConfig?.gamesGistId || '').trim()) {
      // Sin esto, borrar `social.gamesGistId` rompería el fallback de "Recuperar Gist ID" en un dispositivo nuevo.
      await setPrivateConfig(uid, { gamesGistId: legacyGamesGistId }); // audit-allow: destino owner-only (privateConfig), justo lo contrario de un canal público
      seededGamesGistId = true;
    }

    // ---- 2) PURGAR el documento público. ----
    // `uid` va en la escritura a propósito: la regla `profileWriteIsValid` exige que `request.resource.data.uid`
    // sea el del autenticado, y hay perfiles tan viejos que no tienen ese campo. Escribirlo (con su mismo valor)
    // es lo que permite que la purga pase la validación en esos documentos.
    // `updatedAt` NO se toca: es el latido de "última vez visto" y un saneado no es actividad del usuario.
    await updateDoc(doc(services.firestore, 'profiles', uid), {
      uid,
      email: deleteField(), // audit-allow: deleteField() ELIMINA el email legacy, no lo escribe
      'social.gamesGistId': deleteField(),
      'social.githubToken': deleteField(), // audit-allow: deleteField() ELIMINA el token en claro legacy, no lo almacena
    });

    invalidateOwnProfileCache(uid);
    invalidateSocialDirectoryCache();

    return result('healed', backedUpToken, seededGamesGistId);
  } catch (error) {
    // Best-effort de verdad: el usuario no ha pedido esto y no puede hacer nada al respecto. Se reintenta solo.
    console.warn('[saneado] no se pudo migrar el perfil legacy:', error instanceof Error ? error.message : error);
    return result('deferred');
  }
}
