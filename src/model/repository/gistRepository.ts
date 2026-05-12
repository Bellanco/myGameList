import { GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY } from '../../core/constants/storageKeys';
import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { migrateData } from './migrateRepository';
import type { SyncConfig, TabData, TabId } from '../types/game';

const GIST_FILENAME = 'myGames.json';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';
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
const socialGistInFlightByKey = new Map<string, Promise<{ data: SocialGistData; etag: string | null; notModified?: boolean }>>();
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

export interface SocialSharedGame {
  id: number;
  name: string;
  platforms: string[];
  genres: string[];
  steamDeck: boolean;
  review: string;
  score: number;
  strengths: string[];
  weaknesses: string[];
  reasons: string[];
  replayable: boolean;
  retry: boolean;
  hours: number | null;
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
  reviewText: string;
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
  // GitHub REST API uses 'token' scheme for Personal Access Tokens (PAT).
  return `token ${token}`;
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
  const cacheKey = `${gistId}:${token || 'anon'}`;
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
  const cacheKey = `${gistId}:${token || 'anon'}`;
  const cached: SessionCachedValue<SocialGistData> = {
    value: data,
    etag,
    expiresAt: Date.now() + PUBLIC_SOCIAL_GIST_CACHE_TTL_MS,
  };

  publicSocialGistCacheById.set(cacheKey, cached);
  writeSessionCachedValue(buildSessionCacheKey(SESSION_CACHE_PUBLIC_SOCIAL_GIST_PREFIX, cacheKey), cached);
}

function readPublicGamesGistCache(gistId: string, token: string | null = null, options?: { includeExpired?: boolean }): SessionCachedValue<TabData> | null {
  const cacheKey = `${gistId}:${token || 'anon'}`;
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
  const cacheKey = `${gistId}:${token || 'anon'}`;
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

  const rawHours = Number(source.hours);

  return {
    id,
    name,
    platforms: toStringArray(source.platforms),
    genres: toStringArray(source.genres),
    steamDeck: Boolean(source.steamDeck),
    review: String(source.review || '').trim(),
    score: clampRating(source.score),
    strengths: toStringArray(source.strengths),
    weaknesses: toStringArray(source.weaknesses),
    reasons: toStringArray(source.reasons),
    replayable: Boolean(source.replayable),
    retry: Boolean(source.retry),
    hours: Number.isFinite(rawHours) && rawHours >= 0 ? rawHours : null,
  };
}

function normalizeSocialSharedLists(value: unknown): Partial<Record<TabId, SocialSharedGame[]>> {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const output: Partial<Record<TabId, SocialSharedGame[]>> = {};

  (['c', 'v', 'e', 'p'] as const).forEach((tab) => {
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

function clampRating(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(5, numeric));
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
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

function buildActivityId(actorUid: string, gameId: number, type: SocialActivityType): string {
  return buildActivityKey(actorUid, gameId, type);
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
        id: String(record.id || buildActivityId(actorUid, gameId, type)),
        key,
        type,
        actorUid,
        actorName: String(record.actorName || '').trim(),
        gameId,
        gameName,
        rating: clampRating(record.rating),
        recommendationText: String(record.recommendationText || '').trim(),
        reviewText: String(record.reviewText || '').trim(),
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
      id: buildActivityId(recommendation.fromUid, recommendation.gameId, 'recommendation'),
      key,
      type: 'recommendation',
      actorUid: recommendation.fromUid,
      actorName: current?.actorName || '',
      gameId: recommendation.gameId,
      gameName: recommendation.gameName,
      rating: recommendation.rating,
      recommendationText: '',
      reviewText: '',
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
    id: existing?.id || buildActivityId(next.actorUid, next.gameId, next.type),
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

function upsertRecommendationEntry(
  items: SocialRecommendationEntry[],
  input: UpsertRecommendationInput,
  timestamp: number,
): SocialRecommendationEntry[] {
  const existing = items.find((entry) => entry.fromUid === input.actorUid && entry.gameId === input.gameId);
  const createdAt = existing?.createdAt || timestamp;

  const next: SocialRecommendationEntry = {
    id: existing?.id || timestamp,
    fromUid: input.actorUid,
    gameId: input.gameId,
    gameName: input.gameName,
    rating: clampRating(input.rating),
    createdAt,
    updatedAt: timestamp,
  };

  return [
    next,
    ...items.filter((entry) => !(entry.fromUid === input.actorUid && entry.gameId === input.gameId)),
  ]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 160);
}

export function buildReviewExcerpt(text: string, maxLength = 180): string {
  const clean = String(text || '').trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function upsertRecommendationActivity(data: SocialGistData, input: UpsertRecommendationInput): SocialGistData {
  const now = input.timestamp || Date.now();
  const cleanName = String(input.gameName || '').trim();
  if (!input.actorUid || input.gameId <= 0 || !cleanName) {
    return data;
  }

  const recommendations = upsertRecommendationEntry(data.recommendations || [], input, now);

  const activity = upsertActivityEntry(data.activity || [], {
    type: 'recommendation',
    actorUid: input.actorUid,
    actorName: String(input.actorName || '').trim(),
    gameId: input.gameId,
    gameName: cleanName,
    rating: clampRating(input.rating),
    recommendationText: '',
    reviewText: '',
  }, now);

  return {
    ...data,
    recommendations,
    activity,
    updatedAt: now,
  };
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
    reviewText: cleanReview,
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

export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(GIST_CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(GIST_CFG_KEY, JSON.stringify(config));
}

export function clearSyncConfig(): void {
  localStorage.removeItem(GIST_CFG_KEY);
}

export function getSocialSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(SOCIAL_GIST_CFG_KEY);
    return raw ? (JSON.parse(raw) as SyncConfig) : null;
  } catch {
    return null;
  }
}

export function saveSocialSyncConfig(config: SyncConfig): void {
  localStorage.setItem(SOCIAL_GIST_CFG_KEY, JSON.stringify(config));
}

export function clearSocialSyncConfig(): void {
  localStorage.removeItem(SOCIAL_GIST_CFG_KEY);
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
      description: 'myGameList - Social Sync',
      // Public gist allows read-only social profile queries by gistId without sharing private tokens.
      public: true,
      files: {
        [SOCIAL_GIST_FILENAME]: {
          content: JSON.stringify(getEmptySocialGistData()),
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

export async function readSocialGist(token: string, gistId: string, etag: string | null = null): Promise<{ data: SocialGistData; etag: string | null; notModified?: boolean }> {
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

  const requestKey = `${gistId}:${etag || ''}`;
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

      // Fallback only when no cache exists for this session.
      const fresh = await readSocialGist(token, gistId, null);
      return {
        data: fresh.data,
        etag: fresh.etag,
        notModified: true,
      };
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
      const normalized = normalizeSocialGistData(JSON.parse(raw));
      saveSocialGistCache(gistId, normalized, responseEtag);
      return {
        data: normalized,
        etag: responseEtag,
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
        normalized = migrateData(JSON.parse(raw));
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
          content: JSON.stringify(normalized),
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
    data: migrateData(parsed),
    etag: response.headers.get('etag'),
  };
}

export async function writeGist(token: string, gistId: string, payload: TabData): Promise<{ etag: string | null; updatedAt: number }> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

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
          content: JSON.stringify(payload),
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
 * Actualiza la privacidad de un gist social (público/privado).
 * 
 * @param token - Token de GitHub con permisos de gist
 * @param gistId - ID del gist social
 * @param isPublic - true para público, false para privado
 */
export async function updateGistPrivacy(token: string, gistId: string, isPublic: boolean): Promise<void> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      public: Boolean(isPublic),
    }),
  });

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Update gist privacy failed'));
  }
}
