import type { ChunkRef } from './gist';
import type { ScoreScale } from '../../core/utils/scoreScale';

/**
 * Tipos de Firestore (destino: índice público "index-only").
 * Si un campo no aparece aquí, no debe escribirse en Firestore.
 * Estado actual (a migrar): el doc real guarda email/uid/social.githubToken/social.gamesGistId.
 */

/**
 * Señales de estado o comportamiento fuera de lo esperado en un perfil, tal y como las calcula el panel de
 * administración (`detectAnomalies`). Son OBSERVACIONES, no acusaciones: casi todas tienen explicaciones inocentes
 * (perfil a medio crear, cliente viejo, reloj desajustado). Vive aquí, y no en el repositorio, para que las
 * etiquetas de `labels.ts` puedan declararse exhaustivas sobre ella sin que un fichero de textos dependa de un
 * repositorio.
 */
export type AdminAnomaly =
  /** Sin nombre: perfil a medio crear. */
  | 'no-display-name'
  /**
   * Sus amistades le guardan un nombre distinto del que publica ahora: cambió de nick y los docs de amistad
   * conservan el viejo, que es el que ven sus amigos en la lista y en la bandeja de solicitudes.
   */
  | 'stale-friend-name'
  /** Sin `profileId`: la identidad pseudónima nunca se estableció. */
  | 'no-profile-id'
  /** El documento no se identifica por el uid (perfil legacy bajo otro id). */
  | 'foreign-doc-id'
  /** Arrastra restos legacy en un documento que lee cualquier usuario autenticado. */
  | 'legacy-fields'
  /** Token de GitHub en claro: lo más grave que puede quedar ahí. Se separa por su gravedad. */
  | 'legacy-token'
  /** Esquema anterior al vigente. */
  | 'stale-schema'
  /** Sin marca de actividad: no saldría en un directorio ordenado por recencia. */
  | 'never-active'
  /** Más de 30 días sin aparecer (la misma ventana con la que el feed corta la actividad). */
  | 'inactive'
  /** Actividad fechada en el futuro: reloj desajustado o marca manipulada. */
  | 'future-activity'
  /** Alta posterior a la última actividad: imposible salvo manipulación. */
  | 'created-after-activity'
  /**
   * Hay más de un gist social suyo en circulación (sus amistades no apuntan todas al mismo, o su perfil aún
   * publica uno distinto): quien lea el abandonado no verá sus reseñas en el feed.
   */
  | 'gist-drift'
  /**
   * Sus amistades no coinciden en su gist de JUEGOS: quien tenga el abandonado no puede ver sus listas
   * compartidas. Canal distinto del social, y avería distinta.
   */
  | 'games-gist-drift'
  /** Envió solicitudes que llevan más de 90 días pendientes: nadie se las ha aceptado. */
  | 'stale-pending-out';

/** profiles/{profileId} — index-only, identificado por el pseudónimo, NO por uid. */
export interface ProfileIndexDoc {
  profileId: string;
  displayName: string;
  avatarHash: string;
  socialGistId: string;
  private: boolean;
  stats: { totalCompleted: number; totalReviews: number };
  socialChunks: ChunkRef[];
  consent: { agreedAt: number; autoExpireAt: number };
  updatedAt: number;
  // NUNCA: uid, email, githubToken, gamesGistId, review, score, hours
}

/** feed/{reviewId} — tarjeta pública del feed de actividad. */
export interface FirestoreFeedCard {
  reviewId: string;
  profileId: string;
  displayName: string;
  avatarHash: string;
  socialGistId: string;
  gameId: number;
  gameName: string;
  genres: string[];
  rating: number | null;
  snippet: string; // ≤160 chars — nunca review completo
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: 'active' | 'hidden';
}

/** recommendations/{id} — refleja la colección real `recommendations`. */
export interface RecommendationDoc {
  fromProfileId: string; // destino: pseudónimo, no uid
  toEmail: string; // necesario para entregar (campo mínimo consentido)
  gameId: number;
  gameName: string;
  message: string;
  status: 'pending' | 'accepted' | 'dismissed';
  createdAt: number;
  updatedAt: number;
  // NUNCA: review, score, hours, githubToken
}

/**
 * friendships/{docId} — amistad con aceptación mutua. Un doc por par no ordenado, id canónico `minUid__maxUid`.
 * Identidad SIEMPRE por `uid` (única verificable en reglas). Los campos `*Name/*Photo/*SocialGistId/*GamesGistId`
 * están DENORMALIZADOS: cada parte escribe SOLO los suyos (requester al crear, recipient al aceptar), de modo que
 * la lista de amigos, la bandeja de solicitudes y el feed se resuelven desde el propio doc sin leer el directorio
 * (evita el tope de `SOCIAL_DIRECTORY_LIMIT` y el choque con las reglas de `profiles`).
 */
export type FriendshipStatus = 'pending' | 'accepted';

export interface FriendshipDoc {
  users: [string, string]; // [uidA, uidB] ordenados lexicográficamente
  requester: string; // uid de quien envió la petición (∈ users)
  recipient: string; // uid del otro (∈ users)
  status: FriendshipStatus;
  createdAt: number;
  updatedAt: number;
  requesterName: string;
  requesterPhoto: string;
  requesterSocialGistId: string;
  requesterGamesGistId: string;
  recipientName: string;
  recipientPhoto: string;
  recipientSocialGistId: string;
  recipientGamesGistId: string;
}

/**
 * privateConfig/{uid} — solo el dueño (request.auth.uid == uid). Permite recuperar la config tras reinstalar.
 * El token de GitHub se guarda "cifrado" con una clave DERIVADA del uid (estable cross-device para poder
 * recuperarlo en otro dispositivo). Como el uid no es secreto, esto es OFUSCACIÓN: la confidencialidad real la
 * da la regla owner-only de Firestore, no el cifrado. (Ver src/core/security/crypto.ts.)
 */
export interface FirestorePrivateConfig {
  schemaVersion?: number; // F6.3: versión del documento (aditiva)
  profileId: string;
  gamesGistId: string;
  socialGistId: string;
  gamesChunks: ChunkRef[];
  socialChunks: ChunkRef[];
  encryptedGithubToken?: string;
}

/**
 * publicConfig/{uid} — preferencias NO sensibles del dueño (F2). Separada de `privateConfig` para diferenciarla.
 * Owner-only (regla `publicConfig` en firestore.rules). Aditiva: hoy solo la escala de puntuación.
 */
export interface FirestorePublicConfig {
  schemaVersion?: number;
  scoreScale?: ScoreScale;
  /** F1 — apariencia por cuenta: id de paleta, modo claro/oscuro y caja del texto (aditivo). */
  palette?: string;
  theme?: 'dark' | 'light';
  uppercase?: boolean;
  /** F1 — mostrar el botón "Steam Deck" de la barra de filtros (por defecto true; false lo oculta). */
  showSteamButton?: boolean;
  /** F1 — efectos visuales animados de los temas (por defecto true; false los desactiva). */
  effects?: boolean;
  /**
   * L4 — aceptación de las condiciones de uso y la política de privacidad. `version` es `LEGAL_VERSION`; si no
   * coincide con la vigente, la puerta del hub social vuelve a pedirla. Vive aquí (owner-only) y no en el perfil
   * público porque es un dato del dueño, y así le sigue entre dispositivos.
   */
  consent?: { version: string; agreedAt: number };
}
