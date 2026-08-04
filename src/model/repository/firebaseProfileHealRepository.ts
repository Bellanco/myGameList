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
//  4. Perfil que vive bajo un id ajeno (señal `foreign-doc-id`): la PRIMERA MITAD del cutover de identidad, que es
//     crear el documento canónico `profiles/{uid}`. Ver `startIdentityCutover`. La segunda mitad —retirar el
//     huérfano— es del panel, porque las reglas no dejan al dueño tocar un documento cuyo id no es su uid.
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
import { deleteField, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { FIRESTORE_SCHEMA_VERSION } from '../../core/constants/schema';
import { initializeFirebaseServices } from './firebaseClient';
import { reportHandledError } from './telemetryRepository';
import {
  backupGithubToken,
  getPrivateConfig,
  resolveStableProfileId,
  setPrivateConfig,
  setUserMap,
} from './firebaseRepository';
import {
  findSocialProfileByEmail,
  getOwnProfileRef,
  invalidateOwnProfileCache,
  invalidateProfileByEmailCache,
  invalidateSocialDirectoryCache,
} from './firebaseSocialRepository';

export type LegacyHealStatus =
  /** No había nada que sanear (caso normal: ningún perfil nuevo tiene restos). */
  | 'clean'
  /** Se preservó lo necesario y se puso al día el documento público. */
  | 'healed'
  /** Primera mitad del cutover: el perfil vivía bajo otro id y se ha creado el canónico `profiles/{uid}`. */
  | 'migrated'
  /** El perfil no vive en `profiles/{uid}` y no se ha podido crear el canónico (no hay legacy, o no tiene nick). */
  | 'foreign-doc'
  /** No se pudo completar (sin Firebase, sin sesión útil, o falló el respaldo): se reintentará. */
  | 'deferred';

/**
 * En qué paso se quedó un saneado diferido. Sin esto, "no se pudo" era indistinguible de "no había nada que hacer"
 * salvo leyendo la consola del usuario: el paso concreto es lo que dice si hay que mirar las reglas, la red o el
 * cifrado, y es lo que viaja a la telemetría.
 */
export type LegacyHealDeferralStep =
  /** Llamada sin uid: no hay sesión útil. */
  | 'sin-sesion'
  /** Firebase no está configurado en este entorno. */
  | 'sin-firebase'
  /** Falló la lectura del perfil propio. */
  | 'lectura-perfil'
  /** Falló el respaldo CIFRADO del token en claro: no se purga nada (perdería el token). */
  | 'respaldo-token'
  /** Falló sembrar el id del gist de juegos en `privateConfig`. */
  | 'siembra-gist'
  /** Falló escribir la copia canónica del pseudónimo (`userMap` / `privateConfig`). */
  | 'identidad'
  /** Falló la primera mitad del cutover: crear `profiles/{uid}` a partir del perfil legacy. */
  | 'cutover-identidad'
  /** Falló la escritura del documento público (reglas, red). Lo preservado ya está a salvo. */
  | 'escritura-publica';

export interface LegacyHealResult {
  status: LegacyHealStatus;
  /** Paso en el que se quedó, solo cuando `status` es `deferred`. */
  deferredAt?: LegacyHealDeferralStep;
  /** Mensaje del error que lo dejó a medias, si lo hubo. Para la traza, no para la interfaz. */
  detail?: string;
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
 * Deja constancia de un saneado que no se pudo completar. Que sea silencioso PARA EL USUARIO (no lo ha pedido y no
 * puede hacer nada) no significa que deba serlo para nosotros: sin esta traza, un saneado que falla para todo el
 * mundo —una regla mal desplegada, por ejemplo— era indistinguible de uno que no hacía falta, y el único rastro era
 * la consola de un navegador ajeno.
 */
function deferral(step: LegacyHealDeferralStep, error?: unknown): LegacyHealResult {
  const detail = error === undefined ? '' : error instanceof Error ? error.message : String(error);
  console.warn(`[saneado] diferido en «${step}»${detail ? `: ${detail}` : ''}; se reintentará`);
  void reportHandledError(error ?? new Error(`profile-heal:${step}`), false, `profile-heal:${step}`);
  return result('deferred', { deferredAt: step, ...(detail ? { detail } : {}) });
}

/**
 * PRIMERA MITAD DEL CUTOVER DE IDENTIDAD (señal `foreign-doc-id` del panel).
 *
 * El perfil de este usuario es de una versión anterior y vive bajo un id que no es su uid, donde la app ya no lo
 * busca: `resolveOwnProfile` solo lo encuentra por el `email` publicado, y las reglas no le dejan escribir ahí
 * (`isOwner(docId)` es falso), así que su perfil está congelado. Lo que sí puede hacer su navegador es CREAR el
 * documento canónico `profiles/{uid}`, y a partir de ese momento todo —lectura, escritura y saneado— apunta al sitio
 * bueno. Retirar el huérfano es lo único que no puede: eso lo hace el administrador desde `/admin`.
 *
 * El documento nuevo nace LIMPIO: nada de `email`, ni ids de gist, ni el token en claro. Lo que había que rescatar
 * del huérfano se copia antes a `privateConfig` (owner-only, cifrado el token), que es donde debía estar desde el
 * principio. Ese orden importa: si el rescate falla, no se crea nada y se reintenta en el próximo arranque.
 *
 * No se hace nada si el perfil legacy no tiene nick: crear el canónico con el nombre vacío sería fabricar la anomalía
 * `no-display-name` (y caer al nombre real de Google o al correo está descartado por privacidad). Ese caso se queda
 * para el panel, que puede mover el documento tal cual.
 */
async function startIdentityCutover(
  firestore: import('firebase/firestore').Firestore,
  uid: string,
  email: string,
  known?: { id: string; displayName: string; photoURL: string; socialGistId: string; gamesGistId: string; githubToken: string; socialEnabled: boolean } | null,
): Promise<LegacyHealResult> {
  const legacy = known || (email ? await findSocialProfileByEmail(email) : null);
  if (!legacy || legacy.id === uid) {
    return result('foreign-doc');
  }

  if (!String(legacy.displayName || '').trim()) {
    console.warn('[saneado] perfil legacy sin nick: el cutover lo tiene que hacer el panel, no se crea uno sin nombre');
    return result('foreign-doc');
  }

  // ---- 1) RESCATAR a `privateConfig` lo que solo vive en el documento huérfano. ----
  const privateConfig = await getPrivateConfig(uid).catch(() => null);
  const legacyToken = String(legacy.githubToken || '').trim(); // audit-allow: LECTURA del token legacy del huérfano para cifrarlo en privateConfig antes de dejar de usar ese documento
  let backedUpToken = false;
  let seededGamesGistId = false;

  if (legacyToken && !privateConfig?.encryptedGithubToken) {
    await backupGithubToken(uid, legacyToken);
    backedUpToken = true;
  }

  // Los dos ids de gist del huérfano: el social es su canal (sin él no podría volver a publicar desde un
  // dispositivo nuevo) y el de juegos es el fallback de "Recuperar Gist ID". Solo se escribe lo que no esté ya.
  const rescuedIds: Record<string, string> = {};
  if (legacy.gamesGistId && !String(privateConfig?.gamesGistId || '').trim()) {
    rescuedIds.gamesGistId = legacy.gamesGistId;
    seededGamesGistId = true;
  }
  if (legacy.socialGistId && !String(privateConfig?.socialGistId || '').trim()) {
    rescuedIds.socialGistId = legacy.socialGistId;
  }
  if (Object.keys(rescuedIds).length > 0) {
    await setPrivateConfig(uid, rescuedIds); // audit-allow: destino owner-only (privateConfig), justo lo contrario de un canal público
  }

  // Identidad pseudónima, con su copia canónica antes que nada (mismo criterio que el saneado normal).
  const profileId = await resolveStableProfileId(uid);
  if (profileId) {
    await setUserMap(uid, profileId);
    if (String(privateConfig?.profileId || '').trim() !== profileId) {
      await setPrivateConfig(uid, { profileId });
    }
  }

  // ---- 2) CREAR el documento canónico. ----
  // `merge: true` por si apareciera entre la lectura y esta escritura (dos pestañas): nunca debe pisar lo que haya.
  // `tier` NO se escribe: las reglas prohíben al dueño estrenarse un rango, y el que tuviera el huérfano lo rescata
  // el panel al retirarlo. `createdAt` tampoco: no se lee del huérfano, y el panel conserva la más antigua.
  // `updatedAt` SÍ, y con la marca del servidor: el directorio ordena por ese campo y EXCLUYE de la consulta los
  // documentos que no lo traen, así que sin él el usuario desaparecería del descubrimiento. Además es cierto: acaba
  // de iniciar sesión.
  await setDoc(
    doc(firestore, 'profiles', uid),
    {
      schemaVersion: FIRESTORE_SCHEMA_VERSION,
      uid,
      ...(profileId ? { profileId } : {}),
      displayName: legacy.displayName,
      photoURL: legacy.photoURL,
      social: {
        enabled: legacy.socialEnabled,
        etag: null,
      },
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  // La referencia cacheada por correo apunta al huérfano: servirla ahora mandaría las escrituras al documento
  // equivocado durante lo que le quede de TTL.
  invalidateProfileByEmailCache(email);
  invalidateOwnProfileCache(uid);
  invalidateSocialDirectoryCache();

  console.warn(`[cutover] perfil legacy «${legacy.id}» copiado a profiles/${uid}: queda retirar el huérfano desde /admin`);

  return result('migrated', { backedUpToken, seededGamesGistId, establishedProfileId: Boolean(profileId), stampedSchema: true });
}

/**
 * Migra y pone al día el perfil público del usuario indicado. Idempotente y sin escrituras cuando no hay nada que
 * hacer (el caso de la inmensa mayoría): una sola lectura, además cacheada por `getOwnProfileRef`.
 *
 * Nunca lanza: cualquier fallo devuelve `deferred` —con el paso en el que se quedó— y deja el documento intacto.
 */
export async function healOwnLegacyProfile(uid: string, email = ''): Promise<LegacyHealResult> {
  // Los dos casos de ENTORNO (sin sesión, sin Firebase) no se reportan: son estados normales de la app, no fallos.
  if (!uid) {
    return result('deferred', { deferredAt: 'sin-sesion' });
  }

  // Paso en curso, para que el `catch` de abajo sepa QUÉ falló sin envolver cada línea en su propio try.
  let step: LegacyHealDeferralStep = 'lectura-perfil';
  try {
    const services = await initializeFirebaseServices();
    if (!services) {
      return result('deferred', { deferredAt: 'sin-firebase' });
    }

    const profile = await getOwnProfileRef(uid);
    // Sin documento en `profiles/{uid}`: o no tiene perfil social (nada que sanear) o su perfil es de una versión
    // anterior y vive bajo otro id. Lo segundo se arregla creando el documento canónico: es la primera mitad del
    // cutover de identidad, y la única que puede hacer el dueño (retirar el huérfano es cosa del panel).
    if (!profile) {
      step = 'cutover-identidad';
      return await startIdentityCutover(services.firestore, uid, email);
    }

    // La lectura de arriba está CACHEADA, y `ensureProfileByEmail` guarda en esa misma caché (indexada por uid) la
    // referencia de un perfil legacy que vive bajo OTRO id. Escribir entonces en `profiles/{uid}` fallaría
    // —`updateDoc` no crea documentos—, así que es el mismo caso de arriba detectado por otra vía: el cutover, con
    // la ventaja de que la referencia legacy ya está en la mano y no hay que volver a buscarla por correo.
    if (profile.id !== uid) {
      step = 'cutover-identidad';
      return await startIdentityCutover(services.firestore, uid, email, profile);
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
      step = 'respaldo-token';
      await backupGithubToken(uid, legacyToken);
      backedUpToken = true;
    }

    if (legacyGamesGistId && !String(privateConfig?.gamesGistId || '').trim()) {
      // Sin esto, borrar `social.gamesGistId` rompería el fallback de "Recuperar Gist ID" en un dispositivo nuevo.
      step = 'siembra-gist';
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
      step = 'identidad';
      const profileId = await resolveStableProfileId(uid);
      if (profileId) {
        await setUserMap(uid, profileId);
        // Si la configuración privada ya lo tiene (el caso de quien estableció su identidad pero cuyo documento
        // público es anterior a que se publicara el pseudónimo), no se reescribe: no hay nada que preservar.
        if (String(privateConfig?.profileId || '').trim() !== profileId) {
          // Solo el pseudónimo: `setPrivateConfig` hace merge, y mandar aquí los ids de gist (que este camino no
          // conoce) los borraría.
          await setPrivateConfig(uid, { profileId });
        }
        establishedProfileId = profileId;
      }
    }

    // ---- 2) ESCRIBIR el documento público: purga de restos + identidad + marca de esquema, en una sola operación. ----
    // `uid` va en la escritura a propósito: la regla `profileWriteIsValid` exige que `request.resource.data.uid`
    // sea el del autenticado, y hay perfiles tan viejos que no tienen ese campo. Escribirlo (con su mismo valor)
    // es lo que permite que la escritura pase la validación en esos documentos.
    // `updatedAt` NO se toca: es el latido de "última vez visto" y un saneado no es actividad del usuario.
    // `createdAt` tampoco se manda: las reglas la declaran inmutable y enviarla denegaría la escritura entera.
    step = 'escritura-publica';
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
    // Best-effort de verdad: el usuario no ha pedido esto y no puede hacer nada al respecto. Se reintenta solo, y
    // `deferredAt` deja dicho en qué paso se quedó (consola + telemetría) para que el fallo no sea invisible.
    return deferral(step, error);
  }
}
