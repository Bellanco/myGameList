// Resolución del "canal social" del dispositivo: el par (token, gistId) con el que se escribe el gist social.
//
// Antes esta lógica vivía SOLO en el mount del hub (`useSocialViewModel`), así que la config social
// (`mis-listas-social-gist-config`, localStorage) únicamente se armaba si el usuario había abierto el hub en
// ESE dispositivo. Un usuario dado de alta y con sesión activa que escribiera reseñas desde otro
// dispositivo/navegador publicaba cero actividad: `publishReviewActivity` se rendía en silencio. Aquí se
// centraliza la resolución (incluida la recuperación del gistId desde Firestore por email) para que tanto el
// hub como los publicadores armen el canal igual.
import { ensureSyncConfigLoaded, getSocialSyncConfig, getSyncConfig, readSocialGist, saveSocialSyncConfig } from './gistRepository';
import { findSocialProfileByEmail, getCurrentSocialAuthUser } from './firebaseRepository';

export type SocialChannel = { token: string; gistId: string; etag: string | null };

export type SocialChannelResult =
  /** Canal listo: hay token y gist social (recuperándolo de Firestore si hacía falta). */
  | { status: 'ready'; channel: SocialChannel }
  /** El gist referenciado en Firestore ya no existe (404): el dueño debe crear uno nuevo. */
  | { status: 'gist-missing' }
  /** Sin sesión de Google, sin token principal o sin perfil publicado: no hay nada que armar. */
  | { status: 'unavailable' };

/** ¿El error de GitHub es un 404 (gist inexistente)? Mismo criterio que el gateway del hub. */
function isNotFoundGistError(error: unknown): boolean {
  return error instanceof Error && /\b404\b/.test(error.message);
}

/**
 * Resuelve el canal social de este dispositivo, persistiendo la config si ha habido que recuperarla.
 *
 * - Si ya hay config social, la devuelve; y si su token (una COPIA del PAT hecha al darse de alta) difiere del
 *   de la config principal, lo refresca: tras rotar el PAT, el token social quedaba rancio y todas las
 *   lecturas del publicador daban 401 hasta volver a pasar por el gateway del hub.
 * - Si no hay gistId pero sí sesión de Google y token principal, recupera el gist del perfil de Firestore
 *   (por email), lo valida con una lectura y guarda la config.
 *
 * Best-effort: cualquier fallo de Firestore/red degrada a `unavailable` sin lanzar (el llamador decide si
 * marcar la publicación como pendiente).
 */
export async function resolveSocialChannel(options?: { email?: string | null }): Promise<SocialChannelResult> {
  await ensureSyncConfigLoaded(); // C4: el token principal se descifra de forma asíncrona
  const mainConfig = getSyncConfig();
  const socialConfig = getSocialSyncConfig();
  const mainToken = String(mainConfig?.token || '').trim();
  const gistId = String(socialConfig?.gistId || '').trim();

  if (gistId) {
    const socialToken = String(socialConfig?.token || '').trim();
    // El token principal manda cuando existe y difiere (rotación del PAT). Si no hay principal (sync
    // desconectada), se conserva el social: es lo único con lo que aún se puede escribir.
    const token = mainToken && mainToken !== socialToken ? mainToken : socialToken;
    if (!token) {
      return { status: 'unavailable' };
    }
    if (token !== socialToken) {
      saveSocialSyncConfig({
        token,
        gistId,
        etag: socialConfig?.etag ?? null,
        lastRemoteUpdatedAt: socialConfig?.lastRemoteUpdatedAt ?? 0,
      });
    }
    return { status: 'ready', channel: { token, gistId, etag: socialConfig?.etag ?? null } };
  }

  // Sin gist en este dispositivo: se recupera del perfil publicado en Firestore.
  let email = String(options?.email || '').trim();
  if (!email) {
    const authUser = await getCurrentSocialAuthUser();
    email = String(authUser?.email || '').trim();
  }
  if (!email || !mainToken) {
    return { status: 'unavailable' };
  }

  let recoveredGistId = '';
  try {
    const profile = await findSocialProfileByEmail(email);
    recoveredGistId = profile?.socialEnabled ? profile.socialGistId.trim() : '';
  } catch {
    return { status: 'unavailable' }; // Firestore caído: no se puede resolver, pero nada se rompe.
  }
  if (!recoveredGistId) {
    return { status: 'unavailable' };
  }

  try {
    await readSocialGist(mainToken, recoveredGistId, null);
  } catch (error) {
    if (isNotFoundGistError(error)) {
      return { status: 'gist-missing' };
    }
    return { status: 'unavailable' };
  }

  saveSocialSyncConfig({ token: mainToken, gistId: recoveredGistId, etag: null, lastRemoteUpdatedAt: 0 });
  return { status: 'ready', channel: { token: mainToken, gistId: recoveredGistId, etag: null } };
}
