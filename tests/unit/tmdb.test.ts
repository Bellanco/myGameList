// `functions/_lib/tmdb.ts` y los dos endpoints que tiran de él: `/poster` (sirve la imagen elegida) y
// `/api/tmdb-search` (la búsqueda del panel, solo para el administrador).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aCandidato, buscarEnTmdb, esRutaDeImagenTmdb, urlDeImagenTmdb } from '../../functions/_lib/tmdb';

const requireAdminMock = vi.fn();
vi.mock('../../functions/_lib/context', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

const { onRequestGet: poster } = await import('../../functions/poster');
const { onRequestGet: buscar } = await import('../../functions/api/tmdb-search');

const RUTA = '/tNQWO6cNzQYCyvw36mUcAQQyf5F.jpg';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('esRutaDeImagenTmdb', () => {
  // Es lo que impide que `/poster` sea un proxy abierto: solo rutas con forma de imagen de TMDB.
  it('acepta las rutas de TMDB y nada más', () => {
    expect(esRutaDeImagenTmdb(RUTA)).toBe(true);
    expect(esRutaDeImagenTmdb('/abc.jpg')).toBe(false);
    expect(esRutaDeImagenTmdb('https://evil.example/x.jpg')).toBe(false);
    expect(esRutaDeImagenTmdb('/../../etc/passwd.jpg')).toBe(false);
    expect(esRutaDeImagenTmdb(`${RUTA}?x=1`)).toBe(false);
    expect(esRutaDeImagenTmdb(null)).toBe(false);
  });

  it('pide a image.tmdb.org con el tamaño de cada densidad', () => {
    expect(urlDeImagenTmdb(RUTA, 'normal')).toBe(`https://image.tmdb.org/t/p/w342${RUTA}`);
    expect(urlDeImagenTmdb(RUTA, 'medio')).toBe(`https://image.tmdb.org/t/p/w500${RUTA}`);
  });
});

describe('aCandidato', () => {
  it('una serie, con su año y su título original cuando difiere', () => {
    expect(
      aCandidato(
        { id: 71446, media_type: 'tv', name: 'La casa de papel', original_name: 'La casa de papel', first_air_date: '2017-05-02', poster_path: RUTA },
        'screen',
      ),
    ).toEqual({ kind: 'tv', id: 71446, title: 'La casa de papel', year: '2017', path: RUTA });

    expect(
      aCandidato(
        { id: 950387, media_type: 'movie', title: 'Una película de Minecraft', original_title: 'A Minecraft Movie', release_date: '2025-03-31', poster_path: RUTA },
        'screen',
      ),
    ).toEqual({ kind: 'movie', id: 950387, title: 'Una película de Minecraft', originalTitle: 'A Minecraft Movie', year: '2025', path: RUTA });
  });

  // Los homónimos se distinguen por aquello por lo que se les conoce: dos «Troy Baker» en TMDB.
  it('una persona, con su foto y por qué se la conoce', () => {
    expect(
      aCandidato({ id: 1, name: 'Troy Baker', profile_path: RUTA, known_for: [{ title: 'A' }, { name: 'B' }, { title: 'C' }, { title: 'D' }] }, 'person'),
    ).toEqual({ kind: 'person', id: 1, title: 'Troy Baker', path: RUTA, knownFor: ['A', 'B', 'C'] });
  });

  it('sin imagen, o de un tipo que no toca, no es candidato', () => {
    expect(aCandidato({ id: 2, media_type: 'tv', name: 'Sin póster', poster_path: null }, 'screen')).toBeNull();
    expect(aCandidato({ id: 3, media_type: 'person', name: 'J. Arcane', profile_path: RUTA }, 'screen')).toBeNull();
  });
});

describe('buscarEnTmdb', () => {
  it('busca en español, con el token en la cabecera, y devuelve solo los candidatos con imagen', async () => {
    const pedir = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ id: 1, media_type: 'tv', name: 'Arcane', poster_path: RUTA }, { id: 2, media_type: 'movie', title: 'Sin', poster_path: null }] })),
    );
    const candidatos = await buscarEnTmdb('tok', 'Arcane', 'screen', pedir as unknown as typeof fetch);

    expect(candidatos).toEqual([{ kind: 'tv', id: 1, title: 'Arcane', path: RUTA }]);
    const [url, opciones] = pedir.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://api.themoviedb.org/3/search/multi?');
    expect(url).toContain('language=es-ES');
    expect(url).toContain('include_adult=false');
    expect((opciones.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('las personas van por su propia búsqueda', async () => {
    const pedir = vi.fn(async () => new Response(JSON.stringify({ results: [] })));
    await buscarEnTmdb('tok', 'Troy Baker', 'person', pedir as unknown as typeof fetch);
    expect(String((pedir.mock.calls[0] as unknown[])[0])).toContain('/3/search/person?');
  });

  // «No se ha podido preguntar» no es «no hay resultados»: el panel lo dice distinto.
  it('con TMDB caído devuelve null, no una lista vacía', async () => {
    const pedir = vi.fn(async () => new Response('no', { status: 401 }));
    expect(await buscarEnTmdb('tok', 'x', 'screen', pedir as unknown as typeof fetch)).toBeNull();
  });
});

describe('/poster', () => {
  const pedir = (consulta: string) => poster({ request: new Request(`https://mygamelist.pages.dev/poster?${consulta}`) });

  it('rechaza lo que no es una ruta de TMDB sin salir a la red', async () => {
    const fetchSimulado = vi.fn();
    vi.stubGlobal('fetch', fetchSimulado);
    expect((await pedir('p=https://evil.example/x.jpg')).status).toBe(400);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('sirve los bytes desde este dominio, inmutables un año', async () => {
    const fetchSimulado = vi.fn(async () => new Response('JPEG', { headers: { 'Content-Type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchSimulado);

    const respuesta = await pedir(`p=${encodeURIComponent(RUTA)}&s=medio`);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe('JPEG');
    expect(respuesta.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(String((fetchSimulado.mock.calls[0] as unknown[])[0])).toBe(`https://image.tmdb.org/t/p/w500${RUTA}`);
  });

  it('un fallo de TMDB no se guarda', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const respuesta = await pedir(`p=${encodeURIComponent(RUTA)}`);
    expect(respuesta.status).toBe(502);
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('/api/tmdb-search', () => {
  const peticion = (consulta: string) => new Request(`https://mygamelist.pages.dev/api/tmdb-search?${consulta}`);

  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue({ user: {}, isAdmin: true });
  });

  // Cada búsqueda gasta de la clave de la aplicación: abierta a cualquiera sería un proxy gratis a TMDB.
  it('solo el administrador', async () => {
    requireAdminMock.mockResolvedValue(new Response('Solo el administrador', { status: 403 }));
    const fetchSimulado = vi.fn();
    vi.stubGlobal('fetch', fetchSimulado);

    const respuesta = await buscar({ request: peticion('q=Arcane'), env: { TMDB_READ_TOKEN: 'tok' } as never });
    expect(respuesta.status).toBe(403);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it('sin token configurado, 501', async () => {
    const respuesta = await buscar({ request: peticion('q=Arcane'), env: {} as never });
    expect(respuesta.status).toBe(501);
  });

  it('sin nada que buscar, 400', async () => {
    const respuesta = await buscar({ request: peticion('q=%20'), env: { TMDB_READ_TOKEN: 'tok' } as never });
    expect(respuesta.status).toBe(400);
  });

  it('devuelve los candidatos, y el token no sale en la respuesta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ results: [{ id: 1, name: 'Troy Baker', profile_path: RUTA }] }))),
    );
    const respuesta = await buscar({ request: peticion('q=Troy%20Baker&k=person'), env: { TMDB_READ_TOKEN: 'secreto-tmdb' } as never });
    const texto = await respuesta.text();

    expect(respuesta.status).toBe(200);
    expect(JSON.parse(texto)).toEqual({ results: [{ kind: 'person', id: 1, title: 'Troy Baker', path: RUTA }] });
    expect(texto).not.toContain('secreto-tmdb');
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store');
  });

  it('con TMDB caído, 503 y no una lista vacía', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    const respuesta = await buscar({ request: peticion('q=Arcane'), env: { TMDB_READ_TOKEN: 'tok' } as never });
    expect(respuesta.status).toBe(503);
  });
});
