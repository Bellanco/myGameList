import type { GameItem } from './game';
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

/** Fichero ancla del gist de juegos — `myGames.json` (privado). Formato DESTINO (envoltorio). */
export interface GamesMainFile {
  schemaVersion: 3;
  fileType: 'games-main';
  updatedAt: number;
  integrity: { algorithm: string; checksum: string; generatedAt: number };
  chunkIndex: ChunkIndex;
  syncMeta: { lamport: number; updatedAt: number };
  games: Record<number, GameItem>;
  deletedIndex: Record<number, { deletedAt: number; purgeAfter: number }>;
}

/** Fichero de overflow del gist de juegos — `myGames-chunk-N.json`. */
export interface GamesChunkFile {
  schemaVersion: 3;
  fileType: 'games-chunk';
  chunkId: string;
  mainGistId: string;
  updatedAt: number;
  integrity: { algorithm: string; checksum: string; generatedAt: number };
  games: Record<number, GameItem>;
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
