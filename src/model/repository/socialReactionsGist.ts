// EL FICHERO DE «ME GUSTA» EN GITHUB: leerlo y escribirlo, y nada más.
//
// Aparte de la cola (`socialReactionsRepository`) para que el gist social pueda copiarlo al migrar de canal sin una
// importación circular: la cola necesita el canal, y el canal necesita el gist social.
import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import type { SocialReactionsFile } from '../../core/social/reactions';
import { githubFetch } from './githubHttp';
import { GIST_API_BASE, buildGithubError, getGithubAuthHeader } from './githubGistApi';
import { SOCIAL_REACTIONS_FILENAME } from './socialProjection';

/** Última lectura o escritura del fichero, por gist: con su ETag, una relectura sin cambios es un 304. */
const contentCache = new Map<string, { content: string | null; etag: string | null }>();

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: getGithubAuthHeader(token),
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * El CONTENIDO del fichero de reacciones de un gist propio, tal cual, o `null` si el gist no lo tiene. Lanza si el
 * fichero existe pero llega recortado: reescribir desde una lectura a medias borraría lo que no se ha leído.
 *
 * El ETag es el del gist ENTERO (GitHub no lo da por fichero), así que cualquier escritura del fichero principal lo
 * invalida y la siguiente lectura baja el gist completo. Es lo correcto: un 304 solo se acepta cuando nada ha
 * cambiado.
 */
export async function readSocialReactionsContent(token: string, gistId: string): Promise<string | null> {
  if (!isValidGithubToken(token) || !isValidGistId(gistId)) {
    throw new Error('No se puede leer tus «me gusta»: falta la conexión con GitHub.');
  }
  const cached = contentCache.get(gistId);
  const headers = githubHeaders(token);
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, { headers });
  if (response.status === 304 && cached) {
    return cached.content;
  }
  if (!response.ok) {
    throw await buildGithubError(response, 'No se han podido leer tus «me gusta»');
  }
  const body = (await response.json()) as { files?: Record<string, { content?: string; truncated?: boolean } | undefined> };
  const file = body.files?.[SOCIAL_REACTIONS_FILENAME];
  if (file?.truncated) {
    throw new Error('GitHub ha recortado el fichero de tus «me gusta». No se ha cambiado nada para no perder datos.');
  }
  const content = file ? String(file.content ?? '') : null;
  contentCache.set(gistId, { content, etag: response.headers.get('etag') });
  return content;
}

/**
 * El fichero ya interpretado como JSON, o `null` si no existe. Un JSON roto LANZA por lo mismo que un recorte: si no
 * se puede leer, no se puede fusionar, y escribir encima lo borraría.
 */
export async function readSocialReactionsRaw(token: string, gistId: string): Promise<unknown> {
  const content = await readSocialReactionsContent(token, gistId);
  if (content === null) return null;
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('El fichero de tus «me gusta» no se puede leer. No se ha cambiado nada para no perder datos.');
  }
}

/** Carga perezosa del esquema (Zod), como la del fichero principal: solo viaja a quien escribe. */
async function loadReactionsValidator(): Promise<(data: unknown) => void> {
  const schemaModule = await import('../schemas/socialReactionsSchema');
  return schemaModule.assertValidSocialReactions;
}

/** Escribe el fichero de reacciones, y SOLO ese fichero, en el gist propio. */
export async function writeSocialReactions(token: string, gistId: string, file: SocialReactionsFile): Promise<void> {
  if (!isValidGithubToken(token) || !isValidGistId(gistId)) {
    throw new Error('No se pueden guardar tus «me gusta»: falta la conexión con GitHub.');
  }
  const assertValid = await loadReactionsValidator();
  assertValid(file); // allowlist estricta: canal público
  const content = JSON.stringify(file);
  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'PATCH',
    headers: githubHeaders(token),
    body: JSON.stringify({ files: { [SOCIAL_REACTIONS_FILENAME]: { content } } }),
  });
  if (!response.ok) {
    throw await buildGithubError(response, 'No se han podido guardar tus «me gusta»');
  }
  contentCache.set(gistId, { content, etag: response.headers.get('etag') });
}

/** Vacía la caché. Solo para las pruebas. */
export function resetSocialReactionsGistCacheForTests(): void {
  contentCache.clear();
}
