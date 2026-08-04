// Auto-saneado del perfil legacy, ejecutado por el CLIENTE DEL PROPIO USUARIO al iniciar sesión.
//
// Cubre tres cosas que el panel de administración ve pero no puede arreglar:
//
//  1. Restos legacy del documento público (`email`, `social.gamesGistId`, `social.githubToken` en claro). No se
//     pueden borrar sin más, porque para algunos usuarios son la ÚNICA copia que queda de su token y del id de su
//     gist. Ponerlos a salvo significa escribir en `privateConfig`, que es owner-only: ni el administrador puede.
//  2. Identidad pseudónima ausente (`profileId` vacío: señal `no-profile-id` del panel). Su copia CANÓNICA vive en
//     `userMap/{uid}` y `privateConfig/{uid}`, owner-only las dos, y es de donde la leen todos los dispositivos del
//     usuario (`resolveStableProfileId`). Un pseudónimo inventado desde el panel solo llegaría al doc público, así
//     que el cliente lo pisaría en su siguiente guardado y sus publicaciones quedarían atribuidas a otro.
//  3. Marca de esquema atrasada (`schemaVersion`: señal `stale-schema`). Sellarla desde el panel sería mentir: el
//     documento seguiría con la forma vieja.
//
// En los tres casos el único actor capaz de hacer la migración completa es el propio dueño, y este módulo es lo que
// ejecuta su navegador cuando entra.
//
// ORDEN, que es lo único que importa aquí: PRESERVAR (token cifrado, id del gist, pseudónimo canónico) y luego
// escribir el documento público. Si el respaldo falla (offline, reglas, cifrado), NO se purga ni se sella nada y se
// reintenta en el próximo arranque. Nunca al revés.
//
// COSTE: en el caso normal —la inmensa mayoría— es UNA lectura, además cacheada, y CERO escrituras. Solo escribe el
// pequeño porcentaje de perfiles que de verdad arrastra algo, y cuando escribe lo hace en una sola operación por
// documento.
//
// Con esto, la purga manual del panel queda solo para quien no vuelve a entrar nunca.
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { initializeFirebaseServices } from './firebaseClient';
import {
  FIRESTORE_SCHEMA_VERSION,
  backupGithubToken,
  getPrivateConfig,
  resolveStableProfileId,
  setPrivateConfig,
  setUserMap,
} from './firebaseRepository';
import { getOwnProfileRef, invalidateOwnProfileCache, invalidateSocialDirectoryCache } from './firebaseSocialRepository';

export type LegacyHealStatus =
  /** No había nada que sanear (caso normal: ningún perfil nuevo tiene restos). */
  | 'clean'
  /** Se preservó lo necesario y se puso al día el documento público. */
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
  /** Se estableció la identidad pseudónima que faltaba (`userMap` + `privateConfig` + doc público). */
  establishedProfileId: boolean;
  /** Se volvió a sellar la marca de esquema del documento público. */
  stampedSchema: boolean;
}

type HealDetails = Partial<Omit<LegacyHealResult, 'status'>>;

function result(status: LegacyHealStatus, details: HealDetails = {}): LegacyHealResult {
  return {
    status,
    backedUpToken: false,
    seededGamesGistId: false,
    establishedProfileId: false,
    stampedSchema: false,
    ...details,
  };
}

/**
 * Migra y pone al día el perfil público del usuario indicado. Idempotente y sin escrituras cuando no hay nada que
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
    const missingProfileId = !String(profile.profileId || '').trim();
    const staleSchema = Number(profile.schemaVersion || 0) < FIRESTORE_SCHEMA_VERSION;

    if (!legacyToken && !legacyGamesGistId && !hasLegacyEmail && !missingProfileId && !staleSchema) {
      return result('clean');
    }

    // ---- 1) PRESERVAR. Si algo de esto falla, se sale sin escribir en el documento público. ----
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

    // Identidad pseudónima: mismo criterio de orden. `resolveStableProfileId` reconcilia primero con el remoto
    // canónico (`privateConfig`/`userMap`) y solo genera uno nuevo si no hay rastro en ninguna parte, así que un
    // dispositivo que ya publica con su pseudónimo local conserva EL SUYO en vez de estrenar otro y partir en dos la
    // atribución de sus reseñas.
    //
    // Aquí NO se usa `establishProfileIdentity`: se traga sus propios errores, y sellar el pseudónimo en el doc
    // público sin que la copia canónica haya aterrizado es justo la deriva que este saneado viene a evitar. Los
    // errores se propagan (→ `deferred`) y el documento público se queda como estaba.
    let establishedProfileId = '';
    if (missingProfileId) {
      const profileId = await resolveStableProfileId(uid);
      if (profileId) {
        await setUserMap(uid, profileId);
        // Solo el pseudónimo: `setPrivateConfig` hace merge, y mandar aquí los ids de gist (que este camino no
        // conoce) los borraría.
        await setPrivateConfig(uid, { profileId });
        establishedProfileId = profileId;
      }
    }

    // ---- 2) ESCRIBIR el documento público: purga de restos + identidad + marca de esquema, en una sola operación. ----
    // `uid` va en la escritura a propósito: la regla `profileWriteIsValid` exige que `request.resource.data.uid`
    // sea el del autenticado, y hay perfiles tan viejos que no tienen ese campo. Escribirlo (con su mismo valor)
    // es lo que permite que la escritura pase la validación en esos documentos.
    // `updatedAt` NO se toca: es el latido de "última vez visto" y un saneado no es actividad del usuario.
    // `createdAt` tampoco se manda: las reglas la declaran inmutable y enviarla denegaría la escritura entera.
    await updateDoc(doc(services.firestore, 'profiles', uid), {
      uid,
      email: deleteField(), // audit-allow: deleteField() ELIMINA el email legacy, no lo escribe
      'social.gamesGistId': deleteField(),
      'social.githubToken': deleteField(), // audit-allow: deleteField() ELIMINA el token en claro legacy, no lo almacena
      ...(establishedProfileId ? { profileId: establishedProfileId } : {}),
      ...(staleSchema ? { schemaVersion: FIRESTORE_SCHEMA_VERSION } : {}),
    });

    invalidateOwnProfileCache(uid);
    invalidateSocialDirectoryCache();

    return result('healed', {
      backedUpToken,
      seededGamesGistId,
      establishedProfileId: Boolean(establishedProfileId),
      stampedSchema: staleSchema,
    });
  } catch (error) {
    // Best-effort de verdad: el usuario no ha pedido esto y no puede hacer nada al respecto. Se reintenta solo.
    console.warn('[saneado] no se pudo migrar el perfil legacy:', error instanceof Error ? error.message : error);
    return result('deferred');
  }
}
