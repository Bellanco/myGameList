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
  score?: number; // ESPEJO 0–5 (legacy; se mantiene por compat con clientes antiguos, se borrará en el futuro).
  grade?: number | null; // F2: nota fina 0–100 (fuente). Ausente/null → se deriva del `score` 0–5.
  years?: number[];
  strengths?: string[];
  weaknesses?: string[];
  reasons?: string[];
  replayable?: boolean;
  retry?: boolean;
  hours?: number | null;
  scored?: boolean; // opt-in: la lista de la vergüenza puede puntuarse. Si false/ausente → sin nota (grade/score
  // quedan a 0), así la ruleta la trata como neutra y el canal social la muestra "sin puntuar".
  // Destino de la migración (aditivo, opcional para no romper datos legacy):
  _v?: number; // versión entera, incrementa en cada edición (metadato; el reloj CRDT sigue siendo _ts)
  shared?: boolean; // opt-in: este juego se proyecta al canal público (gist social / Firestore)
  listedAt?: number; // fecha de llegada a la lista actual (ms); NO se reescribe al editar
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
  genres: string[];
  platforms: string[];
  score: string;
  hours: string;
  only: boolean;
  deck: boolean;
}

export interface StatusNotice {
  kind: 'ok' | 'warn' | 'err';
  message: string;
}
