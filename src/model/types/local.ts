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
  /**
   * FORMATO DEL GIST DE JUEGOS YA COMPROBADO, por id de gist y con la firma del formato DESTINO como valor
   * (p. ej. `v4+gzip`). Ver `readGist`: un 304 confirma que el contenido no ha cambiado, pero no lo trae, así que
   * no se puede evaluar si toca migrarlo; sin esto había que releer el gist entero una vez POR SESIÓN para
   * averiguar algo que ya se sabía.
   *
   * Guardar la firma y no un simple `true` es lo que hace que el sello caduque cuando debe: si una versión nueva
   * cambia el formato de escritura, deja de coincidir y la comprobación vuelve a hacerse sola.
   */
  gamesGistFormatVerified?: Record<string, string>;
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
  /**
   * La versión de las condiciones que consta aceptada por esta cuenta, vista desde ESTE dispositivo, y cuándo se
   * comprobó. Es la puerta de todo lo social que sale fuera del hub (`canPublishSocialInBackground`): el hub la
   * comprueba al entrar, pero una reseña guardada desde la app principal no pasa por él. La sella el propio hub al
   * comprobarla o al aceptar; sin ella, una lectura de `publicConfig` como mucho al día. Con el `uid`, porque el
   * dispositivo puede cambiar de cuenta (docs/plan-feed-sin-vacio.md, Fase 2).
   */
  legalConsent?: { uid: string; version: string; checkedAt: number };
  /**
   * Cuándo publicó por última vez la pasada social de la app principal (`runBackgroundSocialPass`). Entre dos pasadas
   * que publican van 8 h como mínimo; solo se sella cuando ha publicado de verdad (docs/plan-feed-sin-vacio.md, Fase 3).
   */
  backgroundSocialPassAt?: number;
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
  // Cuándo se completó esa propagación. La huella sola daba por buena una suposición falsa —«si mi identidad
  // no ha cambiado, mis documentos de amistad están al día»— y no lo están cuando la amistad se creó DESPUÉS
  // de sellarla (sus campos los escribió la petición, con lo que hubiera entonces) ni cuando una escritura de
  // aquel día se quedó a medias. Sin fecha, el saneado salía en su primera línea para siempre y esos
  // documentos arrastraban el nombre —y el gist de listados— viejos indefinidamente: un amigo podía entrar a
  // diario sin que nada de eso se corrigiera nunca. Con ella, se revisa de higos a brevas
  // (`FRIENDSHIP_IDENTITY_RECHECK_MS`); ver `healOwnFriendshipIdentity`.
  friendshipIdentityHealedAt?: number;
  // Último latido de uso enviado a `profiles.updatedAt` desde este dispositivo (acota a una escritura diaria).
  profileTouchedAt?: number;
  // F5 — LÍNEA BASE del feed de logros (plan-logros §5.4 y §8.4): `uid → espejo` tal y como estaba la PRIMERA vez
  // que este dispositivo lo vio. Lo que ya estaba ahí no se anuncia. Sin TTL y sin invalidación —no es un caché,
  // es una foto—, y por eso no puede ser la caché del directorio. Solo se poda cuando la amistad desaparece.
  achievementsPeerSeen?: Record<string, string>;
  // Sellos de los SANEADOS DE ARRANQUE del espacio social (ver `viewmodel/social/useSocialStartupTasks`). Cada uno
  // guarda la huella de las entradas con las que su tarea terminó bien; mientras no cambie, la tarea no se
  // ejecuta. Sustituyen a un `useRef` por tarea, que moría con el desmontaje del hub y hacía que abrir el espacio
  // social diez veces en una sesión repitiera diez veces cada saneado (medido con `npm run emulate:social`).
  // Locales por dispositivo, por lo mismo que `friendshipIdentityFingerprint`.
  /** Nick ya replicado a `profiles.displayName`. */
  profileNameRepairedFor?: string;
  /**
   * Cuándo se selló ese nick, para que el sello CADUQUE (ver `STARTUP_STAMP_RECHECK_MS`).
   *
   * `repairProfileDisplayName` devuelve `false` sin lanzar en tres caminos donde no ha comprobado nada —sin
   * servicios, con el perfil ilegible o aún sin crear, y cuando el documento vive bajo otro id (el caso que
   * resuelve el cutover del panel)—, y el gestor lo sellaba igual: «hecho» cuando en realidad era «no he
   * podido mirar». Como la huella es el propio nick, nadie volvía a intentarlo mientras no lo cambiara.
   */
  profileNameRepairedAt?: number;
  /** `<socialGistId>|<gamesGistId>` ya retirados del perfil público. */
  publicGistIdsPurgedFor?: string;
  /**
   * Cuándo se selló esa purga, por lo mismo que `profileNameRepairedAt`: `purgeOwnPublicGistIds` también
   * devuelve `false` sin lanzar cuando NO pudo purgar —típicamente porque aún no había respaldo en
   * `privateConfig`—, y ese no es un estado definitivo: en cuanto el respaldo existe, sí se puede.
   */
  publicGistIdsPurgedAt?: number;
  /**
   * Amistades aceptadas por mí, sin los ids de quien las pidió, cuyo depósito ya se intentó recoger (ids de documento
   * ordenados). Sin depósito (peticiones de la 1.6.7) no hay nada que recoger hasta que quien pidió vuelva a entrar,
   * y sin sello se gastaría una lectura por amistad en cada apertura del hub.
   */
  friendshipKeysClaimedFor?: string;
  /** Cuándo se selló, para reintentarlo a la semana como el resto de sellos de arranque. */
  friendshipKeysClaimedAt?: number;
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
