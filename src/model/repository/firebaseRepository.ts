// Fachada del repositorio Firebase. El código se reparte en módulos cohesivos (M2):
//  - firebaseClient: init de servicios + config + analytics module + helpers de error + interfaces de dominio.
//  - telemetryRepository: reportHandledError / trackAnalyticsEvent / setAnalyticsUser / clearAnalyticsUser.
//  - firebaseAuthRepository: sign-in/out con Google + usuario actual.
//  - firebaseSocialRepository: directorio, índice público, recomendaciones (+ sus cachés).
// Este fichero conserva el NÚCLEO de perfil/identidad/token y RE-EXPORTA la API pública para que ningún
// consumidor cambie sus imports.
import { deleteField, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { decryptFromString, encryptToString } from '../../core/security/crypto';
import { getLocalMeta, patchLocalMeta, seedProfileIdFromRemote } from './indexedDbRepository';
import {
  initializeFirebaseServices,
  isPermissionDeniedError,
  type SocialAuthUser,
  type SocialProfileReference,
} from './firebaseClient';
import {
  findSocialProfileByEmail,
  getOwnProfileRef,
  invalidateOwnProfileCache,
  invalidateSocialDirectoryCache,
  peekOwnProfileTier,
  saveOwnProfileCache,
  invalidateProfileByEmailCache,
} from './firebaseSocialRepository';
import { DEFAULT_PROFILE_TIER } from '../../core/constants/tiers';
import { FIRESTORE_SCHEMA_VERSION } from '../../core/constants/schema';
import type { FirestorePrivateConfig, FirestorePublicConfig } from '../types/firestore';

// --- RE-EXPORTS: API pública estable (los consumidores siguen importando desde firebaseRepository) ---
export { enableAnalyticsAfterConsent, initializeFirebaseServices } from './firebaseClient';
export type {
  FirebaseServices,
  SocialAuthUser,
  SocialProfileReference,
  SocialDirectoryEntry,
} from './firebaseClient';
export { reportHandledError, trackAnalyticsEvent, setAnalyticsUser, clearAnalyticsUser } from './telemetryRepository';
export { getCurrentSocialAuthUser, onSocialAuthChanged, signInWithGoogle, signOutSocialUser } from './firebaseAuthRepository';
// C5: el índice público (upsertProfileIndex/upsertFeedCard) y las recomendaciones quedaron sin consumidores y
// con reglas admin-only (rotas en cliente). Código muerto eliminado; la migración a índice pseudónimo por
// profileId (con guarda recursiva de campos privados) queda registrada como tarea gated en CODE-REVIEW-IMPROVEMENTS.md.
export {
  findSocialProfileByEmail,
  getOwnProfileRef,
  invalidateOwnProfileCache,
  listSocialDirectory,
} from './firebaseSocialRepository';
// Amistad (aceptación mutua): un doc por par, id canónico, denormalización de identidad. Ver firebaseFriendshipRepository.
export {
  acceptFriendRequest,
  deleteFriendship,
  friendshipDocId,
  getMyFriendships,
  healOwnFriendshipIdentity,
  invalidateMyFriendshipsCache,
  readFriendship,
  sendFriendRequest,
  type FriendshipSelfInfo,
} from './firebaseFriendshipRepository';

// F6.3 (modernización): la marca de versión de esquema de los docs de Firestore vive en `core/constants/schema`,
// porque la comparten quien la SELLA (este módulo y el saneado del arranque) y quien detecta los documentos
// atrasados (el panel). Ver el comentario de la constante.

/**
 * Nombre PÚBLICO de un perfil, por orden de preferencia: el nick del perfil social, lo que ya hubiera publicado, y
 * como último recurso el nombre de la cuenta de Google.
 *
 * El CORREO no entra nunca, y es la única exclusión que importa: es el dato que el usuario no ha elegido mostrar.
 * El nombre de Google sí, porque es un nombre —coincidir con él es lo normal, no un accidente— y porque la
 * alternativa era peor: abortar el guardado o crear un perfil sin nombre, que es la anomalía `no-display-name` del
 * panel (un perfil que sus amigos no pueden identificar). Se prefiere un nombre razonable a un error evitable.
 */
function resolvePublicName(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const clean = String(candidate || '').trim();
    if (clean) {
      return clean;
    }
  }
  return '';
}

/**
 * L1 — Resuelve el perfil PROPIO: lectura directa de `profiles/{uid}` y, solo si ahí no hay documento, fallback a
 * la búsqueda legacy por email (perfiles antiguos cuyo id no es el uid). Es el único punto donde vive esa cadena,
 * para que ningún consumidor tenga que conocer el detalle ni pedir el correo si no hace falta.
 */
export async function resolveOwnProfile(user: { uid: string; email?: string }): Promise<SocialProfileReference | null> {
  const uid = String(user.uid || '').trim();
  const email = String(user.email || '').trim().toLowerCase();

  if (uid) {
    const own = await getOwnProfileRef(uid);
    if (own) {
      return own;
    }
  }

  return email ? findSocialProfileByEmail(email) : null;
}

/**
 * Guarda referencia mínima de perfil en Firestore.
 * No lee ni elimina documentos de placeholder en colecciones sociales.
 */
export async function upsertProfileSocialReferences(input: {
  user: SocialAuthUser;
  socialGistId: string;
  gamesGistId?: string;
  githubToken?: string;
  socialGistEtag: string | null;
  preferredName?: string;
}): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  // PRIVACIDAD: el nick es el del perfil social y, si no llega, el nombre de la cuenta de Google. El CORREO nunca:
  // es el único de los tres que el usuario no ha elegido mostrar y que no querría ver publicado. Que el nick
  // coincida con el nombre de Google es perfectamente normal (mucha gente se pone el suyo).
  const profileName = resolvePublicName(input.preferredName, input.user.displayName);
  if (!profileName) {
    throw new Error('No se puede publicar un perfil social sin nombre público');
  }
  const profileId = await resolveStableProfileId(input.user.uid);
  const gamesGistId = String(input.gamesGistId || '');

  // ST11: el token se cifra ANTES de construir el batch (paso async). Si el cifrado falla, se guarda el resto
  // sin token (best-effort) en vez de romper todo el guardado social.
  let encryptedGithubToken: string | null = null;
  if (input.githubToken) {
    try {
      encryptedGithubToken = await encryptToString(input.githubToken, input.user.uid);
    } catch (error) {
      console.warn('[firebase] No se pudo cifrar el token:', error instanceof Error ? error.message : error);
    }
  }

  // ST11: una sola escritura ATÓMICA (1 RTT) agrupa profiles + privateConfig + userMap. Antes eran hasta 5 setDoc
  // secuenciales (perfil, backup token, borrado token legacy, userMap, ids). Una operación por documento (sin dobles
  // escrituras al mismo doc): el borrado del token legacy y las referencias van fusionados en sus respectivos set/merge.
  const batch = writeBatch(services.firestore);

  // L1: el doc público NO lleva `email` ni `social.gamesGistId` (los lee cualquier usuario autenticado). El email
  // ya no se necesita para nada (el perfil propio se resuelve por uid) y el gist de juegos vive en `privateConfig`
  // (abajo, en el mismo batch) y en el doc de amistad. `deleteField()` los purga de los perfiles ya existentes.
  batch.set(
    doc(services.firestore, 'profiles', input.user.uid),
    {
      schemaVersion: FIRESTORE_SCHEMA_VERSION,
      uid: input.user.uid,
      profileId,
      email: deleteField(),
      displayName: profileName,
      photoURL: input.user.photoURL,
      social: {
        // El id del canal social YA NO se publica: lo lee cualquier usuario autenticado, y con él se puede leer
        // el gist entero (un gist secreto no es privado). Vive en `privateConfig` (owner-only, abajo en este mismo
        // batch) para su dueño, y denormalizado en los documentos de amistad para sus amistades, que son los
        // únicos que necesitan leerlo. `deleteField()` lo purga de los perfiles que ya lo llevaban.
        gistId: deleteField(),
        gamesGistId: deleteField(),
        etag: input.socialGistEtag,
        enabled: true,
        // Upgrade proactivo: al respaldar el token CIFRADO, borra el token en claro LEGACY del doc público.
        ...(encryptedGithubToken ? { githubToken: deleteField() } : {}), // audit-allow: deleteField() ELIMINA el token legacy, no lo almacena
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  // B1/B2: privateConfig agrupa ids + token cifrado en una sola escritura (antes dos setDoc).
  batch.set(
    doc(services.firestore, 'privateConfig', input.user.uid),
    {
      schemaVersion: FIRESTORE_SCHEMA_VERSION,
      profileId,
      gamesGistId,
      socialGistId: input.socialGistId,
      ...(encryptedGithubToken ? { encryptedGithubToken } : {}),
    },
    { merge: true },
  );

  // userMap: mapa privado uid→profileId.
  batch.set(
    doc(services.firestore, 'userMap', input.user.uid),
    { profileId, schemaVersion: FIRESTORE_SCHEMA_VERSION },
    { merge: true },
  );

  await batch.commit();

  saveOwnProfileCache(input.user.uid, {
    id: input.user.uid,
    profileId,
    // El documento se acaba de escribir con la versión vigente: sin esto, el saneado del arranque leería la caché,
    // vería 0 y volvería a sellar un perfil que ya está al día.
    schemaVersion: FIRESTORE_SCHEMA_VERSION,
    email: '', // ya no vive en el documento
    displayName: profileName,
    photoURL: String(input.user.photoURL || ''),
    socialGistId: input.socialGistId,
    gamesGistId: String(input.gamesGistId || ''),
    // El rango no lo escribe este camino (lo asigna el admin): se conserva el que ya se conocía en vez de
    // sembrar bronce, que degradaría a un usuario de rango alto mientras viva la caché.
    tier: peekOwnProfileTier(input.user.uid),
    githubToken: String(input.githubToken || ''), // audit-allow: caché en MEMORIA (no Firestore); el token va cifrado a privateConfig
    socialEnabled: true,
  });
}

// ---------------------------------------------------------------------------
// privateConfig/{uid} — solo lectura/escritura del dueño (ver firestore.rules destino).
// Guarda ids de gist/chunks y el token de GitHub CIFRADO (recuperación tras reinstalar).
// ---------------------------------------------------------------------------

export async function getPrivateConfig(uid: string): Promise<FirestorePrivateConfig | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  const snap = await getDoc(doc(services.firestore, 'privateConfig', uid));
  return snap.exists() ? (snap.data() as FirestorePrivateConfig) : null;
}

export async function setPrivateConfig(uid: string, config: Partial<FirestorePrivateConfig>): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  await setDoc(doc(services.firestore, 'privateConfig', uid), { ...config, schemaVersion: FIRESTORE_SCHEMA_VERSION }, { merge: true });
}

// ---------------------------------------------------------------------------
// publicConfig/{uid} — preferencias NO sensibles del dueño (F2), owner-only (ver firestore.rules).
// Separada de privateConfig para diferenciarla. Hoy solo la escala de puntuación (estrellas/nota).
// ---------------------------------------------------------------------------

export async function getPublicConfig(uid: string): Promise<FirestorePublicConfig | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  const snap = await getDoc(doc(services.firestore, 'publicConfig', uid));
  return snap.exists() ? (snap.data() as FirestorePublicConfig) : null;
}

export async function setPublicConfig(uid: string, config: Partial<FirestorePublicConfig>): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  await setDoc(doc(services.firestore, 'publicConfig', uid), { ...config, schemaVersion: FIRESTORE_SCHEMA_VERSION }, { merge: true });
}

/**
 * Cifra el token de GitHub con una clave derivada del `uid` (estable entre dispositivos) y lo guarda
 * en `privateConfig`. Firestore nunca ve el token en claro.
 * Nota de seguridad: la protección efectiva es la regla owner-only de `privateConfig`; el uid no es
 * un secreto de alta entropía, así que no sustituye a dicha regla.
 */
export async function backupGithubToken(uid: string, token: string): Promise<void> {
  if (!uid || !token) return;
  const encryptedGithubToken = await encryptToString(token, uid);
  await setPrivateConfig(uid, { encryptedGithubToken });
}

/**
 * Recupera y descifra el token de GitHub desde `privateConfig` (tras login con Google).
 * Resiliente: si la lectura de `privateConfig` está denegada por reglas (permission-denied) o el
 * descifrado falla, devuelve null para que el flujo caiga al fallback legacy en vez de romperse.
 */
export async function recoverGithubToken(uid: string): Promise<string | null> {
  try {
    const cfg = await getPrivateConfig(uid);
    if (!cfg?.encryptedGithubToken) return null;
    return await decryptFromString(cfg.encryptedGithubToken, uid);
  } catch {
    return null;
  }
}

/** userMap/{uid} → { profileId }. Mapa privado uid→profileId (reglas: nunca legible por clientes). */
export async function setUserMap(uid: string, profileId: string): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');
  await setDoc(doc(services.firestore, 'userMap', uid), { profileId, schemaVersion: FIRESTORE_SCHEMA_VERSION }, { merge: true });
}

/**
 * B2: establece la identidad pseudónima al activar lo social — genera/recupera `profileId`,
 * escribe `userMap/{uid}` y guarda los ids en `privateConfig` (merge, conserva el token cifrado).
 * Best-effort: no rompe el guardado social si falla.
 */
export async function establishProfileIdentity(uid: string, profileId: string, gamesGistId: string, socialGistId: string): Promise<void> {
  try {
    await setUserMap(uid, profileId);
    // Los ids VACÍOS no se escriben. `setPrivateConfig` hace merge, así que mandar `gamesGistId: ''` no es "no
    // tocarlo": lo BORRA. Guardar el perfil social desde un dispositivo sin la sincronización principal
    // configurada dejaba a cero el id del gist de juegos guardado, y con él la recuperación en otros
    // dispositivos. Solo se escribe lo que de verdad se conoce.
    await setPrivateConfig(uid, {
      profileId,
      ...(gamesGistId ? { gamesGistId } : {}),
      ...(socialGistId ? { socialGistId } : {}),
    });
  } catch (error) {
    console.warn('[firebase] No se pudo establecer profileId/userMap:', error instanceof Error ? error.message : error);
  }
}

/** Lee `userMap/{uid}.profileId` (owner-only). Resiliente: cualquier fallo/ausencia → null. */
export async function getUserMapProfileId(uid: string): Promise<string | null> {
  try {
    const services = await initializeFirebaseServices();
    if (!services || !uid) return null;
    const snap = await getDoc(doc(services.firestore, 'userMap', uid));
    if (!snap.exists()) return null;
    const pid = String((snap.data() as { profileId?: string }).profileId || '').trim();
    return pid || null;
  } catch {
    return null;
  }
}

/**
 * 6.2a — Recupera el `profileId` canónico desde Firestore: primero `privateConfig/{uid}` (donde lo
 * deja `establishProfileIdentity`), con fallback a `userMap/{uid}`. Resiliente: permission-denied / offline
 * / ausencia → null para que el llamador caiga al comportamiento local.
 */
export async function recoverRemoteProfileId(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const cfg = await getPrivateConfig(uid);
    const pid = String(cfg?.profileId || '').trim();
    if (pid) return pid;
  } catch {
    // sigue al fallback de userMap
  }
  return getUserMapProfileId(uid);
}

/**
 * 6.2a — Resuelve el `profileId` a usar para las escrituras sociales. Reconcilia con el remoto canónico
 * ANTES de generar uno local nuevo, de modo que todos los dispositivos del mismo usuario converjan al mismo
 * pseudónimo. Si no hay remoto (primer dispositivo) o Firestore no responde, cae al `profileId` local.
 */
export async function resolveStableProfileId(uid: string): Promise<string> {
  const remote = await recoverRemoteProfileId(uid);
  return seedProfileIdFromRemote(remote);
}

/**
 * Garantiza que exista perfil por correo con correo, nombre y gist id.
 */
export async function ensureProfileByEmail(input: {
  user: SocialAuthUser;
  socialGistId: string;
  gamesGistId?: string;
  githubToken?: string;
  socialGistEtag: string | null;
  preferredName?: string;
  // Foto a publicar en el doc público (la lee el directorio). '' la borra (opt-out de foto). Si se omite,
  // se conserva la de la sesión de Google (compatibilidad).
  photoURL?: string;
}): Promise<SocialProfileReference> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const cleanEmail = input.user.email.trim().toLowerCase();
  if (!cleanEmail) {
    throw new Error('La cuenta de Google no tiene email válido');
  }

  // L1: el perfil propio se resuelve por uid (lectura directa del doc, sin publicar el email). La búsqueda por
  // correo queda SOLO como fallback para perfiles legacy cuyo id de documento no es el uid: sin ella se les crearía
  // un perfil duplicado.
  let existing: SocialProfileReference | null = null;
  try {
    existing = await resolveOwnProfile({ uid: input.user.uid, email: cleanEmail });
  } catch (error) {
    if (!isPermissionDeniedError(error)) {
      throw error;
    }
  }

  // PRIVACIDAD: el displayName público es el NICK del perfil social (`preferredName`); si no llega, lo que ya
  // hubiera publicado, y en último término el nombre de la cuenta de Google. El CORREO nunca (ver `resolvePublicName`).
  const profileName = resolvePublicName(input.preferredName, existing?.displayName, input.user.displayName);
  // Un perfil NUEVO sin ningún nombre no se crea: sería la anomalía `no-display-name` del panel, un perfil que sus
  // amigos no pueden identificar. Con el respaldo de arriba esto solo salta si la cuenta de Google tampoco tiene
  // nombre, que es un caso de verdad excepcional. Si el perfil YA existe se respeta lo que tenga.
  if (!existing && !profileName) {
    throw new Error('No se puede crear un perfil social sin nombre público');
  }
  // EL DESTINO ES SIEMPRE `profiles/{uid}`. Cuando el perfil resuelto vive bajo otro id (legacy), escribir ALLÍ es
  // imposible: las reglas atan la escritura a `isOwner(docId)`, así que el guardado se denegaría entero y ese usuario
  // se quedaría sin poder tocar su perfil. Lo que se hace es crear el canónico llevándose su nick —el cutover de
  // identidad, que aquí ocurre de paso— y dejar el huérfano para que lo retire el panel.
  const isForeignDoc = Boolean(existing && existing.id !== input.user.uid);
  const targetId = input.user.uid;
  const gamesGistId = String(input.gamesGistId || '');
  const githubToken = String(input.githubToken || '');
  const resolvedPhotoURL = input.photoURL !== undefined ? input.photoURL : String(input.user.photoURL || '');
  const profileId = await resolveStableProfileId(input.user.uid);
  // Se escribe en el documento propio, así que purgar sus restos es seguro: lo que arrastre el huérfano no se toca
  // desde aquí (no se puede), lo retira el panel.
  const canPurgeLegacyFields = true;
  // `social.gistId` cuenta como resto legacy por purgar, NO como dato a comparar con el de la sesión: el doc ya no
  // lo publica, así que `existing.socialGistId !== input.socialGistId` daba SIEMPRE distinto (vacío contra el id
  // real) y el perfil se reescribía en cada apertura —una escritura de Firestore por usuario y sesión, con su
  // `updatedAt` movido, que dejaba el chequeo de cambios sin efecto—. Tratándolo así se reescribe UNA vez, para
  // purgarlo, y a partir de ahí el chequeo vuelve a distinguir de verdad si algo cambió.
  const hasLegacyPii = Boolean(existing && !isForeignDoc && (existing.email || existing.gamesGistId || existing.socialGistId));
  const shouldWriteProfile =
    !existing ||
    !existing.socialEnabled ||
    // Perfil que vive bajo otro id: hay que crear el canónico, pase lo que pase con el resto de comparaciones.
    isForeignDoc ||
    existing.displayName.trim() !== profileName ||
    (existing.photoURL || '') !== resolvedPhotoURL ||
    // Perfil anterior a la purga: se reescribe una vez para retirarle el email / los ids de gist.
    (canPurgeLegacyFields && hasLegacyPii);

  // B2 — PRIMERO se guardan los ids en `privateConfig`/`userMap`, y solo DESPUÉS se purgan del perfil público.
  // El orden importa: la escritura de abajo borra `social.gistId` y `social.gamesGistId` del documento público, y
  // este guardado es best-effort (se traga sus errores). Con el orden inverso, un fallo de red entre ambos dejaba
  // al usuario purgado y SIN guardar: ni podía recuperar su canal social ni su gist de juegos en otro
  // dispositivo. Guardando antes, el peor caso es tener el dato en los dos sitios, que es inofensivo.
  await establishProfileIdentity(input.user.uid, profileId, gamesGistId, input.socialGistId);

  if (shouldWriteProfile) {
    await setDoc(
      doc(services.firestore, 'profiles', targetId),
      {
        schemaVersion: FIRESTORE_SCHEMA_VERSION,
        uid: input.user.uid,
        profileId,
        displayName: profileName,
        photoURL: resolvedPhotoURL,
        social: {
          // Ver la nota de `upsertProfileSocialReferences`: el id del canal deja de publicarse y se purga de los
          // perfiles existentes. Sus amistades lo tienen denormalizado; su dueño, en `privateConfig`.
          gistId: deleteField(),
          etag: input.socialGistEtag,
          enabled: true,
          ...(canPurgeLegacyFields ? { gamesGistId: deleteField() } : {}),
        },
        updatedAt: serverTimestamp(),
        // FECHA DE ALTA: se sella SOLO al CREAR el documento —o sea cuando no había perfil, y también cuando el que
        // hay vive bajo otro id, porque el canónico nace aquí—. En las reescrituras posteriores no se envía a
        // propósito: las reglas la declaran inmutable, así que mandar un `serverTimestamp()` nuevo haría que la
        // escritura se denegase por completo. La antigüedad real del huérfano la rescata el panel al retirarlo.
        ...(existing && !isForeignDoc ? {} : { createdAt: serverTimestamp() }),
        ...(canPurgeLegacyFields ? { email: deleteField() } : {}),
      },
      { merge: true },
    );
  } else {
    // El perfil no cambia, pero publicar ES actividad y `updatedAt` es lo que la mide: con él parado, el amigo que
    // publica desde la ficha del juego sin abrir nunca el espacio social (el latido del hub no le llega) cruzaría
    // el corte de inactividad de 30 días y los demás dejarían de leer su gist — sus reseñas y publicaciones
    // desaparecerían de sus feeds mientras él las sigue publicando. Acotado a una escritura al día, así que no
    // reintroduce la reescritura por publicación que este chequeo evita.
    await touchOwnProfileActivityThrottled(input.user.uid);
  }

  // B1: respaldo CIFRADO del token en privateConfig; nunca en claro en `profiles`.
  if (githubToken) {
    try {
      await backupGithubToken(input.user.uid, githubToken);
      // Upgrade proactivo: una vez respaldado cifrado, borrar el token en claro LEGACY que perfiles viejos
      // aún conservan en `profiles.social.githubToken` (merge no lo elimina; deleteField sí).
      await setDoc(
        doc(services.firestore, 'profiles', targetId),
        { social: { githubToken: deleteField() } }, // audit-allow: deleteField() ELIMINA el token en claro legacy, no lo almacena
        { merge: true },
      );
    } catch (error) {
      console.warn('[firebase] No se pudo respaldar/limpiar el token:', error instanceof Error ? error.message : error);
    }
  }

  const written: SocialProfileReference = {
    id: targetId,
    profileId,
    // Solo se sella si de verdad se ha reescrito el documento. Cuando el perfil no cambia no se toca su
    // `schemaVersion`, y decir aquí que está al día le taparía el saneado del arranque durante la vida de la caché.
    schemaVersion: shouldWriteProfile ? FIRESTORE_SCHEMA_VERSION : Number(existing?.schemaVersion || 0),
    // El documento ya no lo guarda; la referencia en memoria tampoco necesita arrastrarlo.
    email: '',
    displayName: profileName,
    photoURL: resolvedPhotoURL,
    socialGistId: input.socialGistId,
    gamesGistId,
    // Este guardado no toca el rango: se conserva el del perfil que se acaba de resolver.
    tier: existing?.tier ?? DEFAULT_PROFILE_TIER,
    githubToken,
    socialEnabled: true,
  };
  saveOwnProfileCache(input.user.uid, written);
  // Si el perfil venía de un documento con otro id, la referencia cacheada por correo apunta al huérfano y ya no
  // vale: el canónico acaba de nacer y es el que manda. Olvidarla evita que la siguiente resolución vuelva a
  // proponer el documento en el que este cliente no puede escribir.
  if (isForeignDoc) {
    invalidateProfileByEmailCache(cleanEmail);
  }
  invalidateSocialDirectoryCache();

  return written;
}

/**
 * Actualización ligera de la foto del doc público de perfil (la lee el directorio social). Cumple las reglas:
 * incluye `uid` y solo toca `photoURL`. `''` borra la foto (opt-out). El doc del dueño vive en `profiles/{uid}`.
 * Best-effort: no lanza si Firebase no está configurado.
 */
export async function updateProfilePhoto(uid: string, photoURL: string): Promise<void> {
  if (!uid) return;
  const services = await initializeFirebaseServices();
  if (!services) return;
  await setDoc(
    doc(services.firestore, 'profiles', uid),
    // `updatedAt` es obligatorio de facto: el directorio ordena por él y un doc sin el campo NO saldría en la
    // consulta. Este merge puede crear el doc si aún no existía, así que lo estampa también aquí.
    { uid, photoURL: photoURL || '', updatedAt: serverTimestamp() },
    { merge: true },
  );
  invalidateOwnProfileCache(uid);
  invalidateSocialDirectoryCache();
}

/**
 * Latido de "uso reciente": refresca `profiles/{uid}.updatedAt`. El directorio social ordena por ese campo, de
 * modo que se muestran (y se leen) los perfiles de quien de verdad sigue usando la app en vez de los primeros
 * por uid. Publicar una reseña o un post ya lo refresca vía `ensureProfileByEmail`; esto cubre al usuario que
 * entra a mirar sin publicar nada.
 *
 * Reutiliza `updatedAt` a propósito y no añade un campo nuevo: ya está en TODOS los docs (un `orderBy` sobre un
 * campo ausente excluiría de la consulta a todos los usuarios existentes hasta que reabrieran la app) y la
 * allowlist de las reglas ya lo admite junto a `uid`, así que no hace falta desplegar reglas.
 *
 * PRIVACIDAD: convierte `updatedAt` en un "última vez visto" legible por los usuarios autenticados que ven tu
 * perfil. El llamador debe acotarlo (una vez al día por dispositivo) para que el grano sea diario y no un
 * indicador de presencia. Best-effort: no lanza.
 */
export async function touchOwnProfileActivity(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const services = await initializeFirebaseServices();
    if (!services) return;
    const ref = doc(services.firestore, 'profiles', uid);
    const snap = await getDoc(ref);
    // Sin doc no se crea nada: un perfil a medias (sin `social`) no debe aparecer en el directorio. Se creará
    // al publicar el perfil.
    if (!snap.exists()) return;
    await setDoc(ref, { uid, updatedAt: serverTimestamp() }, { merge: true });
  } catch {
    // best-effort: la recencia es una mejora de orden, no puede romper la apertura del hub.
  }
}

/**
 * Retira del perfil PÚBLICO los ids de gist que aún publique, y solo esos campos.
 *
 * Hace falta aparte de `ensureProfileByEmail` porque esa función únicamente corre al PUBLICAR (reseña, publicación
 * o guardado del perfil). Quien migró su canal a secreto y desde entonces solo ha entrado a mirar se quedaba
 * anunciando en su perfil un gist que la propia migración había borrado: sus amigos lo leían igual —la hidratación
 * fusiona candidatos y tolera un 404—, pero gastaban una petición muerta cada vez y el panel lo marcaba como
 * deriva para siempre. Llamada al abrir el espacio social, se resuelve sola en la primera visita.
 *
 * SEGURIDAD: no sella nada, EXIGE que ya esté sellado. Solo retira el campo cuyo id ya consta en `privateConfig`
 * (owner-only), que es de donde se recupera el canal en otro dispositivo. Comprobarlo en vez de escribirlo evita
 * dos daños: purgar un `gamesGistId` sin respaldo desde un equipo sin la sincronización principal configurada, y
 * pisar en `privateConfig` —la fuente de verdad de la cuenta— el canal que otro dispositivo acabe de migrar.
 *
 * Barata e idempotente: si el perfil ya no publica nada, no escribe. Best-effort: no lanza.
 */
export async function purgeOwnPublicGistIds(input: {
  uid: string;
  socialGistId: string;
  gamesGistId: string;
}): Promise<boolean> {
  const uid = String(input.uid || '').trim();
  if (!uid) return false;
  try {
    const services = await initializeFirebaseServices();
    if (!services) return false;
    const ref = doc(services.firestore, 'profiles', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;

    const social = ((snap.data() as { social?: Record<string, unknown> })?.social || {}) as Record<string, unknown>;
    if (!social.gistId && !social.gamesGistId) return false;

    const saved = await getPrivateConfig(uid);
    const savedSocial = String(saved?.socialGistId || '').trim();
    const savedGames = String(saved?.gamesGistId || '').trim();
    // El id social se retira solo si el respaldo coincide con el canal de esta sesión: si difieren, otro
    // dispositivo migró y aquí no se sabe cuál manda, así que no se toca nada.
    const purgeSocial = Boolean(social.gistId) && Boolean(savedSocial) && savedSocial === String(input.socialGistId || '').trim();
    const purgeGames = Boolean(social.gamesGistId) && Boolean(savedGames);
    if (!purgeSocial && !purgeGames) return false;

    await setDoc(
      ref,
      {
        uid,
        social: {
          ...(purgeSocial ? { gistId: deleteField() } : {}),
          ...(purgeGames ? { gamesGistId: deleteField() } : {}),
        },
      },
      { merge: true },
    );
    invalidateOwnProfileCache(uid);
    invalidateSocialDirectoryCache();
    return true;
  } catch {
    return false;
  }
}

/** Cada cuánto, como mucho, se refresca la recencia desde un mismo dispositivo: una escritura al día. */
export const PROFILE_TOUCH_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

/**
 * `touchOwnProfileActivity` con el acotado que exige su contrato: una vez cada 20 h por dispositivo. Es el único
 * sitio donde vive ese intervalo, para que el latido del hub y el de la publicación no puedan separarse.
 *
 * Best-effort de principio a fin: si IndexedDB no responde, no se refresca la recencia y no pasa nada más.
 */
export async function touchOwnProfileActivityThrottled(uid: string): Promise<void> {
  if (!uid) return;
  try {
    const meta = await getLocalMeta();
    const last = Number(meta?.profileTouchedAt || 0);
    if (last && Date.now() - last < PROFILE_TOUCH_MIN_INTERVAL_MS) return;
    await touchOwnProfileActivity(uid);
    await patchLocalMeta({ profileTouchedAt: Date.now() });
  } catch {
    /* best-effort: la recencia es orden, no funcionalidad. */
  }
}

