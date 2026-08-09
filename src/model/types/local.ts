import type { ChunkRef } from './gist';

/**
 * Metadatos que viven SOLO en IndexedDB, nunca se suben. Evolución de `SyncConfig`.
 * El `githubToken` y el `uid` permanecen aquí — nunca a Firestore ni a gist (salvo el token cifrado en privateConfig).
 */
export interface LocalMeta {
  _key: 'singleton';
  uid: string; // uid de Firebase — solo IndexedDB
  profileId: string; // pseudónimo público (mapa uid→profileId privado)
  githubToken: string; // solo IndexedDB — NUNCA a Firestore ni gist en claro
  gamesGistId: string;
  socialGistId: string;
  deviceId: string;
  deviceName: string;
  gamesEtag: string | null; // ETag para If-Match (conserva el mecanismo actual)
  socialEtag: string | null;
  lamport: number;
  lastGistPull: number;
  lastFirestorePush: number;
  gamesChunks: ChunkRef[];
  socialChunks: ChunkRef[];
  devices: Record<string, { name: string; lastSeen: number }>;
  migrationVersion?: number; // estado de la migración one-time (>=3 = migrado)
  gamesUpdatedAt?: number; // updatedAt del último espejo al store `games` (para elegir la fuente más fresca al cargar)
  photoHealedFor?: string; // última photoURL ya propagada al gist social (evita releer/reescribir cada sesión)
  // Reconciliación de la actividad social (reseñas publicadas en el gist social vs reseñas reales de los
  // listados). `activityReconciledAt` es el sello de la última pasada y `activityReviewCount` el número de
  // reseñas locales que se vio entonces: si el recuento actual difiere, hay que reconciliar aunque el sello
  // esté fresco. `pendingSocialActivity` marca que una publicación se perdió (sin canal armado, chunk que no
  // baja, error de GitHub) y fuerza la pasada en la próxima apertura del hub.
  activityReconciledAt?: number;
  activityReviewCount?: number;
  // Versión de la lógica que escribió el sello: si sube, el sello deja de valer y se fuerza una pasada (así una
  // corrección alcanza a los gists que tocó una versión anterior sin esperar a que caduque).
  activityReconcileVersion?: number;
  pendingSocialActivity?: boolean;
  // Último gist social ya propagado a MIS docs de amistad desde este dispositivo. Evita lanzar la query de
  // amistades en cada publicación: solo se sanea cuando el id del gist cambia de verdad.
  friendshipHealedForGist?: string;
  // Último latido de uso enviado a `profiles.updatedAt` desde este dispositivo (acota a una escritura diaria).
  profileTouchedAt?: number;
  // Histórico del backlog: una instantánea por mes con el tamaño de cada lista. Es la ÚNICA forma de saber cómo
  // evoluciona el backlog —`listedAt` se reescribe al mover de lista, así que no se puede reconstruir a
  // posteriori— y por eso se registra desde ya aunque el gráfico llegue después. Local y por dispositivo: no
  // sube al gist ni a Firestore. Ver `statsSnapshotRepository`.
  backlogHistory?: BacklogSnapshot[];
}

/** Tamaño de cada lista (c/v/e/p) en un mes concreto. Claves cortas: se guardan muchas y no se leen a mano. */
export interface BacklogSnapshot {
  /** Mes `AAAA-MM` en la hora local del dispositivo. */
  m: string;
  c: number;
  v: number;
  e: number;
  p: number;
}

export type SyncOpType =
  | 'upsertGame'
  | 'deleteGame'
  | 'updateProfile'
  | 'updateVisibility'
  | 'revokeConsent';

export interface SyncOp {
  id: string;
  type: SyncOpType;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  nextRetry: number | null;
}
