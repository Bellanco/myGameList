import { GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY } from '../../core/constants/storageKeys';
import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { migrateData } from './migrateRepository';
import type { SyncConfig, TabData } from '../types/game';

const GIST_FILENAME = 'myGames.json';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';
const GIST_API_BASE = 'https://api.github.com/gists';

export interface SocialGistProfile {
  name: string;
  private: boolean;
  favoriteGames: Array<{ id: number; name: string }>;
  recommendations: Array<{ id: number; name: string }>;
}

export type SocialActivityType = 'recommendation' | 'review';

export interface SocialRecommendationEntry {
  id: number;
  fromUid: string;
  toUid: string;
  gameId: number;
  gameName: string;
  message: string;
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
  toUid: string;
  gameId: number;
  gameName: string;
  message: string;
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
  // GitHub REST examples use Bearer for PATs.
  return `Bearer ${token}`;
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
    },
    recommendations: [],
    activity: [],
    updatedAt: Date.now(),
  };
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
        toUid: String(record.toUid || 'public').trim() || 'public',
        gameId,
        gameName,
        message: String(record.message || '').trim(),
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
      recommendationText: recommendation.message,
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
    toUid: input.toUid,
    gameId: input.gameId,
    gameName: input.gameName,
    message: input.message,
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

  const recommendations = upsertRecommendationEntry(data.recommendations || [], {
    ...input,
    gameName: cleanName,
    message: String(input.message || '').trim(),
  }, now);

  const activity = upsertActivityEntry(data.activity || [], {
    type: 'recommendation',
    actorUid: input.actorUid,
    actorName: String(input.actorName || '').trim(),
    gameId: input.gameId,
    gameName: cleanName,
    rating: clampRating(input.rating),
    recommendationText: String(input.message || '').trim(),
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

  await whoAmI(token);

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

  const headers: Record<string, string> = {
    Authorization: getGithubAuthHeader(token),
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, { headers });

  if (response.status === 304) {
    // For social profile hydration we need actual content, not an empty placeholder.
    // Re-read once without ETag to get canonical data while preserving the notModified signal.
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
  if (!raw) {
    return {
      data: getEmptySocialGistData(),
      etag: response.headers.get('etag'),
    };
  }

  try {
    return {
      data: normalizeSocialGistData(JSON.parse(raw)),
      etag: response.headers.get('etag'),
    };
  } catch {
    return {
      data: getEmptySocialGistData(),
      etag: response.headers.get('etag'),
    };
  }
}

export async function readPublicSocialGistById(gistId: string): Promise<SocialGistData> {
  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const response = await fetch(`${GIST_API_BASE}/${gistId}`, {
    headers: {
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(await buildGithubError(response, 'Read public social gist failed'));
  }

  const body = (await response.json()) as { files?: Record<string, { content: string }> };
  const raw = body.files?.[SOCIAL_GIST_FILENAME]?.content;
  if (!raw) {
    return getEmptySocialGistData();
  }

  try {
    return normalizeSocialGistData(JSON.parse(raw));
  } catch {
    return getEmptySocialGistData();
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

  return {
    etag: response.headers.get('etag'),
  };
}

export async function readGist(token: string, gistId: string, etag: string | null = null): Promise<GistReadResponse> {
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
