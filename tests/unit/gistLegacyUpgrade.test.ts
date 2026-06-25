import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGist } from '../../src/model/repository/gistRepository';
import type { TabData } from '../../src/model/types/game';

// Regresión: el upgrade proactivo (wasLegacy) debe dispararse aunque el gist responda 304. Un dispositivo ya
// conectado a un gist VIEJO recibe 304 en cada sync (su etag coincide); sin relectura, nunca migraría.
const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_FILENAME = 'myGames.json';

// Contenido VIEJO plano: el juego no tiene `name` (clave en español) → gamesGistNeedsRewrite = true.
const LEGACY_CONTENT = JSON.stringify({
  c: [{ id: 1, nombre: 'Juego Viejo', plataformas: ['Steam'], puntuacion: 4 }],
  v: [],
  e: [],
  p: [],
  deleted: [],
  updatedAt: 1000,
});

// Contenido ACTUAL plano: el juego ya tiene `name` y campos EN → no necesita reescritura.
const CURRENT_CONTENT = JSON.stringify({
  c: [{ id: 1, _ts: 1000, name: 'Juego Nuevo', platforms: ['Steam'], genres: ['RPG'], score: 4 }],
  v: [],
  e: [],
  p: [],
  deleted: [],
  updatedAt: 1000,
});

/**
 * Mock que devuelve 304 cuando la petición trae `If-None-Match` (etag coincide) y el contenido completo cuando NO
 * lo trae (relectura sin etag). Así reproduce el caso de un dispositivo ya conectado cuyo etag guardado coincide.
 */
function stubGistWithEtagMatch(content: string) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
    const headers = (init.headers || {}) as Record<string, string>;
    if ('If-None-Match' in headers) {
      return new Response(null, { status: 304, headers: { etag: 'W/"etag-1"' } });
    }
    return new Response(JSON.stringify({ files: { [GIST_FILENAME]: { content } } }), {
      status: 200,
      headers: { etag: 'W/"etag-2"' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('readGist — upgrade proactivo en 304', () => {
  it('ante un 304 con gist VIEJO, hace una relectura completa, detecta wasLegacy y devuelve los datos', async () => {
    const gistId = 'aaaa1111';
    const fetchMock = stubGistWithEtagMatch(LEGACY_CONTENT);

    const read = await readGist(TOKEN, gistId, 'W/"etag-1"');

    expect(read.notModified).toBeFalsy();
    expect(read.wasLegacy).toBe(true);
    expect((read.data as TabData).c[0].id).toBe(1);
    expect((read.data as TabData).c[0].name).toBe('Juego Viejo'); // migrado: nombre → name
    // 1ª petición con If-None-Match (304) + relectura sin etag (200).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('una vez verificado el formato en la sesión, los 304 siguientes son notModified (no relee)', async () => {
    const gistId = 'bbbb2222';
    const fetchMock = stubGistWithEtagMatch(LEGACY_CONTENT);

    await readGist(TOKEN, gistId, 'W/"etag-1"'); // verifica (2 fetch)
    const second = await readGist(TOKEN, gistId, 'W/"etag-1"'); // confía en el 304 (1 fetch)

    expect(second.notModified).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('ante un 304 con gist ya ACTUAL, relee una vez y devuelve notModified (sin reescritura espuria)', async () => {
    const gistId = 'cccc3333';
    const fetchMock = stubGistWithEtagMatch(CURRENT_CONTENT);

    const read = await readGist(TOKEN, gistId, 'W/"etag-1"');

    expect(read.notModified).toBe(true);
    expect(read.wasLegacy).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2); // relectura de verificación única
  });
});
