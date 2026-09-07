// MODERACIÓN: las acciones que el panel ejecuta sobre un usuario concreto.
//
// Todas ESCRIBEN, así que cada una dice en su docblock qué toca exactamente y qué deja intacto. El censo
// (`adminCensus`) detecta lo que hay que arreglar; aquí se arregla.
import { collection, deleteDoc, deleteField, doc, getDocs, query, updateDoc, where } from 'firebase/firestore/lite';
import { DEFAULT_PROFILE_TIER, type ProfileTier } from '../../../core/constants/tiers';
import { invalidateOwnProfileCache, invalidateSocialDirectoryCache } from '../firebaseSocialRepository';
import { invalidateMyFriendshipsCache } from '../firebaseFriendshipRepository';
import {
  FOSSIL_PENDING_MS,
  LEGACY_FIELD_PATHS,
  PLACEHOLDER_ID,
  describe,
  requireServices,
  toAdminError,
  toMillis,
  type AdminActionResult,
  type LegacyProfileField,
} from './adminShared';

export interface AdminFriendshipSweepResult extends AdminActionResult {
  /** Documentos de amistad efectivamente escritos o borrados. */
  touched: number;
  /** Documentos que se han mirado (los de ese uid). */
  scanned: number;
}

/**
 * Propaga la identidad PÚBLICA de un usuario (su nick y su foto de perfil) a sus documentos de amistad.
 *
 * POR QUÉ HACE FALTA DESDE AQUÍ. Los campos `requesterName`/`recipientName` (y sus fotos) están denormalizados: se
 * escriben en el momento de la petición y nadie los reescribe al cambiar de nick. El propio cliente los sanea
 * (`healOwnFriendshipIdentity`), pero solo cuando su dueño ABRE EL ESPACIO SOCIAL con el canal ya configurado, o al
 * guardar el perfil, o al publicar. Quien entra a usar sus listas y no pasa por el hub arrastra el nombre viejo para
 * siempre, y es el que ven sus amigos en su lista y en su bandeja. Esta es la única vía que no depende de él.
 *
 * Lo que NO toca, y es deliberado: los ids de gist (`*SocialGistId`, `*GamesGistId`). Para saber cuál de los que
 * circulan es el bueno hay que leer los gists, y eso exige el token de GitHub de su dueño, que es owner-only. El
 * panel enseña la deriva; resolverla sigue siendo cosa de su cliente.
 *
 * Las reglas lo permiten por la rama `isAdmin()` de `allow update` en `friendships`, que se salta
 * `friendshipHealOwnFields` (esa función solo deja tocar los campos del PROPIO lado, y aquí se escriben los de otro).
 *
 * Best-effort acumulativo, igual que el borrado: no aborta al primer fallo y reporta lo que no pudo.
 */
export async function healUserFriendshipIdentity(
  uid: string,
  identity: { name: string; photoURL: string },
): Promise<AdminFriendshipSweepResult> {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) {
    return { ok: false, failures: ['No se conoce el uid del usuario'], touched: 0, scanned: 0 };
  }

  const services = await requireServices();
  const name = identity.name.trim();
  const photo = String(identity.photoURL || '');

  let snapshot;
  try {
    snapshot = await getDocs(
      query(collection(services.firestore, 'friendships'), where('users', 'array-contains', cleanUid)),
    );
  } catch (error) {
    return { ok: false, failures: [describe(toAdminError(error, 'listar sus amistades'))], touched: 0, scanned: 0 };
  }

  const failures: string[] = [];
  let touched = 0;

  // Solo se escribe lo que DIVERGE (mismo criterio que el saneado del propio cliente): sin ese filtro, cada pulsación
  // gastaría una escritura por amistad para dejar los documentos exactamente como estaban.
  const writes = snapshot.docs.flatMap((entry) => {
    const data = entry.data() as Partial<import('../../types/firestore').FriendshipDoc>;
    const amRequester = data.requester === cleanUid;
    const isRecipient = data.recipient === cleanUid;
    if (!amRequester && !isRecipient) {
      return []; // aparece en `users` pero no es ninguno de los dos lados: documento inconsistente, no se toca
    }

    const currentName = amRequester ? data.requesterName : data.recipientName;
    const currentPhoto = amRequester ? data.requesterPhoto : data.recipientPhoto;
    if (currentName === name && currentPhoto === photo) {
      return [];
    }

    const fields = amRequester
      ? { requesterName: name, requesterPhoto: photo, updatedAt: Date.now() }
      : { recipientName: name, recipientPhoto: photo, updatedAt: Date.now() };
    return [updateDoc(entry.ref, fields)];
  });

  const results = await Promise.allSettled(writes);
  results.forEach((result) => {
    if (result.status === 'rejected') {
      failures.push(describe(toAdminError(result.reason, 'actualizar una amistad')));
    } else {
      touched += 1;
    }
  });

  invalidateMyFriendshipsCache();

  return { ok: failures.length === 0, failures, touched, scanned: snapshot.size };
}

/**
 * Fija el nombre público de un usuario: lo escribe en su perfil Y lo propaga a sus documentos de amistad, para que
 * las dos copias que el panel puede alcanzar queden de acuerdo.
 *
 * PARA QUÉ SIRVE Y HASTA DÓNDE LLEGA, sin adornos. Cuando el perfil y las amistades discrepan, el panel no puede
 * saber cuál es el nick vigente: ese dato vive en el GIST social del usuario y leerlo exige su token. Esta acción es
 * el desempate a mano del administrador, que sí ve los dos valores y puede decidir.
 *
 * Lo que NO puede hacer: escribir en su gist. Así que si el gist dice otra cosa, su propio cliente volverá a imponer
 * el del gist en cuanto abra el espacio social (`repairProfileDisplayName`), y hará bien: el nick es del usuario, no
 * del administrador. Esto vale para dejar el directorio coherente ahora y, sobre todo, para quien ya no vuelve.
 */
export async function setUserDisplayName(
  profileDocId: string,
  uid: string,
  displayName: string,
  /** Foto que conserva el perfil. Va con el nombre porque el saneado escribe los dos campos en la misma escritura;
   *  omitirla borraría la foto que sus amigos ya tenían. */
  photoURL: string,
): Promise<AdminFriendshipSweepResult> {
  const cleanId = String(profileDocId || '').trim();
  const cleanName = String(displayName || '').trim();
  if (!cleanId || cleanId === PLACEHOLDER_ID) {
    return { ok: false, failures: ['Identificador de perfil no válido'], touched: 0, scanned: 0 };
  }
  if (!cleanName) {
    return { ok: false, failures: ['No se indicó ningún nombre'], touched: 0, scanned: 0 };
  }

  const services = await requireServices();
  const failures: string[] = [];

  try {
    await updateDoc(doc(services.firestore, 'profiles', cleanId), { displayName: cleanName });
  } catch (error) {
    // Si el perfil no se puede escribir, no se sigue: propagar a las amistades un nombre que el perfil no tiene
    // dejaría las dos copias en desacuerdo otra vez, solo al revés.
    return { ok: false, failures: [describe(toAdminError(error, 'escribir el nombre del perfil'))], touched: 0, scanned: 0 };
  }

  invalidateOwnProfileCache(cleanId);
  invalidateSocialDirectoryCache();

  // La foto va tal cual está en el perfil: esta acción es del NOMBRE, y el saneado escribe los dos campos juntos
  // porque es una sola escritura por documento.
  const sweep = await healUserFriendshipIdentity(uid, { name: cleanName, photoURL });
  failures.push(...sweep.failures);
  return { ok: failures.length === 0, failures, touched: sweep.touched, scanned: sweep.scanned };
}

/**
 * Borra las solicitudes de amistad que ESE usuario envió, siguen pendientes y llevan más de `FOSSIL_PENDING_MS`
 * (180 días) sin que nadie las acepte.
 *
 * Qué se borra y qué no:
 * - solo `status: 'pending'`. Una amistad aceptada no caduca por vieja que sea.
 * - solo las que él ENVIÓ (`requester === uid`). Las que ha recibido son la bandeja de otro y no le corresponde
 *   limpiarlas desde su ficha: aparecerán en la ficha de quien las mandó.
 * - solo con `createdAt` fechado. Sin fecha no hay antigüedad demostrable, y no se borra por sospecha.
 *
 * Borrar la petición la retira también de la bandeja del destinatario, que es justo el objetivo: dejan de ocupar
 * sitio en los dos lados. Los dos interesados pueden volver a enviarla cuando quieran.
 *
 * El filtro por estado y fecha se hace en el cliente (la consulta solo pide `array-contains`) para no exigir un
 * índice compuesto nuevo por una operación de mantenimiento que se ejecuta a mano.
 */
export async function purgeFossilFriendshipRequests(
  uid: string,
  now: number = Date.now(),
): Promise<AdminFriendshipSweepResult> {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) {
    return { ok: false, failures: ['No se conoce el uid del usuario'], touched: 0, scanned: 0 };
  }

  const services = await requireServices();

  let snapshot;
  try {
    snapshot = await getDocs(
      query(collection(services.firestore, 'friendships'), where('users', 'array-contains', cleanUid)),
    );
  } catch (error) {
    return { ok: false, failures: [describe(toAdminError(error, 'listar sus amistades'))], touched: 0, scanned: 0 };
  }

  const fossils = snapshot.docs.filter((entry) => {
    const data = entry.data() as Partial<import('../../types/firestore').FriendshipDoc>;
    if (data.status !== 'pending' || data.requester !== cleanUid) {
      return false;
    }
    const createdAt = toMillis(data.createdAt as never);
    return createdAt > 0 && now - createdAt > FOSSIL_PENDING_MS;
  });

  const failures: string[] = [];
  let touched = 0;

  const results = await Promise.allSettled(fossils.map((entry) => deleteDoc(entry.ref)));
  results.forEach((result) => {
    if (result.status === 'rejected') {
      failures.push(describe(toAdminError(result.reason, 'borrar una solicitud')));
    } else {
      touched += 1;
    }
  });

  invalidateMyFriendshipsCache();

  return { ok: failures.length === 0, failures, touched, scanned: fossils.length };
}

/**
 * Asigna el rango de un perfil. Es la única vía: el dueño no puede escribirlo (regla `profileTierNotSelfAssigned`).
 *
 * Volver a bronce BORRA el campo en vez de escribir `"bronze"`: bronce es la ausencia de rango, y así un perfil
 * degradado queda idéntico a uno que nunca tuvo tier, sin dejar un rastro que luego haya que interpretar.
 */
export async function setUserTier(profileDocId: string, tier: ProfileTier): Promise<void> {
  if (!profileDocId || profileDocId === PLACEHOLDER_ID) {
    throw new Error('Identificador de perfil no válido');
  }

  const services = await requireServices();
  try {
    await updateDoc(doc(services.firestore, 'profiles', profileDocId), {
      tier: tier === DEFAULT_PROFILE_TIER ? deleteField() : tier,
    });
  } catch (error) {
    throw toAdminError(error, 'cambiar el rango del perfil');
  }

  invalidateOwnProfileCache(profileDocId);
  invalidateSocialDirectoryCache();
}

/**
 * Activa o desactiva el social de un usuario. Con `false` sale del directorio y del feed (la consulta del hub
 * filtra por `social.enabled == true`), pero conserva su perfil, sus amistades y sus gists: es una suspensión
 * reversible, no un borrado.
 *
 * NO se toca `updatedAt`: es el latido de "última vez visto" del usuario y falsearlo desde el panel sería mentir
 * en el único dato de actividad que hay.
 */
export async function setUserSocialEnabled(profileDocId: string, enabled: boolean): Promise<void> {
  if (!profileDocId || profileDocId === PLACEHOLDER_ID) {
    throw new Error('Identificador de perfil no válido');
  }

  const services = await requireServices();
  try {
    await updateDoc(doc(services.firestore, 'profiles', profileDocId), { 'social.enabled': enabled });
  } catch (error) {
    throw toAdminError(error, 'cambiar la visibilidad social');
  }

  invalidateOwnProfileCache(profileDocId);
  invalidateSocialDirectoryCache();
}

/**
 * Borra del documento público los campos legacy indicados. Se purga CAMPO A CAMPO y no todo de golpe porque cada
 * uno tiene una consecuencia distinta para su dueño, y no son comparables:
 *
 * - `token`: el token de GitHub en claro, legible hoy por cualquier usuario autenticado. Borrarlo es urgente. Si
 *   ese usuario todavía no tiene el respaldo cifrado en `privateConfig`, pierde la recuperación automática y
 *   tendrá que volver a conectar GitHub la próxima vez que entre en un dispositivo nuevo.
 * - `gamesGistId`: es un id de gist público (no es un secreto). Es además el FALLBACK de
 *   `recoverGistIdFromGoogle` cuando `privateConfig.gamesGistId` está vacío, así que borrarlo puede costarle a su
 *   dueño tener que reintroducir el id a mano en un dispositivo nuevo. Ganancia baja, riesgo real.
 * - `email`: solo se puede borrar de un documento identificado por el uid (ver `AdminUserRow.idMatchesUid`). En
 *   un perfil legacy con otro id, el email es la única forma de volver a localizarlo: purgarlo lo dejaría
 *   huérfano. El llamador debe respetarlo; esto no puede comprobarlo sin releer el documento.
 *
 * El cliente del propio usuario ya los purga en su siguiente guardado (`ensureProfileByEmail`), pero solo si
 * vuelve a publicar; para quien no vuelve, esta es la única vía.
 */
export async function purgeLegacyProfileFields(
  profileDocId: string,
  fields: readonly LegacyProfileField[],
): Promise<void> {
  if (!profileDocId || profileDocId === PLACEHOLDER_ID) {
    throw new Error('Identificador de perfil no válido');
  }
  if (fields.length === 0) {
    throw new Error('No se indicó ningún campo que purgar');
  }

  // deleteField() ELIMINA el campo; no escribe ningún valor en el documento.
  const payload: Record<string, unknown> = {};
  fields.forEach((field) => {
    payload[LEGACY_FIELD_PATHS[field]] = deleteField();
  });

  const services = await requireServices();
  try {
    await updateDoc(doc(services.firestore, 'profiles', profileDocId), payload);
  } catch (error) {
    throw toAdminError(error, 'purgar los campos legacy');
  }

  invalidateOwnProfileCache(profileDocId);
  invalidateSocialDirectoryCache();
}

/**
 * BORRA EL ESPEJO DE LOGROS de un perfil (`profiles/{uid}.achievements`).
 *
 * QUÉ HACE Y QUÉ NO. Retira la vitrina publicada: sus amistades dejan de verle logros y su espejo sale de la
 * muestra con la que se mide el porcentaje comparado. NO le quita ningún logro a esa persona — los logros se
 * derivan de su biblioteca en su propio aparato y siguen ahí.
 *
 * ⚑ Y SE DESHACE SOLO. La marca de agua vive en el `localStorage` de cada dispositivo, así que la próxima vez que
 * esa persona abra la app volverá a publicar lo suyo. Esto no es un borrado permanente: es un borrado del
 * SERVIDOR, útil para dejar el censo limpio antes de un estreno o para retirar una vitrina concreta. Que aguante
 * exigiría una marca de corte que los clientes respetaran, y eso es otra función.
 */
export async function clearProfileAchievements(profileDocId: string): Promise<void> {
  if (!profileDocId || profileDocId === PLACEHOLDER_ID) {
    throw new Error('Identificador de perfil no válido');
  }

  const services = await requireServices();
  try {
    await updateDoc(doc(services.firestore, 'profiles', profileDocId), { achievements: deleteField() });
  } catch (error) {
    throw toAdminError(error, 'borrar el espejo de logros');
  }

  invalidateOwnProfileCache(profileDocId);
  invalidateSocialDirectoryCache();
}

/**
 * BORRA EL ESPEJO DE TODOS LOS PERFILES QUE SE LE PASEN. Devuelve cuántos se han borrado.
 *
 * NO PARA AL PRIMER FALLO, y es deliberado: un perfil que no se deje escribir no puede dejar a medias la limpieza
 * de los otros cuarenta. Se cuentan los que salieron y el panel dice el número; si no coincide con los que había,
 * se vuelve a pulsar.
 *
 * Se aplica el mismo aviso que arriba: cada dispositivo vuelve a publicar lo suyo la próxima vez que abra.
 */
export async function clearAllAchievements(profileDocIds: readonly string[]): Promise<number> {
  const services = await requireServices();
  let borrados = 0;
  for (const id of profileDocIds) {
    if (!id || id === PLACEHOLDER_ID) continue;
    try {
      await updateDoc(doc(services.firestore, 'profiles', id), { achievements: deleteField() });
      borrados += 1;
    } catch {
      // Un perfil que no se deja escribir no puede tumbar la limpieza de los demás.
    }
  }
  invalidateSocialDirectoryCache();
  return borrados;
}

/** Qué hizo el cutover de identidad. Lo cuenta el panel, y distingue las dos situaciones posibles. */
