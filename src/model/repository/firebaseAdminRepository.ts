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
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, limit, query, updateDoc, where, writeBatch } from 'firebase/firestore/lite';
import { DEFAULT_PROFILE_TIER, normalizeTier, type ProfileTier } from '../../core/constants/tiers';
// La versión vigente se comparte con quien la sella (`firebaseRepository` y el saneado del arranque): con un espejo
// propio, subirla allí habría dejado de marcar aquí a los perfiles pendientes de migrar.
import { FIRESTORE_SCHEMA_VERSION } from '../../core/constants/schema';
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
  /**
   * TODOS los nombres distintos que sus amistades tienen denormalizados de él.
   *
   * Con más de uno, o con uno distinto de su `displayName` actual, sus amigos le ven con un nick viejo: el doc de
   * amistad se escribió en el momento de la petición y no se reescribe al cambiar de nombre. Es el dato que
   * sostiene la señal `friend-name-mismatch`, y sin recogerlos todos no se puede comparar (`knownAs` se queda con el
   * primero que aparece, que no tiene por qué ser el vigente).
   */
  friendKnownNames: string[];
  /**
   * Fotos distintas que sus amistades tienen denormalizadas de él. Igual que el nombre, se quedan con la del
   * momento de la petición. Solo importa si alguna difiere de su `photoURL` actual: es lo que le ven sus amigos.
   */
  friendKnownPhotos: string[];
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

  /**
   * Ids de gist social que sus amistades tienen denormalizados de él. Con más de uno (o con uno distinto del que
   * publica su perfil) hay deriva: es lo que permite enseñar los candidatos y unificarlos.
   */
  friendSocialGistIds: string[];

  /**
   * Ids del gist de JUEGOS que sus amistades tienen denormalizados de él. Es con lo que un amigo carga sus listas
   * compartidas (`loadForeignProfileGames`), un canal distinto del social y con su propia deriva posible.
   *
   * Vacío es NORMAL y no es señal de nada: significa que no tiene la sincronización de listas configurada, algo
   * perfectamente legítimo en quien usa el social sin sincronizar sus juegos.
   */
  friendGamesGistIds: string[];

  /** Solicitudes que él envió y llevan más de 90 días sin que nadie las acepte. */
  stalePendingOut: number;
  /** De esas, las que superan los 180 días: las que el panel puede purgar. */
  fossilPendingOut: number;

  /**
   * ¿Se ha visto en el censo otro documento cuyo id sea su uid?
   *
   * Solo tiene sentido en las filas con `foreign-doc-id`, y es lo que decide qué hará el cutover: con gemelo
   * canónico el huérfano se FUSIONA (solo se rescata lo que le falte al vivo); sin él, el documento se MUEVE
   * entero. Sale del propio censo, así que no cuesta ninguna lectura extra — pero si el censo viene truncado,
   * la ausencia de gemelo no es concluyente.
   */
  canonicalTwinFound: boolean;

  /** Señales de que algo no cuadra en este perfil. Vacío = nada que mirar. */
  anomalies: AdminAnomaly[];
}

/** Ventana de inactividad del feed (`FRIEND_ACTIVITY_MAX_AGE_MS` en useSocialViewModel): 30 días. */
const INACTIVITY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A partir de cuándo una solicitud ENVIADA y nunca aceptada se considera fosilizada. Son dos umbrales distintos a
 * propósito, y el orden importa:
 *
 * - `STALE_PENDING_MS` (90 días) solo AVISA (señal `stale-pending-out`). A los tres meses ya no es una petición
 *   reciente que el otro no haya visto todavía: o no le interesa o no vuelve.
 * - `FOSSIL_PENDING_MS` (180 días) es el que habilita la purga. El doble de margen antes de BORRAR algo de dos
 *   personas: la señal es reversible (desaparece si la aceptan) y el borrado no.
 */
const STALE_PENDING_MS = 90 * 24 * 60 * 60 * 1000;
export const FOSSIL_PENDING_MS = 180 * 24 * 60 * 60 * 1000;


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
  /** Todos los nombres distintos que sus amistades guardan de él (para detectar el nick rancio). */
  names: Set<string>;
  /** Todas las fotos distintas que sus amistades guardan de él. */
  photos: Set<string>;
  /** Fecha de la amistad más antigua: el rastro fechado más viejo al que llega el panel. */
  firstAt: number;
  /** Movimiento más reciente en sus amistades. */
  lastAt: number;
  /** Ids de gist social que sus amistades tienen denormalizados de él (para detectar deriva). */
  socialGistIds: Set<string>;
  /** Ids del gist de JUEGOS que sus amistades tienen denormalizados de él (listas compartidas). */
  gamesGistIds: Set<string>;
  /** Solicitudes suyas pendientes con más de 90 días. */
  stalePendingOut: number;
  /** Solicitudes suyas pendientes con más de 180 días (purgables). */
  fossilPendingOut: number;
}

/** Recuento de amistades por uid, en una sola lectura de la colección. */
interface FriendshipTally {
  byUid: Map<string, FriendshipFacts>;
  total: number;
  pending: number;
}

function emptyFacts(): FriendshipFacts {
  return {
    friends: 0, pending: 0, pendingOut: 0, pendingIn: 0,
    name: '', names: new Set(), photos: new Set(),
    firstAt: 0, lastAt: 0,
    socialGistIds: new Set(), gamesGistIds: new Set(),
    stalePendingOut: 0, fossilPendingOut: 0,
  };
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
async function tallyFriendships(
  firestore: import('firebase/firestore/lite').Firestore,
  now: number,
): Promise<FriendshipTally> {
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
      requesterPhoto?: unknown;
      recipientPhoto?: unknown;
      requesterSocialGistId?: unknown;
      recipientSocialGistId?: unknown;
      requesterGamesGistId?: unknown;
      recipientGamesGistId?: unknown;
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
    const sideOf = (uid: string): { name: string; photo: string; socialGistId: string; gamesGistId: string } => {
      if (uid === data.requester) {
        return {
          name: String(data.requesterName || ''),
          photo: String(data.requesterPhoto || ''),
          socialGistId: String(data.requesterSocialGistId || ''),
          gamesGistId: String(data.requesterGamesGistId || ''),
        };
      }
      if (uid === data.recipient) {
        return {
          name: String(data.recipientName || ''),
          photo: String(data.recipientPhoto || ''),
          socialGistId: String(data.recipientSocialGistId || ''),
          gamesGistId: String(data.recipientGamesGistId || ''),
        };
      }
      return { name: '', photo: '', socialGistId: '', gamesGistId: '' };
    };

    users.forEach((uid) => {
      const current = byUid.get(uid) || emptyFacts();
      if (accepted) {
        current.friends += 1;
      } else {
        current.pending += 1;
        // Quién dio el paso: distinguirlo revela, por ejemplo, a quien manda peticiones en masa sin que nadie
        // se las acepte (muchas `pendingOut` y ninguna amistad).
        if (uid === data.requester) {
          current.pendingOut += 1;
          // Antigüedad de la petición: se mide con `createdAt`, no con `updatedAt`, porque lo que interesa es
          // cuánto lleva ESPERANDO. Sin fecha no se cuenta: un doc antiguo sin `createdAt` no es prueba de nada, y
          // el umbral de purga no puede apoyarse en una suposición.
          const age = createdAt > 0 ? now - createdAt : 0;
          if (age > STALE_PENDING_MS) current.stalePendingOut += 1;
          if (age > FOSSIL_PENDING_MS) current.fossilPendingOut += 1;
        } else {
          current.pendingIn += 1;
        }
      }

      const side = sideOf(uid);
      // El primero que aparezca vale para IDENTIFICAR (todos son el mismo nick en el momento de la petición); la
      // colección entera es la que permite ver si alguno se quedó atrás.
      current.name = current.name || side.name.trim();
      if (side.name.trim()) current.names.add(side.name.trim());
      // La foto se añade SIEMPRE, incluida la cadena vacía: "sin foto" es un valor legítimo y comparable. Filtrar
      // los vacíos escondería justo el caso de quien tiene foto en su perfil y sus amigos le siguen viendo sin ella.
      current.photos.add(side.photo);
      if (side.socialGistId) current.socialGistIds.add(side.socialGistId);
      if (side.gamesGistId) current.gamesGistIds.add(side.gamesGistId);

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

  // DESACUERDO DE NOMBRE entre el perfil y sus amistades. Los dos pueden ser el rancio:
  //   · las amistades, si cambió el nick y sus docs se quedaron con el del momento de la petición;
  //   · el PERFIL, si el guardado escribió su gist (de donde el feed lee el nick) y falló al replicar en Firestore;
  //     el saneado de amistades, que propaga el nick del gist, dejaría entonces a las amistades al día y al perfil no.
  // Desde aquí no se puede distinguir —haría falta leer su gist, y eso exige su token—, así que la señal solo dice
  // que no coinciden. Se compara contra los nombres denormalizados y no contra `knownAs` (que es solo el primero que
  // apareció). Sin `displayName` no hay nada que comparar, y de eso ya avisa `no-display-name`.
  const currentName = row.displayName.trim();
  if (currentName && row.friendKnownNames.some((name) => name !== currentName)) {
    found.push('friend-name-mismatch');
  }

  // `enabled-without-gist` ya NO se emite. El id del canal dejó de publicarse en el perfil, así que está vacío
  // para todo el mundo y la señal se dispararía con cualquiera. Tampoco se puede sustituir mirando sus amistades:
  // alguien recién llegado y sin amigos no tiene ninguna, y no por eso su canal está roto. El panel simplemente
  // pierde esta señal — es el precio de que el id deje de ser world-readable, y es un buen cambio.
  if (!row.displayName.trim()) found.push('no-display-name');
  if (!row.profileId) found.push('no-profile-id');
  if (!row.idMatchesUid) found.push('foreign-doc-id');
  if (row.legacy.token) found.push('legacy-token');
  if (row.legacy.email || row.legacy.gamesGistId) found.push('legacy-fields');
  if (row.schemaVersion < FIRESTORE_SCHEMA_VERSION) found.push('stale-schema');

  if (row.updatedAt === 0) found.push('never-active');
  else if (row.updatedAt > now) found.push('future-activity');
  else if (now - row.updatedAt > INACTIVITY_MS) found.push('inactive');

  if (row.createdAt > 0 && row.updatedAt > 0 && row.createdAt > row.updatedAt) found.push('created-after-activity');

  // DERIVA DEL CANAL SOCIAL: el fallo por el que las reseñas de alguien no aparecen en el feed de sus amigos.
  //
  // La comprobación original —comparar el gist que publica su perfil con el que guardan sus amistades— quedó MUERTA
  // al dejar de publicarse `social.gistId`: el campo está vacío para todo el mundo, así que la condición no se
  // cumplía nunca y la señal no volvió a saltar. La deriva, en cambio, sigue existiendo.
  //
  // Lo que sí es observable hoy son los ids denormalizados en `friendships`. Dos casos, y ambos significan que
  // alguien está leyendo un canal abandonado:
  //   1. sus amistades no se ponen de acuerdo entre ellas (más de un id distinto);
  //   2. su perfil TODAVÍA publica un id (resto legacy sin purgar) que no es el que guardan sus amistades.
  // Un solo id compartido por todos, o ninguna amistad, no es deriva: es lo normal.
  const friendGistDisagreement = friendGistIds.size > 1;
  const profileGistDisagrees = Boolean(row.socialGistId) && friendGistIds.size > 0 && !friendGistIds.has(row.socialGistId);
  if (friendGistDisagreement || profileGistDisagrees) {
    found.push('gist-drift');
  }

  // DERIVA DEL GIST DE JUEGOS: canal distinto del social y avería distinta —lo que no se ve son sus LISTAS
  // compartidas, no sus reseñas—. Solo cuenta la discrepancia entre sus amistades: que esté vacío es lo normal en
  // quien no tiene la sincronización de listas configurada, y señalarlo sería un falso positivo constante.
  if (row.friendGamesGistIds.length > 1) {
    found.push('games-gist-drift');
  }

  // Peticiones que envió y nadie aceptó en 90 días. Informativa: puede ser alguien que se apuntó, mandó unas
  // cuantas y no volvió, y también es lo que distingue a quien las manda en masa.
  if (row.stalePendingOut > 0) {
    found.push('stale-pending-out');
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

  // Un solo instante para todo el censo: si cada fila leyera su propio `Date.now()`, dos perfiles idénticos
  // podrían acabar con señales distintas por unos milisegundos. Se toma ANTES del recuento porque la antigüedad de
  // las solicitudes pendientes se mide ahí con el mismo reloj.
  const now = Date.now();

  let friendships: FriendshipTally;
  try {
    friendships = await tallyFriendships(services.firestore, now);
  } catch (error) {
    throw toAdminError(error, 'listar las amistades');
  }

  // Ids de documento presentes en el censo: es lo que permite saber si un perfil huérfano tiene ya su gemelo
  // canónico en `profiles/{uid}` y, por tanto, si el cutover fusionará o moverá.
  const docIds = new Set(profilesSnapshot.docs.map((entry) => entry.id));

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
        friendKnownNames: [...facts.names],
        friendKnownPhotos: [...facts.photos],
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
        friendSocialGistIds: [...facts.socialGistIds],
        friendGamesGistIds: [...facts.gamesGistIds],
        stalePendingOut: facts.stalePendingOut,
        fossilPendingOut: facts.fossilPendingOut,
        // Un documento no es gemelo de sí mismo: solo cuenta si el destino del cutover es OTRO documento del censo.
        canonicalTwinFound: uid !== entry.id && docIds.has(uid),
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

/** Cuántos documentos ha tocado una acción que recorre las amistades de alguien. */
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
    const data = entry.data() as Partial<import('../types/firestore').FriendshipDoc>;
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
    const data = entry.data() as Partial<import('../types/firestore').FriendshipDoc>;
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

/** Qué hizo el cutover de identidad. Lo cuenta el panel, y distingue las dos situaciones posibles. */
export type IdentityCutoverOutcome =
  /** No existía `profiles/{uid}`: el documento legacy se ha MOVIDO ahí entero y el original se ha borrado. */
  | 'moved'
  /** Ya existía `profiles/{uid}`: manda el vivo, y del huérfano solo se ha rescatado lo que al vivo le faltaba. */
  | 'merged';

export interface IdentityCutoverResult {
  outcome: IdentityCutoverOutcome;
  /** Campos que se han rescatado del huérfano al documento vivo (vacío en un `moved`, que se lleva todo). */
  carried: string[];
}

/**
 * CUTOVER DE IDENTIDAD (señal `foreign-doc-id`): lleva un perfil legacy que vive bajo un id cualquiera a
 * `profiles/{uid}`, que es donde la app lo busca hoy, y borra el original.
 *
 * Por qué esto es del ADMIN y no del dueño: las reglas solo dejan escribir y borrar `profiles/{docId}` a quien
 * cumple `isOwner(docId)`. Sobre un documento cuyo id NO es su uid, el dueño no puede hacer nada —ni borrarlo ni
 * apagarlo—, así que el huérfano solo lo puede retirar el administrador. Lo que el dueño SÍ puede es crear su
 * documento canónico, y su navegador lo hace al entrar (ver `firebaseProfileHealRepository`).
 *
 * MOVER, NO REESCRIBIR: el documento legacy se copia TAL CUAL (incluidos `email`, `social.gistId`,
 * `social.gamesGistId` y el token en claro legacy). Podría parecer lo contrario de la purga de PII, y es justo al
 * revés: mientras el documento vive bajo un id ajeno, el auto-saneado del dueño no lo toca —solo mira
 * `profiles/{uid}`—, así que esos restos son intocables. En cuanto están en el documento canónico, el primer inicio
 * de sesión del dueño pone el token y el id del gist a salvo cifrados en `privateConfig` y purga el resto. Copiarlos
 * es lo que DESBLOQUEA la limpieza; dejarlos atrás sería destruir la única copia que le queda de su token.
 *
 * `uid` se fuerza al del destino: sin ese campo (hay perfiles tan viejos que no lo tienen) la regla
 * `profileWriteIsValid` denegaría al dueño cualquier escritura sobre su propio perfil recién movido.
 *
 * Las amistades NO se tocan: sus documentos referencian uids, no ids de perfil, así que el movimiento les es
 * indiferente. Y el `tier` viaja con el documento (o se rescata), que es lo que no podría hacer el dueño.
 *
 * Todo en un único `writeBatch`: o el perfil aparece en su sitio y el huérfano desaparece, o no cambia nada. Sin
 * ventana intermedia en la que el usuario esté duplicado en el directorio o no exista en ninguno de los dos sitios.
 */
export async function migrateForeignProfileDoc(legacyDocId: string, uid: string): Promise<IdentityCutoverResult> {
  const cleanLegacyId = String(legacyDocId || '').trim();
  const cleanUid = String(uid || '').trim();

  if (!cleanLegacyId || cleanLegacyId === PLACEHOLDER_ID) {
    throw new Error('Identificador de perfil no válido');
  }
  if (!cleanUid) {
    throw new Error('No se conoce el uid de destino: sin él no hay a dónde mover el perfil');
  }
  if (cleanLegacyId === cleanUid) {
    throw new Error('Este perfil ya vive en `profiles/{uid}`: no hay nada que migrar');
  }

  const services = await requireServices();

  let legacySnapshot;
  let targetSnapshot;
  try {
    [legacySnapshot, targetSnapshot] = await Promise.all([
      getDoc(doc(services.firestore, 'profiles', cleanLegacyId)),
      getDoc(doc(services.firestore, 'profiles', cleanUid)),
    ]);
  } catch (error) {
    throw toAdminError(error, 'leer los perfiles de la migración');
  }

  if (!legacySnapshot.exists()) {
    throw new Error('El perfil legacy ya no existe: recarga el censo');
  }

  const legacyData = legacySnapshot.data() as Record<string, unknown>;
  const batch = writeBatch(services.firestore);
  const legacyRef = doc(services.firestore, 'profiles', cleanLegacyId);
  const targetRef = doc(services.firestore, 'profiles', cleanUid);
  const carried: string[] = [];

  if (!targetSnapshot.exists()) {
    // MOVER el documento entero. `merge: false` a propósito: es el mismo perfil cambiando de sitio, no una fusión.
    batch.set(targetRef, { ...legacyData, uid: cleanUid }); // audit-allow: MOVIMIENTO literal del documento (el email ya era público en el origen); el saneado del dueño lo purga después
    batch.delete(legacyRef);
  } else {
    // Ya hay documento canónico (su dueño ya ha pasado por aquí). El vivo MANDA: pisarlo con el legacy le
    // devolvería un nick o una foto viejos. Del huérfano solo se rescata lo que al vivo le falte, y lo que se
    // rescata es exactamente lo que su dueño no podría recuperar de otro sitio.
    const targetData = targetSnapshot.data() as Record<string, unknown>;
    const legacySocial = (legacyData.social || {}) as Record<string, unknown>;
    const targetSocial = (targetData.social || {}) as Record<string, unknown>;
    const rescue: Record<string, unknown> = { uid: cleanUid };

    // El rango lo asigna el administrador y el dueño no puede escribirlo: si se quedara en el huérfano, se
    // perdería en el borrado y habría que volver a asignarlo a mano.
    if (legacyData.tier && !targetData.tier) {
      rescue.tier = legacyData.tier;
      carried.push('tier');
    }

    // Antigüedad: gana la fecha de alta MÁS ANTIGUA de las dos. El dueño no puede reescribir la suya (las reglas
    // la declaran inmutable), así que esta es la única oportunidad de conservarla.
    const legacyCreatedAt = toMillis(legacyData.createdAt as never);
    const targetCreatedAt = toMillis(targetData.createdAt as never);
    if (legacyCreatedAt > 0 && (targetCreatedAt === 0 || legacyCreatedAt < targetCreatedAt)) {
      rescue.createdAt = legacyData.createdAt;
      carried.push('createdAt');
    }

    // Restos de recuperación: solo si el vivo no los tiene ya. Van al documento canónico para que el saneado del
    // arranque los ponga a salvo cifrados y los purgue; ahí sí puede, y en el huérfano nunca pudo.
    if (legacySocial.githubToken && !targetSocial.githubToken) {
      rescue['social.githubToken'] = legacySocial.githubToken; // audit-allow: RESCATE del token legacy para que el saneado del dueño lo cifre en privateConfig y lo purgue; en el huérfano se perdería
      carried.push('social.githubToken');
    }
    if (legacySocial.gamesGistId && !targetSocial.gamesGistId) {
      rescue['social.gamesGistId'] = legacySocial.gamesGistId; // audit-allow: RESCATE del id de gist para que el saneado lo mueva a privateConfig (owner-only)
      carried.push('social.gamesGistId');
    }
    if (legacySocial.gistId && !targetSocial.gistId) {
      rescue['social.gistId'] = legacySocial.gistId;
      carried.push('social.gistId');
    }

    batch.set(targetRef, rescue, { merge: true });
    batch.delete(legacyRef);
  }

  try {
    await batch.commit();
  } catch (error) {
    throw toAdminError(error, 'migrar la identidad del perfil');
  }

  invalidateOwnProfileCache(cleanLegacyId);
  invalidateOwnProfileCache(cleanUid);
  invalidateSocialDirectoryCache();

  return { outcome: targetSnapshot.exists() ? 'merged' : 'moved', carried };
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
