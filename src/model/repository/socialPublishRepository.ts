// Publicación de actividad social al guardar una reseña (M4): orquestación pura de repos, sin estado de React.
// Extraído verbatim de App.tsx para sacar la lógica de negocio del componente. Lee el gist social, inserta/actualiza
// la actividad (que se convierte a snippet index-only), reescribe el gist y asegura el perfil en Firestore.
import { ensureProfileByEmail, getCurrentSocialAuthUser, healOwnFriendshipIdentity, resolveStableProfileId } from './firebaseRepository';
import { getLocalMeta, invalidateCachedSocialDirectory, patchLocalMeta } from './indexedDbRepository';
import {
  getSyncConfig,
  readSocialGist,
  remapSocialActorIds,
  removeReviewActivity,
  saveSocialSyncConfig,
  upsertPost,
  upsertReviewActivity,
  writeSocialGist,
} from './gistRepository';
import { markPendingSocialActivity } from './socialActivityReconcile';
import { resolveSocialChannel, type SocialChannel } from './socialChannel';

/**
 * Arma el canal social de este dispositivo para publicar. Devuelve null si no se puede (sin sesión de Google,
 * sin token, sin perfil publicado o gist desaparecido) y, en ese caso, deja la publicación marcada como
 * PENDIENTE: antes se salía en silencio y la reseña no volvía a intentarse jamás, así que quedaba fuera del
 * feed para siempre aunque el usuario estuviera dado de alta (p. ej. si escribía desde un dispositivo donde
 * nunca había abierto el hub social). La reconciliación consume esa marca en la próxima apertura del hub.
 */
async function armSocialChannel(email: string | null): Promise<SocialChannel | null> {
  const resolved = await resolveSocialChannel({ email });
  if (resolved.status !== 'ready') {
    await markPendingSocialActivity();
    return null;
  }
  return resolved.channel;
}

/**
 * Propaga MI gist social a mis docs de amistad cuando su id ha cambiado desde la última propagación hecha en
 * este dispositivo.
 *
 * `ensureProfileByEmail` (al final de cada publicación) actualiza el gist en el DIRECTORIO de Firestore, pero
 * no en los docs de amistad — y el lector prefiere el gist denormalizado en la amistad. Sin esto, quien cambie
 * de gist social y siga publicando sin abrir el hub deja a sus amigos leyendo un gist viejo: su actividad no
 * sale en el feed aunque su perfil se vea completo (ese sale del gist de JUEGOS).
 *
 * PRIVACIDAD: nunca escribe el nombre real de Google. Si el nick del gist aún está vacío no sanea nada (en vez
 * de pisar con vacío un nick bueno ya guardado): lo hará el hub al abrirse, que espera a tener el nick.
 * Best-effort y con sello en `meta` para no lanzar la query de amistades en cada guardado de reseña.
 */
/**
 * Foto que puede ir a un canal público (docs de amistad), con la MISMA semántica que el hub: si el usuario
 * tiene la foto desactivada en el gist, cadena vacía (propaga su opt-out); si la muestra, la del gist y, si su
 * gist es antiguo y no la lleva, la de la sesión de Google (evita pisar con vacío una foto ya guardada).
 */
function publicPhotoURL(data: { profile: { photoURL?: string; visibility?: { showPhoto?: boolean } } }, sessionPhoto: string | null): string {
  if (data.profile.visibility?.showPhoto === false) {
    return '';
  }
  return String(data.profile.photoURL || sessionPhoto || '');
}

async function healFriendshipGistIfChanged(input: {
  uid: string;
  socialGistId: string;
  gamesGistId: string;
  nick: string;
  photoURL: string;
}): Promise<void> {
  if (!input.uid || !input.socialGistId || !input.nick) {
    return;
  }
  try {
    const meta = await getLocalMeta();
    if (meta?.friendshipHealedForGist === input.socialGistId) {
      return;
    }
    await healOwnFriendshipIdentity(input.uid, {
      name: input.nick,
      photo: input.photoURL,
      socialGistId: input.socialGistId,
      gamesGistId: input.gamesGistId,
    });
    await patchLocalMeta({ friendshipHealedForGist: input.socialGistId });
  } catch {
    // best-effort: la publicación ya está hecha; se reintentará en la siguiente o al abrir el hub.
  }
}

/** Publica/actualiza la actividad social de una reseña. Sin canal social utilizable la deja como pendiente. */
export async function publishReviewActivity(input: { id: number; name: string; review: string; score: number; grade?: number | null; reviewChanged?: boolean }): Promise<void> {
  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) {
    await markPendingSocialActivity();
    return;
  }

  const socialConfig = await armSocialChannel(authUser.email);
  if (!socialConfig) {
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

  // PRIVACIDAD: el nombre público en la actividad es el NICK del perfil social (del gist), NUNCA el nombre real de Google.
  const socialNick = String(socialRead.data.profile.name || '').trim();
  const now = Date.now();
  const nextPayload = upsertReviewActivity(migratedData, {
    actorProfileId: profileId,
    actorName: socialNick,
    gameId: input.id,
    gameName: input.name,
    reviewText: input.review, // audit-allow: upsertReviewActivity lo convierte a snippet (no se publica el review completo)
    rating: input.score,
    grade: input.grade ?? null, // nota fina 0–100 (aditiva; el espejo 0–5 va en rating)
    timestamp: now,
    // Solo se recoloca al principio del feed si cambió el texto de la reseña. Editar solo nota/nombre sincroniza
    // esos datos en la tarjeta social pero conserva la posición/fecha original (no cuenta como reseña nueva).
    bumpOrder: input.reviewChanged ?? true,
  });

  // Sincronización de solo nota/nombre sobre una reseña que aún no estaba publicada: no hay nada que sincronizar
  // ni que publicar, así que no se reescribe el gist (mismo patrón de no-op que unpublishReviewActivity).
  if (nextPayload === migratedData) {
    return;
  }

  const writeResult = await writeSocialGist(socialConfig.token, socialConfig.gistId, nextPayload);
  const mainSyncConfig = getSyncConfig();

  saveSocialSyncConfig({
    token: socialConfig.token,
    gistId: socialConfig.gistId,
    etag: writeResult.etag || socialConfig.etag || null,
    lastRemoteUpdatedAt: now,
  });

  // El feed sirve `gameName` desde la caché IndexedDB del directorio (TTL 30 min), una capa por delante de la caché
  // de sesión del gist. Sin invalidarla, tras publicar/renombrar una reseña el propio autor seguiría viendo el
  // título viejo en su feed hasta 30 min. La invalidamos para que el próximo montaje del hub relea el directorio.
  await invalidateCachedSocialDirectory(socialConfig.gistId);

  await ensureProfileByEmail({
    user: authUser,
    socialGistId: socialConfig.gistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    githubToken: mainSyncConfig?.token || socialConfig.token, // audit-allow: ensureProfileByEmail lo cifra en privateConfig (B1)
    socialGistEtag: writeResult.etag || socialConfig.etag || null,
    preferredName: socialNick,
  });

  await healFriendshipGistIfChanged({
    uid: authUser.uid,
    socialGistId: socialConfig.gistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    nick: socialNick,
    photoURL: publicPhotoURL(socialRead.data, authUser.photoURL),
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
    await markPendingSocialActivity();
    return;
  }

  const socialConfig = await armSocialChannel(authUser.email);
  if (!socialConfig) {
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

  // Igual que al publicar: invalida la caché del directorio para que el feed no siga mostrando la reseña retirada.
  await invalidateCachedSocialDirectory(socialConfig.gistId);
}

/**
 * F3 — Publica una publicación de texto libre (noticias/enlaces) en el gist social propio. Mismo flujo que la
 * reseña: lee el gist, remapea identidad legacy, inserta el post, reescribe y asegura el perfil. No-op sin sesión
 * Google ni gist social configurado. Los hipervínculos se derivan del texto al renderizar (no se publican como HTML).
 */
export async function publishPost(input: { text: string; maxLength?: number }): Promise<void> {
  const authUser = await getCurrentSocialAuthUser();
  if (!authUser) {
    throw new Error('Inicia sesión con Google para publicar');
  }

  const socialConfig = await armSocialChannel(authUser.email);
  if (!socialConfig) {
    throw new Error('No se pudo resolver tu canal social en este dispositivo');
  }

  const socialRead = await readSocialGist(
    socialConfig.token,
    socialConfig.gistId,
    socialConfig.etag || null,
  );

  const profileId = await resolveStableProfileId(authUser.uid);
  const migratedData = remapSocialActorIds(socialRead.data, { [authUser.uid]: profileId });

  // PRIVACIDAD: el nombre público del post es el NICK del perfil social (del gist), NUNCA el nombre real de Google.
  const socialNick = String(socialRead.data.profile.name || '').trim();
  const now = Date.now();
  const nextPayload = upsertPost(migratedData, {
    authorProfileId: profileId,
    authorName: socialNick,
    text: input.text,
    // Cupo del rango de quien publica: lo decide el llamador, que es quien conoce la sesión.
    maxLength: input.maxLength,
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
    preferredName: socialNick,
  });

  await healFriendshipGistIfChanged({
    uid: authUser.uid,
    socialGistId: socialConfig.gistId,
    gamesGistId: mainSyncConfig?.gistId || '',
    nick: socialNick,
    photoURL: publicPhotoURL(socialRead.data, authUser.photoURL),
  });
}
