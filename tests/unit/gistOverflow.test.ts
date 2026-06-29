import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENABLE_GAMES_OVERFLOW_GISTS, buildGamesFiles, readGist, writeGist } from '../../src/model/repository/gistRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_FILENAME = 'myGames.json';

function gistIdFromUrl(url: string): string | null {
  const m = url.match(/\/gists\/([^/?]+)/);
  return m ? m[1] : null;
}

function makeGame(id: number, reviewLen: number): GameItem {
  return {
    id,
    _ts: 1000 + id,
    name: `Juego ${id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: 'x'.repeat(reviewLen),
    score: 4,
  };
}

/** Dataset con `n` juegos (reviews largas) para forzar varios ficheros chunk. */
function makeData(n: number, reviewLen = 900): TabData {
  const c: GameItem[] = [];
  for (let i = 1; i <= n; i += 1) c.push(makeGame(i, reviewLen));
  return { c, v: [], e: [], p: [], deleted: [], updatedAt: 1 };
}

function totalGames(data: TabData): number {
  return data.c.length + data.v.length + data.e.length + data.p.length;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── LECTURA de overflow (ACTIVA, sin flag) ─────────────────────────────────────────────────────────────────
describe('Fase B — lectura de chunks en otros gists (overflow)', () => {
  const MAIN_ID = 'aaaa1111';
  const OVERFLOW_ID = 'bbbb2222';

  /** Construye un layout multi-gist: el ancla referencia TODOS sus chunks en un gist de overflow aparte. */
  function buildSplitLayout(data: TabData) {
    const { anchorFile, chunkFiles } = buildGamesFiles(data);
    expect(Object.keys(chunkFiles).length).toBeGreaterThanOrEqual(1); // hay al menos un chunk que mover
    for (const ref of anchorFile.chunkIndex.chunks) {
      if (ref.chunkId !== 'main') ref.gistId = OVERFLOW_ID;
    }
    const mainFiles: Record<string, { content: string }> = { [GIST_FILENAME]: { content: JSON.stringify(anchorFile) } };
    const overflowFiles: Record<string, { content: string }> = {};
    for (const [name, file] of Object.entries(chunkFiles)) overflowFiles[name] = { content: JSON.stringify(file) };
    return { mainFiles, overflowFiles };
  }

  function stubSplitGists(mainFiles: Record<string, { content: string }>, overflowFiles: Record<string, { content: string }> | null) {
    const fetchMock = vi.fn(async (url: string) => {
      const id = gistIdFromUrl(url);
      const headers = { etag: 'W/"etag-1"' };
      if (id === MAIN_ID) return new Response(JSON.stringify({ files: mainFiles }), { status: 200, headers });
      if (id === OVERFLOW_ID) {
        if (overflowFiles === null) return new Response('not found', { status: 404, headers });
        return new Response(JSON.stringify({ files: overflowFiles }), { status: 200, headers });
      }
      return new Response('not found', { status: 404, headers });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('fusiona los chunks del gist de overflow y reconstruye el TabData sin pérdida', async () => {
    const data = makeData(2500);
    const { mainFiles, overflowFiles } = buildSplitLayout(data);
    stubSplitGists(mainFiles, overflowFiles);

    const read = await readGist(TOKEN, MAIN_ID);
    const out = read.data as TabData;
    expect(totalGames(out)).toBe(totalGames(data));
    expect(out.c.map((g) => g.id).sort((a, b) => a - b)).toEqual(data.c.map((g) => g.id).sort((a, b) => a - b));
  });

  it('LANZA (lectura incompleta) si el gist de overflow no es accesible — nunca devuelve datos parciales', async () => {
    const { mainFiles } = buildSplitLayout(makeData(2500));
    stubSplitGists(mainFiles, null); // overflow → 404
    await expect(readGist(TOKEN, MAIN_ID)).rejects.toThrow(/overflow|incompleta/i);
  });

  it('LANZA si falta un fichero chunk referenciado en el gist de overflow', async () => {
    const { mainFiles, overflowFiles } = buildSplitLayout(makeData(2500));
    const firstChunk = Object.keys(overflowFiles)[0];
    delete overflowFiles[firstChunk]; // el ancla lo referencia pero ya no está
    stubSplitGists(mainFiles, overflowFiles);
    await expect(readGist(TOKEN, MAIN_ID)).rejects.toThrow(/ausente|incompleta/i);
  });

  it('no hace fetch extra cuando ningún chunk vive en otro gist (no-op para un único gist)', async () => {
    const data = makeData(2500);
    const { anchorFile, chunkFiles } = buildGamesFiles(data); // todos los chunks con gistId null (mismo gist)
    const mainFiles: Record<string, { content: string }> = { [GIST_FILENAME]: { content: JSON.stringify(anchorFile) } };
    for (const [name, file] of Object.entries(chunkFiles)) mainFiles[name] = { content: JSON.stringify({ ...file, mainGistId: MAIN_ID }) };
    const fetchMock = stubSplitGists(mainFiles, null);

    const read = await readGist(TOKEN, MAIN_ID);
    expect(totalGames(read.data as TabData)).toBe(totalGames(data));
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el GET del gist principal
  });
});

// ── ESCRITURA con overflow (GATED) ─────────────────────────────────────────────────────────────────────────
describe.skipIf(!ENABLE_GAMES_OVERFLOW_GISTS)('Fase B — escritura con gists de overflow (flag activo)', () => {
  const MAIN_ID = 'cccc3333';

  /** Mock multi-gist: POST crea un gist con id generado; PATCH fusiona (null borra); GET devuelve sus ficheros. */
  function stubMultiGistStore() {
    const gists = new Map<string, Record<string, { content: string }>>();
    gists.set(MAIN_ID, { [GIST_FILENAME]: { content: JSON.stringify({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 }) } });
    let seq = 0;
    const posts: string[] = [];
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      const headers = { etag: 'W/"etag-1"' };
      if (method === 'POST') {
        const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string }> };
        seq += 1;
        const newId = `abcdef0${seq}`;
        gists.set(newId, { ...body.files });
        posts.push(newId);
        return new Response(JSON.stringify({ id: newId }), { status: 201, headers });
      }
      const id = gistIdFromUrl(url)!;
      if (method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string } | null> };
        const store = gists.get(id) || {};
        for (const [n, f] of Object.entries(body.files)) {
          if (f === null) delete store[n];
          else store[n] = f;
        }
        gists.set(id, store);
        return new Response(JSON.stringify({ updated_at: '2026-06-29T00:00:00Z' }), { status: 200, headers });
      }
      return new Response(JSON.stringify({ files: gists.get(id) || {} }), { status: 200, headers });
    });
    vi.stubGlobal('fetch', fetchMock);
    return { gists, posts };
  }

  it('reparte el excedente en ≥1 gist de overflow y el round-trip reconstruye todo sin pérdida', async () => {
    const { posts } = stubMultiGistStore();
    const data = makeData(7000); // suficientes chunks para superar el presupuesto del gist principal

    await writeGist(TOKEN, MAIN_ID, data);
    expect(posts.length).toBeGreaterThanOrEqual(1); // se creó al menos un gist de overflow

    const read = await readGist(TOKEN, MAIN_ID);
    expect(totalGames(read.data as TabData)).toBe(totalGames(data));
  });

  it('reutiliza el gist de overflow existente en una segunda escritura (no crea uno nuevo)', async () => {
    const { posts } = stubMultiGistStore();
    const data = makeData(7000);

    await writeGist(TOKEN, MAIN_ID, data);
    const afterFirst = posts.length;
    await writeGist(TOKEN, MAIN_ID, { ...data, updatedAt: 2 });
    expect(posts.length).toBe(afterFirst); // sin nuevos POST: reutiliza el del manifiesto
  });
});
