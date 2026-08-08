// Canal SOCIAL en gist: tipos, transforms puros (normalizar / upsert / fusionar) y la E/S contra GitHub.
//
// Separado de `gistRepository` (que se queda con el gist de JUEGOS) por dos motivos:
//   - Peso de arranque: el de juegos lo importa `useSyncViewModel`, estático desde App, así que mientras ambos
//     compartían fichero los ~50 kB de fuente de esto viajaban en el chunk de arranque de TODO el mundo. Al
//     separarlos, solo lo descarga quien abre el hub social (su chunk perezoso).
//   - Tamaño: eran 2.171 líneas con dos dominios distintos, sus cachés y sus formatos entrelazados.
//
// Lo común a los dos canales (base de la API, cabecera de auth, formateo de errores, borrado de gists) vive en
// `githubGistApi`.
import { isValidGistId, isValidGithubToken, isValidHttpUrl, safePostText } from '../../core/security/sanitize';
import { clampRating, normalizeTimestamp } from '../../core/utils/normalize';
import { resolveGrade } from '../../core/utils/scoreScale';
import { pickLegacyActorId, pickLegacyFromId, pickLegacyReviewText, socialGistNeedsRewrite } from '../migration/legacySocialFormat';
import { TAB_IDS, type TabId } from '../types/game';
import { githubFetch } from './githubHttp';
import { GIST_API_BASE, buildGithubError, getGithubAuthHeader } from './githubGistApi';
import {
  assembleChunkedSocial,
  assertGistSizeWithinLimit,
  assertNoSocialPrivateFields,
  buildReviewSnippet,
  buildSocialFiles,
  chunkFileChecksum,
} from './socialProjection';

export { deleteGist } from './githubGistApi';
export { getSocialSyncConfig, saveSocialSyncConfig } from './gistConfigRepository';

const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

/**
 * A6 — Chunking del gist SOCIAL por `sharedLists` (la "lista pública" grande). Mismo contrato que el de juegos:
 * la LECTURA ya reensambla en ESTA versión (`assembleChunkedSocial`, retrocompatible con gists planos) y la
 * ESCRITURA va GATED. Activar en 2 pasos como juegos: (1) desplegar con lectura activa y este flag en `false`;
 * (2) cuando todos los dispositivos estén al día, poner `true`. Sigue OFF hasta validar el cutover social.
 */
export const ENABLE_SOCIAL_WRAPPER_WRITE = false;

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
  visibility: SocialProfileVisibility;
  sharedLists: Partial<Record<TabId, SocialSharedGame[]>>;
  // F-social: foto de perfil pública. Solo se publica si visibility.showPhoto está activo (el usuario controla
  // la publicación de su propia foto). Si está oculta, no se escribe → nadie la ve.
  photoURL?: string;
}

export interface SocialProfileVisibility {
  hiddenTabs: TabId[];
  hideReplayable: boolean;
  hideRetry: boolean;
  hideGameTime: boolean;
  showPhoto: boolean; // defecto true; controla la publicación/visibilidad de la foto de perfil
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
  grade: number; // nota fina 0–100 (normalize la deriva del rating si el gist no la trae)
  snippet: string;
}

export type SocialActivityType = 'recommendation' | 'review';

export interface SocialRecommendationEntry {
  id: number;
  fromProfileId: string; // 6.2b: pseudónimo público (antes `fromUid`)
  gameId: number;
  gameName: string;
  rating: number;
  grade: number; // nota fina 0–100 (normalize la deriva del rating si falta)
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
  grade: number; // nota fina 0–100 (normalize la deriva del rating si falta)
  recommendationText: string;
  snippet: string;
  createdAt: number;
  updatedAt: number;
}

// F3 — publicación de texto libre del feed (noticias/enlaces). Los hipervínculos se detectan del propio `text`
// al renderizar (URLs http/s validadas); no hay HTML ni campo de enlaces aparte.
export interface SocialPostEntry {
  id: string;
  authorProfileId: string; // pseudónimo público (como actorProfileId)
  authorName: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface SocialGistData {
  profile: SocialGistProfile;
  // ST3: el array `recommendations` top-level era código muerto (sin writer; siempre []). Se elimina del modelo.
  // La LECTURA tolera gists viejos que aún lo lleven: sus recs se fusionan en `activity` (mergeLegacyActivity) y
  // al reescribir el gist propio (socialGistNeedsRewrite → wasLegacy) se deja fuera. `profile.recommendations` ídem.
  activity: SocialActivityEntry[];
  // F3 (aditivo, Opción B): publicaciones de texto libre. La lectura vieja lo ignora; un cliente NUEVO lo preserva
  // en el round-trip (normalizeSocialGistData). Opcional en el schema → no rompe gists sin posts.
  posts?: SocialPostEntry[];
  updatedAt: number;
  schemaVersion?: number; // 6.2b: 2 = identidad por profileId (uid fuera del canal público)
}

export interface UpsertPostInput {
  authorProfileId: string;
  authorName: string;
  text: string;
  timestamp?: number;
  /** Cupo de caracteres del rango de quien publica. Si se omite, rige el techo absoluto del saneador. */
  maxLength?: number;
}

export interface UpsertRecommendationInput {
  actorProfileId: string;
  actorName: string;
  gameId: number;
  gameName: string;
  rating: number;
  grade?: number | null;
  timestamp?: number;
}

export interface UpsertReviewInput {
  actorProfileId: string;
  actorName: string;
  gameId: number;
  gameName: string;
  reviewText: string;
  rating: number;
  grade?: number | null;
  timestamp?: number;
  /** true (por defecto): la reseña sube al principio del feed. false: solo sincroniza datos sin recolocar. */
  bumpOrder?: boolean;
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

function getEmptySocialGistData(): SocialGistData {
  return {
    profile: {
      name: '',
      private: false,
      visibility: {
        hiddenTabs: [],
        hideReplayable: false,
        hideRetry: false,
        hideGameTime: false,
        showPhoto: true,
      },
      sharedLists: {},
    },
    activity: [],
    posts: [],
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
    // Defecto true (mostrar) si no está definido, para gists previos sin el campo.
    showPhoto: source.showPhoto === undefined ? true : Boolean(source.showPhoto),
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
  // Nota fina 0–100: preserva `grade` si el gist lo trae; si no (gist de cliente antiguo), la deriva del rating ×20.
  const grade = resolveGrade({ grade: typeof source.grade === 'number' ? source.grade : null, score: rating }); // audit-allow: 'score' es el nombre del argumento de resolveGrade, no un campo publicado; lo que se escribe es 'rating' (ya redondeado)

  return {
    id,
    name,
    platforms: toStringArray(source.platforms),
    genres: toStringArray(source.genres),
    rating,
    grade,
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
        grade: resolveGrade({ grade: typeof record.grade === 'number' ? record.grade : null, score: clampRating(record.rating) }), // audit-allow: 'score' es el nombre del argumento de resolveGrade, no un campo publicado; lo que se escribe es 'rating' (ya redondeado)
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
        grade: resolveGrade({ grade: typeof record.grade === 'number' ? record.grade : null, score: clampRating(record.rating) }), // audit-allow: 'score' es el nombre del argumento de resolveGrade, no un campo publicado; lo que se escribe es 'rating' (ya redondeado)
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

function normalizePostItems(items: unknown): SocialPostEntry[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((entry) => {
      const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
      const authorProfileId = String(record.authorProfileId || '').trim();
      const text = safePostText(record.text);
      const createdAt = normalizeTimestamp(record.createdAt, Date.now());
      const updatedAt = normalizeTimestamp(record.updatedAt, createdAt);

      if (!authorProfileId || !text) {
        return null;
      }

      return {
        id: String(record.id || `${authorProfileId}:${createdAt}`),
        authorProfileId,
        authorName: String(record.authorName || '').trim(),
        text,
        createdAt,
        updatedAt,
      } satisfies SocialPostEntry;
    })
    .filter((entry): entry is SocialPostEntry => Boolean(entry))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 100);
}

/**
 * Colapsa entradas de actividad duplicadas por `(gameId, type)` conservando la de `updatedAt` MAYOR. Dentro de UN
 * gist social (un único actor) el par `(gameId, type)` identifica una sola reseña/recomendación, así que las dos
 * entradas que puede dejar la transición de identidad uid→profileId (claves DISTINTAS, mismo juego) se funden en la
 * más reciente. Evita tarjetas duplicadas —una con el título viejo— en el lector, y las depura al reescribir.
 */
function dedupeActivityByGame(items: SocialActivityEntry[]): SocialActivityEntry[] {
  const byGame = new Map<string, SocialActivityEntry>();
  for (const entry of items) {
    const gameKey = `${entry.gameId}:${entry.type}`;
    const current = byGame.get(gameKey);
    if (!current || entry.updatedAt > current.updatedAt) {
      byGame.set(gameKey, entry);
    }
  }
  return [...byGame.values()];
}

function mergeLegacyActivity(
  normalizedActivity: SocialActivityEntry[],
  recommendations: SocialRecommendationEntry[],
): SocialActivityEntry[] {
  const map = new Map<string, SocialActivityEntry>();

  // Para claves repetidas conserva la de `updatedAt` MAYOR. Antes se hacía `map.set` sin comparar sobre una lista
  // ordenada de más nuevo a más viejo, por lo que la ÚLTIMA asignación (la más antigua) ganaba y fijaba el título
  // viejo (BUG: el orden por updatedAt ocultaba la entrada actualizada).
  normalizedActivity.forEach((entry) => {
    const current = map.get(entry.key);
    if (!current || entry.updatedAt > current.updatedAt) {
      map.set(entry.key, entry);
    }
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
      grade: resolveGrade({ grade: recommendation.grade ?? null, score: recommendation.rating }), // audit-allow: 'score' es el nombre del argumento de resolveGrade, no un campo publicado; lo que se escribe es 'rating' (ya redondeado)
      recommendationText: '',
      snippet: '',
      createdAt: current?.createdAt || recommendation.createdAt,
      updatedAt: Math.max(current?.updatedAt || 0, recommendation.updatedAt),
    };

    map.set(key, candidate);
  });

  return dedupeActivityByGame([...map.values()])
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 320);
}

function upsertActivityEntry(
  items: SocialActivityEntry[],
  next: Omit<SocialActivityEntry, 'id' | 'key' | 'createdAt' | 'updatedAt'>,
  timestamp: number,
  bumpOrder = true,
): SocialActivityEntry[] {
  const key = buildActivityKey(next.actorProfileId, next.gameId, next.type);
  const existing = items.find((entry) => entry.key === key);
  // Sincronización en sitio (bumpOrder=false): un cambio de solo nota/nombre actualiza una reseña YA publicada,
  // pero NUNCA estrena una entrada en el feed. Sin entrada previa que sincronizar, es un no-op (se devuelve la
  // misma referencia para que el llamador pueda saltarse la reescritura del gist).
  if (!existing && !bumpOrder) {
    return items;
  }
  const createdAt = existing?.createdAt || timestamp;
  // El feed se ordena por `updatedAt`. Solo se avanza cuando cambia el CONTENIDO de la reseña (bumpOrder=true);
  // si solo se sincronizan nota/nombre (bumpOrder=false), se conserva `updatedAt` para NO recolocar la entrada
  // al principio del feed. Una entrada nueva siempre estrena `updatedAt` (no hay posición previa que preservar).
  const updatedAt = existing && !bumpOrder ? existing.updatedAt : timestamp;

  const entry: SocialActivityEntry = {
    id: existing?.id || buildActivityKey(next.actorProfileId, next.gameId, next.type),
    key,
    createdAt,
    updatedAt,
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

  const currentActivity = data.activity || [];
  const activity = upsertActivityEntry(currentActivity, {
    type: 'review',
    actorProfileId: input.actorProfileId,
    actorName: String(input.actorName || '').trim(),
    gameId: input.gameId,
    gameName: cleanName,
    rating: clampRating(input.rating),
    grade: resolveGrade({ grade: input.grade ?? null, score: input.rating }), // audit-allow: 'score' es el nombre del argumento de resolveGrade, no un campo publicado; lo que se escribe es 'rating' (ya redondeado)
    recommendationText: '',
    snippet: buildReviewSnippet(cleanReview),
  }, now, input.bumpOrder ?? true);

  // Sync-only sin entrada previa: upsertActivityEntry no crea nada y devuelve la misma lista. Se devuelve `data`
  // intacto (misma referencia) para que publishReviewActivity detecte el no-op y no reescriba el gist.
  if (activity === currentActivity) {
    return data;
  }

  return {
    ...data,
    activity,
    updatedAt: now,
  };
}

/**
 * Elimina del gist social la actividad de reseña de un juego (despublicar). Se usa cuando el dueño abre una reseña
 * que ya no tiene contraparte en sus listados (juego borrado/perdido): sin juego real detrás quedaría como una
 * reseña vacía en el feed, así que se retira. Devuelve la MISMA referencia si no había nada que quitar, para que
 * el orquestador pueda saltarse la reescritura del gist.
 */
export function removeReviewActivity(
  data: SocialGistData,
  input: { actorProfileId: string; gameId: number; timestamp?: number },
): SocialGistData {
  if (!input.actorProfileId || input.gameId <= 0) {
    return data;
  }

  const key = buildActivityKey(input.actorProfileId, input.gameId, 'review');
  const activity = data.activity || [];
  const next = activity.filter((entry) => entry.key !== key);
  if (next.length === activity.length) {
    return data;
  }

  return {
    ...data,
    activity: next,
    updatedAt: input.timestamp || Date.now(),
  };
}

/** F3 — añade una publicación de texto libre al gist propio (prepend). No-op si falta autor o texto. */
export function upsertPost(data: SocialGistData, input: UpsertPostInput): SocialGistData {
  const now = input.timestamp || Date.now();
  // Con cupo 0 (rango bronce) el texto queda vacío y el `if` de abajo convierte la publicación en un no-op: el
  // último cortafuegos por si alguien llega hasta aquí sin pasar por la comprobación de la interfaz.
  const text = safePostText(input.text, input.maxLength);

  if (!input.authorProfileId || !text) {
    return data;
  }

  const post: SocialPostEntry = {
    id: `${input.authorProfileId}:${now}`,
    authorProfileId: input.authorProfileId,
    authorName: String(input.authorName || '').trim(),
    text,
    createdAt: now,
    updatedAt: now,
  };

  const posts = [post, ...(data.posts || [])]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 100);

  return {
    ...data,
    posts,
    updatedAt: now,
  };
}

function normalizeSocialGistData(data: unknown): SocialGistData {
  const source = (data && typeof data === 'object' ? data : {}) as Partial<SocialGistData>;
  const profile = (source.profile && typeof source.profile === 'object' ? source.profile : {}) as Partial<SocialGistProfile>;

  // ST3: las recomendaciones legacy (top-level y en profile) NO se incluyen en el modelo normalizado, pero se LEEN
  // del raw para fusionarlas en `activity` (sin pérdida de datos); al reescribir el gist se quedan fuera.
  const legacyRecommendations = normalizeRecommendationItems((source as { recommendations?: unknown }).recommendations);

  const normalizedVisibility = normalizeSocialVisibility(profile.visibility);
  // Privacidad: la foto solo se conserva si el usuario la muestra Y es una URL http(s) válida; si oculta la foto,
  // se descarta aquí (defensa) → no se publica al reescribir el gist.
  const rawPhotoURL = (profile as { photoURL?: unknown }).photoURL;
  const photoURL = normalizedVisibility.showPhoto && isValidHttpUrl(rawPhotoURL) ? String(rawPhotoURL) : undefined;

  const normalized: SocialGistData = {
    profile: {
      name: String(profile.name || '').trim(),
      private: Boolean(profile.private),
      // `favoriteGames` de gists antiguos se descarta aquí a propósito: el producto ya no tiene favoritos, así que
      // no vuelve a escribirse y desaparece del gist en la primera reescritura del perfil.
      visibility: normalizedVisibility,
      sharedLists: normalizeSocialSharedLists(profile.sharedLists),
      ...(photoURL ? { photoURL } : {}),
    },
    activity: normalizeActivityItems(source.activity),
    posts: normalizePostItems(source.posts),
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

/**
 * Fusiona dos lecturas del gist social del MISMO autor. Pura.
 *
 * Se usa cuando las dos fuentes que apuntan al gist social de un amigo (el `otherSocialGistId` denormalizado en
 * el doc de amistad y el `social.gistId` del directorio de Firestore) DIVERGEN: una de las dos quedó anclada a
 * un gist viejo y no hay forma de saber cuál a ciegas. Elegir mal deja al amigo sin actividad en el feed,
 * mientras su perfil sigue completo (sale del gist de JUEGOS), que es justo el fallo que esto evita.
 *
 * Criterio: el perfil (nombre/foto/visibilidad) viene del payload con `updatedAt` MAYOR — el más
 * reciente manda; actividad y publicaciones son la UNIÓN de ambos, deduplicadas por `key`/`id` conservando la
 * entrada de `updatedAt` mayor. Así no se pierde nada publicado en el gist que resultó ser el antiguo.
 */
export function mergeSocialGistData(a: SocialGistData, b: SocialGistData): SocialGistData {
  const newest = Number(b.updatedAt || 0) > Number(a.updatedAt || 0) ? b : a;

  const activityByKey = new Map<string, SocialActivityEntry>();
  for (const entry of [...(a.activity || []), ...(b.activity || [])]) {
    const key = entry.key || entry.id;
    const current = activityByKey.get(key);
    if (!current || entry.updatedAt > current.updatedAt) {
      activityByKey.set(key, entry);
    }
  }

  const postsById = new Map<string, SocialPostEntry>();
  for (const entry of [...(a.posts || []), ...(b.posts || [])]) {
    const current = postsById.get(entry.id);
    if (!current || entry.updatedAt > current.updatedAt) {
      postsById.set(entry.id, entry);
    }
  }

  return {
    ...newest,
    activity: [...activityByKey.values()].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 320),
    posts: [...postsById.values()].sort((x, y) => y.updatedAt - x.updatedAt).slice(0, 100),
  };
}

/**
 * Crea el canal social como gist SECRETO.
 *
 * Antes se creaba público y un paso posterior se encargaba de mantenerlo así. Era innecesario: según la propia
 * documentación de GitHub, «secret gists aren't private» — quien tenga el identificador puede leerlos, con o sin
 * sesión. Es decir, un amigo siempre pudo leer un canal secreto; lo único que aportaba ser público era aparecer
 * listado en el perfil de GitHub de su dueño y en las búsquedas, que es exactamente lo que no queremos.
 *
 * Y de paso desaparece la causa de la deriva de gists: GitHub no deja cambiar la visibilidad, así que volverlos
 * públicos obligaba a CLONARLOS a un id nuevo, dejando el original huérfano.
 */
export async function createSocialGist(token: string): Promise<{ gistId: string; etag: string | null }> {
  return createSocialGistWithData(token, getEmptySocialGistData(), false);
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
        const normalizedFresh = normalizeSocialGistData(assembleChunkedSocial(parsedFresh, freshBody.files));
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
      // A6: si el ancla referencia chunks de overflow de `sharedLists` (mismo gist), se fusionan antes de normalizar.
      const normalized = normalizeSocialGistData(assembleChunkedSocial(parsed, body.files));
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

/** Un gist social del usuario (el actual o uno abandonado por un clonado anterior). */
export interface OwnSocialGist {
  gistId: string;
  description: string;
  updatedAt: number;
  isPublic: boolean;
  /** Tamaño del fichero ancla en bytes, según el listado de GitHub. */
  sizeBytes: number;
}

/**
 * Lista los gists SOCIALES de la cuenta del token (por nombre de fichero ancla). Sirve para encontrar gists
 * abandonados: el antiguo paso de volverlo público clonaba el gist a un id nuevo, y el original —con las fechas de
 * publicación— se queda huérfano en la cuenta. Solo lectura.
 */
export async function listOwnSocialGists(token: string): Promise<OwnSocialGist[]> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }

  const response = await githubFetch(`${GIST_API_BASE}?per_page=100`, {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw await buildGithubError(response, 'List own gists failed');
  }

  const body = (await response.json()) as Array<{
    id?: string;
    description?: string;
    updated_at?: string;
    public?: boolean;
    files?: Record<string, { size?: number }>;
  }>;

  return (body || [])
    .filter((gist) => Boolean(gist.files && SOCIAL_GIST_FILENAME in gist.files))
    .map((gist) => ({
      gistId: String(gist.id || ''),
      description: String(gist.description || ''),
      updatedAt: gist.updated_at ? Date.parse(gist.updated_at) : 0,
      isPublic: Boolean(gist.public),
      sizeBytes: Number(gist.files?.[SOCIAL_GIST_FILENAME]?.size || 0),
    }))
    .filter((gist) => Boolean(gist.gistId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Una revisión del gist social. GitHub conserva TODAS las versiones y son inmutables. */
export interface SocialGistRevision {
  version: string;
  committedAt: number;
}

/**
 * Lista las revisiones del gist social, de más reciente a más antigua. Solo lectura y sin caché: se usa para
 * auditar/recuperar fechas de publicación que una escritura posterior sobrescribió (el historial del gist es el
 * único sitio donde sobreviven).
 */
export async function readSocialGistHistory(token: string, gistId: string): Promise<SocialGistRevision[]> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }
  if (!isValidGistId(gistId)) {
    throw new Error('Gist ID inválido');
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw await buildGithubError(response, 'Read social gist history failed');
  }

  const body = (await response.json()) as { history?: Array<{ version?: string; committed_at?: string }> };
  return (body.history || [])
    .map((entry) => ({
      version: String(entry.version || ''),
      committedAt: entry.committed_at ? Date.parse(entry.committed_at) : 0,
    }))
    .filter((entry) => Boolean(entry.version))
    .sort((a, b) => b.committedAt - a.committedAt);
}

/** Lee el contenido del gist social EN una revisión concreta. Solo lectura y sin caché. */
export async function readSocialGistAtRevision(token: string, gistId: string, version: string): Promise<SocialGistData> {
  if (!isValidGithubToken(token)) {
    throw new Error('Formato de token inválido');
  }
  if (!isValidGistId(gistId) || !/^[a-fA-F0-9]{7,}$/.test(version)) {
    throw new Error('Revisión inválida');
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}/${version}`, {
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw await buildGithubError(response, 'Read social gist revision failed');
  }

  const body = (await response.json()) as { files?: Record<string, { content: string }> };
  const raw = body.files?.[SOCIAL_GIST_FILENAME]?.content;
  if (!raw) {
    return getEmptySocialGistData();
  }
  try {
    return normalizeSocialGistData(assembleChunkedSocial(JSON.parse(raw), body.files));
  } catch {
    return getEmptySocialGistData();
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
        // A6: reensambla los chunks de overflow de `sharedLists` (lectura pública de gist ajeno).
        normalized = normalizeSocialGistData(assembleChunkedSocial(JSON.parse(raw), body.files));
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

/**
 * Carga perezosa del validador de esquema (Zod). Se resuelve una sola vez por sesión y el navegador cachea el
 * chunk; el coste va sobre una operación que de todas formas es de red.
 *
 * Si la carga fallara (sin red, o un index.html cacheado tras un despliegue) la escritura ABORTA, que es el
 * comportamiento correcto: es la allowlist que impide publicar en un gist PÚBLICO un campo que no debería estar.
 * Fallar cerrado es lo seguro. La denylist de privacidad (`assertNoSocialPrivateFields`) sigue siendo síncrona y
 * empaquetada, así que la comprobación crítica corre igual aunque esto no llegue a cargarse.
 */
async function loadSocialGistValidator(): Promise<(data: unknown) => void> {
  const schemaModule = await import('../schemas/socialGistSchema');
  return schemaModule.assertValidSocialGist;
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
  const assertValidSocialGist = await loadSocialGistValidator();
  assertValidSocialGist(normalized); // F6.1: allowlist estricta (Zod) — falla si hay cualquier campo extra/tipo inválido

  const headers: Record<string, string> = {
    Authorization: getGithubAuthHeader(token),
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  let files: Record<string, { content: string } | null>;

  if (ENABLE_SOCIAL_WRAPPER_WRITE) {
    // A6: envoltorio multi-fichero del gist social. El ancla lleva el bucket `main` de `sharedLists` + `chunkIndex`;
    // el excedente va a ficheros `myGameList.social-chunk-cN.json` del MISMO gist. Privacidad + tamaño POR fichero.
    const { anchor, chunkFiles } = buildSocialFiles(normalized);
    const anchorContent = JSON.stringify(anchor);
    assertValidSocialGist(anchor); // el ancla (con chunkIndex + main slice) sigue cumpliendo la allowlist estricta
    assertGistSizeWithinLimit(anchorContent, 'gist social (ancla)');
    files = { [SOCIAL_GIST_FILENAME]: { content: anchorContent } };

    // A7 (incremental): lee el estado actual UNA vez para omitir chunks sin cambios y borrar obsoletos. El ancla
    // siempre se reescribe. Si no se puede leer el estado actual, se sube todo y no se borra nada (seguro).
    let currentFiles: Record<string, { content?: string } | undefined> = {};
    try {
      const current = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers });
      if (current.ok) {
        const currentBody = (await current.json()) as { files?: Record<string, { content?: string }> };
        currentFiles = currentBody.files || {};
      }
    } catch {
      // sin estado actual: subimos el conjunto completo y no borramos nada
    }

    for (const [name, file] of Object.entries(chunkFiles)) {
      const sealed = { ...file, mainGistId: gistId };
      assertNoSocialPrivateFields(sealed); // cada chunk es canal público: misma guarda de privacidad
      const content = JSON.stringify(sealed);
      assertGistSizeWithinLimit(content, `gist social (${name})`);
      if (chunkFileChecksum(currentFiles[name]?.content) === file.integrity.checksum) continue; // sin cambios
      files[name] = { content };
    }
    // Borrar chunks sociales obsoletos (comparado contra el conjunto completo `chunkFiles`, no contra el PATCH).
    for (const name of Object.keys(currentFiles)) {
      if (/^myGameList\.social-chunk-.+\.json$/.test(name) && !(name in chunkFiles)) {
        files[name] = null;
      }
    }
  } else {
    // CAMINO ACTUAL (flag OFF): un único fichero plano, byte-idéntico al anterior.
    const socialContent = JSON.stringify(normalized);
    assertGistSizeWithinLimit(socialContent, 'gist social'); // E1: evita el deadlock al superar el límite de gist
    files = { [SOCIAL_GIST_FILENAME]: { content: socialContent } };
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ files }),
  });

  if (!response.ok) {
    throw await buildGithubError(response, 'Write social gist failed');
  }

  const etag = response.headers.get('etag');
  saveSocialGistCache(gistId, normalized, etag);
  // El feed re-lee el gist PROPIO por la vía pública (readPublicSocialGistById) justo tras publicar/editar/borrar; su
  // caché de sesión (45 s) seguiría sirviendo la versión ANTERIOR y el contenido recién escrito "no aparecería en el
  // histórico". Como acabamos de escribirlo, refrescamos también esa caché pública (mismo token) → el re-fetch del
  // feed lo ve al instante. No añade llamadas a GitHub ni cambia la lógica de 304/sync.
  savePublicSocialGistCache(gistId, normalized, etag, token);

  return {
    etag,
  };
}

/**
 * ¿El canal recién clonado tiene de verdad el contenido del original? Se comprueba ANTES de borrar nada: contar
 * entradas es barato y es la diferencia entre retirar un gist ya copiado y borrar el único sitio donde estaba.
 */
export async function socialGistHasContent(token: string, gistId: string, expectedEntries: number): Promise<boolean> {
  if (expectedEntries === 0) {
    return true; // no había nada que copiar: nada que verificar
  }
  try {
    const check = await readSocialGist(token, gistId, null);
    return (check.data.activity?.length || 0) + (check.data.posts?.length || 0) >= expectedEntries;
  } catch {
    return false; // ante la duda, NO se borra
  }
}

/**
 * A partir de 1 MB, GitHub trunca el contenido del fichero en las respuestas de la API. El código no maneja
 * `truncated`/`raw_url` en ninguna parte, así que un gist así se lee como vacío. No se migra por encima de este
 * umbral, con margen de sobra: un canal real ronda el kilobyte (los topes de actividad y publicaciones acotan su
 * crecimiento a unos cientos de KB en el peor caso).
 */
const TRUNCATION_RISK_BYTES = 900_000;

/** Un canal legítimamente vacío ocupa unos cientos de bytes. Por encima de esto, "vacío" huele a lectura fallida. */
const EMPTY_PAYLOAD_MAX_BYTES = 4_000;

/** Resultado de asegurar que el canal social es secreto. */
export interface SecretSocialGistResult {
  /** Canal tras la operación: el nuevo si hubo migración, el mismo si no. */
  gistId: string;
  etag: string | null;
  migrated: boolean;
  /**
   * Gists PÚBLICOS superados por la migración y que se pueden retirar sin perder nada: el que se clonó (su
   * contenido está copiado) y los que están vacíos. Vacío si no hubo migración.
   */
  supersededGistIds: string[];
  /**
   * Gists PÚBLICOS con contenido que NO se copió (una cuenta con deriva puede tener dos canales con cosas
   * distintas). No se tocan: borrarlos perdería lo que solo esté ahí. Se reportan para poder avisar.
   */
  keptPublicGistIds: string[];
  /** Entradas (actividad + publicaciones) que se copiaron: sirve para verificar el clon antes de borrar nada. */
  copiedEntries: number;
  /** No se migró por riesgo de truncado: el canal es demasiado grande para leerlo entero por la API. */
  tooLarge?: boolean;
}

/**
 * Asegura que el canal social del usuario sea un gist SECRETO, migrándolo si hoy es público.
 *
 * GitHub no permite cambiar la visibilidad de un gist, así que migrar es CLONAR el contenido a un id nuevo. Es la
 * misma operación que causó la deriva histórica, con dos diferencias: aquí es deliberada y una sola vez, y el id
 * resultante se propaga a `privateConfig` y a los documentos de amistad, que son las dos únicas fuentes que
 * quedan (el perfil público ya no lo publica).
 *
 * La detección NO usa una lectura anónima: según la documentación de GitHub, un gist secreto también es legible
 * sin autenticación por quien tenga el id, así que sondear no distingue nada. Se usa el campo `public` que
 * devuelve el propio listado de la cuenta, que es el dato real.
 *
 * IMPORTANTE: el gist antiguo NO se borra. Sigue en la cuenta de su dueño, público, hasta que él lo borre; la app
 * no borra gists por política. El llamador debe decírselo.
 */
export async function ensureSecretSocialGist(token: string, gistId: string): Promise<SecretSocialGistResult> {
  const unchanged: SecretSocialGistResult = {
    gistId,
    etag: null,
    migrated: false,
    supersededGistIds: [],
    keptPublicGistIds: [],
    copiedEntries: 0,
  };
  if (!isValidGithubToken(token) || !isValidGistId(gistId)) {
    return unchanged;
  }

  const own = await listOwnSocialGists(token);
  const current = own.find((entry) => entry.gistId === gistId);
  // Si el gist no aparece en el listado de la cuenta no se puede afirmar nada (token de otra cuenta, gist ajeno,
  // listado incompleto): no se migra a ciegas.
  if (!current || !current.isPublic) {
    return unchanged;
  }

  // DE QUÉ GIST SE CLONA. No se asume que el de la sesión sea el bueno: una cuenta con deriva histórica tiene dos
  // canales, y el de este dispositivo puede ser el clon VACÍO que dejó el problema. Copiar ese y retirar el otro
  // dejaría al usuario con un canal en blanco y sus reseñas fuera de la vista.
  //
  // Se elige por CONTENIDO (el tamaño del fichero es el mejor indicador disponible sin lecturas extra: ya viene en
  // el listado) y, a igualdad, por recencia. El propio gist de la sesión gana los empates para no cambiar de canal
  // sin motivo. Solo se consideran los que no arriesgan truncado.
  const source = own
    .filter((entry) => entry.sizeBytes < TRUNCATION_RISK_BYTES)
    .reduce((best, entry) => {
      if (!best) return entry;
      if (entry.sizeBytes !== best.sizeBytes) return entry.sizeBytes > best.sizeBytes ? entry : best;
      if (entry.updatedAt !== best.updatedAt) return entry.updatedAt > best.updatedAt ? entry : best;
      return best.gistId === gistId ? best : entry;
    }, undefined as OwnSocialGist | undefined);
  const sourceGistId = source?.gistId || gistId;

  // GUARDA DE TRUNCADO. GitHub recorta en la API los ficheros de más de 1 MB (`truncated: true`, sin contenido
  // completo), y aquí un JSON a medias no parsea: la lectura devolvería un canal VACÍO. Clonar eso y repuntar las
  // referencias hacia el clon sería perder el canal de vista. No se migra: se deja como está y se avisa.
  const sourceSize = source?.sizeBytes ?? current.sizeBytes;
  if (sourceSize >= TRUNCATION_RISK_BYTES) {
    return { ...unchanged, tooLarge: true };
  }

  const payload = await readSocialGist(token, sourceGistId, null);
  // Segunda red de seguridad: si el origen viene vacío pero el fichero NO lo estaba, algo se perdió al leer
  // (truncado, parseo fallido). Clonar un vacío sobre un canal con contenido sería destruirlo de facto.
  const sourceIsEmpty = (payload.data.activity?.length || 0) === 0 && (payload.data.posts?.length || 0) === 0;
  if (sourceIsEmpty && sourceSize > EMPTY_PAYLOAD_MAX_BYTES) {
    return { ...unchanged, tooLarge: true };
  }

  const migration = await createSocialGistWithData(token, payload.data, false);

  // QUÉ SE PUEDE RETIRAR. El clon se hace de UN gist, pero una cuenta con deriva puede tener dos públicos, y
  // borrar el equivocado deja expuesto precisamente el que tiene las reseñas (o pierde lo que solo esté ahí).
  //   - El clonado: su contenido está copiado → se retira.
  //   - Los vacíos: no hay nada que perder → se retiran.
  //   - Uno público CON contenido que no se copió → NO se toca, y se reporta para avisar.
  const publicos = own.filter((entry) => entry.isPublic && entry.gistId !== migration.gistId);
  const superseded = publicos
    .filter((entry) => entry.gistId === sourceGistId || entry.sizeBytes <= EMPTY_PAYLOAD_MAX_BYTES)
    .map((entry) => entry.gistId);
  const kept = publicos.filter((entry) => !superseded.includes(entry.gistId)).map((entry) => entry.gistId);

  return {
    gistId: migration.gistId,
    etag: migration.etag,
    migrated: true,
    supersededGistIds: superseded,
    keptPublicGistIds: kept,
    copiedEntries: (payload.data.activity?.length || 0) + (payload.data.posts?.length || 0),
  };
}

