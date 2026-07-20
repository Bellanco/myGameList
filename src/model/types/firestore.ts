import type { ChunkRef } from './gist';
import type { ScoreScale } from '../../core/utils/scoreScale';

/**
 * Tipos de Firestore (destino: índice público "index-only").
 * Si un campo no aparece aquí, no debe escribirse en Firestore.
 * Estado actual (a migrar): el doc real guarda email/uid/social.githubToken/social.gamesGistId.
 */

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
}
