// La búsqueda de carátulas del panel de premios: `buscarCandidatos` (`functions/_lib/igdbCover.ts`) y el endpoint
// que la sirve, `/api/igdb-search`, solo para el administrador.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buscarCandidatos, claveCache, type FichaIgdb } from '../../functions/_lib/igdbCover';

const requireAdminMock = vi.fn();
vi.mock('../../functions/_lib/context', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

const { onRequestGet: buscar } = await import('../../functions/api/igdb-search');

const OCARINA = 'The Legend of Zelda: Ocarina of Time';

/** IGDB devuelve estas fichas a cualquier consulta. El token ya está en KV, así que no se pasa por Twitch. */
function igdbResponde(fichas: Partial<FichaIgdb>[], status = 200) {
  const llamada = vi.fn(async () => new Response(JSON.stringify(fichas), { status }));
  vi.stubGlobal('fetch', llamada);
  return llamada;
}

function kv(extra: Record<string, string> = {}) {
  const datos = new Map(Object.entries({ 'igdb:token:v1': 'token', ...extra }));
  return { get: async (clave: string) => datos.get(clave) ?? null, put: async () => {} };
}

function entorno(extra: Record<string, string> = {}) {
  return { IGDB_CLIENT_ID: 'id-publico', IGDB_CLIENT_SECRET: 'secreto', COVERS: kv(extra) } as never;
}

const n64 = {
  id: 1029,
  name: OCARINA,
  game_type: 0,
  total_rating_count: 2176,
  first_release_date: 912_000_000, // 1998
  cover: { image_id: 'co3nnx' },
  platforms: [{ abbreviation: 'N64' }],
};
const remake = {
  id: 9999,
  name: OCARINA,
  game_type: 8,
  total_rating_count: 0,
  first_release_date: 1_790_000_000, // 2026
  cover: { image_id: 'cocv5r' },
  platforms: [{ abbreviation: 'Switch 2' }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buscarCandidatos', () => {
  it('enseña los homónimos con su año, sus plataformas y su tipo, sin repetir fichas', async () => {
    igdbResponde([n64, remake]);
    const candidatos = await buscarCandidatos(entorno(), OCARINA);

    expect(candidatos).toEqual([
      { id: 1029, name: OCARINA, coverId: 'co3nnx', year: '1998', platforms: ['N64'], gameType: 0 },
      { id: 9999, name: OCARINA, coverId: 'cocv5r', year: '2026', platforms: ['Switch 2'], gameType: 8 },
    ]);
  });

  // Solo lo que se puede elegir: sin carátula no hay nada que pintar, y los DLC y packs solo estorban.
  it('deja fuera lo que no tiene carátula y los DLC', async () => {
    igdbResponde([
      { ...remake, id: 1, cover: undefined },
      { ...remake, id: 2, game_type: 1 },
      n64,
    ]);
    expect((await buscarCandidatos(entorno(), OCARINA))?.map((c) => c.id)).toEqual([1029]);
  });

  it('primero lo que más se parece al nombre buscado', async () => {
    igdbResponde([{ ...n64, id: 5, name: 'Ocarina of Time Redux', total_rating_count: 9000 }, remake]);
    expect((await buscarCandidatos(entorno(), OCARINA))?.[0].id).toBe(9999);
  });

  it('con IGDB caído devuelve null, no una lista vacía', async () => {
    vi.useFakeTimers();
    igdbResponde([], 503);
    const pendiente = buscarCandidatos(entorno(), OCARINA);
    await vi.runAllTimersAsync();
    expect(await pendiente).toBeNull();
    vi.useRealTimers();
  });
});

describe('/api/igdb-search', () => {
  const peticion = (consulta: string) => new Request(`https://mygamelist.pages.dev/api/igdb-search?${consulta}`);

  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ user: {}, isAdmin: true });
  });

  // Cada búsqueda son dos consultas con las credenciales de la aplicación: abierta, sería un proxy gratis a IGDB.
  it('solo el administrador', async () => {
    requireAdminMock.mockResolvedValue(new Response('Solo el administrador', { status: 403 }));
    const llamada = igdbResponde([n64]);

    const respuesta = await buscar({ request: peticion('q=Ocarina'), env: entorno() });
    expect(respuesta.status).toBe(403);
    expect(llamada).not.toHaveBeenCalled();
  });

  it('sin credenciales configuradas, 501', async () => {
    const respuesta = await buscar({ request: peticion('q=Ocarina'), env: { COVERS: kv() } as never });
    expect(respuesta.status).toBe(501);
  });

  it('sin nada que buscar, 400', async () => {
    const respuesta = await buscar({ request: peticion('q=%20'), env: entorno() });
    expect(respuesta.status).toBe(400);
  });

  // Con la automática marcada se ve de un vistazo si hay que cambiarla: es la de ese nombre sin plataformas.
  it('devuelve los candidatos y cuál es la automática, sin que salga el secreto', async () => {
    igdbResponde([n64, remake]);
    const env = entorno({ [claveCache(OCARINA, [])]: 'co3nnx' });
    const respuesta = await buscar({ request: peticion(`q=${encodeURIComponent(OCARINA)}`), env });
    const texto = await respuesta.text();

    expect(respuesta.status).toBe(200);
    const cuerpo = JSON.parse(texto) as { results: { id: number }[]; automatic: string | null };
    expect(cuerpo.results.map((c) => c.id)).toEqual([1029, 9999]);
    expect(cuerpo.automatic).toBe('co3nnx');
    expect(texto).not.toContain('secreto');
  });

  it('con IGDB caído, 503 y no una lista vacía', async () => {
    vi.useFakeTimers();
    igdbResponde([], 503);
    const pendiente = buscar({ request: peticion('q=Ocarina'), env: entorno() });
    await vi.runAllTimersAsync();
    expect((await pendiente).status).toBe(503);
    vi.useRealTimers();
  });
});
