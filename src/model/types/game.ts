export const TAB_IDS = ['c', 'v', 'e', 'p'] as const;
export type TabId = (typeof TAB_IDS)[number];

export interface GameItem {
  id: number;
  _ts: number;
  name: string;
  platforms: string[];
  genres: string[];
  steamDeck: boolean;
  review: string;
  score?: number;
  years?: number[];
  strengths?: string[];
  weaknesses?: string[];
  reasons?: string[];
  replayable?: boolean;
  retry?: boolean;
  hours?: number | null;
  // Destino de la migración (aditivo, opcional para no romper datos legacy):
  _v?: number; // versión entera, incrementa en cada edición (metadato; el reloj CRDT sigue siendo _ts)
  shared?: boolean; // opt-in: este juego se proyecta al canal público (gist social / Firestore)
}

export interface DeletedItem {
  id: number;
  _ts: number;
  deletedAt?: number; // destino: marca de borrado explícita (aditivo)
}

export interface TabData {
  c: GameItem[];
  v: GameItem[];
  e: GameItem[];
  p: GameItem[];
  deleted: DeletedItem[];
  updatedAt: number;
}

export interface SyncConfig {
  token: string;
  gistId: string;
  etag: string | null;
  lastRemoteUpdatedAt: number;
}

export interface StoragePayload {
  c: GameItem[];
  v: GameItem[];
  e: GameItem[];
  p: GameItem[];
  deleted: DeletedItem[];
  updatedAt: number;
  etag: string | null;
  lastRemoteUpdatedAt: number;
  schemaVersion?: number; // marca de auto-upgrade del estado local (ver LOCAL_SCHEMA_VERSION)
}

export interface TabSort {
  col: string;
  asc: boolean;
}

export interface ToolbarFilters {
  search: string;
  genre: string;
  platform: string;
  score: string;
  hours: string;
  only: boolean;
  deck: boolean;
}

export interface StatusNotice {
  kind: 'ok' | 'warn' | 'err';
  message: string;
}
