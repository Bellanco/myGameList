// Panel de administración: censo de usuarios y acciones de moderación sobre `profiles` / `friendships`.
//
// TODO lo que hay aquí lo autoriza `isAdmin()` en firestore.rules (mismo correo + email verificado). Para
// cualquier otra sesión, cada función de este módulo responde `permission-denied`: el módulo no concede nada por
// sí mismo, solo habla con Firestore como el resto de repositorios.
//
// Lo que este módulo NO puede hacer, y es intencionado: `privateConfig`, `publicConfig` y `userMap` son
// owner-only en las reglas (ahí vive el token cifrado del usuario), así que el admin ni los lee ni los borra.
// El borrado de un usuario desde aquí es, por tanto, PARCIAL — ver `deleteUserProfile`.
//
// PRIVACIDAD: del `email` legacy que arrastran los perfiles antiguos solo se expone si EXISTE, nunca su valor.
// Para purgarlo no hace falta leerlo, y no tiene sentido volver a pasear PII por el cliente para enseñarla en una
// tabla. Lo mismo con el id del gist de juegos y con el token en claro legacy.
import { collection, deleteDoc, deleteField, doc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { DEFAULT_PROFILE_TIER, normalizeTier, type ProfileTier } from '../../core/constants/tiers';
import type { AdminAnomaly } from '../types/firestore';
import { initializeFirebaseServices, isPermissionDeniedError } from './firebaseClient';
import { invalidateOwnProfileCache, invalidateSocialDirectoryCache } from './firebaseSocialRepository';
import { invalidateMyFriendshipsCache } from './firebaseFriendshipRepository';

/**
 * Tope de perfiles que se traen de una vez. No hay paginación a propósito (el censo cabe de sobra); si algún día
 * se supera, `AdminCensus.truncated` lo dice en la interfaz en vez de mentir con una lista incompleta.
 */
export const ADMIN_PROFILES_LIMIT = 300;

/** Documento centinela de la colección: ni es un usuario ni las reglas dejan tocarlo. */
const PLACEHOLDER_ID = '_placeholder';

export interface AdminUserRow {
  /** Id del documento en `profiles` (hoy coincide con el uid; tras el cutover será el profileId). */
  id: string;
  uid: string;
  displayName: string;
  /**
   * Nombre con el que le conocen sus amigos, sacado de los campos denormalizados de `friendships`. Sirve para
   * identificar a quien tiene el perfil a medias (`displayName` vacío): el doc de amistad guardó su nombre en el
   * momento de la petición y ahí sigue. Vacío si no tiene amistades. No es PII nueva: es el mismo nick público.
   */
  knownAs: string;
  photoURL: string;
  socialEnabled: boolean;
  socialGistId: string;
  /** Rango asignado por el admin. Los perfiles sin campo `tier` son bronce. */
  tier: ProfileTier;
  /** Última actividad conocida (`updatedAt`), en ms. 0 si el doc no lo trae. */
  updatedAt: number;
  /** Amistades aceptadas. */
  friends: number;
  /** Solicitudes pendientes (en cualquier sentido). */
  pending: number;
  /** Restos legacy pendientes de purga. Se expone la PRESENCIA, nunca el valor. */
  legacy: {
    email: boolean;
    gamesGistId: boolean;
    /** Token de GitHub en claro en `social.githubToken`: lo más grave que puede quedar en un doc público. */
    token: boolean;
  };
  /**
   * ¿El documento se identifica por el uid de su dueño (`profiles/{uid}`, el modelo actual)?
   *
   * Si es `false`, el perfil es de una versión anterior y vive bajo otro id: para ESE documento, el `email` es la
   * ÚNICA forma de que su dueño vuelva a encontrarlo (`findSocialProfileByEmail` es el fallback cuando la lectura
   * por uid no da nada). Purgárselo lo dejaría huérfano y le crearía un perfil duplicado en su próximo guardado.
   * Por eso `ensureProfileByEmail` tampoco lo purga en ese caso, y el panel debe respetar la misma regla.
   */
  idMatchesUid: boolean;

  // --- Identidad y esquema ---
  /** Pseudónimo canónico (`profileId`). Vacío si nunca se estableció la identidad (ver `establishProfileIdentity`). */
  profileId: string;
  /** Versión del esquema del documento. 0 si no la trae (anterior a que existiera). */
  schemaVersion: number;
  /** ¿Tiene foto publicada? Solo la presencia: la URL no aporta nada en una tabla. */
  hasPhoto: boolean;
  /** ¿El perfil guarda el ETag de su gist social? Su ausencia obliga a releer el gist entero. */
  hasSocialEtag: boolean;

  // --- Fechas ---
  /** Alta sellada en el documento (`createdAt`), en ms. 0 si el perfil es anterior a que se registrara. */
  createdAt: number;
  /**
   * Alta ESTIMADA para los perfiles sin `createdAt`: la fecha de su amistad más antigua, que es el rastro fechado
   * más viejo al que llega el panel. 0 si no tiene amistades.
   */
  estimatedFirstSeenAt: number;
  /** Movimiento más reciente en sus amistades, en ms. 0 si no tiene ninguna. */
  lastFriendshipAt: number;

  // --- Relaciones, desglosadas ---
  /** Solicitudes que ÉL envió y siguen pendientes. */
  pendingOut: number;
  /** Solicitudes que ha RECIBIDO y siguen pendientes. */
  pendingIn: number;

  /** Señales de que algo no cuadra en este perfil. Vacío = nada que mirar. */
  anomalies: AdminAnomaly[];
}

/** Ventana de inactividad del feed (`FRIEND_ACTIVITY_MAX_AGE_MS` en useSocialViewModel): 30 días. */
const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

/** Versión de esquema vigente (espejo de `FIRESTORE_SCHEMA_VERSION` en firebaseRepository). */
const CURRENT_SCHEMA_VERSION = 1;

/** Campos legacy purgables, uno a uno: cada uno tiene consecuencias distintas para su dueño. */
export type LegacyProfileField = 'email' | 'gamesGistId' | 'token';

const LEGACY_FIELD_PATHS: Record<LegacyProfileField, string> = {
  email: 'email', // audit-allow: es la RUTA del campo a borrar con deleteField(), no un email almacenado
  gamesGistId: 'social.gamesGistId', // audit-allow: es la RUTA del campo a borrar con deleteField(), no un valor almacenado
  token: 'social.githubToken',
};

export interface AdminCensus {
  users: AdminUserRow[];
  /** true si se alcanzó `ADMIN_PROFILES_LIMIT` y por tanto la lista puede estar incompleta. */
  truncated: boolean;
  totals: {
    profiles: number;
    socialEnabled: number;
    friendships: number;
    pending: number;
    /** Perfiles con algún resto legacy (email / gamesGistId / token en claro). */
    legacy: number;
    /** Perfiles con al menos una señal de algo fuera de lugar. */
    flagged: number;
    /** Reparto por rango. */
    byTier: Record<ProfileTier, number>;
  };
}

export interface AdminActionResult {
  ok: boolean;
  failures: string[];
}

/** Lo que se sabe de un uid a partir de sus documentos de amistad. */
interface FriendshipFacts {
  friends: number;
  pending: number;
  pendingOut: number;
  pendingIn: number;
  name: string;
  /** Fecha de la amistad más antigua: el rastro fechado más viejo al que llega el panel. */
  firstAt: number;
  /** Movimiento más reciente en sus amistades. */
  lastAt: number;
  /** Ids de gist social que sus amistades tienen denormalizados de él (para detectar deriva). */
  socialGistIds: Set<string>;
}

/** Recuento de amistades por uid, en una sola lectura de la colección. */
interface FriendshipTally {
  byUid: Map<string, FriendshipFacts>;
  total: number;
  pending: number;
}

function emptyFacts(): FriendshipFacts {
  return { friends: 0, pending: 0, pendingOut: 0, pendingIn: 0, name: '', firstAt: 0, lastAt: 0, socialGistIds: new Set() };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `updatedAt` puede venir como Timestamp de Firestore o como número (docs de clientes antiguos). */
function toMillis(value: { toMillis?: () => number } | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const millis = value?.toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : 0;
}

/** Traduce el `permission-denied` de las reglas al lenguaje del panel (la causa siempre es la misma: no eres admin). */
function toAdminError(error: unknown, what: string): Error {
  if (isPermissionDeniedError(error)) {
    return new Error(`Sin permisos de administrador para ${what}. Inicia sesión con la cuenta de administrador.`);
  }
  return error instanceof Error ? error : new Error(String(error));
}

async function requireServices() {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }
  return services;
}

/**
 * Amistades agregadas por uid. Una única lectura de la colección entera: el admin las ve todas (regla `isAdmin()`),
 * y contarlas en el cliente evita N consultas (una por usuario) para un dato que es puramente informativo.
 */
async function tallyFriendships(firestore: import('firebase/firestore').Firestore): Promise<FriendshipTally> {
  const snapshot = await getDocs(collection(firestore, 'friendships'));
  const byUid = new Map<string, FriendshipFacts>();
  let total = 0;
  let pending = 0;

  snapshot.docs.forEach((entry) => {
    const data = entry.data() as {
      users?: unknown;
      status?: unknown;
      requester?: unknown;
      recipient?: unknown;
      requesterName?: unknown;
      recipientName?: unknown;
      requesterSocialGistId?: unknown;
      recipientSocialGistId?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
    };
    const users = Array.isArray(data.users) ? data.users.filter((uid): uid is string => typeof uid === 'string') : [];
    if (users.length === 0) {
      return; // el placeholder no tiene `users`
    }

    total += 1;
    const accepted = data.status === 'accepted';
    if (!accepted) {
      pending += 1;
    }

    const createdAt = toMillis(data.createdAt as never);
    const updatedAt = toMillis(data.updatedAt as never);

    // Campos denormalizados que cada parte escribió de SÍ MISMA al crear o aceptar la petición.
    const sideOf = (uid: string): { name: string; socialGistId: string } => {
      if (uid === data.requester) {
        return { name: String(data.requesterName || ''), socialGistId: String(data.requesterSocialGistId || '') };
      }
      if (uid === data.recipient) {
        return { name: String(data.recipientName || ''), socialGistId: String(data.recipientSocialGistId || '') };
      }
      return { name: '', socialGistId: '' };
    };

    users.forEach((uid) => {
      const current = byUid.get(uid) || emptyFacts();
      if (accepted) {
        current.friends += 1;
      } else {
        current.pending += 1;
        // Quién dio el paso: distinguirlo revela, por ejemplo, a quien manda peticiones en masa sin que nadie
        // se las acepte (muchas `pendingOut` y ninguna amistad).
        if (uid === data.requester) current.pendingOut += 1;
        else current.pendingIn += 1;
      }

      const side = sideOf(uid);
      // El primero que aparezca vale: no hay forma de saber cuál es más reciente y todos son el mismo nick.
      current.name = current.name || side.name.trim();
      if (side.socialGistId) current.socialGistIds.add(side.socialGistId);

      if (createdAt > 0) current.firstAt = current.firstAt === 0 ? createdAt : Math.min(current.firstAt, createdAt);
      current.lastAt = Math.max(current.lastAt, updatedAt, createdAt);
      byUid.set(uid, current);
    });
  });

  return { byUid, total, pending };
}

/**
 * Señales de que algo no cuadra. Se calculan aquí (y no en la vista) para que sean el mismo juicio en cualquier
 * sitio que las pinte, y para poder probarlas sin renderizar nada.
 */
function detectAnomalies(row: Omit<AdminUserRow, 'anomalies'>, friendGistIds: Set<string>, now: number): AdminAnomaly[] {
  const found: AdminAnomaly[] = [];

  if (row.socialEnabled && !row.socialGistId) found.push('enabled-without-gist');
  if (!row.displayName.trim()) found.push('no-display-name');
  if (!row.profileId) found.push('no-profile-id');
  if (!row.idMatchesUid) found.push('foreign-doc-id');
  if (row.legacy.token) found.push('legacy-token');
  if (row.legacy.email || row.legacy.gamesGistId) found.push('legacy-fields');
  if (row.schemaVersion < CURRENT_SCHEMA_VERSION) found.push('stale-schema');

  if (row.updatedAt === 0) found.push('never-active');
  else if (row.updatedAt > now) found.push('future-activity');
  else if (now - row.updatedAt > INACTIVITY_MS) found.push('inactive');

  if (row.createdAt > 0 && row.updatedAt > 0 && row.createdAt > row.updatedAt) found.push('created-after-activity');

  // Deriva del gist social: sus amistades guardan un id distinto del que publica el directorio. Es el fallo por el
  // que las reseñas de alguien no aparecen en el feed de sus amigos, y desde aquí se ve de un vistazo.
  if (row.socialGistId && friendGistIds.size > 0 && !friendGistIds.has(row.socialGistId)) {
    found.push('gist-drift');
  }

  return found;
}

/**
 * Censo completo: todos los perfiles (incluidos los que tienen el social DESACTIVADO, que el directorio filtra) con
 * su recuento de amistades.
 *
 * Sin `orderBy('updatedAt')` a propósito: un `orderBy` deja fuera los documentos que NO tienen ese campo, y en un
 * censo de administración una omisión silenciosa es peor que un orden imperfecto. Se ordena en el cliente.
 *
 * OJO con el alcance: solo aparece quien tiene documento en `profiles`, es decir quien ha llegado a montar el
 * perfil social. Un usuario que solo entra con Google y usa las listas no tiene perfil, y sus otros documentos son
 * owner-only: para el admin es invisible, y no hay forma de verlo desde el cliente.
 */
export async function loadAdminCensus(limitCount = ADMIN_PROFILES_LIMIT): Promise<AdminCensus> {
  const services = await requireServices();
  const normalizedLimit = Math.max(1, limitCount);

  let profilesSnapshot;
  try {
    profilesSnapshot = await getDocs(query(collection(services.firestore, 'profiles'), limit(normalizedLimit)));
  } catch (error) {
    throw toAdminError(error, 'listar los perfiles');
  }

  let friendships: FriendshipTally;
  try {
    friendships = await tallyFriendships(services.firestore);
  } catch (error) {
    throw toAdminError(error, 'listar las amistades');
  }

  // Un solo instante para todo el censo: si cada fila leyera su propio `Date.now()`, dos perfiles idénticos
  // podrían acabar con señales distintas por unos milisegundos.
  const now = Date.now();

  const users = profilesSnapshot.docs
    .filter((entry) => entry.id !== PLACEHOLDER_ID)
    .map((entry) => {
      const data = entry.data() as {
        uid?: string;
        profileId?: string;
        schemaVersion?: number;
        displayName?: string;
        photoURL?: string;
        email?: string;
        tier?: string;
        social?: { gistId?: string; etag?: string | null; gamesGistId?: string; githubToken?: string; enabled?: boolean };
        updatedAt?: { toMillis?: () => number } | number;
        createdAt?: { toMillis?: () => number } | number;
      };
      const social = data.social || {};
      const uid = String(data.uid || entry.id);
      const facts = friendships.byUid.get(uid) || emptyFacts();

      return {
        id: entry.id,
        uid,
        displayName: String(data.displayName || ''),
        knownAs: facts.name,
        photoURL: String(data.photoURL || ''),
        socialEnabled: Boolean(social.enabled),
        socialGistId: String(social.gistId || ''),
        tier: normalizeTier(data.tier),
        updatedAt: toMillis(data.updatedAt),
        friends: facts.friends,
        pending: facts.pending,
        pendingOut: facts.pendingOut,
        pendingIn: facts.pendingIn,
        profileId: String(data.profileId || ''),
        schemaVersion: Number(data.schemaVersion || 0),
        hasPhoto: Boolean(data.photoURL),
        hasSocialEtag: Boolean(social.etag),
        createdAt: toMillis(data.createdAt),
        estimatedFirstSeenAt: facts.firstAt,
        lastFriendshipAt: facts.lastAt,
        legacy: {
          email: Boolean(data.email), // audit-allow: solo se comprueba la PRESENCIA del campo legacy; el valor no sale de aquí
          gamesGistId: Boolean(social.gamesGistId), // audit-allow: presencia del campo legacy para poder purgarlo; no se escribe ni se muestra
          token: Boolean(social.githubToken), // audit-allow: LECTURA de presencia para poder purgarlo; no se almacena ni se muestra
        },
        // Se compara contra el campo `uid` REAL del documento, no contra el `uid` derivado de arriba (que cae al
        // id del doc cuando falta): un perfil tan viejo que ni siquiera tiene `uid` es justo el que no se puede
        // purgar a ciegas, y darlo por bueno sería el error caro.
        idMatchesUid: String(data.uid || '') === entry.id,
      };
    })
    // Las señales se calculan sobre la fila ya montada (necesitan varios de sus campos a la vez) y con un único
    // `now`, para que todas las filas se juzguen con el mismo reloj.
    .map((row) => ({
      ...row,
      anomalies: detectAnomalies(row, friendships.byUid.get(row.uid)?.socialGistIds || new Set(), now),
    }))
    // Más recientes primero; los que no traen `updatedAt` caen al final (pero SALEN).
    .sort((a, b) => b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName));

  return {
    users,
    truncated: profilesSnapshot.size >= normalizedLimit,
    totals: {
      profiles: users.length,
      socialEnabled: users.filter((user) => user.socialEnabled).length,
      friendships: friendships.total,
      pending: friendships.pending,
      legacy: users.filter((user) => user.legacy.email || user.legacy.gamesGistId || user.legacy.token).length,
      /** Perfiles con al menos una señal: es el número que dice si hay que mirar algo hoy. */
      flagged: users.filter((user) => user.anomalies.length > 0).length,
      byTier: users.reduce(
        (acc, user) => ({ ...acc, [user.tier]: acc[user.tier] + 1 }),
        { bronze: 0, silver: 0, gold: 0, mithril: 0 } as Record<ProfileTier, number>,
      ),
    },
  };
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
 * Borra el perfil de un usuario y TODAS sus amistades (en ambos sentidos: el doc de amistad guarda también la
 * identidad denormalizada del que se va, así que dejarlo sería dejar su nombre y su foto en la bandeja del otro).
 *
 * BORRADO PARCIAL, y hay que decirlo claro: `privateConfig`, `publicConfig` y `userMap` de ese usuario son
 * owner-only en las reglas y sobreviven a esta operación, igual que su cuenta de Firebase Auth y sus gists de
 * GitHub. Para un borrado completo haría falta el Admin SDK en servidor. Lo que sí consigue: el usuario desaparece
 * del directorio, del feed y de las listas de amigos, y al volver a entrar se le crea un perfil nuevo.
 *
 * Best-effort acumulativo (mismo criterio que `deleteOwnAccount`): no aborta al primer fallo, los reporta.
 */
export async function deleteUserProfile(profileDocId: string, uid: string): Promise<AdminActionResult> {
  if (!profileDocId || profileDocId === PLACEHOLDER_ID) {
    return { ok: false, failures: ['Identificador de perfil no válido'] };
  }

  const services = await requireServices();
  const failures: string[] = [];
  const targetUid = uid || profileDocId;

  try {
    const snapshot = await getDocs(
      query(collection(services.firestore, 'friendships'), where('users', 'array-contains', targetUid)),
    );
    const results = await Promise.allSettled(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      failures.push(`amistades: ${failed} de ${snapshot.size} no se pudieron borrar`);
    }
  } catch (error) {
    failures.push(`amistades: ${describe(toAdminError(error, 'borrar las amistades'))}`);
  }

  try {
    await deleteDoc(doc(services.firestore, 'profiles', profileDocId));
  } catch (error) {
    failures.push(`perfil: ${describe(toAdminError(error, 'borrar el perfil'))}`);
  }

  invalidateOwnProfileCache(profileDocId);
  invalidateMyFriendshipsCache();
  invalidateSocialDirectoryCache();

  return { ok: failures.length === 0, failures };
}
