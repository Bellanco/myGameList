import type { TabData } from '../types/game';
import { readForeignGamesGist } from './gistRepository';
import { getCachedProfileGames, invalidateProfileGames, putCachedProfileGames } from './indexedDbRepository';

// Dedupe de lecturas en vuelo por gist de listados: si el efecto de carga se re-ejecuta (re-render, cambio de
// identidad de socialDirectory) antes de que la primera lectura resuelva, las llamadas concurrentes comparten la
// misma promesa en vez de lanzar lecturas de gist duplicadas. (Cada perfil tiene un único gamesGistId.)
const inFlightByGamesGist = new Map<string, Promise<TabData | null>>();

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
    // Una lectura del mismo gist ya está en curso → reutilízala (evita duplicados).
    const existing = inFlightByGamesGist.get(gamesGistId);
    if (existing) return existing;
  }

  if (!token) {
    return getCachedProfileGames(profileId, gamesGistId, { allowExpired: true });
  }

  const request = (async () => {
    try {
      const games = await readForeignGamesGist(token, gamesGistId);
      await putCachedProfileGames(profileId, gamesGistId, games);
      return games;
    } catch (error) {
      const stale = await getCachedProfileGames(profileId, gamesGistId, { allowExpired: true });
      if (stale) return stale;
      throw error;
    }
  })();

  // Solo se registra/comparte el camino normal; un forceRefresh deliberado no se deduplica contra cargas previas.
  if (forceRefresh) {
    return request;
  }
  inFlightByGamesGist.set(gamesGistId, request);
  try {
    return await request;
  } finally {
    inFlightByGamesGist.delete(gamesGistId);
  }
}

export { invalidateProfileGames };
