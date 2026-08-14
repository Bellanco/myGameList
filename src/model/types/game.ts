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
  /**
   * Fecha (ms) en que se escribió o reescribió el TEXTO de la reseña.
   *
   * Existe porque `_ts` es el reloj del merge CRDT y lo mueve cualquier edición del juego (y lo sellaba en bloque
   * la importación de datos), así que no sirve como fecha de la reseña: es la fecha que publica el canal social y
   * la que muestran el feed y la pestaña Reseñas. Solo la toca un cambio del texto; ni cambiar la nota, ni mover
   * de lista, ni importar la mueven. Aditivo: un cliente antiguo la ignora al leer.
   */
  reviewedAt?: number;
  /**
   * Cuándo entró el juego en cada lista, la PRIMERA vez (ms). Nadie lo teclea: lo sella la propia transición.
   *
   * Es lo que `listedAt` no puede ser. `listedAt` marca la llegada a la lista ACTUAL y se REESCRIBE al mover el
   * juego, así que al terminar algo se borra la fecha en que se añadió a Próximos: hoy no hay forma de saber
   * cuánto tiempo pasó un juego esperando, que es la pregunta central de una lista de pendientes. Aquí cada lista
   * tiene su sello y ninguno pisa al anterior.
   *
   * PRIMERA entrada y no la última, a propósito: es un sello ESTABLE. Un valor que no se reescribe no genera
   * churn en el merge y hace que dos dispositivos converjan al mismo número; las vueltas siguientes al mismo
   * listado (una rejugada) ya las cuenta `years`, que es multivalor justo para eso.
   *
   * Aditivo y auto-reparable: un cliente antiguo que edite el juego se lleva por delante estos sellos (el merge
   * es LWW del objeto entero), pero `normalizeGame` vuelve a sembrar el de la lista actual desde `listedAt` en la
   * siguiente carga. Lo único que no se recupera es el paso por listas anteriores.
   */
  enteredAt?: Partial<Record<TabId, number>>;
  /**
   * Fecha (ms) del último cambio de NOTA. Autorrellenada, igual que `reviewedAt` y por el mismo motivo: `_ts` lo
   * mueve cualquier edición, así que no sirve para saber cuándo cambiaste de opinión sobre un juego.
   *
   * Solo la mueve un `grade` distinto del anterior: ni reescribir la reseña, ni mover de lista, ni importar.
   * Ausente en los juegos anteriores al campo — no se puede deducir, y sembrarla con `_ts` sería inventarse una
   * fecha (los lectores caen a `_ts` mientras no exista, que es aproximar sin fingir precisión).
   */
  gradedAt?: number;
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
