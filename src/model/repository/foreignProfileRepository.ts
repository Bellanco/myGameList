import type { TabData } from '../types/game';
import { readForeignGamesGist } from './gistRepository';
import { getCachedProfileGames, invalidateProfileGames, putCachedProfileGames } from './indexedDbRepository';

/**
 * Carga la lista COMPLETA de juegos de otro perfil componiendo la caché de IndexedDB (TTL 1 día) con la lectura
 * del gist de listados ajeno:
 * - Por defecto sirve de caché si está fresca (<24h) y NO toca la red (ahorra el rate-limit del token de gist).
 * - `forceRefresh` salta la caché, relee del gist y reescribe la caché.
 * - Sin token: no se hace red; se devuelve la caché aunque esté caducada (o `null` si no hay).
 * - Si la red falla (404/rate-limit), cae a la caché caducada si existe; si no, propaga el error.
 */
export async function loadForeignProfileGames(opts: {
  profileId: string;
  gamesGistId: string;
  token: string | null;
  forceRefresh?: boolean;
}): Promise<TabData | null> {
  const { profileId, gamesGistId, token, forceRefresh } = opts;
  if (!profileId || !gamesGistId) return null;

  if (!forceRefresh) {
    const cached = await getCachedProfileGames(profileId, gamesGistId);
    if (cached) return cached;
  }

  if (!token) {
    return getCachedProfileGames(profileId, gamesGistId, { allowExpired: true });
  }

  try {
    const games = await readForeignGamesGist(token, gamesGistId);
    await putCachedProfileGames(profileId, gamesGistId, games);
    return games;
  } catch (error) {
    const stale = await getCachedProfileGames(profileId, gamesGistId, { allowExpired: true });
    if (stale) return stale;
    throw error;
  }
}

export { invalidateProfileGames };
