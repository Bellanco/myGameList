import type { TabData } from '../types/game';
import { readForeignGamesGist } from './gistRepository';
import { getCachedProfileGames, getCachedProfileGamesEntry, invalidateProfileGames, putCachedProfileGames } from './indexedDbRepository';

// Dedupe de lecturas en vuelo por gist de listados: si el efecto de carga se re-ejecuta (re-render, cambio de
// identidad de socialDirectory) antes de que la primera lectura resuelva, las llamadas concurrentes comparten la
// misma promesa en vez de lanzar lecturas de gist duplicadas. (Cada perfil tiene un único gamesGistId.)
const inFlightByGamesGist = new Map<string, Promise<TabData | null>>();

/**
 * Carga la lista COMPLETA de juegos de otro perfil componiendo la caché de IndexedDB con la lectura del gist ajeno.
 *
 * REVALIDACIÓN CONDICIONAL (evita títulos rancios): con token siempre se pregunta a GitHub con `If-None-Match` usando
 * el ETag cacheado. Si el autor no ha tocado su gist, GitHub responde 304 (sin cuerpo, sin coste de rate-limit) y se
 * sirve la caché al instante; si lo cambió (p. ej. renombró un juego), responde 200 con el contenido nuevo. Así el
 * amigo ve los títulos actualizados sin esperar al TTL de 24h ni pulsar "Actualizar listados".
 * - `forceRefresh` ignora el ETag para forzar un 200 (relectura explícita del usuario).
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

  // Sin token no se puede tocar la red: se sirve la caché (aunque esté caducada) o null.
  if (!token) {
    return getCachedProfileGames(profileId, gamesGistId, { allowExpired: true });
  }

  // Una lectura del mismo gist ya está en curso → reutilízala (evita duplicados). El forceRefresh deliberado no se
  // deduplica contra cargas previas.
  if (!forceRefresh) {
    const existing = inFlightByGamesGist.get(gamesGistId);
    if (existing) return existing;
  }

  const request = (async () => {
    const cachedEntry = await getCachedProfileGamesEntry(profileId, gamesGistId);
    const conditionalEtag = forceRefresh ? null : cachedEntry?.etag || null;
    try {
      const res = await readForeignGamesGist(token, gamesGistId, conditionalEtag);
      if (res.notModified && cachedEntry) {
        // Sin cambios remotos: renueva la marca de tiempo (mantiene fresca la caché) y sirve lo cacheado.
        await putCachedProfileGames(profileId, gamesGistId, cachedEntry.games, res.etag ?? cachedEntry.etag ?? null);
        return cachedEntry.games;
      }
      if (res.data) {
        await putCachedProfileGames(profileId, gamesGistId, res.data, res.etag ?? null);
        return res.data;
      }
      // 304 sin registro de caché correspondiente (raro): cae a lo que haya, aunque esté caducado.
      return getCachedProfileGames(profileId, gamesGistId, { allowExpired: true });
    } catch (error) {
      const stale = await getCachedProfileGames(profileId, gamesGistId, { allowExpired: true });
      if (stale) return stale;
      throw error;
    }
  })();

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
