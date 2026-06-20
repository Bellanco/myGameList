import { GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY } from '../../core/constants/storageKeys';
import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { migrateData } from './migrateRepository';
import { clampRating, normalizeTimestamp } from '../../core/utils/normalize';
import { gamesGistNeedsRewrite, unwrapGamesFile } from '../migration/legacyGamesFormat';
import { pickLegacyReviewText, socialGistNeedsRewrite } from '../migration/legacySocialFormat';
import { TAB_IDS, type GameItem, type SyncConfig, type TabData, type TabId } from '../types/game';
import type { PublicGame } from '../types/social';
import type { GamesMainFile } from '../types/gist';

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

// --- Constructores del formato DESTINO del gist de juegos (ADITIVO, sin cablear). ---
// La escritura sigue en `TabData` plano (fase A); estos builders son para el futuro corte (fase C).

function checksum32(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/**
 * Reparte una lista en buckets `{ main, c1, c2, … }` por tamaño acumulado (JSON). Un item nunca cae en
 * dos buckets. Núcleo de eficiencia del chunking.
 */
export function distributeIntoChunks<T extends { id: number }>(items: T[], thresholdBytes: number): Record<string, T[]> {
  const buckets: Record<string, T[]> = { main: [] };
  let current = 'main';
  let size = 0;
  let chunkIdx = 0;
  for (const item of items) {
    const itemSize = new Blob([JSON.stringify(item)]).size;
    if (size + itemSize > thresholdBytes && buckets[current].length > 0) {
      chunkIdx += 1;
      current = `c${chunkIdx}`;
      buckets[current] = [];
      size = 0;
    }
    buckets[current].push(item);
    size += itemSize;
  }
  return buckets;
}

/**
 * Envuelve un `TabData` en el fichero ancla `GamesMainFile` (formato destino). Cada juego se anota con
 * `_tab` para que `unwrapGamesFile` pueda reconstruir el `TabData`. Función pura; no escribe nada.
 */
// E1 (escalabilidad): guarda de tamaño del gist. GitHub trunca/rechaza ficheros muy grandes (~1 MB). En vez de
// dejar que el PATCH falle en bucle (deadlock silencioso), avisamos por consola al acercarnos y lanzamos un error
// accionable al superar el umbral de bloqueo. El particionado real por tamaño llega en E4 (chunking).
const GIST_SIZE_WARN_BYTES = 700 * 1024;
const GIST_SIZE_BLOCK_BYTES = 950 * 1024;

function utf8ByteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}

/** Lanza si el contenido supera el umbral seguro; avisa (sin lanzar) al acercarse. Devuelve el tamaño en bytes. */
export function assertGistSizeWithinLimit(content: string, label: string): number {
  const bytes = utf8ByteLength(content);
  const kb = Math.round(bytes / 1024);
  if (bytes >= GIST_SIZE_BLOCK_BYTES) {
    throw new Error(
      `El ${label} ocupa ${kb} KB y supera el límite seguro de gist (~${Math.round(GIST_SIZE_BLOCK_BYTES / 1024)} KB). ` +
        'No se ha subido para no fallar contra GitHub. Reduce datos (o espera al particionado por tamaño).',
    );
  }
  if (bytes >= GIST_SIZE_WARN_BYTES) {
    console.warn(`[gist] ${label} grande: ${kb} KB (aviso desde ${Math.round(GIST_SIZE_WARN_BYTES / 1024)} KB).`);
  }
  return bytes;
}

// E1 (escalabilidad): serialización magra. Omite campos OPCIONALES vacíos/por-defecto al escribir el gist de juegos
// (arrays vacíos, booleanos opcionales en false). Los campos requeridos (id/_ts/name/platforms/genres/steamDeck/review)
// se conservan siempre. Compat-safe: la lectura tolera ausencia de campos opcionales.
function leanGameItem(game: GameItem): GameItem {
  const out: Record<string, unknown> = {
    id: game.id,
    _ts: game._ts,
    name: game.name,
    platforms: Array.isArray(game.platforms) ? game.platforms : [],
    genres: Array.isArray(game.genres) ? game.genres : [],
    steamDeck: Boolean(game.steamDeck),
    review: game.review || '',
  };
  if (game.score !== undefined && game.score !== null) out.score = game.score;
  if (game.hours !== undefined && game.hours !== null) out.hours = game.hours;
  if (Array.isArray(game.years) && game.years.length) out.years = game.years;
  if (Array.isArray(game.strengths) && game.strengths.length) out.strengths = game.strengths;
  if (Array.isArray(game.weaknesses) && game.weaknesses.length) out.weaknesses = game.weaknesses;
  if (Array.isArray(game.reasons) && game.reasons.length) out.reasons = game.reasons;
  if (game.replayable) out.replayable = true;
  if (game.retry) out.retry = true;
  if (game._v !== undefined) out._v = game._v;
  if (game.shared) out.shared = true;
  return out as unknown as GameItem;
}

/** Devuelve una copia de `TabData` con cada juego en su forma magra (para escribir el gist más compacto). */
export function leanTabData(data: TabData): TabData {
  return {
    c: (data.c || []).map(leanGameItem),
    v: (data.v || []).map(leanGameItem),
    e: (data.e || []).map(leanGameItem),
    p: (data.p || []).map(leanGameItem),
    deleted: data.deleted || [],
    updatedAt: data.updatedAt,
  };
}

export function buildGamesMainFile(data: TabData): GamesMainFile {
  const games: Record<number, GameItem & { _tab: TabId }> = {};
  for (const tab of TAB_IDS) {
    for (const game of data[tab] || []) {
      if (!game || !(Number(game.id) > 0)) continue;
      games[game.id] = { ...game, _tab: tab };
    }
  }
  const deletedIndex: Record<number, { deletedAt: number; purgeAfter: number }> = {};
  for (const tomb of data.deleted || []) {
    if (!tomb || !(Number(tomb.id) > 0)) continue;
    const ts = Number(tomb.deletedAt ?? tomb._ts) || 0;
    deletedIndex[tomb.id] = { deletedAt: ts, purgeAfter: ts };
  }
  const generatedAt = Date.now();
  return {
    schemaVersion: 3,
    fileType: 'games-main',
    updatedAt: data.updatedAt || generatedAt,
    integrity: { algorithm: 'djb2', checksum: checksum32(JSON.stringify(games)), generatedAt },
    chunkIndex: { strategy: 'size', maxChunkKB: 800, chunks: [{ chunkId: 'main', gistId: null, sizeKB: 0, updatedAt: generatedAt }] },
    syncMeta: { lamport: 0, updatedAt: generatedAt },
    games,
    deletedIndex,
  };
}

const SNIPPET_MAX_CHARS = 160;

/** Deriva el snippet público (≤160) del review privado. Reemplaza al antiguo buildReviewExcerpt (muerto). */
export function buildReviewSnippet(review: string): string {
  return (review || '').slice(0, SNIPPET_MAX_CHARS).trimEnd();
}

/**
 * Proyección pública de un juego (canal social): copia campos públicos y deriva `snippet`,
 * OMITIENDO siempre los privados (`review`, `score`, `hours`, `steamDeck`, `retry`, `replayable`).
 * El `tab` se pasa porque vive en la estructura `TabData`, no en el `GameItem`.
 */
export function toPublicGame(game: GameItem, tab: TabId): PublicGame {
  return {
    id: game.id,
    name: game.name,
    genres: game.genres,
    platforms: game.platforms,
    strengths: game.strengths,
    weaknesses: game.weaknesses,
    tab,
    rating: game.score ?? null,
    years: game.years,
    snippet: buildReviewSnippet(game.review),
    hasFullReview: (game.review || '').length > 0,
    updatedAt: game._ts,
  };
}

const SOCIAL_PRIVATE_FIELDS = ['review', 'reviewText', 'score', 'hours', 'steamDeck', 'retry', 'replayable'];

/** Guarda de privacidad: lanza si algún campo privado aparece en lo que se escribirá al gist social. */
export function assertNoSocialPrivateFields(obj: unknown, path = ''): void {
  if (!obj || typeof obj !== 'object') return;
  for (const field of SOCIAL_PRIVATE_FIELDS) {
    if (field in (obj as Record<string, unknown>)) {
      throw new Error(`Campo privado '${field}' en ${path || 'root'}: el gist social no debe contenerlo`);
    }
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    assertNoSocialPrivateFields(value, path ? `${path}.${key}` : key);
  }
}

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
  assertNoSocialPrivateFields(normalized); // canal público: nunca review/reviewText/score/hours/etc.

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
