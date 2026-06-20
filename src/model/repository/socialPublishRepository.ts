// Publicación de actividad social al guardar una reseña (M4): orquestación pura de repos, sin estado de React.
// Extraído verbatim de App.tsx para sacar la lógica de negocio del componente. Lee el gist social, inserta/actualiza
// la actividad (que se convierte a snippet index-only), reescribe el gist y asegura el perfil en Firestore.
import { ensureProfileByEmail, getCurrentSocialAuthUser } from './firebaseRepository';
import {
  getSyncConfig,
  getSocialSyncConfig,
  readSocialGist,
  saveSocialSyncConfig,
  upsertReviewActivity,
  writeSocialGist,
} from './gistRepository';

/** Publica/actualiza la actividad social de una reseña. No-op si no hay sesión Google ni gist social configurado. */
export async function publishReviewActivity(input: { id: number; name: string; review: string; score: number }): Promise<void> {
  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) {
    return;
  }

  const socialConfig = getSocialSyncConfig();
  if (!socialConfig?.token || !socialConfig.gistId) {
    return;
  }

  const socialRead = await readSocialGist(
    socialConfig.token,
    socialConfig.gistId,
    socialConfig.etag || null,
  );

  const now = Date.now();
  const nextPayload = upsertReviewActivity(socialRead.data, {
    actorUid: authUser.uid,
    actorName: authUser.displayName || authUser.email,
    gameId: input.id,
    gameName: input.name,
    reviewText: input.review, // audit-allow: upsertReviewActivity lo convierte a snippet (no se publica el review completo)
    rating: input.score,
    timestamp: now,
  });

  const writeResult = await writeSocialGist(socialConfig.token, socialConfig.gistId, nextPayload);
  const mainSyncConfig = getSyncConfig();

  saveSocialSyncConfig({
    token: socialConfig.token,
    gistId: socialConfig.gistId,
    etag: writeResult.etag || socialConfig.etag || null,
    lastRemoteUpdatedAt: now,
  });

  await ensureProfileByEmail({
    user: authUser,
    socialGistId: socialConfig.gistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    githubToken: mainSyncConfig?.token || socialConfig.token, // audit-allow: ensureProfileByEmail lo cifra en privateConfig (B1)
    socialGistEtag: writeResult.etag || socialConfig.etag || null,
    preferredName: authUser.displayName || authUser.email,
  });
}
