import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readForeignGamesGist } from '../../src/model/repository/gistRepository';
import {
  getCachedProfileGames,
  getCachedSocialDirectory,
  invalidateProfileGames,
  putCachedProfileGames,
  putCachedSocialDirectory,
} from '../../src/model/repository/indexedDbRepository';
import { loadForeignProfileGames } from '../../src/model/repository/foreignProfileRepository';
import { applyProfileVisibility } from '../../src/core/utils/profileVisibility';
import { PROFILE_CACHE_STORE, openSharedDatabase } from '../../src/model/repository/idbConnectionRepository';
import type { GameItem, TabData } from '../../src/model/types/game';
import type { SocialProfileVisibility } from '../../src/model/repository/gistRepository';

const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_ID = 'abc12345';
const OTHER_GIST_ID = 'def67890';
const GAMES_FILENAME = 'myGames.json';
const DAY_MS = 24 * 60 * 60 * 1000;

function makeGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    id: 7,
    _ts: 1000,
    name: 'Hollow Knight',
    platforms: ['PC'],
    genres: ['Metroidvania'],
    steamDeck: true,
    review: 'Una obra maestra',
    score: 5,
    strengths: ['Combate', 'Atmósfera'],
    weaknesses: ['Mapa'],
    reasons: [],
    hours: 40,
    replayable: true,
    retry: true,
    ...overrides,
  };
}

function makeTabData(games: GameItem[]): TabData {
  return { c: games, v: [], e: [], p: [], deleted: [], updatedAt: 1000 };
}

function fullVisibility(overrides: Partial<SocialProfileVisibility> = {}): SocialProfileVisibility {
  return { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true, ...overrides };
}

/** Mockea fetch para devolver un gist de juegos con el contenido dado en el fichero de juegos. */
function stubGamesGist(tabData: TabData) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ files: { [GAMES_FILENAME]: { content: JSON.stringify(tabData) } } }), {
      status: 200,
      headers: { etag: 'W/"etag-1"' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * Stub que HONRA `If-None-Match`: devuelve 304 (sin cuerpo) cuando el ETag condicional coincide con el actual, y 200
 * con contenido en caso contrario. Simula el comportamiento real de GitHub para probar la revalidación condicional.
 */
function stubGamesGistConditional(tabData: TabData, etag = 'W/"etag-1"') {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const headers = (init?.headers || {}) as Record<string, string>;
    if (headers['If-None-Match'] === etag) {
      return new Response(null, { status: 304, headers: { etag } });
    }
    return new Response(JSON.stringify({ files: { [GAMES_FILENAME]: { content: JSON.stringify(tabData) } } }), {
      status: 200,
      headers: { etag },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function clearProfileCache(): Promise<void> {
  const db = await openSharedDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROFILE_CACHE_STORE, 'readwrite');
    tx.objectStore(PROFILE_CACHE_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('readForeignGamesGist', () => {
  it('lee y decodifica el gist de listados de otro usuario por su ID', async () => {
    stubGamesGist(makeTabData([makeGame()]));
    const res = await readForeignGamesGist(TOKEN, GIST_ID);
    expect(res.data?.c).toHaveLength(1);
    expect(res.data?.c[0].id).toBe(7);
    expect(res.data?.c[0].strengths).toContain('Combate');
    expect(res.etag).toBe('W/"etag-1"');
    expect(res.notModified).toBeFalsy();
  });

  it('devuelve notModified (304) sin cuerpo cuando el ETag condicional coincide', async () => {
    const fetchMock = stubGamesGistConditional(makeTabData([makeGame()]));
    const res = await readForeignGamesGist(TOKEN, GIST_ID, 'W/"etag-1"');
    expect(res.notModified).toBe(true);
    expect(res.data).toBeNull();
    expect(res.etag).toBe('W/"etag-1"');
    const sentHeaders = (fetchMock.mock.calls[0][1]?.headers || {}) as Record<string, string>;
    expect(sentHeaders['If-None-Match']).toBe('W/"etag-1"');
  });

  it('rechaza un gistId con formato inválido sin tocar la red', async () => {
    const fetchMock = stubGamesGist(makeTabData([]));
    await expect(readForeignGamesGist(TOKEN, 'no válido!!')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propaga un error cuando GitHub responde no-ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(readForeignGamesGist(TOKEN, GIST_ID)).rejects.toThrow();
  });
});

describe('applyProfileVisibility', () => {
  it('vacía las pestañas ocultas', () => {
    const out = applyProfileVisibility(makeTabData([makeGame()]), fullVisibility({ hiddenTabs: ['c'] }));
    expect(out.c).toHaveLength(0);
  });

  it('elimina horas, rejugable y reintentar cuando están ocultos', () => {
    const out = applyProfileVisibility(
      makeTabData([makeGame()]),
      fullVisibility({ hideGameTime: true, hideReplayable: true, hideRetry: true }),
    );
    expect(out.c[0].hours).toBeNull();
    expect(out.c[0].replayable).toBe(false);
    expect(out.c[0].retry).toBe(false);
  });

  it('conserva los datos cuando no hay restricciones', () => {
    const out = applyProfileVisibility(makeTabData([makeGame()]), fullVisibility());
    expect(out.c[0].hours).toBe(40);
    expect(out.c[0].replayable).toBe(true);
    expect(out.c[0].strengths).toContain('Atmósfera');
  });
});

describe('caché de perfiles ajenos (profileCache, TTL 1 día)', () => {
  beforeEach(async () => {
    await clearProfileCache();
  });

  it('sirve la caché fresca y la descarta pasadas 24h', async () => {
    const now = 1_000_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    await putCachedProfileGames('p1', GIST_ID, makeTabData([makeGame()]));
    expect(await getCachedProfileGames('p1', GIST_ID)).not.toBeNull();

    nowSpy.mockReturnValue(now + DAY_MS + 1);
    expect(await getCachedProfileGames('p1', GIST_ID)).toBeNull();
    // allowExpired devuelve la caché aunque haya caducado (último recurso sin token).
    expect(await getCachedProfileGames('p1', GIST_ID, { allowExpired: true })).not.toBeNull();
  });

  it('invalida la caché si cambia el gamesGistId', async () => {
    await putCachedProfileGames('p1', GIST_ID, makeTabData([makeGame()]));
    expect(await getCachedProfileGames('p1', OTHER_GIST_ID)).toBeNull();
  });
});

describe('caché del directorio social (TTL 30 min)', () => {
  const THIRTY_MIN_MS = 30 * 60 * 1000;

  beforeEach(async () => {
    await clearProfileCache();
  });

  it('sirve el directorio fresco y lo descarta pasados 30 min', async () => {
    const now = 1_000_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    await putCachedSocialDirectory('own-gist', [{ id: 'p1' }, { id: 'p2' }]);
    expect(await getCachedSocialDirectory('own-gist')).toHaveLength(2);

    // Sigue fresco dentro de la ventana (p. ej. a los 5 min).
    nowSpy.mockReturnValue(now + 5 * 60 * 1000);
    expect(await getCachedSocialDirectory('own-gist')).toHaveLength(2);

    nowSpy.mockReturnValue(now + THIRTY_MIN_MS + 1);
    expect(await getCachedSocialDirectory('own-gist')).toBeNull();
  });

  it('está aislado por gist propio y no devuelve nada sin clave', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
    await putCachedSocialDirectory('own-gist', [{ id: 'p1' }]);
    expect(await getCachedSocialDirectory('otro-gist')).toBeNull();
    expect(await getCachedSocialDirectory('')).toBeNull();
  });
});

describe('loadForeignProfileGames', () => {
  beforeEach(async () => {
    await clearProfileCache();
  });

  it('revalida con If-None-Match: un 304 sirve la caché sin re-descargar contenido', async () => {
    const fetchMock = stubGamesGistConditional(makeTabData([makeGame()]));
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);

    const first = await loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN });
    expect(first?.c[0].id).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1); // primera vez: 200 (sin ETag que enviar)

    const second = await loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN });
    expect(second?.c[0].id).toBe(7); // servido de caché tras el 304
    expect(fetchMock).toHaveBeenCalledTimes(2); // revalida (petición condicional), pero
    const sentHeaders = (fetchMock.mock.calls[1][1]?.headers || {}) as Record<string, string>;
    expect(sentHeaders['If-None-Match']).toBe('W/"etag-1"'); // ...con If-None-Match → 304, sin cuerpo
  });

  it('BUG 2 fix: al cambiar el gist remoto, la revalidación trae el título nuevo (no rancio)', async () => {
    // Primera carga: "Hollow Knight" con etag-1, cacheado.
    stubGamesGistConditional(makeTabData([makeGame({ name: 'Hollow Knight' })]), 'W/"etag-1"');
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
    const first = await loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN });
    expect(first?.c[0].name).toBe('Hollow Knight');

    // El autor renombra el juego → su gist cambia de ETag y contenido. Dentro de la ventana de 24h, la caché vieja
    // seguía "fresca", pero la revalidación condicional (If-None-Match: etag-1 ≠ etag-2) recibe 200 con lo nuevo.
    stubGamesGistConditional(makeTabData([makeGame({ name: 'Hollow Knight: Silksong' })]), 'W/"etag-2"');
    const second = await loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN });
    expect(second?.c[0].name).toBe('Hollow Knight: Silksong');
  });

  it('forceRefresh salta la caché aunque esté fresca', async () => {
    const fetchMock = stubGamesGist(makeTabData([makeGame()]));
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);

    await loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN });
    await loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN, forceRefresh: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sin token sirve la caché y nunca toca la red', async () => {
    const fetchMock = stubGamesGist(makeTabData([makeGame()]));
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);

    await putCachedProfileGames('p1', GIST_ID, makeTabData([makeGame()]));
    const result = await loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: null });
    expect(result?.c[0].id).toBe(7);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin token y sin caché devuelve null', async () => {
    stubGamesGist(makeTabData([makeGame()]));
    const result = await loadForeignProfileGames({ profileId: 'desconocido', gamesGistId: GIST_ID, token: null });
    expect(result).toBeNull();
  });

  it('deduplica lecturas concurrentes del mismo gist en una sola llamada de red', async () => {
    const fetchMock = stubGamesGist(makeTabData([makeGame()]));
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);

    const [a, b] = await Promise.all([
      loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN }),
      loadForeignProfileGames({ profileId: 'p1', gamesGistId: GIST_ID, token: TOKEN }),
    ]);
    expect(a?.c[0].id).toBe(7);
    expect(b?.c[0].id).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  afterEach(async () => {
    await invalidateProfileGames('p1');
  });
});
