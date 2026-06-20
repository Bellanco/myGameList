import type { ChunkRef } from './gist';

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
 * privateConfig/{uid} — solo el dueño (request.auth.uid == uid). Permite recuperar la config tras reinstalar.
 * El token de GitHub se guarda CIFRADO en cliente (nunca en claro); la clave de descifrado vive en IndexedDB.
 */
export interface FirestorePrivateConfig {
  profileId: string;
  gamesGistId: string;
  socialGistId: string;
  gamesChunks: ChunkRef[];
  socialChunks: ChunkRef[];
  encryptedGithubToken?: string;
}
