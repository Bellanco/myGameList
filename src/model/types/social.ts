import type { TabId } from './game';
import type { ChunkIndex } from './gist';

/**
 * Proyección pública de un juego — se guarda en el gist social y en Firestore.
 * NUNCA contiene `review`, `score`, `hours`, `steamDeck`, `retry` ni `replayable`.
 * `snippet` se deriva del review en tiempo de publicación (≤160 chars).
 */
export interface PublicGame {
  id: number;
  name: string;
  genres: string[];
  platforms: string[];
  strengths?: string[];
  weaknesses?: string[];
  tab: TabId; // pestaña/estado (mapea c|v|e|p)
  rating: number | null; // derivado de score
  years?: number[];
  snippet: string; // ≤160 chars, derivado de review — nunca el review completo
  hasFullReview: boolean; // indica que existe review privado (sin exponerlo)
  updatedAt: number; // = _ts del item de origen
}

/** Perfil social enriquecido usado en la app/ViewModels (stats/visibility + reloj propio). */
export interface SocialProfile {
  profileId: string; // UUID v4 — pseudónimo público, NO el uid de Firebase
  displayName: string;
  avatarHash: string; // hash determinista (no expone email/uid)
  private: boolean;
  favoriteGames: number[]; // ids de juego
  visibility: { hiddenTabs: TabId[]; hideGameTime: boolean };
  stats: { totalCompleted: number; totalExcluded: number; totalReviews: number; avgRating: number };
  _modified: number; // reloj propio del perfil (no sustituye a _ts de los juegos)
  _v: number;
}

export interface ActivityFeedItem {
  key: string;
  type: 'review';
  gameId: number;
  gameName: string;
  rating: number | null;
  snippet: string; // ≤160 chars — nunca review completo
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface ActivityFeed {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  items: ActivityFeedItem[];
}

export interface ConsentConfig {
  version: string;
  agreedAt: number;
  scope: string[];
  retentionDays: number;
  autoExpireAt: number;
  revokedFields: string[];
}

/** El `profile` que vive DENTRO del gist social (`myGameList.social.json`), con `sharedLists`. */
export interface SocialGistProfile {
  profileId?: string; // destino: pseudónimo (hoy se usa uid/displayName)
  displayName: string;
  avatarHash?: string;
  sharedLists: Record<TabId, PublicGame[]>; // destino: PublicGame (sin review)
}

export interface SocialRecommendationEntry {
  gameId: number;
  gameName: string;
  rating: number | null; // sin review
}

export interface SocialActivityEntry {
  gameId: number;
  gameName: string;
  rating: number | null;
  snippet: string; // destino (≤160). Forma vieja real: `reviewText` (completo) — migrar en lectura.
  createdAt: number;
  updatedAt: number;
}

/**
 * Contenido del fichero `myGameList.social.json` (gist social, público).
 * Forma real actual: { profile, recommendations, activity, updatedAt }.
 * Destino (aditivo): `schemaVersion`, `consent`, y `chunkIndex` si hay overflow.
 */
export interface SocialGistData {
  profile: SocialGistProfile;
  recommendations: SocialRecommendationEntry[];
  activity: SocialActivityEntry[];
  updatedAt: number;
  schemaVersion?: 2;
  consent?: ConsentConfig;
  chunkIndex?: ChunkIndex;
}
