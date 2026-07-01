// Capa social en Firestore: directorio de perfiles y búsqueda por email (+ sus cachés).
// Extraído de firebaseRepository.ts (M2). NO importa de la fachada (sin ciclos).
// C5: eliminados el índice público (upsertProfileIndex/upsertFeedCard) y las recomendaciones — código muerto
// (sin consumidores) y con reglas admin-only. Ver CODE-REVIEW-IMPROVEMENTS.md (migración PII gated).
import { collection, documentId, getDocs, limit, query, where } from 'firebase/firestore';
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
    const q = query(
      collection(services.firestore, 'profiles'),
      where('social.enabled', '==', true),
      where(documentId(), '!=', '_placeholder'),
      limit(normalizedLimit),
    );

    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        throw new Error('Permisos insuficientes para leer perfiles sociales en Firestore');
      }
      throw error;
    }

    const entries = snapshot.docs
      .map((entry) => {
        const data = entry.data() as {
          uid?: string;
          email?: string;
          displayName?: string;
          photoURL?: string;
          social?: { gistId?: string; gamesGistId?: string; enabled?: boolean };
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
        };
      })
      .filter((entry) => entry.enabled && Boolean(entry.socialGistId))
      .map((entry) => ({
        id: entry.id,
        uid: entry.uid,
        email: entry.email,
        displayName: entry.displayName,
        photoURL: entry.photoURL,
        socialGistId: entry.socialGistId,
        gamesGistId: entry.gamesGistId,
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
