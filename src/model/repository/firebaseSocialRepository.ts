// Capa social en Firestore: directorio de perfiles y búsqueda por email (+ sus cachés).
// Extraído de firebaseRepository.ts (M2). NO importa de la fachada (sin ciclos).
// C5: eliminados el índice público (upsertProfileIndex/upsertFeedCard) y las recomendaciones — código muerto
// (sin consumidores) y con reglas admin-only. Ver CODE-REVIEW-IMPROVEMENTS.md (migración PII gated).
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
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
 * Busca perfil social por correo para evitar duplicados y mantener mínimo en Firestore.
 * No lee ni modifica documentos placeholder que no contengan email.
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
    const data = docEntry.data() as {
      profileId?: string;
      email?: string;
      displayName?: string;
      photoURL?: string;
      social?: { gistId?: string; gamesGistId?: string; githubToken?: string; enabled?: boolean };
    };

    const profile: SocialProfileReference = {
      id: docEntry.id,
      profileId: String(data.profileId || ''),
      email: String(data.email || ''),
      displayName: String(data.displayName || ''),
      photoURL: String(data.photoURL || ''),
      socialGistId: String(data.social?.gistId || ''),
      gamesGistId: String(data.social?.gamesGistId || ''),
      githubToken: String(data.social?.githubToken || ''), // audit-allow: LECTURA legacy en claro para recuperación (fallback); no es escritura
      socialEnabled: Boolean(data.social?.enabled),
    };

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
          email?: string;
          displayName?: string;
          photoURL?: string;
          social?: { gistId?: string; gamesGistId?: string; enabled?: boolean };
          updatedAt?: { toMillis?: () => number } | number;
        };

        return {
          id: entry.id,
          // uid explícito del doc; hoy coincide con el id, pero tras el cutover uid→profileId el id será el profileId.
          uid: String(data.uid || entry.id),
          email: String(data.email || ''),
          displayName: String(data.displayName || ''),
          photoURL: String(data.photoURL || ''),
          socialGistId: String(data.social?.gistId || ''),
          gamesGistId: String(data.social?.gamesGistId || ''),
          enabled: Boolean(data.social?.enabled),
          updatedAt: toMillis(data.updatedAt),
        };
      })
      // Guarda barata: el placeholder ya no puede salir (no tiene `social.enabled`), pero si algún día lo
      // tuviera, no debe colarse en el directorio.
      .filter((entry) => entry.enabled && Boolean(entry.socialGistId) && entry.id !== '_placeholder')
      .map((entry) => ({
        id: entry.id,
        uid: entry.uid,
        email: entry.email,
        displayName: entry.displayName,
        photoURL: entry.photoURL,
        socialGistId: entry.socialGistId,
        gamesGistId: entry.gamesGistId,
        updatedAt: entry.updatedAt,
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
