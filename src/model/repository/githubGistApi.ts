// Primitivas compartidas de la API de Gists de GitHub: lo poco que necesitan por igual el canal de JUEGOS
// (`gistRepository`) y el canal SOCIAL (`socialGistRepository`).
//
// Vive aparte para que esos dos puedan separarse de verdad: mientras compartían fichero, el gist social viajaba
// en el chunk de ARRANQUE de todo el mundo (el de juegos lo importa `useSyncViewModel`, que es estático desde
// App), aunque quien nunca abre el hub social no llegue a ejecutar ni una línea.
import { isValidGistId, isValidGithubToken } from '../../core/security/sanitize';
import { githubFetch, parseRetryAfterMs } from './githubHttp';

export const GIST_API_BASE = 'https://api.github.com/gists';

export function getGithubAuthHeader(token: string): string {
  // Use Bearer scheme which is recommended and compatible with PATs.
  return `Bearer ${token}`;
}

export async function buildGithubError(response: Response, prefix: string): Promise<Error> {
  const statusPart = `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`;

  let message: string;
  try {
    const payload = (await response.json()) as { message?: string; errors?: Array<{ message?: string }> };
    const apiMessage = payload?.message?.trim();
    const apiDetails = (payload?.errors || [])
      .map((entry) => entry?.message?.trim())
      .filter(Boolean)
      .join(', ');
    const details = [apiMessage, apiDetails].filter(Boolean).join(' | ');
    message = details ? `${prefix}: ${statusPart} - ${details}` : `${prefix}: ${statusPart}`;
  } catch {
    message = `${prefix}: ${statusPart}`;
  }

  const error = new Error(message);
  // S3: en 403/429 adjunta cuánto esperar (Retry-After / X-RateLimit-Reset) para que el backoff lo respete.
  const retryAfterMs = parseRetryAfterMs(response, Date.now());
  if (retryAfterMs > 0) (error as { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
  return error;
}

/**
 * Borra un gist de la cuenta del token. Se usa para retirar el canal social ANTIGUO tras migrarlo a secreto: es
 * lo único que quita de circulación lo que ya se publicó, porque el gist viejo seguiría siendo público e
 * indexable para siempre.
 *
 * IRREVERSIBLE. El llamador debe haber verificado antes que el canal nuevo tiene el contenido, y haber repuntado
 * ya todas las referencias: si esto se ejecutase antes, un fallo a media faena dejaría al usuario apuntando a un
 * gist que ya no existe.
 *
 * Devuelve `true` si el gist quedó borrado. Un 404 también cuenta: ya no está, que es el objetivo.
 */
export async function deleteGist(token: string, gistId: string): Promise<boolean> {
  if (!isValidGithubToken(token) || !isValidGistId(gistId)) {
    return false;
  }

  const response = await githubFetch(`${GIST_API_BASE}/${gistId}`, {
    method: 'DELETE',
    headers: {
      Authorization: getGithubAuthHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  return response.ok || response.status === 404;
}