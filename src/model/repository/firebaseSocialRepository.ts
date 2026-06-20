// Capa social en Firestore: directorio de perfiles, índice público (index-only), recomendaciones y sus cachés.
// Extraído de firebaseRepository.ts (M2) sin cambio de comportamiento. NO importa de la fachada (sin ciclos).
import { collection, doc, documentId, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import {
  initializeFirebaseServices,
  isPermissionDeniedError,
  type GameRecommendation,
  type SocialDirectoryEntry,
  type SocialProfileReference,
} from './firebaseClient';
import type { FirestoreFeedCard, ProfileIndexDoc } from '../types/firestore';

const SOCIAL_PROFILE_CACHE_TTL_MS = 60_000;
const SOCIAL_DIRECTORY_CACHE_TTL_MS = 30_000;
const RECEIVED_RECOMMENDATIONS_CACHE_TTL_MS = 15_000;

type CachedValue<T> = {
  value: T;
  expiresAt: number;
};

const socialProfileByEmailCache = new Map<string, CachedValue<SocialProfileReference | null>>();
const socialProfileByEmailInFlight = new Map<string, Promise<SocialProfileReference | null>>();
const socialDirectoryCacheByLimit = new Map<number, CachedValue<SocialDirectoryEntry[]>>();
const socialDirectoryInFlightByLimit = new Map<number, Promise<SocialDirectoryEntry[]>>();
const receivedRecommendationsByEmailCache = new Map<string, CachedValue<GameRecommendation[]>>();
const receivedRecommendationsInFlightByEmail = new Map<string, Promise<GameRecommendation[]>>();

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

function readReceivedRecommendationsCache(email: string): GameRecommendation[] | null {
  const cached = receivedRecommendationsByEmailCache.get(email);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    receivedRecommendationsByEmailCache.delete(email);
    return null;
  }

  return cached.value;
}

function saveReceivedRecommendationsCache(email: string, value: GameRecommendation[]): void {
  receivedRecommendationsByEmailCache.set(email, {
    value,
    expiresAt: Date.now() + RECEIVED_RECOMMENDATIONS_CACHE_TTL_MS,
  });
}

function invalidateReceivedRecommendationsCache(email?: string): void {
  if (email) {
    receivedRecommendationsByEmailCache.delete(email);
    return;
  }

  receivedRecommendationsByEmailCache.clear();
}

const FIRESTORE_FORBIDDEN_FIELDS = ['uid', 'email', 'githubToken', 'gamesGistId', 'review', 'reviewText', 'score', 'hours', 'steamDeck', 'retry', 'replayable'];

/** Guarda de privacidad para escrituras a Firestore (canales públicos profiles/feed). */
export function assertNoFirestorePrivateFields(data: Record<string, unknown>): void {
  for (const field of FIRESTORE_FORBIDDEN_FIELDS) {
    if (field in data) throw new Error(`Campo prohibido "${field}" en escritura a Firestore`);
  }
}

/** profiles/{profileId} — índice público (index-only). Valida que no haya campos privados. */
export async function upsertProfileIndex(docData: ProfileIndexDoc): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');
  assertNoFirestorePrivateFields(docData as unknown as Record<string, unknown>);
  await setDoc(doc(services.firestore, 'profiles', docData.profileId), { ...docData }, { merge: true });
}

/** feed/{reviewId} — tarjeta pública. Valida sin campos privados y snippet ≤ 200. */
export async function upsertFeedCard(card: FirestoreFeedCard): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) throw new Error('Firebase no está configurado en este entorno');
  assertNoFirestorePrivateFields(card as unknown as Record<string, unknown>);
  if (card.snippet.length > 200) throw new Error('snippet supera 200 caracteres');
  await setDoc(doc(services.firestore, 'feed', card.reviewId), { ...card }, { merge: true });
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
      social?: { gistId?: string; gamesGistId?: string; githubToken?: string; enabled?: boolean };
    };

    const profile: SocialProfileReference = {
      id: docEntry.id,
      profileId: String(data.profileId || ''),
      email: String(data.email || ''),
      displayName: String(data.displayName || ''),
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
          email?: string;
          displayName?: string;
          social?: { gistId?: string; gamesGistId?: string; enabled?: boolean };
        };

        return {
          id: entry.id,
          email: String(data.email || ''),
          displayName: String(data.displayName || ''),
          socialGistId: String(data.social?.gistId || ''),
          gamesGistId: String(data.social?.gamesGistId || ''),
          enabled: Boolean(data.social?.enabled),
        };
      })
      .filter((entry) => entry.enabled && Boolean(entry.socialGistId))
      .map((entry) => ({
        id: entry.id,
        email: entry.email,
        displayName: entry.displayName,
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

/**
 * Envía una recomendación de juego a un amigo.
 * Guarda en la colección 'recommendations' de Firestore.
 */
export async function sendGameRecommendation(input: {
  fromUid: string;
  fromEmail: string;
  fromDisplayName: string;
  toEmail: string;
  gameId: number;
  gameName: string;
  message?: string;
}): Promise<{ id: string }> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const toEmailClean = input.toEmail.trim().toLowerCase();
  if (!toEmailClean) {
    throw new Error('Email del destinatario es requerido');
  }

  if (input.gameId <= 0) {
    throw new Error('ID de juego inválido');
  }

  const now = Date.now();
  const docRef = doc(collection(services.firestore, 'recommendations'));

  await setDoc(docRef, {
    fromUid: input.fromUid,
    fromEmail: input.fromEmail.toLowerCase(),
    fromDisplayName: input.fromDisplayName || input.fromEmail,
    toEmail: toEmailClean,
    gameId: input.gameId,
    gameName: String(input.gameName || `Juego ${input.gameId}`).trim(),
    message: String(input.message || '').trim(),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  });

  invalidateReceivedRecommendationsCache(toEmailClean);

  return { id: docRef.id };
}

/**
 * Obtiene recomendaciones pendientes recibidas para un correo.
 * Si las reglas denegan permisos, retorna array vacío.
 */
export async function getReceivedRecommendations(toEmail: string): Promise<GameRecommendation[]> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  const toEmailClean = toEmail.trim().toLowerCase();
  if (!toEmailClean) {
    return [];
  }

  const cached = readReceivedRecommendationsCache(toEmailClean);
  if (cached) {
    return cached;
  }

  const inFlight = receivedRecommendationsInFlightByEmail.get(toEmailClean);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const q = query(
      collection(services.firestore, 'recommendations'),
      where('toEmail', '==', toEmailClean),
      where('status', '==', 'pending'),
    );

    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        saveReceivedRecommendationsCache(toEmailClean, []);
        return [];
      }

      throw error;
    }

    const recommendations = snapshot.docs
      .map((docEntry) => {
        const data = docEntry.data() as {
          fromUid?: string;
          fromEmail?: string;
          fromDisplayName?: string;
          toEmail?: string;
          gameId?: number;
          gameName?: string;
          message?: string;
          status?: string;
          createdAt?: number;
          updatedAt?: number;
        };

        return {
          id: docEntry.id,
          fromUid: String(data.fromUid || ''),
          fromEmail: String(data.fromEmail || ''),
          fromDisplayName: String(data.fromDisplayName || ''),
          toEmail: String(data.toEmail || ''),
          gameId: Number(data.gameId || 0),
          gameName: String(data.gameName || ''),
          message: String(data.message || ''),
          status: (data.status === 'pending' || data.status === 'accepted' || data.status === 'declined' ? data.status : 'pending') as 'pending' | 'accepted' | 'declined',
          createdAt: Number(data.createdAt || 0),
          updatedAt: Number(data.updatedAt || 0),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    saveReceivedRecommendationsCache(toEmailClean, recommendations);
    return recommendations;
  })();

  receivedRecommendationsInFlightByEmail.set(toEmailClean, request);
  try {
    return await request;
  } finally {
    receivedRecommendationsInFlightByEmail.delete(toEmailClean);
  }
}

/**
 * Actualiza el estado de una recomendación (accept/decline).
 */
export async function updateRecommendationStatus(
  recommendationId: string,
  status: 'accepted' | 'declined',
): Promise<void> {
  const services = await initializeFirebaseServices();
  if (!services) {
    throw new Error('Firebase no está configurado en este entorno');
  }

  await setDoc(
    doc(services.firestore, 'recommendations', recommendationId),
    {
      status,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  invalidateReceivedRecommendationsCache();
}
