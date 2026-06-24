import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENABLE_GAMES_WRAPPER_WRITE, readGist, writeGist } from '../../src/model/repository/gistRepository';
import type { GameItem, TabData } from '../../src/model/types/game';

// Token/gistId con formato válido (ver isValidGithubToken/isValidGistId en core/security/sanitize).
const TOKEN = 'ghp_0123456789abcdefghij';
const GIST_ID = 'abc12345';
const GIST_FILENAME = 'myGames.json';

function makeGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    id: 1,
    _ts: 1000,
    name: 'Test',
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: true,
    review: 'una reseña',
    score: 4,
    years: [2025],
    hours: 12,
    retry: false,
    replayable: false,
    ...overrides,
  };
}

/**
 * Mockea `fetch` con un gist en memoria: PATCH fusiona ficheros (null borra) y GET devuelve el estado actual.
 * Reproduce el contrato mínimo que `writeGist` (PATCH, + GET previo para limpiar chunks obsoletos) y `readGist`
 * (GET) esperan de la API de gists.
 */
function stubGistStore(initialFiles: Record<string, { content: string }> = {}) {
  const store: Record<string, { content: string }> = { ...initialFiles };
  const patchBodies: Array<{ files: Record<string, { content: string } | null> }> = [];

  const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const headers = { etag: 'W/"etag-1"' };
    if (method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { files: Record<string, { content: string } | null> };
      patchBodies.push(body);
      for (const [name, file] of Object.entries(body.files)) {
        if (file === null) delete store[name];
        else store[name] = file;
      }
      return new Response(JSON.stringify({ updated_at: '2026-06-21T12:00:00Z' }), { status: 200, headers });
    }
    return new Response(JSON.stringify({ files: store }), { status: 200, headers });
  });

  vi.stubGlobal('fetch', fetchMock);
  return { store, patchBodies };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe.skipIf(!ENABLE_GAMES_WRAPPER_WRITE)('writeGist con ENABLE_GAMES_WRAPPER_WRITE activo (formato v4)', () => {
  it('emite el envoltorio GamesMainFile v4 (fileType/schemaVersion) en el PATCH', async () => {
    const { patchBodies } = stubGistStore();
    const data: TabData = {
      c: [makeGame({ id: 1, name: 'Juego C' })],
      v: [makeGame({ id: 2, name: 'Juego V', score: undefined })],
      e: [],
      p: [],
      deleted: [{ id: 9, _ts: 500, deletedAt: 500 }],
      updatedAt: 1234,
    };

    await writeGist(TOKEN, GIST_ID, data);

    const lastPatch = patchBodies[patchBodies.length - 1];
    const anchorContent = (lastPatch.files[GIST_FILENAME] as { content: string }).content;
    const anchor = JSON.parse(anchorContent) as Record<string, unknown>;
    expect(anchor.fileType).toBe('games-main');
    expect(anchor.schemaVersion).toBe(4);
    expect(anchor).toHaveProperty('games');
    expect(anchor).toHaveProperty('dictionaries');
    // El fichero NO debe ser ya el formato plano antiguo.
    expect(anchor).not.toHaveProperty('c');
    expect(anchor).not.toHaveProperty('v');
  });

  it('round-trip writeGist → readGist reconstruye el TabData sin pérdida y NO marca wasLegacy', async () => {
    stubGistStore();
    const data: TabData = {
      c: [makeGame({ id: 1, name: 'Hollow Knight', genres: ['Metroidvania'], score: 5 })],
      v: [makeGame({ id: 2, name: 'Celeste', platforms: ['Switch'], score: 5, retry: true })],
      e: [makeGame({ id: 3, name: 'En curso' })],
      p: [makeGame({ id: 4, name: 'Pendiente', score: undefined })],
      deleted: [{ id: 9, _ts: 500, deletedAt: 500 }],
      updatedAt: 4321,
    };

    await writeGist(TOKEN, GIST_ID, data);
    const read = await readGist(TOKEN, GIST_ID);
    const out = read.data as TabData;

    const ids = (arr: GameItem[]) => arr.map((g) => g.id);
    expect(ids(out.c)).toEqual([1]);
    expect(ids(out.v)).toEqual([2]);
    expect(ids(out.e)).toEqual([3]);
    expect(ids(out.p)).toEqual([4]);
    expect(out.c[0].name).toBe('Hollow Knight');
    expect(out.c[0].genres).toEqual(['Metroidvania']);
    expect(out.c[0].score).toBe(5);
    expect(out.v[0].name).toBe('Celeste');
    expect(out.v[0].platforms).toEqual(['Switch']);
    expect(out.v[0].retry).toBe(true);
    expect(out.deleted.map((d) => d.id)).toContain(9);

    // El gist ya está en v4 → no debe pedir un re-upgrade espurio en el siguiente sync.
    expect(read.wasLegacy).toBe(false);
  });
});
