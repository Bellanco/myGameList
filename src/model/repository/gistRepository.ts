import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { migrateData } from './migrateRepository';
import { clampRating, normalizeTimestamp } from '../../core/utils/normalize';
import { assembleChunkedGames, gamesGistNeedsRewrite, gamesGistNeedsUpgradeToWrapper, unwrapGamesFile } from '../migration/legacyGamesFormat';
import { pickLegacyActorId, pickLegacyFromId, pickLegacyReviewText, socialGistNeedsRewrite } from '../migration/legacySocialFormat';
import { assertValidSocialGist } from '../schemas/socialGistSchema';
import { TAB_IDS, type TabData, type TabId } from '../types/game';
import { githubFetch, parseRetryAfterMs } from './githubHttp';
export { NetworkDeferredError, isDeferredNetworkError, getRetryAfterMs } from './githubHttp';
// M1: transforms puros y config de sync extraídos a módulos dedicados. Importamos de vuelta los que se usan
// internamente y RE-EXPORTAMOS la API pública para no obligar a los consumidores a cambiar sus imports.
import {
  assertGistSizeWithinLimit,
  assertNoSocialPrivateFields,
  buildGamesFiles,
  buildReviewSnippet,
  leanTabData,
} from './socialProjection';

export {
  assertGistSizeWithinLimit,
  assertNoSocialPrivateFields,
  buildGamesFiles,
  buildGamesMainFile,
  buildReviewSnippet,
  distributeIntoChunks,
  gamesChunkFilename,
  leanTabData,
  toPublicGame,
} from './socialProjection';
export { getSyncConfig, saveSyncConfig, clearSyncConfig, getSocialSyncConfig, saveSocialSyncConfig, ensureSyncConfigLoaded } from './gistConfigRepository';

const GIST_FILENAME = 'myGames.json';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

/**
 * ┌─ CORTE DE FORMATO DEL GIST DE JUEGOS (schemaVersion 4) — LEER ANTES DE ACTIVAR ─────────────────────┐
 * Con `true`, la ESCRITURA emite el envoltorio `GamesMainFile` v4: mapa por id (no `c/v/e/p`) +
 * DICCIONARIOS de categorías deduplicadas (genres/platforms/strengths/weaknesses/reasons) + ancla padre
 * con `chunkIndex` y chunks hijos de overflow. La LECTURA ya es retrocompatible en ESTA versión
 * (`unwrapGamesFile`/`assembleChunkedGames` leen plano, keyed-v3 y keyed-v4) y el auto-upgrade reescribe
 * lo viejo a v4 (`gamesGistNeedsUpgradeToWrapper`).
 *
 * ⚠️ ACTIVAR EN 2 PASOS (NO poner `true` de golpe):
 *   1) Desplegar ESTA versión a TODOS tus dispositivos. Con el flag en `false` ya ganan la LECTURA v4
 *      (siguen escribiendo plano) → nadie se rompe.
 *   2) Solo cuando TODOS estén al día, poner esto en `true` + commit + push. En la siguiente sync el gist
 *      pasa a v4 y se deduplican las categorías.
 * Una versión ANTERIOR a esta leería los índices del diccionario como números (datos corruptos). Es
 * REVERSIBLE (volver a `false` → se rebaja a plano). Verificado: round-trip exacto sobre datos reales, 4% menor.
 * └──────────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const ENABLE_GAMES_WRAPPER_WRITE = false;
const GIST_API_BASE = 'https://api.github.com/gists';
const SESSION_CACHE_SOCIAL_GIST_PREFIX = 'myGameList.session.socialGist';
const SESSION_CACHE_PUBLIC_SOCIAL_GIST_PREFIX = 'myGameList.session.publicSocialGist';
const SOCIAL_GIST_CACHE_TTL_MS = 20_000;
const PUBLIC_SOCIAL_GIST_CACHE_TTL_MS = 45_000;

type SessionCachedValue<T> = {
  value: T;
  etag?: string | null;
  expiresAt: number;
};

const socialGistCacheById = new Map<string, SessionCachedValue<SocialGistData>>();
const publicSocialGistCacheById = new Map<string, SessionCachedValue<SocialGistData>>();
const socialGistInFlightByKey = new Map<string, Promise<{ data: SocialGistData; etag: string | null; notModified?: boolean; wasLegacy?: boolean }>>();
const publicSocialGistInFlightById = new Map<string, Promise<SocialGistData>>();


export interface SocialGistProfile {
  name: string;
  private: boolean;
  favoriteGames: Array<{ id: number; name: string }>;
  visibility: SocialProfileVisibility;
  sharedLists: Partial<Record<TabId, SocialSharedGame[]>>;
}

export interface SocialProfileVisibility {
  hiddenTabs: TabId[];
  hideReplayable: boolean;
  hideRetry: boolean;
    hideGameTime: boolean;
}

/**
 * Proyección PÚBLICA de un juego compartido (canal social, index-only).
 * NO contiene review completo, score exacto, hours, steamDeck, retry, replayable ni strengths/weaknesses/reasons.
 * Solo lo mínimo + `rating` (redondeado) y `snippet` (≤160, derivado del review).
 */
export interface SocialSharedGame {
  id: number;
  name: string;
  platforms: string[];
  genres: string[];
  rating: number;
  snippet: string;
}

export type SocialActivityType = 'recommendation' | 'review';

export interface SocialRecommendationEntry {
  id: number;
  fromProfileId: string; // 6.2b: pseudónimo público (antes `fromUid`)
  gameId: number;
  gameName: string;
  rating: number;
  createdAt: number;
  updatedAt: number;
}

export interface SocialActivityEntry {
  id: string;
  key: string;
  type: SocialActivityType;
  actorProfileId: string; // 6.2b: pseudónimo público (antes `actorUid`)
  actorName: string;
  gameId: number;
  gameName: string;
  rating: number;
  recommendationText: string;
  snippet: string;
  createdAt: number;
  updatedAt: number;
}

export interface SocialGistData {
  profile: SocialGistProfile;
  // ST3: el array `recommendations` top-level era código muerto (sin writer; siempre []). Se elimina del modelo.
  // La LECTURA tolera gists viejos que aún lo lleven: sus recs se fusionan en `activity` (mergeLegacyActivity) y
  // al reescribir el gist propio (socialGistNeedsRewrite → wasLegacy) se deja fuera. `profile.recommendations` ídem.
  activity: SocialActivityEntry[];
  updatedAt: number;
  schemaVersion?: number; // 6.2b: 2 = identidad por profileId (uid fuera del canal público)
}

export interface UpsertRecommendationInput {
  actorProfileId: string;
  actorName: string;
  gameId: number;
  gameName: string;
  rating: number;
  timestamp?: number;
}

export interface UpsertReviewInput {
  actorProfileId: string;
  actorName: string;
  gameId: number;
  gameName: string;
  reviewText: string;
  rating: number;
  timestamp?: number;
}

function getGithubAuthHeader(token: string): string {
  // Use Bearer scheme which is recommended and compatible with PATs.
  return `Bearer ${token}`;
}

function shortTokenDiscriminant(token: string | null | undefined): string {
  if (!token) return 'anon';
  try {
    return String(token).slice(-8);
  } catch {
    return 'anon';
  }
}

function buildSessionCacheKey(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

function readSessionCachedValue<T>(key: string, options?: { includeExpired?: boolean }): SessionCachedValue<T> | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as SessionCachedValue<T>;
    if (!parsed || typeof parsed !== 'object') {
      window.sessionStorage.removeItem(key);
      return null;
    }

    if (!options?.includeExpired && Number(parsed.expiresAt || 0) <= Date.now()) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCachedValue<T>(key: string, value: SessionCachedValue<T>): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota/serialization errors in session cache.
  }
}

function readSocialGistCache(gistId: string): SessionCachedValue<SocialGistData> | null {
  const memory = socialGistCacheById.get(gistId);
  if (memory && memory.expiresAt > Date.now()) {
    return memory;
  }

  const key = buildSessionCacheKey(SESSION_CACHE_SOCIAL_GIST_PREFIX, gistId);
  const sessionValue = readSessionCachedValue<SocialGistData>(key);
  if (!sessionValue) {
    socialGistCacheById.delete(gistId);
    return null;
  }

  socialGistCacheById.set(gistId, sessionValue);
  return sessionValue;
}

function saveSocialGistCache(gistId: string, data: SocialGistData, etag: string | null): void {
  const cached: SessionCachedValue<SocialGistData> = {
    value: data,
    etag,
    expiresAt: Date.now() + SOCIAL_GIST_CACHE_TTL_MS,
  };

  socialGistCacheById.set(gistId, cached);
  writeSessionCachedValue(buildSessionCacheKey(SESSION_CACHE_SOCIAL_GIST_PREFIX, gistId), cached);
}

function readPublicSocialGistCache(gistId: string, token: string | null = null, options?: { includeExpired?: boolean }): SessionCachedValue<SocialGistData> | null {
  const cacheKey = `${gistId}:${shortTokenDiscriminant(token)}`;
  const memory = publicSocialGistCacheById.get(cacheKey);
  if (memory && (options?.includeExpired || memory.expiresAt > Date.now())) {
    return memory;
  }

  const key = buildSessionCacheKey(SESSION_CACHE_PUBLIC_SOCIAL_GIST_PREFIX, cacheKey);
  const sessionValue = readSessionCachedValue<SocialGistData>(key, { includeExpired: options?.includeExpired });
  if (!sessionValue) {
    publicSocialGistCacheById.delete(cacheKey);
    return null;
  }

  publicSocialGistCacheById.set(cacheKey, sessionValue);
  return sessionValue;
}

function savePublicSocialGistCache(gistId: string, data: SocialGistData, etag: string | null = null, token: string | null = null): void {
  const cacheKey = `${gistId}:${shortTokenDiscriminant(token)}`;
  const cached: SessionCachedValue<SocialGistData> = {
    value: data,
    etag,
    expiresAt: Date.now() + PUBLIC_SOCIAL_GIST_CACHE_TTL_MS,
  };

  publicSocialGistCacheById.set(cacheKey, cached);
  writeSessionCachedValue(buildSessionCacheKey(SESSION_CACHE_PUBLIC_SOCIAL_GIST_PREFIX, cacheKey), cached);
}

async function buildGithubError(response: Response, prefix: string): Promise<Error> {
  const statusPart = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;

  let message: string;
  try {
    const payload = (await response.json()) as { message?: string; errors?: Array<{ message?: string }> };
    const apiMessage = payload?.message?.trim();
    const apiDetails = (payload?.errors || [])
      .map((entry) => entry?.message?.trim())
      .filter(Boolean)
      .join(', ');
    const details = [apiMessage, apiDetails].filter(Boolean).join(' | ');
    message = details ? `${prefix}: ${statusPart} - ${details}` : `${prefix}: ${statusPart}`;
  } catch {
    message = `${prefix}: ${statusPart}`;
  }

  const error = new Error(message);
  // S3: en 403/429 adjunta cuánto esperar (Retry-After / X-RateLimit-Reset) para que el backoff lo respete.
  const retryAfterMs = parseRetryAfterMs(response, Date.now());
  if (retryAfterMs > 0) (error as { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
  return error;
}

export interface GistReadResponse {
  notModified?: boolean;
  data?: TabData;
  etag?: string | null;
  /** Upgrade proactivo: el remoto estaba en formato viejo; el ciclo de sync debe reescribirlo en el actual. */
  wasLegacy?: boolean;
}

function getEmptySocialGistData(): SocialGistData {
  return {
    profile: {
      name: '',
      private: false,
      favoriteGames: [],
      visibility: {
        hiddenTabs: [],
        hideReplayable: false,
        hideRetry: false,
        hideGameTime: false,
      },
      sharedLists: {},
    },
    activity: [],
    updatedAt: Date.now(),
  };
}

function normalizeTabId(value: unknown): TabId | null {
  const tab = String(value || '').trim() as TabId;
  if (tab === 'c' || tab === 'v' || tab === 'e' || tab === 'p') {
    return tab;
  }

  return null;
}

function normalizeSocialVisibility(value: unknown): SocialProfileVisibility {
  const source = (value && typeof value === 'object' ? value : {}) as Partial<SocialProfileVisibility>;
  const hiddenTabs = Array.isArray(source.hiddenTabs)
    ? source.hiddenTabs
        .map((tab) => normalizeTabId(tab))
        .filter((tab): tab is TabId => Boolean(tab))
    : [];

  return {
    hiddenTabs: [...new Set(hiddenTabs)],
    hideReplayable: Boolean(source.hideReplayable),
    hideRetry: Boolean(source.hideRetry),
      hideGameTime: Boolean(source.hideGameTime),
  };
}

function normalizeSocialSharedGame(value: unknown): SocialSharedGame | null {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const id = Number(source.id || 0);
  const name = String(source.name || '').trim();
  if (id <= 0 || !name) {
    return null;
  }

  const toStringArray = (items: unknown): string[] => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, 24);
  };

  // Proyección pública: deriva snippet del review legacy (o del snippet ya migrado) y rating del score legacy.
  const snippet = buildReviewSnippet(pickLegacyReviewText(source));
  const rating = Math.round(clampRating(source.rating ?? source.score));

  return {
    id,
    name,
    platforms: toStringArray(source.platforms),
    genres: toStringArray(source.genres),
    rating,
    snippet,
  };
}

function normalizeSocialSharedLists(value: unknown): Partial<Record<TabId, SocialSharedGame[]>> {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const output: Partial<Record<TabId, SocialSharedGame[]>> = {};

  TAB_IDS.forEach((tab) => {
    const rawItems = source[tab];
    if (!Array.isArray(rawItems)) {
      return;
    }

    const items = rawItems
      .map((entry) => normalizeSocialSharedGame(entry))
      .filter((entry): entry is SocialSharedGame => Boolean(entry))
      .slice(0, 120);

    output[tab] = items;
  });

  return output;
}

function normalizeActivityType(value: unknown): SocialActivityType | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'review' || normalized === 'review_created' || normalized === 'review_updated') {
    return 'review';
  }

  if (normalized === 'recommendation' || normalized === 'recommendation_with_message') {
    return 'recommendation';
  }

  return null;
}

// 6.2b: versión del esquema del gist social. 2 = identidad por profileId (sin uid en el canal público).
const SOCIAL_GIST_SCHEMA_VERSION = 2;

function buildActivityKey(actorId: string, gameId: number, type: SocialActivityType): string {
  return `${actorId}:${gameId}:${type}`;
}

function normalizeRecommendationItems(items: unknown): SocialRecommendationEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((entry) => {
      const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const gameId = Number(record.gameId || 0);
      const fromProfileId = pickLegacyFromId(record);
      const gameName = String(record.gameName || '').trim();
      const createdAt = normalizeTimestamp(record.createdAt, Date.now());
      const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);

      if (!fromProfileId || gameId <= 0 || !gameName) {
        return null;
      }

      return {
        id: Number(record.id || createdAt),
        fromProfileId,
        gameId,
        gameName,
        rating: clampRating(record.rating),
        createdAt,
        updatedAt,
      } satisfies SocialRecommendationEntry;
    })
    .filter((entry): entry is SocialRecommendationEntry => Boolean(entry))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 160);
}

function normalizeActivityItems(items: unknown): SocialActivityEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((entry) => {
      const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const type = normalizeActivityType(record.type);
      const actorProfileId = pickLegacyActorId(record);
      const gameId = Number(record.gameId || 0);
      const gameName = String(record.gameName || '').trim();
      const createdAt = normalizeTimestamp(record.createdAt, Date.now());
      const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);

      if (!type || !actorProfileId || gameId <= 0 || !gameName) {
        return null;
      }

      const key = String(record.key || buildActivityKey(actorProfileId, gameId, type)).trim() || buildActivityKey(actorProfileId, gameId, type);

      return {
        id: String(record.id || buildActivityKey(actorProfileId, gameId, type)),
        key,
        type,
        actorProfileId,
        actorName: String(record.actorName || '').trim(),
        gameId,
        gameName,
        rating: clampRating(record.rating),
        recommendationText: String(record.recommendationText || '').trim(),
        snippet: buildReviewSnippet(pickLegacyReviewText(record)),
        createdAt,
        updatedAt,
      } satisfies SocialActivityEntry;
    })
    .filter((entry): entry is SocialActivityEntry => Boolean(entry))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 320);
}

function mergeLegacyActivity(
  normalizedActivity: SocialActivityEntry[],
  recommendations: SocialRecommendationEntry[],
): SocialActivityEntry[] {
  const map = new Map<string, SocialActivityEntry>();

  normalizedActivity.forEach((entry) => {
    map.set(entry.key, entry);
  });

  recommendations.forEach((recommendation) => {
    const key = buildActivityKey(recommendation.fromProfileId, recommendation.gameId, 'recommendation');
    const current = map.get(key);

    const candidate: SocialActivityEntry = {
      id: buildActivityKey(recommendation.fromProfileId, recommendation.gameId, 'recommendation'),
      key,
      type: 'recommendation',
      actorProfileId: recommendation.fromProfileId,
      actorName: current?.actorName || '',
      gameId: recommendation.gameId,
      gameName: recommendation.gameName,
      rating: recommendation.rating,
      recommendationText: '',
      snippet: '',
      createdAt: current?.createdAt || recommendation.createdAt,
      updatedAt: Math.max(current?.updatedAt || 0, recommendation.updatedAt),
    };

    map.set(key, candidate);
  });

  return [...map.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 320);
}

function upsertActivityEntry(
  items: SocialActivityEntry[],
  next: Omit<SocialActivityEntry, 'id' | 'key' | 'createdAt' | 'updatedAt'>,
  timestamp: number,
): SocialActivityEntry[] {
  const key = buildActivityKey(next.actorProfileId, next.gameId, next.type);
  const existing = items.find((entry) => entry.key === key);
  const createdAt = existing?.createdAt || timestamp;

  const entry: SocialActivityEntry = {
    id: existing?.id || buildActivityKey(next.actorProfileId, next.gameId, next.type),
    key,
    createdAt,
    updatedAt: timestamp,
    ...next,
  };

  return [
    entry,
    ...items.filter((candidate) => candidate.key !== key),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 320);
}

export function upsertReviewActivity(data: SocialGistData, input: UpsertReviewInput): SocialGistData {
  const now = input.timestamp || Date.now();
  const cleanReview = String(input.reviewText || '').trim();
  const cleanName = String(input.gameName || '').trim();

  if (!input.actorProfileId || input.gameId <= 0 || !cleanName || !cleanReview) {
    return data;
  }

  const activity = upsertActivityEntry(data.activity || [], {
    type: 'review',
    actorProfileId: input.actorProfileId,
    actorName: String(input.actorName || '').trim(),
    gameId: input.gameId,
    gameName: cleanName,
    rating: clampRating(input.rating),
    recommendationText: '',
    snippet: buildReviewSnippet(cleanReview),
  }, now);

  return {
    ...data,
    activity,
    updatedAt: now,
  };
}

function normalizeSocialGistData(data: unknown): SocialGistData {
  const source = (data && typeof data === 'object' ? data : {}) as Partial<SocialGistData>;
  const profile = (source.profile && typeof source.profile === 'object' ? source.profile : {}) as Partial<SocialGistProfile>;

  const toGames = (items: unknown): Array<{ id: number; name: string }> => {
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .map((entry) => {
        const record = (entry && typeof entry === 'object' ? entry : {}) as { id?: unknown; name?: unknown };
        return {
          id: Number(record.id || 0),
          name: String(record.name || '').trim(),
        };
      })
      .filter((entry) => entry.id > 0 && Boolean(entry.name));
  };

  // ST3: las recomendaciones legacy (top-level y en profile) NO se incluyen en el modelo normalizado, pero se LEEN
  // del raw para fusionarlas en `activity` (sin pérdida de datos); al reescribir el gist se quedan fuera.
  const legacyRecommendations = normalizeRecommendationItems((source as { recommendations?: unknown }).recommendations);

  const normalized: SocialGistData = {
    profile: {
      name: String(profile.name || '').trim(),
      private: Boolean(profile.private),
      favoriteGames: toGames(profile.favoriteGames),
      visibility: normalizeSocialVisibility(profile.visibility),
      sharedLists: normalizeSocialSharedLists(profile.sharedLists),
    },
    activity: normalizeActivityItems(source.activity),
    updatedAt: Number(source.updatedAt || Date.now()),
    schemaVersion: SOCIAL_GIST_SCHEMA_VERSION,
  };

  normalized.activity = mergeLegacyActivity(normalized.activity, legacyRecommendations);

  return normalized;
}

/**
 * 6.2b — Remapea la identidad del actor del contenido social: cualquier `actorProfileId`/`fromProfileId`
 * que coincida con un uid conocido se sustituye por su `profileId`, reconstruyendo `key`/`id`. Pura.
 * Solo debe aplicarse al gist PROPIO (el llamador pasa `{ [miUid]: miProfileId }`); para gists ajenos el
 * mapa va vacío y no cambia nada. Sirve para sacar el uid del canal público al reescribir un gist legacy.
 */
export function remapSocialActorIds(data: SocialGistData, uidToProfileId: Record<string, string>): SocialGistData {
  const map = (id: string): string => uidToProfileId[id] || id;

  const activity = (data.activity || []).map((entry) => {
    const actorProfileId = map(entry.actorProfileId);
    if (actorProfileId === entry.actorProfileId) return entry;
    const key = buildActivityKey(actorProfileId, entry.gameId, entry.type);
    return { ...entry, actorProfileId, key, id: key };
  });

  return { ...data, activity };
}

export async function whoAmI(token: string): Promise<{ login: string }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await githubFetch('https://api.github.com/user', {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Auth failed');
  }

  return (await response.json()) as { login: string };
}

export async function createGist(token: string): Promise<{ gistId: string; etag: string | null }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await githubFetch(GIST_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: 'Mi Lista de Juegos - Sincronización',
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: Date.now() }),
        },
      },
    }),
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Create failed');
  }

  const body = (await response.json()) as { id: string };
  return { gistId: body.id, etag: response.headers.get('etag') };
}

export async function createSocialGist(token: string): Promise<{ gistId: string; etag: string | null }> {
  return createSocialGistWithData(token, getEmptySocialGistData(), true);
}

async function createSocialGistWithData(token: string, data: SocialGistData, isPublic: boolean): Promise<{ gistId: string; etag: string | null }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const normalized = normalizeSocialGistData(data);
  assertNoSocialPrivateFields(normalized); // canal público: nunca review/reviewText/score/hours/etc.
  const response = await githubFetch(GIST_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      description: 'myGameList - Social Sync',
      public: isPublic,
      files: {
        [SOCIAL_GIST_FILENAME]: {
          content: JSON.stringify(normalized),
        },
      },
    }),
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Create social gist failed');
  }

  const body = (await response.json()) as { id: string };
  return { gistId: body.id, etag: response.headers.get('etag') };
}

async function isPublicSocialGistAccessible(gistId: string): Promise<boolean> {
  try {
    await readPublicSocialGistById(gistId, null);
    return true;
  } catch {
    return false;
  }
}

export async function readSocialGist(token: string, gistId: string, etag: string | null = null): Promise<{ data: SocialGistData; etag: string | null; notModified?: boolean; wasLegacy?: boolean }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const cached = readSocialGistCache(gistId);
  if (!etag && cached) {
    return {
      data: cached.value,
      etag: cached.etag || null,
      notModified: true,
    };
  }

  // Deduplicate by gistId only (etag variations should reuse same in-flight request)
  const requestKey = gistId;
  const inFlight = socialGistInFlightByKey.get(requestKey);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const headers: Record<string, string> = {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (etag) {
      headers['If-None-Match'] = etag;
    }

    const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers });

    if (response.status === 304) {
      if (cached) {
        return {
          data: cached.value,
          etag: cached.etag || etag,
          notModified: true,
        };
      }

      // No cached value in this session: perform a fresh fetch without ETag header
      const freshHeaders: Record<string, string> = {
        Authorization: getGithubAuthHeader(token),
        'X-GitHub-Api-Version': '2022-11-28',
      };
      const freshResp = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers: freshHeaders });
      if (!freshResp.ok) {
        throw await buildGithubError(freshResp, 'Read social gist fallback failed');
      }
      const freshBody = (await freshResp.json()) as { files?: Record<string, { content: string }> };
      const rawFresh = freshBody.files?.[SOCIAL_GIST_FILENAME]?.content;
      const responseEtagFresh = freshResp.headers.get('etag');
      if (!rawFresh) {
        const empty = getEmptySocialGistData();
        saveSocialGistCache(gistId, empty, responseEtagFresh);
        return { data: empty, etag: responseEtagFresh };
      }

      try {
        const parsedFresh = JSON.parse(rawFresh);
        const normalizedFresh = normalizeSocialGistData(parsedFresh);
        saveSocialGistCache(gistId, normalizedFresh, responseEtagFresh);
        return { data: normalizedFresh, etag: responseEtagFresh, wasLegacy: socialGistNeedsRewrite(parsedFresh) };
      } catch {
        const empty = getEmptySocialGistData();
        saveSocialGistCache(gistId, empty, responseEtagFresh);
        return { data: empty, etag: responseEtagFresh };
      }
    }

    if (!response.ok) {
      throw await buildGithubError(response, 'Read social gist failed');
    }

    const body = (await response.json()) as { files?: Record<string, { content: string }> };
    const raw = body.files?.[SOCIAL_GIST_FILENAME]?.content;
    const responseEtag = response.headers.get('etag');
    if (!raw) {
      const empty = getEmptySocialGistData();
      saveSocialGistCache(gistId, empty, responseEtag);
      return {
        data: empty,
        etag: responseEtag,
      };
    }

    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizeSocialGistData(parsed);
      saveSocialGistCache(gistId, normalized, responseEtag);
      return {
        data: normalized,
        etag: responseEtag,
        wasLegacy: socialGistNeedsRewrite(parsed),
      };
    } catch {
      const empty = getEmptySocialGistData();
      saveSocialGistCache(gistId, empty, responseEtag);
      return {
        data: empty,
        etag: responseEtag,
      };
    }
  })();

  socialGistInFlightByKey.set(requestKey, request);
  try {
    return await request;
  } finally {
    socialGistInFlightByKey.delete(requestKey);
  }
}

export async function readPublicSocialGistById(gistId: string, token: string | null = null): Promise<SocialGistData> {
  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const cached = readPublicSocialGistCache(gistId, token);
  if (cached) {
    return cached.value;
  }

  const staleCached = readPublicSocialGistCache(gistId, token, { includeExpired: true });

  const inFlight = publicSocialGistInFlightById.get(gistId);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    const baseHeaders: Record<string, string> = {
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (token && isValidGithubToken(token)) {
      baseHeaders['Authorization'] = getGithubAuthHeader(token);
    }

    if (staleCached?.etag) {
      baseHeaders['If-None-Match'] = staleCached.etag;
    }

    const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
      headers: baseHeaders,
    });

    if (response.status === 304 && staleCached) {
      savePublicSocialGistCache(gistId, staleCached.value, staleCached.etag || null, token);
      return staleCached.value;
    }

    if (!response.ok) {
      throw await buildGithubError(response, 'Read public social gist failed');
    }

    const body = (await response.json()) as { files?: Record<string, { content: string }> };
    const raw = body.files?.[SOCIAL_GIST_FILENAME]?.content;
    const responseEtag = response.headers.get('etag');
    let normalized = getEmptySocialGistData();
    if (raw) {
      try {
        normalized = normalizeSocialGistData(JSON.parse(raw));
      } catch {
        normalized = getEmptySocialGistData();
      }
    }

    savePublicSocialGistCache(gistId, normalized, responseEtag, token);
    return normalized;
  })();

  publicSocialGistInFlightById.set(gistId, request);
  try {
    return await request;
  } finally {
    publicSocialGistInFlightById.delete(gistId);
  }
}

export async function writeSocialGist(token: string, gistId: string, payload: SocialGistData): Promise<{ etag: string | null }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const normalized = normalizeSocialGistData({
    ...payload,
    updatedAt: Date.now(),
  });
  assertNoSocialPrivateFields(normalized); // canal público: nunca review/reviewText/score/hours/etc. (denylist)
  assertValidSocialGist(normalized); // F6.1: allowlist estricta (Zod) — falla si hay cualquier campo extra/tipo inválido

  const socialContent = JSON.stringify(normalized);
  assertGistSizeWithinLimit(socialContent, 'gist social'); // E1: evita el deadlock al superar el límite de gist

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      files: {
        [SOCIAL_GIST_FILENAME]: {
          content: socialContent,
        },
      },
    }),
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Write social gist failed');
  }

  const etag = response.headers.get('etag');
  saveSocialGistCache(gistId, normalized, etag);

  return {
    etag,
  };
}

export async function readGist(token: string, gistId: string, etag: string | null = null): Promise<GistReadResponse> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const headers: Record<string, string> = {
    Authorization: getGithubAuthHeader(token),
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers });

  if (response.status === 304) {
    return { notModified: true };
  }

  if (!response.ok) {
    throw await buildGithubError(response, 'Read failed');
  }

  const body = (await response.json()) as { files?: Record<string, { content: string }> };
  const raw = body.files?.[GIST_FILENAME]?.content;

  if (!raw) {
    throw new Error('Gist file not found');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON in Gist');
  }

  // E4: si el ancla referencia chunks de overflow en el mismo gist, fusiona sus juegos (los ficheros vienen en
  // la misma respuesta). Para gist plano o de un solo fichero no hace nada (comportamiento actual intacto).
  const assembled = assembleChunkedGames(parsed, body.files);

  return {
    data: migrateData(unwrapGamesFile(assembled)),
    etag: response.headers.get('etag'),
    // El "viejo" depende del DESTINO de escritura: con el envoltorio v4 activado, "viejo" = no-v4 (se re-encoda);
    // con escritura plana, "viejo" = envoltorio o legacy (se rebaja a plano). Así el auto-upgrade apunta al destino real.
    wasLegacy: ENABLE_GAMES_WRAPPER_WRITE ? gamesGistNeedsUpgradeToWrapper(parsed) : gamesGistNeedsRewrite(parsed),
  };
}

export async function writeGist(token: string, gistId: string, payload: TabData): Promise<{ etag: string | null; updatedAt: number }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  // E1: serialización magra (omite opcionales vacíos) + guarda de tamaño por fichero.
  const lean = leanTabData(payload);
  const headers: Record<string, string> = {
    Authorization: getGithubAuthHeader(token),
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let files: Record<string, { content: string } | null>;

  if (ENABLE_GAMES_WRAPPER_WRITE) {
    // E4 (GATED — bandera en false por ahora): envoltorio DESTINO multi-fichero. El ancla lleva el bucket `main`;
    // el excedente va a ficheros `myGames-chunk-cN.json` del MISMO gist. Cada fichero se mantiene bajo el umbral.
    const { anchorFile, chunkFiles } = buildGamesFiles(lean);
    files = {};
    const anchorContent = JSON.stringify(anchorFile);
    assertGistSizeWithinLimit(anchorContent, 'gist de juegos (ancla)');
    files[GIST_FILENAME] = { content: anchorContent };
    for (const [name, file] of Object.entries(chunkFiles)) {
      const content = JSON.stringify({ ...file, mainGistId: gistId });
      assertGistSizeWithinLimit(content, `gist de juegos (${name})`);
      files[name] = { content };
    }
    // Eliminar ficheros chunk obsoletos (existían antes y ya no forman parte del conjunto): listar y poner a null.
    try {
      const current = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers });
      if (current.ok) {
        const currentBody = (await current.json()) as { files?: Record<string, unknown> };
        for (const name of Object.keys(currentBody.files || {})) {
          if (/^myGames-chunk-.+\.json$/.test(name) && !(name in files)) {
            files[name] = null; // null elimina el fichero del gist
          }
        }
      }
    } catch {
      // Si no se pudo listar, no borramos obsoletos (no crítico); el PATCH continúa.
    }
  } else {
    // CAMINO ACTUAL (flag OFF) — TabData plano, byte-idéntico al anterior.
    const fileContent = JSON.stringify(lean);
    assertGistSizeWithinLimit(fileContent, 'gist de juegos');
    files = { [GIST_FILENAME]: { content: fileContent } };
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ files }),
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Write failed');
  }

  const body = (await response.json()) as { updated_at?: string };
  return {
    etag: response.headers.get('etag'),
    updatedAt: body.updated_at ? Date.parse(body.updated_at) : Date.now(),
  };
}

/**
 * Garantiza que el gist social tenga la visibilidad deseada.
 *
 * Si la visibilidad actual no coincide con la deseada, se clona el contenido
 * en un nuevo gist con la visibilidad adecuada.
 *
 * @param token - Token de GitHub con permisos de gist
 * @param gistId - ID del gist social original
 * @param isPublic - true para público, false para privado
 */
export async function updateGistPrivacy(token: string, gistId: string, isPublic: boolean): Promise<{ gistId: string; etag: string | null }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const sourceGist = await readSocialGist(token, gistId, null);
  const currentlyPublic = await isPublicSocialGistAccessible(gistId);

  if ((isPublic && currentlyPublic) || (!isPublic && !currentlyPublic)) {
    return { gistId, etag: sourceGist.etag || null };
  }

  const migration = await createSocialGistWithData(token, sourceGist.data, isPublic);
  return {
    gistId: migration.gistId,
    etag: migration.etag,
  };
}
