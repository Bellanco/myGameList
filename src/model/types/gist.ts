import type { GameItem, TabId } from './game';
import type { PublicGame, ActivityFeed } from './social';

/**
 * Chunking de gists (destino). Hoy cada gist es un único fichero plano; cuando se supera el umbral
 * de tamaño se reparte el excedente en ficheros `*-chunk-N.json`. El fichero ancla referencia los chunks.
 */
export interface ChunkRef {
  chunkId: string; // 'main' | 'c1' | 'c2' | …
  gistId: string | null; // null = el chunk vive en el gist ancla (no en un gist de overflow)
  sizeKB: number;
  updatedAt: number;
}

export interface ChunkIndex {
  strategy: 'size';
  maxChunkKB: number;
  chunks: ChunkRef[];
}

/**
 * Diccionarios de categorías deduplicadas (schemaVersion 4). Cada array mapea índice→valor; los juegos
 * referencian por índice en vez de repetir la cadena. Viven SOLO en el ancla (globales); los chunks usan
 * los del ancla. Evita la repetición de géneros/plataformas/puntos fuertes/débiles/razones.
 */
export interface CategoryDictionaries {
  genres: string[];
  platforms: string[];
  strengths: string[];
  weaknesses: string[];
  reasons: string[];
}

/** Las 5 categorías deduplicadas mediante `CategoryDictionaries`. */
export type CategoryKey = 'genres' | 'platforms' | 'strengths' | 'weaknesses' | 'reasons';

/** Juego codificado (schemaVersion 4): las 5 categorías son índices al diccionario, el resto igual que `GameItem`. */
export type EncodedGameItem = Omit<GameItem, CategoryKey> & Record<CategoryKey, number[]> & { _tab?: TabId };

/** Fichero ancla del gist de juegos — `myGames.json` (privado). Formato DESTINO (envoltorio). */
export interface GamesMainFile {
  schemaVersion: 3 | 4;
  fileType: 'games-main';
  updatedAt: number;
  integrity: { algorithm: string; checksum: string; generatedAt: number };
  chunkIndex: ChunkIndex;
  syncMeta: { lamport: number; updatedAt: number };
  dictionaries?: CategoryDictionaries; // v4: diccionarios globales de categorías (ausente en v3)
  games: Record<number, EncodedGameItem>;
  deletedIndex: Record<number, { deletedAt: number; purgeAfter: number }>;
}

/** Fichero de overflow del gist de juegos — `myGames-chunk-N.json`. */
export interface GamesChunkFile {
  schemaVersion: 3 | 4;
  fileType: 'games-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: string; checksum: string; generatedAt: number };
  games: Record<number, EncodedGameItem>;
}

/** Fichero de overflow del gist social — `myGameList.social-chunk-N.json` (público). */
export interface SocialChunkFile {
  schemaVersion: 2;
  fileType: 'social-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: string; checksum: string; generatedAt: number };
  games: Record<number, PublicGame>; // solo proyección pública
  activityFeed: ActivityFeed;
}
