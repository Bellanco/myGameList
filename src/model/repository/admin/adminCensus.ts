// CENSO del panel: la tabla de usuarios con perfil social y las señales que la acompañan.
//
// Es la única área del panel que solo LEE. Todo lo que detecta —inactividad, solicitudes fosilizadas, restos
// legacy, identidad divergente— se calcula aquí a partir de lo leído, y las acciones para arreglarlo viven en
// `adminModeration`.
//
// PRIVACIDAD: del `email` legacy que arrastran los perfiles antiguos solo se expone si EXISTE, nunca su valor.
// Para purgarlo no hace falta leerlo, y no tiene sentido pasear PII por el cliente para enseñarla en una tabla.
// Lo mismo con el id del gist de juegos y con el token en claro legacy.
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore/lite';
import { normalizeTier, type ProfileTier } from '../../../core/constants/tiers';
// La versión vigente se comparte con quien la sella (`firebaseRepository` y el saneado del arranque): con un
// espejo propio, subirla allí habría dejado de marcar aquí a los perfiles pendientes de migrar.
import { FIRESTORE_SCHEMA_VERSION } from '../../../core/constants/schema';
import type { AdminAnomaly } from '../../types/firestore';
import { INACTIVITY_MS, PLACEHOLDER_ID, STALE_PENDING_MS, FOSSIL_PENDING_MS, requireServices, toAdminError, toMillis } from './adminShared';
import { APP_LOCALE } from '../../../core/constants/locale';
import { isGenericGooglePhoto } from '../../../core/social/googlePhoto';

/**
 * Tope de perfiles que se traen de una vez. No hay paginación a propósito (el censo cabe de sobra); si algún día
 * se supera, `AdminCensus.truncated` lo dice en la interfaz en vez de mentir con una lista incompleta.
 */
export const ADMIN_PROFILES_LIMIT = 300;

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

export interface AdminCensus {
  users: AdminUserRow[];
  /**
   * Los ESPEJOS de logros publicados, sueltos y sin dueño: es lo que mide qué parte de la gente tiene cada
   * escalón (`measureRarity`) en la pantalla del catálogo.
   *
   * CUESTA CERO: el censo ya se baja el documento entero de cada perfil, así que esto es un campo más de un dato
   * que ya está en memoria — ni una petición nueva ni un índice.
   *
   * VAN SIN UID A PROPÓSITO. Para decidir si un escalón necesita un intermedio hace falta el reparto, no quién
   * tiene qué; y una lista de «los logros de cada usuario» en el panel es exactamente el tipo de dato que se
   * acaba enseñando por accidente. Como cadenas sueltas no se puede.
   */
  mirrors: string[];
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

async function tallyFriendships(
  firestore: import('firebase/firestore/lite').Firestore,
  now: number,
): Promise<FriendshipTally> {
  const snapshot = await getDocs(collection(firestore, 'friendships'));
  return tallyFriendshipDocs(snapshot.docs, now);
}

/**
 * El recuento en sí, sobre los documentos que se le den. Aparte de la lectura para poder recontar UNA ficha con solo
 * sus amistades (`reloadAdminCensusRow`) sin que el criterio pueda separarse del del censo entero.
 */
function tallyFriendshipDocs(docs: ReadonlyArray<{ data(): unknown }>, now: number): FriendshipTally {
  const byUid = new Map<string, FriendshipFacts>();
  let total = 0;
  let pending = 0;

  docs.forEach((entry) => {
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
function detectAnomalies(
  row: Omit<AdminUserRow, 'anomalies'>,
  friendGistIds: Set<string>,
  now: number,
  genericPhotos: ReadonlySet<string>,
): AdminAnomaly[] {
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

  // FOTO PUBLICADA DE MÁS. Hasta el 28-09-2026, publicar una reseña escribía en el perfil la foto de la sesión de
  // Google SIN FILTRAR: ni el interruptor de ocultarla ni la criba del avatar genérico. Dos huellas lo delatan:
  //   · es el avatar genérico (el monograma de Google, que la app nunca publica a sabiendas);
  //   · el perfil publica foto y NINGUNA de sus amistades guarda una: su propio cliente propaga a las amistades la
  //     foto que quiere enseñar, así que todas vacías es lo que deja quien la ocultó.
  // Sin amistades la segunda no se puede afirmar —quien la oculta y quien la enseña se ven igual— y no se afirma.
  const friendsSeeNoPhoto = row.friendKnownPhotos.length > 0 && row.friendKnownPhotos.every((photo) => !photo);
  if (row.photoURL && (genericPhotos.has(row.photoURL) || friendsSeeNoPhoto)) {
    found.push('stray-photo');
  }

  return found;
}

/** Monta la fila de un perfil con lo que sus amistades dicen de él, señales incluidas. */
function buildRow(
  entry: { id: string; data(): unknown },
  byUid: Map<string, FriendshipFacts>,
  docIds: Set<string>,
  now: number,
  genericPhotos: ReadonlySet<string>,
): AdminUserRow {
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
  const facts = byUid.get(uid) || emptyFacts();

  const row = {
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
  // Las señales se calculan sobre la fila ya montada (necesitan varios de sus campos a la vez) y con el `now`
  // que se le pase, para que todas las filas de un censo se juzguen con el mismo reloj.
  return { ...row, anomalies: detectAnomalies(row, facts.socialGistIds, now, genericPhotos) };
}

/**
 * Cuáles de estas fotos son el avatar genérico de Google. El veredicto se cachea por URL (`googlePhoto`), y las
 * mismas fotos las acaba de pedir el avatar de cada ficha, así que casi nunca sale a la red. Ante la duda, `false`:
 * una foto real nunca se marca por un fallo de red.
 */
async function resolveGenericPhotos(urls: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(urls.filter(Boolean))];
  const verdicts = await Promise.all(unique.map((url) => isGenericGooglePhoto(url).catch(() => false)));
  return new Set(unique.filter((_, index) => verdicts[index]));
}

/** Más recientes primero; los que no traen `updatedAt` caen al final (pero SALEN). */
function sortRows(users: AdminUserRow[]): AdminUserRow[] {
  return users.sort((a, b) => b.updatedAt - a.updatedAt || a.displayName.localeCompare(b.displayName, APP_LOCALE));
}

/**
 * Los totales del resumen. Los de perfiles salen de las filas; los de amistades, del recuento de la colección, que
 * cuenta documentos y no personas (una amistad es de dos).
 */
function buildTotals(users: AdminUserRow[], friendships: number, pending: number): AdminCensus['totals'] {
  return {
    profiles: users.length,
    socialEnabled: users.filter((user) => user.socialEnabled).length,
    friendships,
    pending,
    legacy: users.filter((user) => user.legacy.email || user.legacy.gamesGistId || user.legacy.token).length,
    /** Perfiles con al menos una señal: es el número que dice si hay que mirar algo hoy. */
    flagged: users.filter((user) => user.anomalies.length > 0).length,
    byTier: users.reduce(
      (acc, user) => ({ ...acc, [user.tier]: acc[user.tier] + 1 }),
      { bronze: 0, silver: 0, gold: 0, mithril: 0 } as Record<ProfileTier, number>,
    ),
  };
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

  // Los espejos de logros, recogidos aparte del recuento de usuarios: son cadenas sueltas y ninguna fila del
  // censo las necesita. El campo llega vacío mientras `ENABLE_ACHIEVEMENTS_PUBLISH` esté apagado, y entonces la
  // pantalla del catálogo dice que no hay muestra en vez de pintar un 0 % que parecería un dato.
  const mirrors = profilesSnapshot.docs
    .filter((entry) => entry.id !== PLACEHOLDER_ID)
    .map((entry) => String((entry.data() as { achievements?: { list?: string } }).achievements?.list || ''))
    .filter(Boolean);

  const profileDocs = profilesSnapshot.docs.filter((entry) => entry.id !== PLACEHOLDER_ID);
  const genericPhotos = await resolveGenericPhotos(
    profileDocs.map((entry) => String((entry.data() as { photoURL?: string }).photoURL || '')),
  );
  const users = sortRows(profileDocs.map((entry) => buildRow(entry, friendships.byUid, docIds, now, genericPhotos)));

  return {
    users,
    mirrors,
    truncated: profilesSnapshot.size >= normalizedLimit,
    totals: buildTotals(users, friendships.total, friendships.pending),
  };
}

/** Una ficha releída. `row: null` = el perfil ya no existe, y la ficha sale del censo. */
export interface AdminCensusRowReading {
  id: string;
  row: AdminUserRow | null;
}

/**
 * Vuelve a leer UNA ficha —su perfil y sus amistades— y la sustituye en el censo que ya había.
 *
 * PARA QUÉ. Cada acción de la ficha recargaba el censo entero: todos los perfiles y la colección de amistades
 * completa, para cambiar un dato de una persona. Esto son una lectura del perfil y una consulta de sus amistades.
 *
 * SOLO PARA ACCIONES QUE NO TOCAN A OTROS. Las filas ajenas no se releen, así que vale para lo que escribe en su
 * perfil o en SU lado de sus amistades (rango, social, restos legacy, identidad). Lo que cambia filas ajenas —purgar
 * solicitudes, que baja el `pendingIn` de quien las recibía; borrar; el cutover— necesita el censo entero.
 *
 * Va en dos piezas —leer y colocar— para que el ViewModel coloque la lectura sobre el censo que tenga EN ESE
 * MOMENTO: con dos fichas releyéndose a la vez, colocar sobre el censo del arranque borraría el cambio de la otra.
 *
 * Los totales de amistades se corrigen por diferencia: los documentos de esta persona son los únicos que han podido
 * cambiar, así que basta con restar lo que contaban antes y sumar lo que cuentan ahora.
 */
export async function readAdminCensusRow(census: AdminCensus, profileDocId: string): Promise<AdminCensusRowReading> {
  const previous = census.users.find((user) => user.id === profileDocId);
  if (!previous) {
    return { id: profileDocId, row: null };
  }
  const services = await requireServices();

  let profile;
  let friendshipDocs;
  try {
    [profile, friendshipDocs] = await Promise.all([
      getDoc(doc(services.firestore, 'profiles', profileDocId)),
      getDocs(query(collection(services.firestore, 'friendships'), where('users', 'array-contains', previous.uid))),
    ]);
  } catch (error) {
    throw toAdminError(error, 'releer el perfil');
  }

  const now = Date.now();
  const docIds = new Set(census.users.map((user) => user.id));
  const tally = tallyFriendshipDocs(friendshipDocs.docs, now);
  if (!profile.exists()) {
    return { id: profileDocId, row: null };
  }
  const genericPhotos = await resolveGenericPhotos([String((profile.data() as { photoURL?: string }).photoURL || '')]);
  return { id: profileDocId, row: buildRow(profile, tally.byUid, docIds, now, genericPhotos) };
}

/** La ficha releída, puesta en su sitio. Pura: se aplica sobre el censo MÁS RECIENTE, no sobre el de la lectura. */
export function replaceCensusRow(census: AdminCensus, reading: AdminCensusRowReading): AdminCensus {
  const previous = census.users.find((user) => user.id === reading.id);
  if (!previous) {
    return census;
  }
  const next = reading.row;
  const users = census.users.flatMap((user) => (user.id !== reading.id ? [user] : next ? [next] : []));
  const before = previous.friends + previous.pending;
  const after = next ? next.friends + next.pending : 0;
  return {
    ...census,
    users,
    totals: buildTotals(
      users,
      census.totals.friendships - before + after,
      census.totals.pending - previous.pending + (next ? next.pending : 0),
    ),
  };
}

/** Cuántos documentos ha tocado una acción que recorre las amistades de alguien. */
