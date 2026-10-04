// Capa social en Firestore: directorio de perfiles y resolución del perfil PROPIO (+ sus cachés).
// Extraído de firebaseRepository.ts (M2). NO importa de la fachada (sin ciclos).
// C5: eliminados el índice público (upsertProfileIndex/upsertFeedCard) y las recomendaciones — código muerto
// (sin consumidores) y con reglas admin-only. Ver CODE-REVIEW-IMPROVEMENTS.md (migración PII gated).
//
// L1 (privacidad): el perfil propio se resuelve por `getDoc(profiles/{uid})`, no consultando la colección por
// `email`. Todas las llamadas de la app eran siempre con el email del propio usuario (recuperar mi perfil en un
// dispositivo nuevo); nadie busca a otros por correo. Leer por id permite dejar de publicar el email en un
// documento que cualquier usuario autenticado puede leer. `findSocialProfileByEmail` se conserva SOLO como
// fallback para perfiles legacy cuyo id de documento no es el uid.
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore/lite';
import type { PalmaresEntry } from '../types/premios';
import { DEFAULT_PROFILE_TIER, normalizeTier, type ProfileTier } from '../../core/constants/tiers';
import {
  initializeFirebaseServices,
  isPermissionDeniedError,
  type SocialDirectoryEntry,
  type SocialProfileReference,
  type YearSummarySeen,
} from './firebaseClient';
import {
  getCachedDirectoryProfiles,
  getCachedDirectoryQuery,
  invalidateCachedDirectoryProfiles,
  invalidateCachedDirectoryQueries,
  putCachedDirectoryProfiles,
  putCachedDirectoryQuery,
  type CachedDirectoryProfile,
} from './indexedDbRepository';
import { mapWithConcurrency } from '../../core/utils/concurrency';
import { isServiceUnavailable } from '../../core/utils/network';
import { firestoreQuotaError, isFirestoreQuotaExhausted, noteFirestoreError } from './firestoreQuota';
import { INACTIVE_PROFILE_MAX_AGE_MS, PROFILE_INACTIVITY_MS } from '../../core/constants/socialActivity';

const SOCIAL_PROFILE_CACHE_TTL_MS = 60_000;
const SOCIAL_DIRECTORY_CACHE_TTL_MS = 30_000;

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

const socialProfileByEmailCache = new Map<string, CachedValue<SocialProfileReference | null>>();
const socialProfileByEmailInFlight = new Map<string, Promise<SocialProfileReference | null>>();
const ownProfileCacheByUid = new Map<string, CachedValue<SocialProfileReference | null>>();
const ownProfileInFlightByUid = new Map<string, Promise<SocialProfileReference | null>>();
const socialDirectoryCacheByLimit = new Map<number | string, CachedValue<SocialDirectoryEntry[]>>();
const socialDirectoryInFlightByLimit = new Map<number | string, Promise<SocialDirectoryEntry[]>>();
/**
 * Cuándo se invalidó el directorio por última vez. Una copia de IndexedDB leída antes no vale aunque siga ahí (el
 * borrado es asíncrono), y una consulta que salió antes no se guarda: puede no traer el cambio que la invalidó.
 */
let socialDirectoryInvalidatedAt = 0;

/** ¿El error es "falta el índice compuesto" (código `failed-precondition` de Firestore)? */
function isMissingIndexError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code || '';
  const message = error instanceof Error ? error.message : '';
  return code === 'failed-precondition' || /requires an index|needs an index/i.test(message);
}

/** `updatedAt` puede venir como Timestamp de Firestore o como número (docs escritos por clientes antiguos). */
/**
 * El aviso del resumen del año leído A LA DEFENSIVA: lo escribe su dueño, y un documento con cualquier cosa en el
 * campo no puede tumbar el directorio — se queda sin tarjeta y ya.
 */
function readYearSummarySeen(raw: unknown): YearSummarySeen | null {
  if (!raw || typeof raw !== 'object') return null;
  const { year, at } = raw as { year?: unknown; at?: { toMillis?: () => number } | number };
  const millis = toMillis(at);
  return Number.isInteger(year) && millis > 0 ? { year: year as number, at: millis } : null;
}

function toMillis(value: { toMillis?: () => number } | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const millis = value?.toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : 0;
}

/** Lo que se lee de un documento de `profiles` para el directorio. */
type DirectoryDocData = {
  uid?: string;
  profileId?: string;
  displayName?: string;
  photoURL?: string;
  tier?: string;
  social?: { gistId?: string; gamesGistId?: string; enabled?: boolean };
  updatedAt?: { toMillis?: () => number } | number;
  achievements?: { list?: unknown };
  palmares?: unknown;
  yearSummary?: unknown;
};

/**
 * Documento de perfil → entrada del directorio. Lo comparten la consulta de recientes (`listSocialDirectory`) y la
 * lectura por uid (`getSocialProfilesByUid`): son el mismo dato y tienen que salir con la misma forma.
 */
function mapDirectoryEntry(id: string, data: DirectoryDocData): SocialDirectoryEntry & { enabled: boolean } {
  return {
    id,
    // uid explícito del doc; hoy coincide con el id, pero tras el cutover uid→profileId el id será el profileId.
    uid: String(data.uid || id),
    displayName: String(data.displayName || ''),
    photoURL: String(data.photoURL || ''),
    // Del mismo documento, sin coste: es lo que permite reconocer a alguien desde el archivo de una
    // edición publicada, donde no hay uid.
    profileId: String(data.profileId || ''),
    socialGistId: String(data.social?.gistId || ''),
    // LEGACY: se mantiene la lectura mientras queden perfiles sin purgar; en los nuevos llega vacío y el gist
    // de juegos de un AMIGO se resuelve desde su doc de amistad (denormalizado). El email de otros usuarios ya
    // no se lee NUNCA: no debe circular por el cliente.
    gamesGistId: String(data.social?.gamesGistId || ''),
    enabled: Boolean(data.social?.enabled),
    updatedAt: toMillis(data.updatedAt),
    tier: normalizeTier(data.tier),
    // EL ESPEJO DE LOGROS de esa persona, en la MISMA lectura que ya trae nombre y foto: no cuesta una
    // petición ni un campo nuevo. Es la única fuente del que no eres tú —el propio sale del evaluador
    // local— y sin él la vitrina de una amistad y el porcentaje comparado se quedaban en blanco para
    // siempre, aunque el espejo estuviera publicado (lo estaba: la escritura nunca fue el problema).
    achievementsMirror: String(data.achievements?.list || ''),
    // Del mismo documento, sin coste: la tarjeta del resumen del año en el feed de sus amistades.
    yearSummarySeen: readYearSummarySeen(data.yearSummary),
    palmares: Array.isArray(data.palmares) ? (data.palmares as PalmaresEntry[]) : undefined,
  };
}

/** Sin la marca `enabled`, que solo sirve para filtrar: lo que se cachea y se devuelve. */
function toDirectoryEntry(entry: SocialDirectoryEntry & { enabled?: boolean }): SocialDirectoryEntry {
  return {
    id: entry.id,
    uid: entry.uid,
    displayName: entry.displayName,
    photoURL: entry.photoURL,
    profileId: entry.profileId,
    socialGistId: entry.socialGistId,
    gamesGistId: entry.gamesGistId,
    updatedAt: entry.updatedAt,
    tier: entry.tier,
    achievementsMirror: entry.achievementsMirror,
    yearSummarySeen: entry.yearSummarySeen,
    palmares: entry.palmares,
  };
}

/**
 * Olvida el perfil legacy cacheado por correo. Lo llama el cutover de identidad: una vez creado
 * `profiles/{uid}`, servir la referencia del documento huérfano mandaría las escrituras al sitio equivocado
 * durante lo que le quede de TTL. Sin correo, vacía la caché entera (cambio de sesión).
 */
export function invalidateProfileByEmailCache(email?: string): void {
  if (email) {
    socialProfileByEmailCache.delete(email.trim().toLowerCase());
    return;
  }
  socialProfileByEmailCache.clear();
}

function readProfileByEmailCache(email: string): SocialProfileReference | null | undefined {
  const cached = socialProfileByEmailCache.get(email);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    socialProfileByEmailCache.delete(email);
    return undefined;
  }

  return cached.value;
}

// Exportado para que la fachada (ensureProfileByEmail/upsertProfileSocialReferences) refresque la caché
// tras escribir el perfil, sin duplicar el estado de caché.
export function saveProfileByEmailCache(email: string, value: SocialProfileReference | null): void {
  socialProfileByEmailCache.set(email, {
    value,
    expiresAt: Date.now() + SOCIAL_PROFILE_CACHE_TTL_MS,
  });
}

function readOwnProfileCache(uid: string): SocialProfileReference | null | undefined {
  const cached = ownProfileCacheByUid.get(uid);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    ownProfileCacheByUid.delete(uid);
    return undefined;
  }

  return cached.value;
}

/**
 * Rango que ya se conocía del perfil propio, leído de la caché en memoria (sin red). Lo usan los caminos que
 * REESCRIBEN esa caché tras guardar el perfil: el `tier` no es suyo (lo asigna el admin y esas escrituras no lo
 * tocan), así que sembrar bronce a ciegas degradaría a un usuario de rango alto durante la vida de la caché.
 * Si no hay nada cacheado devuelve bronce, que es el valor por defecto real.
 */
export function peekOwnProfileTier(uid: string): ProfileTier {
  return ownProfileCacheByUid.get(uid.trim())?.value?.tier || DEFAULT_PROFILE_TIER;
}

/**
 * Perfil propio cacheado y aún vigente, sin red. Lo usan los guardados que no leen el documento antes de escribirlo
 * para saber si pueden arrastrar a la caché lo que ellos no tocan (ver `ensureProfileByEmail`).
 */
export function peekOwnProfileCache(uid: string): SocialProfileReference | null {
  return readOwnProfileCache(uid.trim()) ?? null;
}

/** Refresca la caché del perfil propio tras escribirlo (misma función que cumplía `saveProfileByEmailCache`). */
export function saveOwnProfileCache(uid: string, value: SocialProfileReference | null): void {
  ownProfileCacheByUid.set(uid, {
    value,
    expiresAt: Date.now() + SOCIAL_PROFILE_CACHE_TTL_MS,
  });
}

/**
 * Olvida el perfil propio cacheado. Lo llaman las escrituras parciales sobre `profiles/{uid}` (foto, saneado del
 * gist) y el borrado de cuenta, para que la siguiente lectura no sirva un documento que ya no existe o cambió.
 * Sin uid, vacía la caché entera (cambio de sesión).
 */
export function invalidateOwnProfileCache(uid?: string): void {
  if (uid) {
    ownProfileCacheByUid.delete(uid.trim());
    return;
  }
  ownProfileCacheByUid.clear();
}

/** Proyección común del documento de perfil a `SocialProfileReference` (lo comparten la lectura por uid y la legacy). */
function mapProfileReference(id: string, data: Record<string, unknown>): SocialProfileReference {
  const social = (data.social || {}) as { gistId?: string; gamesGistId?: string; githubToken?: string; enabled?: boolean };
  return {
    id,
    profileId: String(data.profileId || ''),
    // 0 = documento anterior a que existiera la marca. El auto-saneado del arranque lo compara con la versión
    // vigente para decidir si hay que volver a sellarlo.
    schemaVersion: Number(data.schemaVersion || 0),
    // LEGACY: los perfiles nuevos ya no publican el email. Se sigue leyendo del documento PROPIO para detectar
    // que aún lo arrastra y borrarlo en el siguiente guardado (ver `ensureProfileByEmail`).
    email: String(data.email || ''),
    displayName: String(data.displayName || ''),
    photoURL: String(data.photoURL || ''),
    socialGistId: String(social.gistId || ''),
    // LEGACY: el id del gist de juegos vive ahora en `privateConfig` (owner-only) y, para los amigos, en el doc de
    // amistad. Se sigue leyendo mientras queden perfiles sin purgar.
    gamesGistId: String(social.gamesGistId || ''),
    githubToken: String(social.githubToken || ''), // audit-allow: LECTURA legacy en claro para recuperación (fallback); no es escritura
    socialEnabled: Boolean(social.enabled),
    // Rango: lo asigna el admin y el dueño no puede tocarlo. Del PROPIO perfil sale la cadencia del feed.
    tier: normalizeTier(data.tier),
    createdAt: profileCreatedAtMillis(data.createdAt),
    achievementsMirror: String((data.achievements as { list?: unknown } | undefined)?.list || ''),
    achievementsMirrorAt: Number((data.achievements as { at?: unknown } | undefined)?.at) || 0,
    // Lectura DEFENSIVA, como el espejo: lo escribe el administrador, pero un documento con cualquier cosa en
    // este campo no puede tumbar el perfil — se queda sin vitrina y ya.
    palmares: Array.isArray(data.palmares) ? (data.palmares as PalmaresEntry[]) : undefined,
  };
}

/**
 * `createdAt` en milisegundos, venga como venga. Las escrituras actuales usan `serverTimestamp()` —que se lee como
 * `Timestamp`— y los documentos anteriores llevan un número; las reglas admiten los dos a propósito, así que el
 * mapeo tiene que admitirlos también. Cualquier otra cosa vale 0, que es «no se sabe» y deja los dos logros que
 * dependen de esto sin conceder, en vez de inventarse una antigüedad.
 */
function profileCreatedAtMillis(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
  const millis = (raw as { toMillis?: () => number } | null)?.toMillis;
  if (typeof millis !== 'function') return 0;
  try {
    const value = millis.call(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

/**
 * Perfil PROPIO por uid (`profiles/{uid}`), que es como se identifican todos los documentos que escribe la app.
 * Lectura directa por id: ni consulta la colección ni necesita el email publicado. Devuelve null si no existe
 * (dispositivo nuevo sin perfil aún) o si las reglas deniegan, para que el llamador caiga a su fallback.
 */
export async function getOwnProfileRef(uid: string): Promise<SocialProfileReference | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const cleanUid = uid.trim();
  if (!cleanUid) {
    return null;
  }

  const cached = readOwnProfileCache(cleanUid);
  if (cached !== undefined) {
    return cached;
  }

  const inFlight = ownProfileInFlightByUid.get(cleanUid);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    let snapshot;
    try {
      snapshot = await getDoc(doc(services.firestore, 'profiles', cleanUid));
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        saveOwnProfileCache(cleanUid, null);
        return null;
      }
      throw error;
    }

    if (!snapshot.exists()) {
      saveOwnProfileCache(cleanUid, null);
      return null;
    }

    const profile = mapProfileReference(snapshot.id, snapshot.data() as Record<string, unknown>);
    saveOwnProfileCache(cleanUid, profile);
    return profile;
  })();

  ownProfileInFlightByUid.set(cleanUid, request);
  try {
    return await request;
  } finally {
    ownProfileInFlightByUid.delete(cleanUid);
  }
}

function saveSocialDirectoryCache(limitCount: number | string, value: SocialDirectoryEntry[]): void {
  socialDirectoryCacheByLimit.set(limitCount, {
    value,
    expiresAt: Date.now() + SOCIAL_DIRECTORY_CACHE_TTL_MS,
  });
}

function readSocialDirectoryCache(limitCount: number | string): SocialDirectoryEntry[] | null {
  const cached = socialDirectoryCacheByLimit.get(limitCount);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    socialDirectoryCacheByLimit.delete(limitCount);
    return null;
  }

  return cached.value;
}

/**
 * Exportado para que la fachada invalide el directorio tras crear/actualizar un perfil.
 *
 * Con `uid`, de los perfiles leídos por uid (`getSocialProfilesByUid`) solo se olvida ESE: es lo que pasan las
 * escrituras de tu propio perfil, y tirar la copia de todos tus amigos por cambiar tu foto costaría una lectura por
 * amigo en el siguiente refresco del feed. Sin `uid` (moderación, borrado de cuenta), se olvidan todos.
 */
export function invalidateSocialDirectoryCache(uid?: string): void {
  const now = Date.now();
  socialDirectoryCacheByLimit.clear();
  socialDirectoryInvalidatedAt = now;
  // También la copia persistente: sin esto, tu propio cambio de nick o de foto tardaría horas en verse.
  void invalidateCachedDirectoryQueries();
  const cleanUid = String(uid || '').trim();
  if (cleanUid) {
    directoryProfileMemory.delete(cleanUid);
    directoryProfileInvalidatedAt.set(cleanUid, now);
    void invalidateCachedDirectoryProfiles(cleanUid);
    return;
  }
  directoryProfileMemory.clear();
  directoryProfilesInvalidatedAt = now;
  void invalidateCachedDirectoryProfiles();
}

// ---------------------------------------------------------------------------
// PERFILES POR UID: los de tus amigos y el tuyo, que es lo que el feed necesita del directorio (rango, vitrina,
// palmarés, resumen del año, recencia). Antes salían de la consulta de los 50 más recientes, que costaba 50
// lecturas en cada caducidad tuviera uno 3 amigos o 40, y dejaba sin nada de eso a los amigos que no cabían.
// ---------------------------------------------------------------------------
const directoryProfileMemory = new Map<string, CachedDirectoryProfile<SocialDirectoryEntry>>();
/** Por uid y global: una lectura que salió antes de invalidar no se guarda, y una copia anterior no se sirve. */
const directoryProfileInvalidatedAt = new Map<string, number>();
let directoryProfilesInvalidatedAt = 0;
/** Lecturas simultáneas de perfiles por uid. Las mismas que el resto de lecturas de la hidratación del feed. */
const DIRECTORY_PROFILE_FETCH_CONCURRENCY = 6;

function directoryProfileInvalidatedFor(uid: string): number {
  return Math.max(directoryProfilesInvalidatedAt, directoryProfileInvalidatedAt.get(uid) || 0);
}

/**
 * ¿Sirve todavía esta copia? La edad la pone quien pregunta, salvo para quien lleva más de `PROFILE_INACTIVITY_MS`
 * sin aparecer: a ese se le acepta hasta un día (`INACTIVE_PROFILE_MAX_AGE_MS`), porque mientras siga dormido no
 * cambia nada de lo que se pinta de él.
 */
function directoryProfileIsFresh(uid: string, row: CachedDirectoryProfile<SocialDirectoryEntry>, maxAgeMs: number, now: number): boolean {
  if (row.cachedAt < directoryProfileInvalidatedFor(uid)) return false;
  const lastActiveAt = row.entry?.updatedAt || 0;
  const asleep = lastActiveAt > 0 && now - lastActiveAt > PROFILE_INACTIVITY_MS;
  return now - row.cachedAt < (asleep ? Math.max(maxAgeMs, INACTIVE_PROFILE_MAX_AGE_MS) : maxAgeMs);
}

/**
 * Perfiles de esos uids, como entradas del directorio. Solo devuelve los que se dejan leer y tienen el espacio
 * social encendido; el resto (apagado, borrado) no sale, y quien llama decide qué hacer con ellos —el feed los
 * sintetiza desde la amistad, como siempre—.
 *
 * Un `getDoc` por perfil y no una consulta `documentId() in [...]`: Firestore cobra igual (una lectura por
 * documento), pero la consulta obliga a trocear de 30 en 30 y su índice no se puede probar en el emulador. Con
 * `getDoc` no hay índice que desplegar antes que la app.
 *
 * OJO con el id: hoy el documento de un perfil es `profiles/{uid}`. Si el cutover de identidad lo pasa a ser el
 * `profileId` (ver `listSocialDirectory`), esto tiene que seguir a ese cambio.
 */
export async function getSocialProfilesByUid(
  uids: string[],
  options?: { forceRefresh?: boolean; maxAgeMs?: number },
): Promise<SocialDirectoryEntry[]> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const wanted = [...new Set(uids.map((uid) => String(uid || '').trim()).filter((uid) => uid && uid !== '_placeholder'))];
  if (wanted.length === 0) return [];

  const forceRefresh = Boolean(options?.forceRefresh);
  // Nunca menos que la caché en memoria del directorio: dos pantallas que piden lo mismo seguidas no pagan dos veces.
  const maxAgeMs = Math.max(options?.maxAgeMs ?? 0, SOCIAL_DIRECTORY_CACHE_TTL_MS);
  const now = Date.now();
  const rows = new Map<string, CachedDirectoryProfile<SocialDirectoryEntry>>();

  if (!forceRefresh) {
    let persisted: Record<string, CachedDirectoryProfile<SocialDirectoryEntry>> | null = null;
    for (const uid of wanted) {
      const inMemory = directoryProfileMemory.get(uid);
      if (inMemory && directoryProfileIsFresh(uid, inMemory, maxAgeMs, now)) {
        rows.set(uid, inMemory);
        continue;
      }
      persisted ??= await getCachedDirectoryProfiles<SocialDirectoryEntry>();
      const stored = persisted[uid];
      if (stored && directoryProfileIsFresh(uid, stored, maxAgeMs, now)) {
        directoryProfileMemory.set(uid, stored);
        rows.set(uid, stored);
      }
    }
  }

  const missing = wanted.filter((uid) => !rows.has(uid));
  if (missing.length > 0) {
    const startedAt = Date.now();
    // Las filas guardadas de CUALQUIER edad, por si Firestore no atiende (ver el `catch`). Se leen a lo sumo una vez.
    let storedForFallback: Promise<Record<string, CachedDirectoryProfile<SocialDirectoryEntry>>> | null = null;
    const fetched = await mapWithConcurrency(missing, DIRECTORY_PROFILE_FETCH_CONCURRENCY, async (uid) => {
      let entry: SocialDirectoryEntry | null = null;
      try {
        // Con la cuota del día agotada no se pregunta: va directo a la copia de abajo (ver `firestoreQuota`).
        if (isFirestoreQuotaExhausted()) throw firestoreQuotaError();
        const snapshot = await getDoc(doc(services.firestore, 'profiles', uid));
        if (snapshot.exists()) {
          const mapped = mapDirectoryEntry(snapshot.id, snapshot.data() as DirectoryDocData);
          entry = mapped.enabled ? toDirectoryEntry(mapped) : null;
        }
      } catch (error) {
        // Perfil social apagado: las reglas no dejan leerlo. No es un fallo, es «no hay nada que enseñar».
        if (isPermissionDeniedError(error)) {
          return { uid, row: { cachedAt: startedAt, entry: null }, stale: false };
        }
        noteFirestoreError(error);
        // EL SERVICIO NO ATIENDE (cuota agotada, caído, sin red): se sirve lo último guardado de ESTE perfil, por
        // viejo que sea, y no se guarda como nuevo. Antes un solo `getDoc` fallido rechazaba todos y el feed
        // perdía hasta a los amigos que sí tenían copia (docs/plan-degradacion-servicios.md, fase 2). Sin copia
        // de nadie, se propaga: la hidratación tiene su propio rescate, el feed entero guardado.
        if (isServiceUnavailable(error)) {
          storedForFallback ??= getCachedDirectoryProfiles<SocialDirectoryEntry>();
          const stored = (await storedForFallback)[uid];
          if (stored) return { uid, row: stored, stale: true };
        }
        throw error;
      }
      return { uid, row: { cachedAt: startedAt, entry }, stale: false };
    });

    const toPersist: Record<string, CachedDirectoryProfile<SocialDirectoryEntry>> = {};
    for (const { uid, row, stale } of fetched) {
      rows.set(uid, row);
      if (!stale && startedAt >= directoryProfileInvalidatedFor(uid)) {
        directoryProfileMemory.set(uid, row);
        toPersist[uid] = row;
      }
    }
    if (Object.keys(toPersist).length > 0) {
      void putCachedDirectoryProfiles(toPersist);
    }
  }

  return wanted
    .map((uid) => rows.get(uid)?.entry ?? null)
    .filter((entry): entry is SocialDirectoryEntry => Boolean(entry));
}

/**
 * FALLBACK LEGACY — busca el perfil por correo. Solo debe llamarse cuando `getOwnProfileRef(uid)` no encuentra
 * documento: cubre a los perfiles antiguos cuyo id NO es el uid (los creó una versión anterior), donde saltarse
 * esta búsqueda crearía un perfil duplicado al usuario.
 *
 * Los perfiles nuevos ya no publican `email`, así que esta consulta solo puede encontrar documentos anteriores a
 * la purga. Cuando el barrido de PII haya pasado y deje de usarse, se elimina junto con el campo de las reglas.
 */
export async function findSocialProfileByEmail(email: string): Promise<SocialProfileReference | null> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) {
    return null;
  }

  const cached = readProfileByEmailCache(cleanEmail);
  if (cached !== undefined) {
    return cached;
  }

  const inFlight = socialProfileByEmailInFlight.get(cleanEmail);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    // `social.enabled == true` NO es un filtro de producto, es OBLIGATORIO para que la consulta pase las reglas.
    // La regla de lectura de `profiles` autoriza a un autenticado cualquiera solo sobre documentos con
    // `social.enabled == true`, y en una CONSULTA Firestore no evalúa la condición documento a documento: exige que
    // la propia consulta garantice que todo lo que pueda devolver es legible, así que sin este `where` deniega la
    // consulta ENTERA —incluso cuando no devuelve nada—. Sin él, esta búsqueda estaba muerta para todo el mundo
    // menos el administrador: devolvía `permission-denied`, se traducía a `null` aquí abajo y parecía "no hay
    // perfil legacy". Es lo que dejaba encallados a los perfiles con id ajeno al uid.
    //
    // Precio: un perfil legacy con el social DESACTIVADO deja de encontrarse. No hay alternativa desde el cliente,
    // y esos perfiles no tienen presencia social que recuperar; el panel sí los ve y puede migrarlos.
    const q = query(
      collection(services.firestore, 'profiles'),
      where('email', '==', cleanEmail),
      where('social.enabled', '==', true),
      limit(1),
    );

    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch (error) {
      // If rules deny reads, keep flow alive and continue with gist-only profile resolution.
      if (isPermissionDeniedError(error)) {
        saveProfileByEmailCache(cleanEmail, null);
        return null;
      }

      // Dos igualdades se sirven con índices de campo único (Firestore los fusiona), así que no debería hacer falta
      // un índice compuesto. Si alguna vez lo pidiera, degradar es mejor que romper el guardado del perfil: se
      // pierde el fallback legacy, no la sesión.
      if (isMissingIndexError(error)) {
        console.warn('[firebase] Falta el índice profiles(email, social.enabled): sin fallback legacy por correo');
        saveProfileByEmailCache(cleanEmail, null);
        return null;
      }

      throw error;
    }

    if (snapshot.empty) {
      saveProfileByEmailCache(cleanEmail, null);
      return null;
    }

    const docEntry = snapshot.docs[0];
    const profile = mapProfileReference(docEntry.id, docEntry.data() as Record<string, unknown>);

    saveProfileByEmailCache(cleanEmail, profile);
    return profile;
  })();

  socialProfileByEmailInFlight.set(cleanEmail, request);
  try {
    return await request;
  } finally {
    socialProfileByEmailInFlight.delete(cleanEmail);
  }
}

/**
 * Devuelve un listado reducido de perfiles para feed social.
 * Si las reglas no permiten lectura, retorna array vacío para no bloquear la UI.
 *
 * `maxAgeMs` acepta una copia de IndexedDB de hasta esa edad antes de preguntar a Firestore, que cobra una lectura
 * por perfil devuelto. Lo pasa cada llamador según el rango de quien mira (`PROFILE_TIER_DIRECTORY_TTL_MS`,
 * `PROFILE_TIER_PREMIOS_PROFILES_TTL_MS`); sin él, solo vale la caché de 30 s en memoria, como siempre.
 * `forceRefresh` se salta las dos.
 *
 * `activeWithinMs` deja fuera a quien lleva más de ese tiempo sin aparecer (`updatedAt`). Va en la CONSULTA, no
 * después: así un perfil dormido no cuesta su lectura. Es un rango sobre el mismo campo que el orden, así que lo
 * sirve el índice que ya existe (`social.enabled ASC, updatedAt DESC`). Cada valor tiene su propia copia: va en la
 * clave junto al tope.
 */
export async function listSocialDirectory(
  limitCount = 12,
  options?: { forceRefresh?: boolean; maxAgeMs?: number; activeWithinMs?: number },
): Promise<SocialDirectoryEntry[]> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const normalizedLimit = Math.max(1, limitCount);
  const activeWithinMs = Math.max(0, options?.activeWithinMs ?? 0);
  // La clave de las copias: el tope y, si lo hay, el corte de actividad (la consulta es otra).
  const cacheKey = activeWithinMs > 0 ? `${normalizedLimit}@${activeWithinMs}` : normalizedLimit;
  // Una copia de hace un rato puede traer a quien ha cruzado el corte desde entonces: se vuelve a filtrar al servirla.
  const stillActive = (entries: SocialDirectoryEntry[]): SocialDirectoryEntry[] => {
    if (activeWithinMs <= 0) return entries;
    const cutoff = Date.now() - activeWithinMs;
    return entries.filter((entry) => entry.updatedAt >= cutoff);
  };
  const forceRefresh = Boolean(options?.forceRefresh);
  const cached = readSocialDirectoryCache(cacheKey);
  if (!forceRefresh && cached) {
    return stillActive(cached);
  }

  const maxAgeMs = Math.max(0, options?.maxAgeMs ?? 0);
  if (!forceRefresh && maxAgeMs > 0) {
    const persisted = await getCachedDirectoryQuery<SocialDirectoryEntry>(cacheKey);
    if (
      persisted
      && persisted.cachedAt >= socialDirectoryInvalidatedAt
      && Date.now() - persisted.cachedAt < maxAgeMs
    ) {
      saveSocialDirectoryCache(cacheKey, persisted.entries);
      return stillActive(persisted.entries);
    }
  }

  const startedAt = Date.now();
  const inFlight = forceRefresh ? null : socialDirectoryInFlightByLimit.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    // ORDEN POR USO RECIENTE. Antes se filtraba con `where(documentId(), '!=', '_placeholder')`, y una
    // desigualdad obliga a Firestore a ordenar PRIMERO por ese campo: el directorio eran "los N perfiles con uid
    // alfabéticamente menor", no los N más recientes, así que al pasar de N perfiles los nuevos quedaban fuera
    // de forma arbitraria y permanente. Ese filtro no hace falta: `_placeholder` no tiene el campo
    // `social.enabled`, así que la igualdad ya lo excluye (y con él, la regla de lectura sigue cumpliéndose).
    // `updatedAt` está en TODOS los docs de perfil (lo escribe `ensureProfileByEmail` desde el primer guardado),
    // condición necesaria para ordenar por él: un doc sin el campo quedaría fuera de la consulta.
    const profiles = collection(services.firestore, 'profiles');
    const enabled = where('social.enabled', '==', true);
    const recent = activeWithinMs > 0
      ? [where('updatedAt', '>=', Timestamp.fromMillis(startedAt - activeWithinMs))]
      : [];

    let snapshot;
    try {
      if (isFirestoreQuotaExhausted()) throw firestoreQuotaError();
      snapshot = await getDocs(query(profiles, enabled, ...recent, orderBy('updatedAt', 'desc'), limit(normalizedLimit)));
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        throw new Error('Permisos insuficientes para leer perfiles sociales en Firestore');
      }
      noteFirestoreError(error);
      // EL SERVICIO NO ATIENDE: la última copia de esta consulta, por vieja que sea, antes que una lista vacía. No se
      // guarda como nueva ni en memoria: en cuanto Firestore vuelva, la siguiente apertura la relee.
      if (isServiceUnavailable(error)) {
        const persisted = await getCachedDirectoryQuery<SocialDirectoryEntry>(cacheKey);
        if (persisted) return stillActive(persisted.entries);
        throw error;
      }
      // El orden por `updatedAt` necesita el índice compuesto (`firestore.indexes.json`). Si se despliega la app
      // antes que el índice, Firestore responde `failed-precondition` y, sin esta degradación, el hub entero se
      // quedaría sin directorio ni feed. Se reintenta sin orden: se pierde la prioridad por uso reciente (no el
      // corte por inactividad, que sale del `updatedAt` de cada doc), pero el social sigue funcionando.
      if (!isMissingIndexError(error)) {
        throw error;
      }
      console.warn('[firebase] Falta el índice profiles(social.enabled, updatedAt desc): directorio sin ordenar por recencia');
      snapshot = await getDocs(query(profiles, enabled, limit(normalizedLimit)));
    }

    const visible = snapshot.docs
      .map((entry) => mapDirectoryEntry(entry.id, entry.data() as DirectoryDocData))
      // NO se exige `socialGistId`. Antes se filtraba por él, y eso ata el directorio a que ese id se publique en
      // el perfil, que es justo lo que va a dejar de pasar: el canal social de un amigo se resuelve desde el doc
      // de amistad, y de un NO amigo no se lee gist ninguno (solo nombre y foto). Con el filtro puesto, un perfil
      // sin id desaparecía del descubrimiento aunque estuviera perfectamente activo.
      //
      // Efecto colateral querido: los perfiles rotos (`social.enabled` sin gist, la señal `enabled-without-gist`
      // del panel) pasan a verse en el directorio como index-only, en vez de ser invisibles. La hidratación ya
      // sabe tratarlos: sin candidatos de gist, se quedan en nombre y foto.
      //
      // Guarda barata: el placeholder ya no puede salir (no tiene `social.enabled`), pero si algún día lo
      // tuviera, no debe colarse en el directorio.
      .filter((entry) => entry.enabled && entry.id !== '_placeholder');

    // UN USUARIO, UNA ENTRADA. Durante el cutover de identidad (señal `foreign-doc-id`) un mismo uid tiene DOS
    // documentos: el canónico que acaba de crear su navegador y el huérfano legacy, que solo el administrador puede
    // retirar. Los dos traen `social.enabled`, así que sin esto la persona sale duplicada en el directorio —y en el
    // descubrimiento— hasta que alguien pase por el panel. Gana el documento canónico (id == uid) y, si ninguno lo
    // es, el más recientemente activo. Los perfiles legacy sin campo `uid` no colisionan: su uid cae a su propio id.
    const canonicalByUid = new Map<string, (typeof visible)[number]>();
    visible.forEach((entry) => {
      const current = canonicalByUid.get(entry.uid);
      if (!current) {
        canonicalByUid.set(entry.uid, entry);
        return;
      }
      const currentIsCanonical = current.id === current.uid;
      const entryIsCanonical = entry.id === entry.uid;
      if (entryIsCanonical && !currentIsCanonical) {
        canonicalByUid.set(entry.uid, entry);
        return;
      }
      if (entryIsCanonical === currentIsCanonical && entry.updatedAt > current.updatedAt) {
        canonicalByUid.set(entry.uid, entry);
      }
    });

    // `stillActive` también aquí: sin índice, la consulta de respaldo no lleva el corte y lo trae todo.
    const entries = stillActive([...canonicalByUid.values()].map(toDirectoryEntry));

    saveSocialDirectoryCache(cacheKey, entries);
    if (startedAt >= socialDirectoryInvalidatedAt) {
      void putCachedDirectoryQuery(cacheKey, entries, startedAt);
    }
    return entries;
  })();

  socialDirectoryInFlightByLimit.set(cacheKey, request);
  try {
    return await request;
  } finally {
    socialDirectoryInFlightByLimit.delete(cacheKey);
  }
}
