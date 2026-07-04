import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ENABLE_GAMES_COMPRESSION,
  readForeignGamesGist,
  readGist,
  writeGist,
} from '../../src/model/repository/gistRepository';
import { decodeGistContent, encodeCompressed, isCompressedEnvelope } from '../../src/core/utils/gistCompression';
import type { GameItem, TabData } from '../../src/model/types/game';

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

/**
 * Comprime en sitio cada fichero del store (simula un gist escrito por un cliente con compresión activa).
 * Idempotente: si `writeGist` ya lo comprimió (flag ON), no vuelve a envolver → funciona con el flag en cualquier estado.
 */
async function compressStore(store: Record<string, { content: string }>): Promise<void> {
  for (const name of Object.keys(store)) {
    if (isCompressedEnvelope(JSON.parse(store[name].content))) continue;
    store[name] = { content: await encodeCompressed('games', store[name].content) };
  }
}

const ids = (arr: GameItem[]) => arr.map((g) => g.id);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// LECTURA de gists comprimidos: activa SIEMPRE (Fase 1), independiente del flag de escritura. Verifica que un gist
// escrito por un cliente con compresión se lee sin pérdida por cualquier cliente con este código.
describe('lectura retrocompatible de gists comprimidos', () => {
  const data: TabData = {
    c: [makeGame({ id: 1, name: 'Hollow Knight', genres: ['Metroidvania'], platforms: ['PC', 'Switch'], score: 5, review: 'obra maestra' })],
    v: [makeGame({ id: 2, name: 'Celeste', platforms: ['Switch'], score: 5, retry: true })],
    e: [makeGame({ id: 3, name: 'En curso' })],
    p: [makeGame({ id: 4, name: 'Pendiente', score: undefined })],
    deleted: [{ id: 9, _ts: 500, deletedAt: 500 }],
    updatedAt: 4321,
  };

  it('readGist descomprime el sobre `enc` y reconstruye el TabData sin pérdida', async () => {
    const { store } = stubGistStore();
    await writeGist(TOKEN, GIST_ID, data); // escribe v4 (plano si el flag está OFF)
    await compressStore(store); // ahora el gist queda comprimido, como lo dejaría un cliente con el flag ON
    expect(isCompressedEnvelope(JSON.parse(store[GIST_FILENAME].content))).toBe(true);

    const read = await readGist(TOKEN, GIST_ID);
    const out = read.data as TabData;
    expect(ids(out.c)).toEqual([1]);
    expect(ids(out.v)).toEqual([2]);
    expect(ids(out.e)).toEqual([3]);
    expect(ids(out.p)).toEqual([4]);
    expect(out.c[0].name).toBe('Hollow Knight');
    expect(out.c[0].genres).toEqual(['Metroidvania']);
    expect(out.c[0].review).toBe('obra maestra');
    expect(out.v[0].retry).toBe(true);
    expect(out.deleted.map((d) => d.id)).toContain(9);
  });

  it('lee sin pérdida un gist comprimido CON chunks de overflow en el mismo gist', async () => {
    const { store } = stubGistStore();
    // Dataset grande → fuerza main + varios ficheros chunk.
    const review = 'x'.repeat(900);
    const c: GameItem[] = [];
    for (let i = 1; i <= 2500; i += 1) c.push(makeGame({ id: i, name: `Juego ${i}`, review }));
    const big: TabData = { c, v: [], e: [], p: [], deleted: [], updatedAt: 1 };

    await writeGist(TOKEN, GIST_ID, big);
    const chunkFiles = Object.keys(store).filter((n) => /^myGames-chunk-.+\.json$/.test(n));
    expect(chunkFiles.length).toBeGreaterThanOrEqual(1); // hay chunking real
    await compressStore(store);

    const read = await readGist(TOKEN, GIST_ID);
    const out = read.data as TabData;
    expect(out.c.length).toBe(2500);
    expect(out.c.find((g) => g.id === 2500)?.name).toBe('Juego 2500');
  });

  it('readForeignGamesGist también descomprime (lectura del gist de un amigo)', async () => {
    const { store } = stubGistStore();
    await writeGist(TOKEN, GIST_ID, data);
    await compressStore(store);

    const read = await readForeignGamesGist(TOKEN, GIST_ID);
    const out = read.data as TabData;
    expect(ids(out.c)).toEqual([1]);
    expect(out.c[0].name).toBe('Hollow Knight');
  });

  it('un `enc` DESCONOCIDO (formato futuro) no rompe: se trata como no-legible, no lanza', async () => {
    stubGistStore({
      [GIST_FILENAME]: { content: JSON.stringify({ fileType: 'games', schemaVersion: 99, enc: 'zstd+b64', payload: 'AAAA' }) },
    });
    const read = await readGist(TOKEN, GIST_ID);
    const out = read.data as TabData;
    // No lanza y no inventa juegos: al no reconocer el `enc`, el contenido no es un TabData → listas vacías.
    expect(out.c.length + out.v.length + out.e.length + out.p.length).toBe(0);
  });

  it('reporta el ratio de compresión sobre un dataset v4 realista', async () => {
    const { store } = stubGistStore();
    const c: GameItem[] = [];
    for (let i = 1; i <= 1500; i += 1) {
      c.push(makeGame({
        id: i,
        name: `Juego ${i}`,
        genres: ['acción', 'aventura', 'rpg'],
        platforms: ['PC', 'PS5', 'Switch'],
        strengths: ['jugabilidad', 'banda sonora'],
        review: 'Una reseña de longitud media con vocabulario repetido entre juegos.',
      }));
    }
    await writeGist(TOKEN, GIST_ID, { c, v: [], e: [], p: [], deleted: [], updatedAt: 1 });

    // Flag-independiente: normaliza cada fichero a JSON plano (por si el flag ya comprimió) y compara con su forma
    // comprimida. Así el ratio mide siempre plano-vs-comprimido, esté el flag ON u OFF.
    const bytes = (s: string) => new TextEncoder().encode(s).length;
    let plainBytes = 0;
    let compressedBytes = 0;
    for (const f of Object.values(store)) {
      const plain = (await decodeGistContent(f.content)).content;
      plainBytes += bytes(plain);
      compressedBytes += bytes(await encodeCompressed('games', plain));
    }
    const ratio = compressedBytes / plainBytes;
    // eslint-disable-next-line no-console
    console.log(`[compresión] v4 plano ${Math.round(plainBytes / 1024)} KB → comprimido ${Math.round(compressedBytes / 1024)} KB (${Math.round(ratio * 100)}% del original)`);
    expect(ratio).toBeLessThan(0.5); // al menos 50% de ahorro sobre datos repetitivos

    // Y sigue leyéndose sin pérdida tras comprimir.
    const read = await readGist(TOKEN, GIST_ID);
    expect((read.data as TabData).c.length).toBe(1500);
  });
});

// ESCRITURA comprimida: solo corre cuando el flag está activo (patrón `describe.skipIf` como el cutover v4).
// Documenta y valida el comportamiento del cutover; con el flag OFF se salta.
describe.skipIf(!ENABLE_GAMES_COMPRESSION)('escritura comprimida (ENABLE_GAMES_COMPRESSION activo)', () => {
  it('el PATCH lleva el sobre `enc` y el round-trip write→read es idempotente y sin pérdida', async () => {
    const { store, patchBodies } = stubGistStore();
    const data: TabData = {
      c: [makeGame({ id: 1, name: 'Hollow Knight', score: 5 })],
      v: [makeGame({ id: 2, name: 'Celeste', retry: true })],
      e: [],
      p: [],
      deleted: [{ id: 9, _ts: 500, deletedAt: 500 }],
      updatedAt: 1,
    };

    await writeGist(TOKEN, GIST_ID, data);
    const anchorContent = (patchBodies[patchBodies.length - 1].files[GIST_FILENAME] as { content: string }).content;
    expect(isCompressedEnvelope(JSON.parse(anchorContent))).toBe(true);
    expect(store[GIST_FILENAME].content).toContain('"enc"');

    const read = await readGist(TOKEN, GIST_ID);
    const out = read.data as TabData;
    expect(ids(out.c)).toEqual([1]);
    expect(out.c[0].name).toBe('Hollow Knight');
    expect(out.v[0].retry).toBe(true);
    expect(read.wasLegacy).toBe(false); // ya comprimido → no pide re-upgrade
  });
});
