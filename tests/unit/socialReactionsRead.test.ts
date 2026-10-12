import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPublicSocialReactions,
  readPublicSocialGistById,
  writeSocialGist,
  type SocialGistData,
} from '../../src/model/repository/socialGistRepository';

// FASE 3 de docs/plan-reacciones.md — los «me gusta» de una amistad llegan en la MISMA lectura de su gist social.

const TOKEN = 'ghp_0123456789abcdefghij';
const MAIN = 'myGameList.social.json';
const REACTIONS = 'myGameList.social-reactions.json';
let gistSeq = 0;
/** Un gist distinto por test: la caché de sesión es del módulo y no se vacía entre casos. */
const nextGist = () => `aabbccdd${String(++gistSeq).padStart(4, '0')}`;

function socialData(name = 'Marta'): SocialGistData {
  return {
    profile: {
      name,
      private: false,
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity: [],
    posts: [],
    updatedAt: 1,
    schemaVersion: 2,
  } as unknown as SocialGistData;
}

const LIKE = { on: 'activity', to: 'pi', item: 'pi:7:review', kind: 'like', at: 1_000 };

function stubFetch(responses: Array<() => Response>) {
  let i = 0;
  const fetchMock = vi.fn(async () => responses[Math.min(i++, responses.length - 1)]());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function gistBody(files: Record<string, string>, etag = 'W/"1"'): Response {
  const body = { files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }])) };
  return new Response(JSON.stringify(body), { status: 200, headers: { etag } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('los «me gusta» viajan en la lectura del gist', () => {
  it('una sola petición trae los datos y los «me gusta»', async () => {
    const gist = nextGist();
    const fetchMock = stubFetch([
      () => gistBody({ [MAIN]: JSON.stringify(socialData()), [REACTIONS]: JSON.stringify({ v: 1, updatedAt: 1, items: [LIKE] }) }),
    ]);

    expect(getPublicSocialReactions(gist, TOKEN)).toEqual([]);
    const data = await readPublicSocialGistById(gist, TOKEN);

    expect(data.profile.name).toBe('Marta');
    expect(getPublicSocialReactions(gist, TOKEN)).toEqual([LIKE]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un fichero de «me gusta» roto no estropea la lectura del perfil', async () => {
    const gist = nextGist();
    stubFetch([() => gistBody({ [MAIN]: JSON.stringify(socialData()), [REACTIONS]: '{roto' })]);

    const data = await readPublicSocialGistById(gist, TOKEN);

    expect(data.profile.name).toBe('Marta');
    expect(getPublicSocialReactions(gist, TOKEN)).toEqual([]);
  });

  it('mientras la copia vive, se sirven sus «me gusta» sin volver a GitHub', async () => {
    const gist = nextGist();
    const fetchMock = stubFetch([
      () => gistBody({ [MAIN]: JSON.stringify(socialData()), [REACTIONS]: JSON.stringify({ v: 1, updatedAt: 1, items: [LIKE] }) }),
    ]);
    await readPublicSocialGistById(gist, TOKEN);
    await readPublicSocialGistById(gist, TOKEN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getPublicSocialReactions(gist, TOKEN)).toEqual([LIKE]);
  });

  it('escribir el fichero principal no borra de la copia los «me gusta» ya leídos', async () => {
    const gist = nextGist();
    stubFetch([
      () => gistBody({ [MAIN]: JSON.stringify(socialData()), [REACTIONS]: JSON.stringify({ v: 1, updatedAt: 1, items: [LIKE] }) }),
      () => new Response(JSON.stringify({}), { status: 200, headers: { etag: 'W/"2"' } }),
    ]);
    await readPublicSocialGistById(gist, TOKEN);

    await writeSocialGist(TOKEN, gist, socialData('Marta 2'));

    expect((await readPublicSocialGistById(gist, TOKEN)).profile.name).toBe('Marta 2');
    expect(getPublicSocialReactions(gist, TOKEN)).toEqual([LIKE]);
  });
});

// La copia caducada se borraba al mirar si había una viva, y la revalidación ya no la encontraba: nunca se enviaba el
// ETag y cada relectura bajaba el gist entero (hallazgo de la Fase 3, arreglado el 12-10-2026).
describe('revalidación de la copia de un gist ajeno', () => {
  const caducar = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 60_000);
  };

  it('pasada su vida, relee con If-None-Match; un 304 sirve la copia con sus «me gusta»', async () => {
    const gist = nextGist();
    const fetchMock = stubFetch([
      () => gistBody({ [MAIN]: JSON.stringify(socialData()), [REACTIONS]: JSON.stringify({ v: 1, updatedAt: 1, items: [LIKE] }) }, 'W/"v1"'),
      () => new Response(null, { status: 304 }),
    ]);
    await readPublicSocialGistById(gist, TOKEN);

    caducar();
    const data = await readPublicSocialGistById(gist, TOKEN);
    vi.useRealTimers();

    const headers = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('W/"v1"');
    expect(data.profile.name).toBe('Marta');
    expect(getPublicSocialReactions(gist, TOKEN)).toEqual([LIKE]);
  });

  it('también tras recargar: la copia caducada de sessionStorage sigue sirviendo para revalidar', async () => {
    const gist = nextGist();
    const fetchMock = stubFetch([
      () => gistBody({ [MAIN]: JSON.stringify(socialData()) }, 'W/"v1"'),
      () => new Response(null, { status: 304 }),
    ]);
    await readPublicSocialGistById(gist, TOKEN);
    vi.resetModules();
    const fresh = await import('../../src/model/repository/socialGistRepository'); // «recarga»: memoria vacía

    caducar();
    await fresh.readPublicSocialGistById(gist, TOKEN);
    vi.useRealTimers();

    const headers = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('W/"v1"');
  });

  it('si GitHub limita, se sirve la copia caducada en vez de fallar', async () => {
    const gist = nextGist();
    stubFetch([
      () => gistBody({ [MAIN]: JSON.stringify(socialData('Copia')) }, 'W/"v1"'),
      () => new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
    ]);
    await readPublicSocialGistById(gist, TOKEN);

    caducar();
    const data = await readPublicSocialGistById(gist, TOKEN);
    vi.useRealTimers();

    expect(data.profile.name).toBe('Copia');
  });
});
