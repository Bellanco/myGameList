import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { migrateData } from './migrateRepository';
import { clampRating, normalizeTimestamp } from '../../core/utils/normalize';
import { gamesGistNeedsRewrite, unwrapGamesFile } from '../migration/legacyGamesFormat';
import { pickLegacyReviewText, socialGistNeedsRewrite } from '../migration/legacySocialFormat';
import { assertValidSocialGist } from '../schemas/socialGistSchema';
import { TAB_IDS, type TabData, type TabId } from '../types/game';
// M1: transforms puros y config de sync extraídos a módulos dedicados. Importamos de vuelta los que se usan
// internamente y RE-EXPORTAMOS la API pública para no obligar a los consumidores a cambiar sus imports.
import {
  assertGistSizeWithinLimit,
  assertNoSocialPrivateFields,
  buildGamesMainFile,
  buildReviewSnippet,
  leanTabData,
} from './socialProjection';

export {
  assertGistSizeWithinLimit,
  assertNoSocialPrivateFields,
  buildGamesMainFile,
  buildReviewSnippet,
  distributeIntoChunks,
  leanTabData,
  toPublicGame,
} from './socialProjection';
export { getSyncConfig, saveSyncConfig, clearSyncConfig, getSocialSyncConfig, saveSocialSyncConfig } from './gistConfigRepository';

const GIST_FILENAME = 'myGames.json';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

/**
 * Fase C (corte de formato): si está activo, la ESCRITURA del gist de juegos emite el envoltorio
 * `GamesMainFile` (schemaVersion 3) en lugar del `TabData` plano. La LECTURA ya es retrocompatible
 * (unwrapGamesFile lee ambos). ⚠️ Mantener en `false` hasta que TODOS los dispositivos tengan la versión
 * nueva: una versión vieja (sin unwrapGamesFile) no sabría leer el envoltorio. Activar es un cambio de una sola dirección.
 */
const ENABLE_GAMES_WRAPPER_WRITE = false;
const GIST_API_BASE = 'https://api.github.com/gists';
const SESSION_CACHE_SOCIAL_GIST_PREFIX = 'myGameList.session.socialGist';
const SESSION_CACHE_PUBLIC_SOCIAL_GIST_PREFIX = 'myGameList.session.publicSocialGist';
const SESSION_CACHE_PUBLIC_GAMES_GIST_PREFIX = 'myGameList.session.publicGamesGist';
const SOCIAL_GIST_CACHE_TTL_MS = 20_000;
const PUBLIC_SOCIAL_GIST_CACHE_TTL_MS = 45_000;
const PUBLIC_GAMES_GIST_CACHE_TTL_MS = 45_000;

type SessionCachedValue<T> = {
  value: T;
  etag?: string | null;
  expiresAt: number;
};

const socialGistCacheById = new Map<string, SessionCachedValue<SocialGistData>>();
const publicSocialGistCacheById = new Map<string, SessionCachedValue<SocialGistData>>();
const publicGamesGistCacheById = new Map<string, SessionCachedValue<TabData>>();
const socialGistInFlightByKey = new Map<string, Promise<{ data: SocialGistData; etag: string | null; notModified?: boolean; wasLegacy?: boolean }>>();
const publicSocialGistInFlightById = new Map<string, Promise<SocialGistData>>();
const publicGamesGistInFlightById = new Map<string, Promise<TabData>>();


export interface SocialGistProfile {
  name: string;
  private: boolean;
  favoriteGames: Array<{ id: number; name: string }>;
  recommendations: Array<{ id: number; name: string }>;
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
  fromUid: string;
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
  actorUid: string;
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
  recommendations: SocialRecommendationEntry[];
  activity: SocialActivityEntry[];
  updatedAt: number;
}

export interface UpsertRecommendationInput {
  actorUid: string;
  actorName: string;
  gameId: number;
  gameName: string;
  rating: number;
  timestamp?: number;
}

export interface UpsertReviewInput {
  actorUid: string;
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

function readPublicGamesGistCache(gistId: string, token: string | null = null, options?: { includeExpired?: boolean }): SessionCachedValue<TabData> | null {
  const cacheKey = `${gistId}:${shortTokenDiscriminant(token)}`;
  const memory = publicGamesGistCacheById.get(cacheKey);
  if (memory && (options?.includeExpired || memory.expiresAt > Date.now())) {
    return memory;
  }

  const key = buildSessionCacheKey(SESSION_CACHE_PUBLIC_GAMES_GIST_PREFIX, cacheKey);
  const sessionValue = readSessionCachedValue<TabData>(key, { includeExpired: options?.includeExpired });
  if (!sessionValue) {
    publicGamesGistCacheById.delete(cacheKey);
    return null;
  }

  publicGamesGistCacheById.set(cacheKey, sessionValue);
  return sessionValue;
}

function savePublicGamesGistCache(gistId: string, data: TabData, etag: string | null = null, token: string | null = null): void {
  const cacheKey = `${gistId}:${shortTokenDiscriminant(token)}`;
  const cached: SessionCachedValue<TabData> = {
    value: data,
    etag,
    expiresAt: Date.now() + PUBLIC_GAMES_GIST_CACHE_TTL_MS,
  };

  publicGamesGistCacheById.set(cacheKey, cached);
  writeSessionCachedValue(buildSessionCacheKey(SESSION_CACHE_PUBLIC_GAMES_GIST_PREFIX, cacheKey), cached);
}

async function buildGithubError(response: Response, prefix: string): Promise<string> {
  const statusPart = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;

  try {
    const payload = (await response.json()) as { message?: string; errors?: Array<{ message?: string }> };
    const apiMessage = payload?.message?.trim();
    const apiDetails = (payload?.errors || [])
      .map((entry) => entry?.message?.trim())
      .filter(Boolean)
      .join(', ');
    const details = [apiMessage, apiDetails].filter(Boolean).join(' | ');
    return details ? `${prefix}: ${statusPart} - ${details}` : `${prefix}: ${statusPart}`;
  } catch {
    return `${prefix}: ${statusPart}`;
  }
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
      recommendations: [],
      visibility: {
        hiddenTabs: [],
        hideReplayable: false,
        hideRetry: false,
        hideGameTime: false,
      },
      sharedLists: {},
    },
    recommendations: [],
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

function buildActivityKey(actorUid: string, gameId: number, type: SocialActivityType): string {
  return `${actorUid}:${gameId}:${type}`;
}

function normalizeRecommendationItems(items: unknown): SocialRecommendationEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((entry) => {
      const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const gameId = Number(record.gameId || 0);
      const fromUid = String(record.fromUid || '').trim();
      const gameName = String(record.gameName || '').trim();
      const createdAt = normalizeTimestamp(record.createdAt, Date.now());
      const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);

      if (!fromUid || gameId <= 0 || !gameName) {
        return null;
      }

      return {
        id: Number(record.id || createdAt),
        fromUid,
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
      const actorUid = String(record.actorUid || '').trim();
      const gameId = Number(record.gameId || 0);
      const gameName = String(record.gameName || '').trim();
      const createdAt = normalizeTimestamp(record.createdAt, Date.now());
      const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);

      if (!type || !actorUid || gameId <= 0 || !gameName) {
        return null;
      }

      const key = String(record.key || buildActivityKey(actorUid, gameId, type)).trim() || buildActivityKey(actorUid, gameId, type);

      return {
        id: String(record.id || buildActivityKey(actorUid, gameId, type)),
        key,
        type,
        actorUid,
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
    const key = buildActivityKey(recommendation.fromUid, recommendation.gameId, 'recommendation');
    const current = map.get(key);

    const candidate: SocialActivityEntry = {
      id: buildActivityKey(recommendation.fromUid, recommendation.gameId, 'recommendation'),
      key,
      type: 'recommendation',
      actorUid: recommendation.fromUid,
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
  const key = buildActivityKey(next.actorUid, next.gameId, next.type);
  const existing = items.find((entry) => entry.key === key);
  const createdAt = existing?.createdAt || timestamp;

  const entry: SocialActivityEntry = {
    id: existing?.id || buildActivityKey(next.actorUid, next.gameId, next.type),
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

  if (!input.actorUid || input.gameId <= 0 || !cleanName || !cleanReview) {
    return data;
  }

  const activity = upsertActivityEntry(data.activity || [], {
    type: 'review',
    actorUid: input.actorUid,
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

  const normalized: SocialGistData = {
    profile: {
      name: String(profile.name || '').trim(),
      private: Boolean(profile.private),
      favoriteGames: toGames(profile.favoriteGames),
      recommendations: toGames(profile.recommendations),
      visibility: normalizeSocialVisibility(profile.visibility),
      sharedLists: normalizeSocialSharedLists(profile.sharedLists),
    },
    recommendations: normalizeRecommendationItems(source.recommendations),
    activity: normalizeActivityItems(source.activity),
    updatedAt: Number(source.updatedAt || Date.now()),
  };

  normalized.activity = mergeLegacyActivity(normalized.activity, normalized.recommendations);

  return normalized;
}

export async function whoAmI(token: string): Promise<{ login: string }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Auth failed'));
  }

  return (await response.json()) as { login: string };
}

export async function createGist(token: string): Promise<{ gistId: string; etag: string | null }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await fetch(GIST_API_BASE, {
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
    throw new Error(await buildGithubError(response, 'Create failed'));
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
  const response = await fetch(GIST_API_BASE, {
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
    throw new Error(await buildGithubError(response, 'Create social gist failed'));
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

    const response = await fetch(`${GIST_API_BASE}/${gistId}`, { headers });

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
      const freshResp = await fetch(`${GIST_API_BASE}/${gistId}`, { headers: freshHeaders });
      if (!freshResp.ok) {
        throw new Error(await buildGithubError(freshResp, 'Read social gist fallback failed'));
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
      throw new Error(await buildGithubError(response, 'Read social gist failed'));
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

    const response = await fetch(`${GIST_API_BASE}/${gistId}`, {
      headers: baseHeaders,
    });

    if (response.status === 304 && staleCached) {
      savePublicSocialGistCache(gistId, staleCached.value, staleCached.etag || null, token);
      return staleCached.value;
    }

    if (!response.ok) {
      throw new Error(await buildGithubError(response, 'Read public social gist failed'));
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

export async function readPublicGamesGistById(gistId: string, token: string | null = null): Promise<TabData> {
  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const cached = readPublicGamesGistCache(gistId, token);
  if (cached) {
    return cached.value;
  }

  const staleCached = readPublicGamesGistCache(gistId, token, { includeExpired: true });

  const inFlight = publicGamesGistInFlightById.get(gistId);
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

    const response = await fetch(`${GIST_API_BASE}/${gistId}`, {
      headers: baseHeaders,
    });

    if (response.status === 304 && staleCached) {
      savePublicGamesGistCache(gistId, staleCached.value, staleCached.etag || null, token);
      return staleCached.value;
    }

    if (!response.ok) {
      throw new Error(await buildGithubError(response, 'Read public games gist failed'));
    }

    const body = (await response.json()) as { files?: Record<string, { content: string }> };
    const raw = body.files?.[GIST_FILENAME]?.content;
    const responseEtag = response.headers.get('etag');
    let normalized = migrateData({});
    if (raw) {
      try {
        normalized = migrateData(unwrapGamesFile(JSON.parse(raw)));
      } catch {
        normalized = migrateData({});
      }
    }

    savePublicGamesGistCache(gistId, normalized, responseEtag, token);
    return normalized;
  })();

  publicGamesGistInFlightById.set(gistId, request);
  try {
    return await request;
  } finally {
    publicGamesGistInFlightById.delete(gistId);
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

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, {
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
    throw new Error(await buildGithubError(response, 'Write social gist failed'));
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

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, { headers });

  if (response.status === 304) {
    return { notModified: true };
  }

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Read failed'));
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

  return {
    data: migrateData(unwrapGamesFile(parsed)),
    etag: response.headers.get('etag'),
    wasLegacy: gamesGistNeedsRewrite(parsed),
  };
}

export async function writeGist(token: string, gistId: string, payload: TabData): Promise<{ etag: string | null; updatedAt: number }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  // Fase C: emitir el envoltorio destino solo si la bandera está activa; si no, TabData plano (retrocompatible).
  // E1: serialización magra (omite opcionales vacíos) + guarda de tamaño (evita el deadlock al superar el límite de gist).
  const lean = leanTabData(payload);
  const fileContent = ENABLE_GAMES_WRAPPER_WRITE ? JSON.stringify(buildGamesMainFile(lean)) : JSON.stringify(lean);
  assertGistSizeWithinLimit(fileContent, 'gist de juegos');

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      files: {
        [GIST_FILENAME]: {
          content: fileContent,
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Write failed'));
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
