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
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { DEFAULT_PROFILE_TIER, normalizeTier, type ProfileTier } from '../../core/constants/tiers';
import {
  initializeFirebaseServices,
  isPermissionDeniedError,
  type SocialDirectoryEntry,
  type SocialProfileReference,
} from './firebaseClient';

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
const socialDirectoryCacheByLimit = new Map<number, CachedValue<SocialDirectoryEntry[]>>();
const socialDirectoryInFlightByLimit = new Map<number, Promise<SocialDirectoryEntry[]>>();

/** ¿El error es "falta el índice compuesto" (código `failed-precondition` de Firestore)? */
function isMissingIndexError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code || '';
  const message = error instanceof Error ? error.message : '';
  return code === 'failed-precondition' || /requires an index|needs an index/i.test(message);
}

/** `updatedAt` puede venir como Timestamp de Firestore o como número (docs escritos por clientes antiguos). */
function toMillis(value: { toMillis?: () => number } | number | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const millis = value?.toMillis?.();
  return typeof millis === 'number' && Number.isFinite(millis) ? millis : 0;
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
  };
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

function saveSocialDirectoryCache(limitCount: number, value: SocialDirectoryEntry[]): void {
  socialDirectoryCacheByLimit.set(limitCount, {
    value,
    expiresAt: Date.now() + SOCIAL_DIRECTORY_CACHE_TTL_MS,
  });
}

function readSocialDirectoryCache(limitCount: number): SocialDirectoryEntry[] | null {
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

// Exportado para que la fachada invalide el directorio tras crear/actualizar un perfil.
export function invalidateSocialDirectoryCache(): void {
  socialDirectoryCacheByLimit.clear();
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
    const q = query(
      collection(services.firestore, 'profiles'),
      where('email', '==', cleanEmail),
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
 */
export async function listSocialDirectory(limitCount = 12, options?: { forceRefresh?: boolean }): Promise<SocialDirectoryEntry[]> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const normalizedLimit = Math.max(1, limitCount);
  const forceRefresh = Boolean(options?.forceRefresh);
  const cached = readSocialDirectoryCache(normalizedLimit);
  if (!forceRefresh && cached) {
    return cached;
  }

  const inFlight = forceRefresh ? null : socialDirectoryInFlightByLimit.get(normalizedLimit);
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

    let snapshot;
    try {
      snapshot = await getDocs(query(profiles, enabled, orderBy('updatedAt', 'desc'), limit(normalizedLimit)));
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        throw new Error('Permisos insuficientes para leer perfiles sociales en Firestore');
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

    const entries = snapshot.docs
      .map((entry) => {
        const data = entry.data() as {
          uid?: string;
          displayName?: string;
          photoURL?: string;
          tier?: string;
          social?: { gistId?: string; gamesGistId?: string; enabled?: boolean };
          updatedAt?: { toMillis?: () => number } | number;
        };

        return {
          id: entry.id,
          // uid explícito del doc; hoy coincide con el id, pero tras el cutover uid→profileId el id será el profileId.
          uid: String(data.uid || entry.id),
          displayName: String(data.displayName || ''),
          photoURL: String(data.photoURL || ''),
          socialGistId: String(data.social?.gistId || ''),
          // LEGACY: se mantiene la lectura mientras queden perfiles sin purgar; en los nuevos llega vacío y el gist
          // de juegos de un AMIGO se resuelve desde su doc de amistad (denormalizado). El email de otros usuarios ya
          // no se lee NUNCA: no debe circular por el cliente.
          gamesGistId: String(data.social?.gamesGistId || ''),
          enabled: Boolean(data.social?.enabled),
          updatedAt: toMillis(data.updatedAt),
          tier: normalizeTier(data.tier),
        };
      })
      // Guarda barata: el placeholder ya no puede salir (no tiene `social.enabled`), pero si algún día lo
      // tuviera, no debe colarse en el directorio.
      .filter((entry) => entry.enabled && Boolean(entry.socialGistId) && entry.id !== '_placeholder')
      .map((entry) => ({
        id: entry.id,
        uid: entry.uid,
        displayName: entry.displayName,
        photoURL: entry.photoURL,
        socialGistId: entry.socialGistId,
        gamesGistId: entry.gamesGistId,
        updatedAt: entry.updatedAt,
        tier: entry.tier,
      }));

    saveSocialDirectoryCache(normalizedLimit, entries);
    return entries;
  })();

  socialDirectoryInFlightByLimit.set(normalizedLimit, request);
  try {
    return await request;
  } finally {
    socialDirectoryInFlightByLimit.delete(normalizedLimit);
  }
}
