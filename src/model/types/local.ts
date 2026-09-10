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
  // F4: mensajes de lista publicados en la última pasada. Va aparte del recuento de reseñas porque mover un juego
  // de lista no cambia cuántas reseñas hay: sin este número, el sello fresco daba la pasada por hecha y la
  // actividad de lista se quedaba sin subir.
  activityMoveCount?: number;
  // Versión de la lógica que escribió el sello: si sube, el sello deja de valer y se fuerza una pasada (así una
  // corrección alcanza a los gists que tocó una versión anterior sin esperar a que caduque).
  activityReconcileVersion?: number;
  pendingSocialActivity?: boolean;
  // Último gist social ya propagado a MIS docs de amistad DESDE LA RUTA DE PUBLICACIÓN. Sigue vivo junto a
  // `friendshipIdentityFingerprint` porque acota una ruta que la huella no puede acotar: la publicación no sabe
  // descartar el monograma genérico de Google, así que se le fija a una pasada por id de gist para que no se
  // pelee con el saneado del hub. Ver `healFriendshipGistIfChanged`.
  friendshipHealedForGist?: string;
  // Huella de la identidad (nick, foto, gist social y gist de juegos) ya propagada a MIS docs de amistad desde
  // ESTE dispositivo. Mientras no cambie, el saneado sale sin leer ni escribir nada; ver
  // `identityFingerprint` en `firebaseFriendshipRepository`. Local por dispositivo a propósito: la foto
  // publicable y el gist de la sesión se resuelven en cada uno por separado.
  friendshipIdentityFingerprint?: string;
  // Último latido de uso enviado a `profiles.updatedAt` desde este dispositivo (acota a una escritura diaria).
  profileTouchedAt?: number;
  // Sellos de los SANEADOS DE ARRANQUE del espacio social (ver `viewmodel/social/useSocialStartupTasks`). Cada uno
  // guarda la huella de las entradas con las que su tarea terminó bien; mientras no cambie, la tarea no se
  // ejecuta. Sustituyen a un `useRef` por tarea, que moría con el desmontaje del hub y hacía que abrir el espacio
  // social diez veces en una sesión repitiera diez veces cada saneado (medido con `npm run emulate:social`).
  // Locales por dispositivo, por lo mismo que `friendshipIdentityFingerprint`.
  /** Nick ya replicado a `profiles.displayName`. */
  profileNameRepairedFor?: string;
  /** `<socialGistId>|<gamesGistId>` ya retirados del perfil público. */
  publicGistIdsPurgedFor?: string;
  /** Gist social del que ya consta que es SECRETO: evita un listado de gists contra GitHub por apertura. */
  socialChannelPrivateFor?: string;
  /**
   * DERIVA DE CANAL, resuelta y recordada: `uid del amigo` → id del gist social que ganó la última fusión.
   *
   * Cuando el directorio de Firestore y el documento de amistad anuncian gists distintos para la misma persona,
   * la hidratación lee LOS DOS y fusiona, porque la deriva puede ir en cualquier dirección. Eso cuesta una lectura
   * extra por amigo derivado en CADA hidratación en frío. No se puede arreglar en el origen desde aquí: las
   * reglas solo dejan que cada parte sanee sus propios campos denormalizados, así que el que mira no puede
   * reescribir el puntero del otro (y es correcto que no pueda).
   *
   * Lo que sí se puede es no volver a pagarlo: recordado el ganador, la siguiente hidratación lee solo ese. Si esa
   * lectura falla —el gist se borró, el amigo cambió de canal—, se olvida y la pasada siguiente vuelve a
   * aprender de las dos fuentes.
   */
  socialGistWinnerByFriend?: Record<string, string>;
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
