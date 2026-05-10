export type TabId = 'c' | 'v' | 'e' | 'p';

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
}

export interface DeletedItem {
  id: number;
  _ts: number;
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
