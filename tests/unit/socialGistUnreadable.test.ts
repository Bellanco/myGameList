import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSocialGist } from '../../src/model/repository/socialGistRepository';

// El canal PROPIO ilegible —JSON roto, recortado por GitHub, un chunk que falta— se devolvía como un canal VACÍO y
// se cacheaba con su ETag. Las escrituras parten de esa lectura (`openSocialWrite`, `reconcileReviewActivity`), así
// que la siguiente reescribía el canal desde cero y borraba lo que no se había podido leer.

const TOKEN = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz';
const SOCIAL_FILE = 'myGameList.social.json';

function stubGist(files: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ files }), {
    status: 200,
    headers: { 'content-type': 'application/json', etag: 'W/"e1"' },
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('lectura del gist social propio ilegible', () => {
  it('JSON roto: lanza en vez de devolver un canal vacío, y no lo cachea', async () => {
    const gistId = 'aabbccddeeff00112233445566778801';
    const fetchMock = stubGist({ [SOCIAL_FILE]: { content: '{"profile":{"name":"Ada"', truncated: true } });

    await expect(readSocialGist(TOKEN, gistId, null)).rejects.toThrow(/ilegible/);
    // Sin caché: la siguiente lectura vuelve a la red en vez de servir el vacío.
    await expect(readSocialGist(TOKEN, gistId, null)).rejects.toThrow(/ilegible/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un chunk de overflow que falta: lanza en vez de devolver las listas a medias', async () => {
    const gistId = 'aabbccddeeff00112233445566778802';
    const anchor = {
      profile: { name: 'Ada', private: false, visibility: {}, sharedLists: { c: [] } },
      activity: [], posts: [], updatedAt: 1,
      chunkIndex: { strategy: 'size', maxChunkKB: 512, chunks: [{ chunkId: 'main', gistId: null }, { chunkId: 'c1', gistId: null }] },
    };
    stubGist({ [SOCIAL_FILE]: { content: JSON.stringify(anchor) } });

    await expect(readSocialGist(TOKEN, gistId, null)).rejects.toThrow(/ausente/);
  });

  it('sin el fichero sigue siendo un canal vacío de verdad (recién creado)', async () => {
    const gistId = 'aabbccddeeff00112233445566778803';
    stubGist({});

    const read = await readSocialGist(TOKEN, gistId, null);

    expect(read.data.activity).toEqual([]);
    expect(read.etag).toBe('W/"e1"');
  });
});
