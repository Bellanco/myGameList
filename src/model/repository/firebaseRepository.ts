// Fachada del repositorio Firebase. El código se reparte en módulos cohesivos (M2):
//  - firebaseClient: init de servicios + config + analytics module + helpers de error + interfaces de dominio.
//  - telemetryRepository: reportHandledError / trackAnalyticsEvent / setAnalyticsUser / clearAnalyticsUser.
//  - firebaseAuthRepository: sign-in/out con Google + usuario actual.
//  - firebaseSocialRepository: directorio, índice público, recomendaciones (+ sus cachés).
// Este fichero conserva el NÚCLEO de perfil/identidad/token y RE-EXPORTA la API pública para que ningún
// consumidor cambie sus imports.
import { deleteField, doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { decryptFromString, encryptToString } from '../../core/security/crypto';
import { seedProfileIdFromRemote } from './indexedDbRepository';
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
  saveProfileByEmailCache,
} from './firebaseSocialRepository';
import { DEFAULT_PROFILE_TIER } from '../../core/constants/tiers';
import { pickLiveSocialGist } from '../../core/social/gistArbitration';
import { probeSocialGistEvidence } from './gistRepository';
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

// F6.3 (modernización): marca de versión de esquema en los docs de Firestore (profiles/userMap/privateConfig).
// Aditiva — las reglas no validan un conjunto exacto de campos, así que no requiere redesplegar reglas. Permite a
// futuras migraciones detectar la versión del documento.
const FIRESTORE_SCHEMA_VERSION = 1;

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

  const profileName = (input.preferredName || input.user.displayName || input.user.email || '').trim();
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
    await setPrivateConfig(uid, { profileId, gamesGistId, socialGistId });
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

  // PRIVACIDAD: el displayName público es el NICK del perfil social (`preferredName`); si no llega, se PRESERVA el
  // existente (que ya era el nick). NUNCA se cae al nombre real de Google (`input.user.displayName`) ni al email.
  const profileName = (input.preferredName || existing?.displayName || '').trim();
  const targetId = existing?.id || input.user.uid;
  const gamesGistId = String(input.gamesGistId || '');
  const githubToken = String(input.githubToken || '');
  const resolvedPhotoURL = input.photoURL !== undefined ? input.photoURL : String(input.user.photoURL || '');
  const profileId = await resolveStableProfileId(input.user.uid);
  // El doc del dueño se identifica por su uid: solo ahí se puede purgar sin riesgo. Sobre un doc legacy con otro id
  // no se borra nada (se migrará antes en el barrido), porque su `email` es la única forma de volver a encontrarlo.
  const canPurgeLegacyFields = targetId === input.user.uid;
  const hasLegacyPii = Boolean(existing && (existing.email || existing.gamesGistId));
  const shouldWriteProfile =
    !existing ||
    !existing.socialEnabled ||
    existing.id !== targetId ||
    existing.id !== input.user.uid ||
    existing.displayName.trim() !== profileName ||
    (existing.photoURL || '') !== resolvedPhotoURL ||
    existing.socialGistId !== input.socialGistId ||
    // Perfil anterior a la purga: se reescribe una vez para retirarle el email / el id del gist de juegos.
    (canPurgeLegacyFields && hasLegacyPii);

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
        // FECHA DE ALTA: se sella SOLO al crear el perfil (`!existing`). En las reescrituras posteriores no se
        // envía a propósito — las reglas la declaran inmutable, así que mandar un `serverTimestamp()` nuevo haría
        // que la escritura se denegase por completo. Los perfiles anteriores a este cambio se quedan sin ella; el
        // panel de administración lo suple con la fecha de su amistad más antigua, marcada como estimada.
        ...(existing ? {} : { createdAt: serverTimestamp() }),
        ...(canPurgeLegacyFields ? { email: deleteField() } : {}),
      },
      { merge: true },
    );
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

  // B2: establecer profileId/userMap/privateConfig.
  await establishProfileIdentity(input.user.uid, profileId, gamesGistId, input.socialGistId);

  const written: SocialProfileReference = {
    id: targetId,
    profileId,
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
  // La caché legacy por email se refresca solo si el perfil vive en un doc con otro id (ahí sigue siendo la vía de
  // resolución hasta que el barrido lo migre).
  if (!canPurgeLegacyFields) {
    saveProfileByEmailCache(cleanEmail, written);
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
 * Resultado del saneado del canal social. Dos desenlaces distintos, y el segundo no puede resolverse aquí:
 *
 *  - `healed`: se corrigió el documento del directorio, que apuntaba a un gist que ya no es el vivo.
 *  - `adoptGistId`: el gist vivo NO es el de este dispositivo. Solo el llamador puede arreglarlo, porque implica
 *    reescribir la configuración local de sync (que vive en el navegador, no en Firestore). Si no lo adopta, el
 *    usuario seguiría publicando en el gist perdedor y volvería a divergir en el siguiente guardado.
 */
export interface GistHealResult {
  healed: boolean;
  /** Gist que el llamador debe adoptar como suyo, o '' si no hay nada que adoptar. */
  adoptGistId: string;
}

const NO_HEAL: GistHealResult = { healed: false, adoptGistId: '' };

/**
 * Auto-heal del directorio: sincroniza `profiles/{uid}.social.gistId` con el gist social ACTUAL del dueño (el de su
 * sesión). El doc del directorio solo se reescribe al re-publicar el perfil, así que puede quedar anclado a un gist
 * viejo si el usuario cambió de gist social sin volver a publicar → el feed de sus amigos leería un gist obsoleto.
 * Este heal (best-effort, análogo a `healOwnFriendshipIdentity`) lo corrige sin intervención del usuario. Escribe
 * SOLO si de verdad diverge (evita writes/invalidaciones de caché en cada apertura). Merge de `social` → preserva
 * `gamesGistId`/`enabled`/etc. Devuelve true si aplicó una corrección.
 */
export async function healOwnDirectoryGist(
  uid: string,
  socialGistId: string,
  socialGistEtag: string | null = null,
): Promise<GistHealResult> {
  if (!uid || !socialGistId) return NO_HEAL;
  const services = await initializeFirebaseServices();
  if (!services) return NO_HEAL;
  const ref = doc(services.firestore, 'profiles', uid);
  const snap = await getDoc(ref);
  // Sin doc → nada que sanear (se creará al publicar el perfil). Ya coincide → no se escribe.
  if (!snap.exists()) return NO_HEAL;
  const data = snap.data() as { social?: { gistId?: string } };
  const publishedGistId = String(data.social?.gistId || '');
  if (publishedGistId === socialGistId) return NO_HEAL;

  // DIVERGEN. Antes se escribía el de la sesión sin más, y eso hacía que ganara el ÚLTIMO dispositivo en abrir:
  // uno antiguo con la configuración obsoleta reimponía su gist y devolvía al usuario a la deriva (sus reseñas
  // nuevas dejaban de verse). Ahora se arbitra con evidencia y se escribe el ganador, que puede ser el que ya
  // estaba publicado. Mismo árbitro que usa el panel de administración, para que los dos converjan al mismo id
  // en vez de reescribirse mutuamente.
  //
  // El coste de red solo se paga en este caso raro: si los ids coinciden, la función ya ha salido arriba.
  if (publishedGistId) {
    const verdict = pickLiveSocialGist(await Promise.all([socialGistId, publishedGistId].map(probeSocialGistEvidence)));
    // `sin-evidencia` (sin red, o rate-limit anónimo agotado) NO es un veredicto: se conserva el comportamiento de
    // siempre y manda el gist de la sesión, que es la única verdad de la que dispone este dispositivo.
    if (verdict.reason !== 'sin-evidencia') {
      // Sin ganador (ninguno legible sin autenticación) no se toca nada: mejor la deriva que apuntar a los amigos
      // a un gist que no pueden leer. `updateGistPrivacy` lo volverá público en el siguiente guardado.
      if (!verdict.winner) return NO_HEAL;
      // GANA EL PUBLICADO: este dispositivo es el que está equivocado. No basta con no escribir —si se dejara así,
      // el usuario seguiría PUBLICANDO en el gist perdedor y volvería a divergir en el siguiente guardado. Se le
      // pide al llamador que lo adopte en su configuración local.
      if (verdict.winner === publishedGistId) {
        return { healed: false, adoptGistId: publishedGistId };
      }
    }
  }

  await setDoc(
    ref,
    {
      uid,
      social: { gistId: socialGistId, ...(socialGistEtag ? { etag: socialGistEtag } : {}) },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  invalidateOwnProfileCache(uid);
  invalidateSocialDirectoryCache();
  return { healed: true, adoptGistId: '' };
}
