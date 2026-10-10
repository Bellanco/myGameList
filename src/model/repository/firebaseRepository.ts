// Fachada del repositorio Firebase. El código se reparte en módulos cohesivos (M2):
//  - firebaseClient: init de servicios + config + analytics module + helpers de error + interfaces de dominio.
//  - telemetryRepository: reportHandledError / trackAnalyticsEvent / setAnalyticsUser / clearAnalyticsUser.
//  - firebaseAuthRepository: sign-in/out con Google + usuario actual.
//  - firebaseSocialRepository: directorio, índice público, recomendaciones (+ sus cachés).
// Este fichero conserva el NÚCLEO de perfil/identidad/token y RE-EXPORTA la API pública para que ningún
// consumidor cambie sus imports.
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore/lite';
import { decryptFromString, encryptToString } from '../../core/security/crypto';
import { PUBLIC_NAME_MAX_LENGTH, safeTrim } from '../../core/security/sanitize';
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
  saveOwnProfileCache,
  invalidateProfileByEmailCache,
} from './firebaseSocialRepository';
import { DEFAULT_PROFILE_TIER } from '../../core/constants/tiers';
import { FIRESTORE_SCHEMA_VERSION } from '../../core/constants/schema';
import { buildMirror } from '../../core/achievements/pack';
import type { FirestorePrivateConfig, FirestorePublicConfig } from '../types/firestore';
import { PROFILE_INACTIVITY_MS, PROFILE_TOUCH_MIN_INTERVAL_MS } from '../../core/constants/socialActivity';
import { stampOwnFriendshipsOnReturn } from './firebaseFriendshipRepository';
import { toMillis } from '../../core/utils/firestoreTime';

// --- RE-EXPORTS: API pública estable (los consumidores siguen importando desde firebaseRepository) ---
export { enableAnalyticsAfterConsent, initializeFirebaseServices } from './firebaseClient';
export type {
  FirebaseServices,
  SocialAuthUser,
  SocialProfileReference,
  SocialDirectoryEntry,
} from './firebaseClient';
export { reportHandledError, trackAnalyticsEvent, setAnalyticsUser, clearAnalyticsUser } from './telemetryRepository';
export { getCurrentSocialAuthUser, onSocialAuthChanged, readAdminClaim, signInWithGoogle, signOutSocialUser } from './firebaseAuthRepository';
// C5: el índice público (upsertProfileIndex/upsertFeedCard) y las recomendaciones quedaron sin consumidores y
// con reglas admin-only (rotas en cliente). Código muerto eliminado; la migración a índice pseudónimo por
// profileId (con guarda recursiva de campos privados) queda registrada como tarea gated en CODE-REVIEW-IMPROVEMENTS.md.
export {
  findSocialProfileByEmail,
  getOwnProfileRef,
  getSocialProfilesByUid,
  invalidateOwnProfileCache,
  listSocialDirectory,
} from './firebaseSocialRepository';
// Amistad (aceptación mutua): un doc por par, id canónico, denormalización de identidad. Ver firebaseFriendshipRepository.
export {
  acceptFriendRequest,
  claimRequesterKeys,
  deleteFriendship,
  friendshipDocId,
  getMyFriendships,
  haveFriendshipEdgesChanged,
  healOwnFriendshipIdentity,
  invalidateMyFriendshipsCache,
  MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS,
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
 *
 * C7: se recorta a `PUBLIC_NAME_MAX_LENGTH`, que es el límite que las reglas exigen (`profileFieldsAreSane`). El
 * editor del perfil ya corta el nick a ese mismo tope, pero el nombre de la cuenta de Google entra por el fallback
 * sin pasar por ningún campo de la UI: sin este recorte, un nombre de Google largo haría que la regla denegara el
 * guardado entero del perfil, y el usuario vería un fallo que no puede explicar ni arreglar. Si no cabe, se corta.
 */
function resolvePublicName(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const clean = safeTrim(candidate, PUBLIC_NAME_MAX_LENGTH);
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
  // Sin `schemaVersion`: no lo leía nadie (el de `profiles` sí, y se queda). El de los documentos antiguos se borra en
  // la siguiente escritura (docs/plan-firestore-sin-sobrantes.md).
  await setDoc(doc(services.firestore, 'privateConfig', uid), { ...config, schemaVersion: deleteField() }, { merge: true });
}

// ---------------------------------------------------------------------------
// publicConfig/{uid} — preferencias NO sensibles del dueño (F2), owner-only (ver firestore.rules).
// Separada de privateConfig para diferenciarla. Hoy solo la escala de puntuación (estrellas/nota).
// ---------------------------------------------------------------------------

/**
 * COPIA EN MEMORIA DE `publicConfig`. El mismo documento lo leían dos veces seguidas al arrancar la escala de nota
 * y la apariencia, y otra el consentimiento del social en cada montaje del hub: tres lecturas para un documento que
 * solo cambia cuando su dueño toca una preferencia. Lo que se escribe desde aquí la tira al momento; lo que cambie
 * otro dispositivo se ve en la siguiente carga de la página o pasado este plazo.
 */
export const PUBLIC_CONFIG_MAX_AGE_MS = 5 * 60 * 1000;

let publicConfigCache: { uid: string; at: number; value: FirestorePublicConfig | null } | null = null;
let publicConfigInFlight: { uid: string; promise: Promise<FirestorePublicConfig | null> } | null = null;
let publicConfigGeneration = 0;

function invalidatePublicConfigCache(): void {
  publicConfigCache = null;
  publicConfigInFlight = null;
  publicConfigGeneration += 1;
}

export async function getPublicConfig(uid: string): Promise<FirestorePublicConfig | null> {
  if (publicConfigCache?.uid === uid && Date.now() - publicConfigCache.at < PUBLIC_CONFIG_MAX_AGE_MS) {
    return publicConfigCache.value ? { ...publicConfigCache.value } : null;
  }
  if (publicConfigInFlight?.uid === uid) {
    const shared = await publicConfigInFlight.promise;
    return shared ? { ...shared } : null;
  }

  const generation = publicConfigGeneration;
  const promise = (async () => {
    const services = await initializeFirebaseServices();
    if (!services) {
      throw new Error('Firebase no está configurado en este entorno');
    }
    const snap = await getDoc(doc(services.firestore, 'publicConfig', uid));
    const value = snap.exists() ? (snap.data() as FirestorePublicConfig) : null;
    // Una lectura que salió antes de una escritura propia no guarda lo que ya se sabe viejo.
    if (generation === publicConfigGeneration) {
      publicConfigCache = { uid, at: Date.now(), value };
    }
    return value;
  })();
  const entry = { uid, promise };
  publicConfigInFlight = entry;
  try {
    const value = await promise;
    return value ? { ...value } : null;
  } finally {
    if (publicConfigInFlight === entry) publicConfigInFlight = null;
  }
}

export async function setPublicConfig(uid: string, config: Partial<FirestorePublicConfig>): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  try {
    // Fuera lo que no lee nadie: `schemaVersion`, y la forma y el tamaño del listado, que desde el 20-09-2026 son del
    // dispositivo y no se suben. Lo de los documentos antiguos se va en esta misma escritura
    // (docs/plan-firestore-sin-sobrantes.md).
    await setDoc(
      doc(services.firestore, 'publicConfig', uid),
      { ...config, schemaVersion: deleteField(), listShape: deleteField(), gridSize: deleteField() },
      { merge: true },
    );
  } finally {
    invalidatePublicConfigCache();
  }
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

/**
 * `userMap/{uid}` ya no se usa: guardaba solo el `profileId`, que ya está en `privateConfig/{uid}`, las dos del dueño
 * y escritas siempre a la vez (docs/plan-firestore-sin-sobrantes.md, Fase 2). Se borra una vez por cuenta y
 * dispositivo, DESPUÉS de dejar el `profileId` en `privateConfig`, para que nunca quede sin ninguna de las dos copias.
 * Best-effort: si falla, se reintenta en la siguiente pasada.
 */
async function dropLegacyUserMap(uid: string): Promise<void> {
  try {
    const meta = await getLocalMeta();
    if (meta?.userMapDroppedFor === uid) return;
    const services = await initializeFirebaseServices();
    if (!services) return;
    await deleteDoc(doc(services.firestore, 'userMap', uid));
    await patchLocalMeta({ userMapDroppedFor: uid });
  } catch {
    // best-effort
  }
}

/**
 * B2: establece la identidad pseudónima al activar lo social — genera/recupera `profileId` y guarda los ids en
 * `privateConfig` (merge, conserva el token cifrado). Best-effort: no rompe el guardado social si falla.
 */
export async function establishProfileIdentity(uid: string, profileId: string, gamesGistId: string, socialGistId: string): Promise<boolean> {
  try {
    // Los ids VACÍOS no se escriben. `setPrivateConfig` hace merge, así que mandar `gamesGistId: ''` no es "no
    // tocarlo": lo BORRA. Guardar el perfil social desde un dispositivo sin la sincronización principal
    // configurada dejaba a cero el id del gist de juegos guardado, y con él la recuperación en otros
    // dispositivos. Solo se escribe lo que de verdad se conoce.
    await setPrivateConfig(uid, {
      profileId,
      ...(gamesGistId ? { gamesGistId } : {}),
      ...(socialGistId ? { socialGistId } : {}),
    });
    await dropLegacyUserMap(uid);
    return true;
  } catch (error) {
    console.warn('[firebase] No se pudo establecer profileId:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * 6.2a — Recupera el `profileId` canónico desde Firestore: `privateConfig/{uid}`, donde lo deja
 * `establishProfileIdentity`. Resiliente: permission-denied / offline / ausencia → null para que el llamador caiga
 * al comportamiento local.
 */
export async function recoverRemoteProfileId(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const cfg = await getPrivateConfig(uid);
    const pid = String(cfg?.profileId || '').trim();
    return pid || null;
  } catch {
    return null;
  }
}

/**
 * 6.2a — Resuelve el `profileId` a usar para las escrituras sociales. Reconcilia con el remoto canónico
 * ANTES de generar uno local nuevo, de modo que todos los dispositivos del mismo usuario converjan al mismo
 * pseudónimo. Si no hay remoto (primer dispositivo) o Firestore no responde, cae al `profileId` local.
 */
export async function resolveStableProfileId(uid: string): Promise<string> {
  // El pseudónimo no cambia una vez que existe en remoto: todos los dispositivos convergen a él. Se recuerda en
  // memoria para no releer `privateConfig` en cada montaje del hub y en cada publicación. Solo cuando vino de
  // Firestore: si no había remoto (primer dispositivo, sin red), el siguiente intento vuelve a preguntar.
  if (resolvedProfileId?.uid === uid) {
    return resolvedProfileId.profileId;
  }
  const remote = await recoverRemoteProfileId(uid);
  const profileId = await seedProfileIdFromRemote(remote);
  if (remote) {
    resolvedProfileId = { uid, profileId };
  }
  return profileId;
}

let resolvedProfileId: { uid: string; profileId: string } | null = null;

/**
 * Lo que ya se escribió en esta carga de la página y no hace falta repetir en cada publicación: la identidad
 * (pseudónimo e ids en `privateConfig`) y el respaldo cifrado del token con la purga del token en claro legacy.
 * Antes eran cuatro escrituras por reseña publicada aunque nada hubiera cambiado.
 */
let identityWrittenStamp = '';
let tokenBackedUpStamp = '';
/** uid al que ya se le intentó sellar la fecha de alta que faltaba en esta carga (ver `ensureProfileByEmail`). */
let createdAtSealStamp = '';

/** Huella del token para comparar sin guardar otra copia suya en memoria. */
function tokenFingerprint(token: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36) + ':' + token.length;
}

/**
 * Olvida todo lo que este módulo recuerda de la cuenta propia: la copia de `publicConfig`, el pseudónimo resuelto
 * y las escrituras ya hechas. Lo llama el borrado de cuenta, que no recarga la página: sin esto, volver a activar
 * lo social en la misma sesión se saltaría la identidad de `privateConfig` que se acaba de borrar.
 */
export function forgetOwnAccountMemo(): void {
  invalidatePublicConfigCache();
  resolvedProfileId = null;
  identityWrittenStamp = '';
  tokenBackedUpStamp = '';
  createdAtSealStamp = '';
}

/**
 * Garantiza que exista perfil por correo con correo, nombre y gist id.
 */
export async function ensureProfileByEmail(input: {
  user: SocialAuthUser;
  socialGistId: string;
  gamesGistId?: string;
  githubToken?: string;
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

  // B2 — PRIMERO se guardan los ids en `privateConfig`, y solo DESPUÉS se purgan del perfil público.
  // El orden importa: la escritura de abajo borra `social.gistId` y `social.gamesGistId` del documento público, y
  // este guardado es best-effort (se traga sus errores). Con el orden inverso, un fallo de red entre ambos dejaba
  // al usuario purgado y SIN guardar: ni podía recuperar su canal social ni su gist de juegos en otro
  // dispositivo. Guardando antes, el peor caso es tener el dato en los dos sitios, que es inofensivo.
  const identityStamp = [input.user.uid, profileId, gamesGistId, input.socialGistId].join('|');
  if (identityWrittenStamp !== identityStamp) {
    if (await establishProfileIdentity(input.user.uid, profileId, gamesGistId, input.socialGistId)) {
      identityWrittenStamp = identityStamp;
    }
  }

  if (shouldWriteProfile) {
    // La recencia ANTERIOR, para la señal de regreso (ver `signalReturnIfAsleep`): esta reescritura mueve `updatedAt`
    // sin pasar por `touchOwnProfileActivity`, y quien vuelve tras un mes cambiando de nick o de foto se quedaría sin
    // avisar a sus amigos. Solo cuando ya había perfil propio: uno nuevo no viene de dormir. Una lectura más, y solo
    // en este camino, que es el raro (el normal es el `else`, que pasa por el latido).
    const previousUpdatedAt = existing && !isForeignDoc
      ? await getDoc(doc(services.firestore, 'profiles', targetId))
        .then((snap) => (snap.data() as { updatedAt?: unknown } | undefined)?.updatedAt)
        .catch(() => undefined)
      : undefined;
    await setDoc(
      doc(services.firestore, 'profiles', targetId),
      {
        schemaVersion: FIRESTORE_SCHEMA_VERSION,
        uid: input.user.uid,
        profileId,
        displayName: profileName,
        photoURL: resolvedPhotoURL,
        social: {
          // El id del canal ya no se publica: con él cualquier usuario autenticado podría leer el gist entero (un
          // gist secreto no es privado). Se purga de los perfiles que aún lo llevan. Sus amistades lo tienen
          // denormalizado; su dueño, en `privateConfig`.
          gistId: deleteField(),
          // El ETag del gist social tampoco: no lo leía nadie, ni el panel, y lo descargaba todo el que cargaba el
          // directorio (docs/plan-firestore-sin-sobrantes.md).
          etag: deleteField(),
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
    await signalReturnIfAsleep(input.user.uid, previousUpdatedAt);
  } else {
    // El perfil no cambia, pero publicar ES actividad y `updatedAt` es lo que la mide: con él parado, el amigo que
    // publica desde la ficha del juego sin abrir nunca el espacio social (el latido del hub no le llega) cruzaría
    // el corte de inactividad de 30 días y los demás dejarían de leer su gist — sus reseñas y publicaciones
    // desaparecerían de sus feeds mientras él las sigue publicando. Acotado a una escritura al día, así que no
    // reintroduce la reescritura por publicación que este chequeo evita.
    await touchOwnProfileActivityThrottled(input.user.uid);
  }

  // B1: respaldo CIFRADO del token en privateConfig; nunca en claro en `profiles`.
  const tokenStamp = githubToken ? `${input.user.uid}|${tokenFingerprint(githubToken)}` : '';
  if (githubToken && tokenBackedUpStamp !== tokenStamp) {
    try {
      await backupGithubToken(input.user.uid, githubToken);
      // Upgrade proactivo: una vez respaldado cifrado, borrar el token en claro LEGACY que perfiles viejos
      // aún conservan en `profiles.social.githubToken` (merge no lo elimina; deleteField sí).
      await setDoc(
        doc(services.firestore, 'profiles', targetId),
        { social: { githubToken: deleteField() } }, // audit-allow: deleteField() ELIMINA el token en claro legacy, no lo almacena
        { merge: true },
      );
      tokenBackedUpStamp = tokenStamp;
    } catch (error) {
      console.warn('[firebase] No se pudo respaldar/limpiar el token:', error instanceof Error ? error.message : error);
    }
  }

  // LA FECHA DE ALTA QUE FALTA (docs/plan-firestore-sin-sobrantes.md, Fase 3). Arriba solo se sella al CREAR el
  // documento, pero hasta la 1.6.9 la foto, la vitrina y el resumen del año podían crearlo antes y sin ella; y un
  // cliente viejo en caché aún puede. Si el perfil propio no la tiene, se sella aquí: las reglas lo permiten mientras
  // falte. En una escritura APARTE y tragándose el fallo, porque si la copia leída fuera vieja y la fecha ya
  // existiera, la regla de inmutabilidad la denegaría, y no debe arrastrar con ella el guardado del perfil. Una vez
  // por carga: si falló, la siguiente lo vuelve a intentar.
  let sealedCreatedAt = 0;
  if (existing && !isForeignDoc && !existing.createdAt && createdAtSealStamp !== input.user.uid) {
    createdAtSealStamp = input.user.uid;
    try {
      await setDoc(
        doc(services.firestore, 'profiles', targetId),
        { uid: input.user.uid, createdAt: serverTimestamp() },
        { merge: true },
      );
      sealedCreatedAt = Date.now();
    } catch (error) {
      console.warn('[firebase] No se pudo sellar la fecha de alta:', error instanceof Error ? error.message : error);
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
    // Lo que este guardado no escribe se arrastra del perfil leído. Perderlo en la caché no es inocuo: con la vitrina
    // vacía, el publicador de logros sube la de este dispositivo como REEMPLAZO y se lleva las medallas ganadas en
    // otros (ver `mergeForPublish`). El canónico que nace de un documento ajeno no tiene nada de esto todavía.
    ...(existing && !isForeignDoc
      ? {
        createdAt: existing.createdAt || sealedCreatedAt,
        achievementsMirror: existing.achievementsMirror,
        achievementsMirrorAt: existing.achievementsMirrorAt,
        palmares: existing.palmares,
      }
      : {}),
  };
  saveOwnProfileCache(input.user.uid, written);
  // Si el perfil venía de un documento con otro id, la referencia cacheada por correo apunta al huérfano y ya no
  // vale: el canónico acaba de nacer y es el que manda. Olvidarla evita que la siguiente resolución vuelva a
  // proponer el documento en el que este cliente no puede escribir.
  if (isForeignDoc) {
    invalidateProfileByEmailCache(cleanEmail);
  }
  // Solo si el documento se ha reescrito. Publicar una reseña pasa por aquí cada vez y, con el perfil igual, tirar la
  // copia de la consulta del directorio hacía pagar sus 50 lecturas en la siguiente visita al social sin que nada
  // de lo que enseña hubiera cambiado. La reseña nueva no vive en el directorio, sino en el gist social, y su copia
  // (la del feed) la tira quien publica (`invalidateCachedSocialDirectory`). El latido de arriba solo mueve
  // `updatedAt`, que decide el orden del directorio, no lo que pinta.
  if (shouldWriteProfile) {
    invalidateSocialDirectoryCache(input.user.uid);
  }

  return written;
}

/**
 * REPARA LA RÉPLICA DEL NICK en `profiles/{uid}` cuando se quedó atrás respecto al gist.
 *
 * El nick lo escribe su dueño en su GIST social, y `profiles.displayName` es la copia que leen el directorio y el
 * panel de administración. Al guardar el perfil se escribe primero el gist y después se replica aquí, así que un
 * fallo en medio —red, permisos, la pestaña que se cierra— deja las dos fuentes en desacuerdo: el feed enseña el
 * nombre nuevo (lee el gist) y el resto el viejo, indefinidamente, porque nada volvía a intentarlo.
 *
 * Esto lo cierra: el cliente compara al abrir el hub y solo escribe si de verdad difieren. No es un `ensureProfileByEmail`
 * completo a propósito —no toca identidad, ni ids, ni purga nada—, para que reparar una copia no arrastre el resto
 * del guardado.
 *
 * Devuelve `true` si ha reescrito. Best-effort: no lanza si Firebase no está configurado.
 */
export async function repairProfileDisplayName(uid: string, nick: string): Promise<boolean> {
  const cleanUid = String(uid || '').trim();
  const cleanNick = safeTrim(nick, PUBLIC_NAME_MAX_LENGTH);
  // Sin nick no se repara NADA: escribir vacío borraría el nombre público de quien tiene el perfil bien.
  if (!cleanUid || !cleanNick) return false;

  const services = await initializeFirebaseServices();
  if (!services) return false;

  const existing = await resolveOwnProfile({ uid: cleanUid });
  // Solo el documento CANÓNICO: sobre uno que vive bajo otro id las reglas no dejan escribir al dueño, y ese caso
  // lo retira el panel con el cutover de identidad.
  if (!existing || existing.id !== cleanUid) return false;
  if (existing.displayName.trim() === cleanNick) return false;

  await setDoc(
    doc(services.firestore, 'profiles', cleanUid),
    { uid: cleanUid, displayName: cleanNick, updatedAt: serverTimestamp() },
    { merge: true },
  );
  invalidateOwnProfileCache(cleanUid);
  invalidateSocialDirectoryCache(cleanUid);
  return true;
}

/**
 * ¿La escritura falló porque el documento no existe? Es lo que devuelve `updateDoc` sobre un perfil sin crear.
 */
function isNotFoundError(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'not-found';
}

/**
 * Actualización ligera de la foto del doc público de perfil (la lee el directorio social). Cumple las reglas:
 * incluye `uid` y solo toca `photoURL`. `''` borra la foto (opt-out). El doc del dueño vive en `profiles/{uid}`.
 * Best-effort: no lanza si Firebase no está configurado.
 *
 * NO CREA EL PERFIL (`updateDoc`, no `setDoc` + `merge`). Lo creaba, sin fecha de alta, cuando el saneado de la
 * foto genérica corría antes que el alta; luego el alta lo encontraba hecho y no sellaba `createdAt` nunca
 * (docs/plan-firestore-sin-sobrantes.md, Fase 3). Si aún no existe no hay nada que hacer: el alta escribe la foto.
 */
export async function updateProfilePhoto(uid: string, photoURL: string): Promise<void> {
  if (!uid) return;
  const services = await initializeFirebaseServices();
  if (!services) return;
  try {
    await updateDoc(
      doc(services.firestore, 'profiles', uid),
      // `updatedAt` es obligatorio de facto: el directorio ordena por él y un doc sin el campo NO saldría en la consulta.
      { uid, photoURL: photoURL || '', updatedAt: serverTimestamp() },
    );
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
  invalidateOwnProfileCache(uid);
  invalidateSocialDirectoryCache(uid);
}

/**
 * PUBLICA TU ESPEJO DE LOGROS en `profiles/{uid}.achievements` (F3 del plan, §9.1).
 *
 * QUÉ SALE DE AQUÍ, y conviene tenerlo delante: este documento lo lee CUALQUIER usuario autenticado, así que lo
 * que se publica es exactamente lo que `packAchievements` empaqueta y nada más — un mapa de bits de qué logros
 * tienes y, para unos pocos, el DÍA en que cayeron. Sin horas (un sello al minuto diría a qué horas usas la app),
 * sin progreso de lo que te falta y sin un solo dato de tu biblioteca. Los «primeros pasos» ni siquiera tienen
 * bit: la vitrina de alguien con quinientos juegos no puede empezar por «escribió su primera reseña».
 *
 * LA FORMA LA DECIDE `buildMirror`, que es quien sabe qué versión de gramática lleva la cadena. Aquí solo se
 * escribe.
 *
 * `uid` y `updatedAt` van en la escritura por lo mismo que en `updateProfilePhoto`: las reglas exigen el primero y el
 * directorio ordena por el segundo, de modo que un documento sin él no saldría en la consulta.
 *
 * Best-effort: si falla, lanza y quien llama no lo da por publicado, así que se vuelve a intentar en la sesión
 * siguiente. Mientras tanto lo único que pasa es que las amistades ven tu vitrina un poco desactualizada.
 */
export async function publishAchievementMirror(uid: string, list: string): Promise<void> {
  if (!uid || !list) return;
  const services = await initializeFirebaseServices();
  if (!services) return;
  // `updateDoc` y no `setDoc` + `merge`, por dos cosas: no crea un perfil que aún no existe (lo creaba sin fecha de
  // alta, ver `updateProfilePhoto`; si falla, quien llama no lo da por publicado y lo reintenta), y sustituye el mapa
  // entero, así que la versión suelta que guardaban los espejos antiguos (`v`) se va sola (ver `AchievementMirror`).
  await updateDoc(
    doc(services.firestore, 'profiles', uid),
    { uid, achievements: buildMirror(list, Date.now()), updatedAt: serverTimestamp() },
  );
  invalidateOwnProfileCache(uid);
  invalidateSocialDirectoryCache(uid);
}

/**
 * Publica que su dueño YA ABRIÓ su resumen del año (`profiles/{uid}.yearSummary = { year, at }`). Sus amistades lo
 * leen en el directorio y les sale la tarjeta destacada en el feed (ver `core/social/yearSummaryFeed.ts`).
 *
 * Lo que se publica es eso y nada más: qué año y cuándo se abrió. Ni una cifra del resumen, que cada amistad
 * calcula con lo que ya puede ver. Solo se llama en temporada (del 15 al 31 de diciembre) y una vez por año; la
 * guarda la lleva quien llama (`useYearSummarySignal`).
 *
 * `uid` y `updatedAt` van en la escritura por lo mismo que en el espejo de logros: las reglas exigen el primero y el
 * directorio ordena por el segundo. Lanza si falla, para que quien llama no lo dé por publicado y lo reintente.
 */
export async function publishYearSummarySeen(uid: string, year: number): Promise<void> {
  if (!uid || !Number.isInteger(year)) return;
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no disponible');
  // `updateDoc`: no crea un perfil que aún no existe (ver `updateProfilePhoto`). El mapa se escribe entero igualmente.
  await updateDoc(
    doc(services.firestore, 'profiles', uid),
    { uid, yearSummary: { year, at: Date.now() }, updatedAt: serverTimestamp() },
  );
  invalidateOwnProfileCache(uid);
  invalidateSocialDirectoryCache(uid);
}

/**
 * LA SEÑAL DE REGRESO (docs/plan-feed-sin-vacio.md, Fase 4): si la recencia ANTERIOR del perfil propio tenía más de 30
 * días, quien vuelve sella sus amistades para que sus amigos lo saquen ya del corte de inactividad. Sin marca anterior
 * no se da por regreso. Best-effort: la recencia ya está escrita, y sin el sello sus amigos lo verán al caducar la
 * copia (como antes).
 */
async function signalReturnIfAsleep(uid: string, previousUpdatedAt: unknown): Promise<void> {
  const previous = toMillis(previousUpdatedAt as Parameters<typeof toMillis>[0]);
  if (previous <= 0 || Date.now() - previous <= PROFILE_INACTIVITY_MS) return;
  await stampOwnFriendshipsOnReturn(uid).catch(() => 0);
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
    const previous = (snap.data() as { updatedAt?: unknown } | undefined)?.updatedAt;
    // De paso se va el ETag del gist social que guardaban los perfiles de antes: no lo lee nadie, y el latido es la
    // única escritura que alcanza a quien no vuelve a guardar su perfil (docs/plan-firestore-sin-sobrantes.md).
    await setDoc(ref, { uid, updatedAt: serverTimestamp(), social: { etag: deleteField() } }, { merge: true });
    // Después de la recencia, y no antes: quien relea el perfil por el sello tiene que encontrarlo ya despierto.
    await signalReturnIfAsleep(uid, previous);
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
    invalidateSocialDirectoryCache(uid);
    return true;
  } catch {
    return false;
  }
}

// Cada cuánto, como mucho, se refresca la recencia desde un mismo dispositivo. Vive en `core/constants/socialActivity`
// porque la pasada de fondo de la app principal la consulta sin cargar este módulo; se reexporta desde aquí.
export { PROFILE_TOUCH_MIN_INTERVAL_MS };

/**
 * `touchOwnProfileActivity` con el acotado que exige su contrato: una vez cada 20 h por dispositivo. Es el único
 * sitio donde vive ese intervalo, para que el latido del hub y el de la publicación no puedan separarse.
 *
 * Best-effort de principio a fin: si IndexedDB no responde, no se refresca la recencia y no pasa nada más.
 */
export function touchOwnProfileActivityThrottled(uid: string): Promise<void> {
  if (!uid) return Promise.resolve();
  // UNA a la vez: el hub y la pasada de fondo de la app principal pueden pedirla en el mismo arranque, y las dos
  // leerían la recencia vieja —dos escrituras y, si venía de dormir, dos sellos de regreso en cada amistad—.
  if (!touchInFlight) {
    touchInFlight = touchOwnProfileActivityThrottledNow(uid).finally(() => {
      touchInFlight = null;
    });
  }
  return touchInFlight;
}

let touchInFlight: Promise<void> | null = null;

async function touchOwnProfileActivityThrottledNow(uid: string): Promise<void> {
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

