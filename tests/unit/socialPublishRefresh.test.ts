import { afterEach, describe, expect, it, vi } from 'vitest';

// Espía que CONSERVA la validación real: solo permite comprobar que se invoca (y forzar un rechazo en un test).
const schemaSpy = vi.hoisted(() => ({ assertValidSocialGist: vi.fn() }));
vi.mock('../../src/model/schemas/socialGistSchema', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/model/schemas/socialGistSchema')>();
  schemaSpy.assertValidSocialGist.mockImplementation(original.assertValidSocialGist);
  return { ...original, assertValidSocialGist: schemaSpy.assertValidSocialGist };
});
import { readPublicSocialGistById, writeSocialGist, type SocialGistData } from '../../src/model/repository/gistRepository';

const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_ID = 'abcdef99';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

function baseData(posts: SocialGistData['posts'] = []): SocialGistData {
  return {
    profile: {
      name: 'Yo',
      private: false,
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity: [],
    posts,
    updatedAt: 1,
    schemaVersion: 2,
  } as unknown as SocialGistData;
}

function post(text: string, ts: number) {
  return { id: `p1:${ts}`, authorProfileId: 'p1', authorName: 'Yo', text, createdAt: ts, updatedAt: ts };
}

/** Gist en memoria: PATCH fusiona ficheros, GET devuelve el estado actual. */
function stubGistStore(initialFiles: Record<string, { content: string }>) {
  const store: Record<string, { content: string }> = { ...initialFiles };
  let getCount = 0;
  let patchCount = 0;
  const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const headers = { etag: `W/"etag-${Date.now()}"` };
    if (method === 'PATCH') {
      patchCount += 1;
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string } | null> };
      for (const [name, file] of Object.entries(body.files)) {
        if (file === null) delete store[name];
        else store[name] = file;
      }
      return new Response(JSON.stringify({ updated_at: '2026-06-29T12:00:00Z' }), { status: 200, headers });
    }
    getCount += 1;
    return new Response(JSON.stringify({ files: store }), { status: 200, headers });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { getCount: () => getCount, patchCount: () => patchCount };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('refresco tras publicar — la caché pública se actualiza al escribir el gist propio', () => {
  it('readPublicSocialGistById ve el post recién escrito (sin servir la versión cacheada obsoleta)', async () => {
    // Estado inicial en GitHub: sin posts.
    const store = stubGistStore({ [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(baseData([])) } });

    // 1) El feed lee el gist propio por la vía pública → cachea (45 s) la versión SIN posts.
    const before = await readPublicSocialGistById(GIST_ID, TOKEN);
    expect(before.posts).toHaveLength(0);

    // 2) Se publica un post (escribe el gist).
    await writeSocialGist(TOKEN, GIST_ID, baseData([post('Mira esta captura', 2000)]));

    // 3) El feed re-lee por la vía pública: debe ver el post nuevo, no la caché obsoleta de 45 s.
    const after = await readPublicSocialGistById(GIST_ID, TOKEN);
    expect(after.posts).toHaveLength(1);
    expect(after.posts?.[0].text).toBe('Mira esta captura');

    // Y lo sirve desde la caché refrescada por la escritura: no hizo un GET extra para el paso 3.
    expect(store.getCount()).toBe(1);
  });
});

// P2 — la validación de esquema (Zod) ya NO viaja en el chunk de arranque: `writeSocialGist` la carga bajo
// demanda con `await import()`. Aquí se comprueba que sigue EJECUTÁNDOSE en la ruta de escritura; si ese import se
// rompiera o alguien retirara la llamada, el gist PÚBLICO pasaría a subirse sin su allowlist y nadie se enteraría.
//
// Se comprueba la INVOCACIÓN y no un payload inválido a propósito: `normalizeSocialGistData` corre antes y
// reconstruye el objeto campo a campo, así que ya descarta lo desconocido. Esta validación es la segunda línea
// —la que cubre un fallo de esa normalización—, y por definición no se puede provocar desde fuera con un
// payload normal. Lo comprobable, y lo que de verdad importa, es que se sigue ejecutando.
describe('validación de esquema del gist social (cargada bajo demanda)', () => {
  it('escribe con normalidad un payload válido', async () => {
    stubGistStore({ [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(baseData([])) } });
    await expect(writeSocialGist(TOKEN, GIST_ID, baseData([post('hola', 1000)]))).resolves.toBeDefined();
  });

  it('el validador SE EJECUTA al escribir, pese a cargarse de forma diferida', async () => {
    stubGistStore({ [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(baseData([])) } });
    schemaSpy.assertValidSocialGist.mockClear();

    await writeSocialGist(TOKEN, GIST_ID, baseData([post('hola', 1000)]));

    expect(schemaSpy.assertValidSocialGist).toHaveBeenCalled();
    // Y recibe el payload YA normalizado que se va a subir, no el de entrada.
    const validado = schemaSpy.assertValidSocialGist.mock.calls[0][0] as { posts?: unknown[] };
    expect(validado.posts).toHaveLength(1);
  });

  it('si el validador rechaza, la escritura ABORTA (falla cerrado, no sube el gist)', async () => {
    const store = stubGistStore({ [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(baseData([])) } });
    schemaSpy.assertValidSocialGist.mockImplementationOnce(() => {
      throw new Error('Gist social inválido (schema): prueba');
    });

    await expect(writeSocialGist(TOKEN, GIST_ID, baseData([post('hola', 1000)]))).rejects.toThrow(/schema/);
    // No llegó a tocar GitHub: fallar cerrado significa no publicar nada.
    expect(store.patchCount()).toBe(0);
  });
});
