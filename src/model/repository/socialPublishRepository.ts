// Publicación de actividad social al guardar una reseña (M4): orquestación pura de repos, sin estado de React.
// Extraído verbatim de App.tsx para sacar la lógica de negocio del componente. Lee el gist social, inserta/actualiza
// la actividad (que se convierte a snippet index-only), reescribe el gist y asegura el perfil en Firestore.
import { ensureProfileByEmail, getCurrentSocialAuthUser, resolveStableProfileId } from './firebaseRepository';
import {
  getSyncConfig,
  getSocialSyncConfig,
  readSocialGist,
  remapSocialActorIds,
  removeReviewActivity,
  saveSocialSyncConfig,
  upsertPost,
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

  // 6.2b: identidad por profileId (pseudónimo estable, 6.2a) en vez del uid de Firebase. Remapea las
  // entradas legacy del gist propio (actorUid==miUid → miProfileId) antes de insertar la nueva actividad,
  // de modo que el uid sale del canal público y toda nuestra actividad queda agrupada por profileId.
  const profileId = await resolveStableProfileId(authUser.uid);
  const migratedData = remapSocialActorIds(socialRead.data, { [authUser.uid]: profileId });

  const now = Date.now();
  const nextPayload = upsertReviewActivity(migratedData, {
    actorProfileId: profileId,
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

/**
 * Despublica del gist social la reseña de un juego. Pensado para reseñas HUÉRFANAS: el dueño abre una reseña que
 * ya no tiene contraparte en sus listados privados (juego borrado/perdido) y se ve vacía; se retira del feed.
 * No-op sin sesión Google ni gist social configurado; NO reescribe el gist si no había nada que quitar.
 */
export async function unpublishReviewActivity(input: { id: number }): Promise<void> {
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

  // Misma identidad que al publicar: profileId estable (remapea entradas legacy uid→profileId).
  const profileId = await resolveStableProfileId(authUser.uid);
  const migratedData = remapSocialActorIds(socialRead.data, { [authUser.uid]: profileId });

  const now = Date.now();
  const nextPayload = removeReviewActivity(migratedData, { actorProfileId: profileId, gameId: input.id, timestamp: now });
  if (nextPayload === migratedData) {
    return; // no había reseña que despublicar
  }

  const writeResult = await writeSocialGist(socialConfig.token, socialConfig.gistId, nextPayload);
  saveSocialSyncConfig({
    token: socialConfig.token,
    gistId: socialConfig.gistId,
    etag: writeResult.etag || socialConfig.etag || null,
    lastRemoteUpdatedAt: now,
  });
}

/**
 * F3 — Publica una publicación de texto libre (noticias/enlaces) en el gist social propio. Mismo flujo que la
 * reseña: lee el gist, remapea identidad legacy, inserta el post, reescribe y asegura el perfil. No-op sin sesión
 * Google ni gist social configurado. Los hipervínculos se derivan del texto al renderizar (no se publican como HTML).
 */
export async function publishPost(input: { text: string }): Promise<void> {
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

  const profileId = await resolveStableProfileId(authUser.uid);
  const migratedData = remapSocialActorIds(socialRead.data, { [authUser.uid]: profileId });

  const now = Date.now();
  const nextPayload = upsertPost(migratedData, {
    authorProfileId: profileId,
    authorName: authUser.displayName || authUser.email,
    text: input.text,
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
