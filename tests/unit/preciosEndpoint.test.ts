// `/api/precios` — los precios de IsThereAnyDeal (P1 del plan de la ficha y los precios, `functions/api/precios.ts` y
// `functions/_lib/itad.ts`). Lo que sujeta cada bloque: que lo que llega de ITAD se lea bien y no se reescriba, que la
// caché del borde ahorre llamadas con el plazo de cada rango, que un ITAD caído no rompa nada y que los topes se
// apliquen por rango. Ninguna llamada sale a la red: `fetch` va sustituido por un ITAD de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizarPrecio,
  normalizarTitulo,
  packsPorJuego,
  resolverPrecios,
  varianteNumerica,
  type CacheItad,
} from '../../functions/_lib/itad';
import { PROFILE_TIER_PRICE_REQUESTS_PER_HOUR, PROFILE_TIER_PRICE_TTL_MS, type ProfileTier } from '../../src/core/constants/tiers';

const requireUserMock = vi.fn();
const rangoMock = vi.fn<() => ProfileTier>(() => 'bronze');
vi.mock('../../functions/_lib/context', () => ({
  requireUser: (...args: unknown[]) => requireUserMock(...args),
}));
vi.mock('../../functions/_lib/quota', () => ({
  readProfileFacts: async () => ({ tier: rangoMock(), nick: '' }),
}));

const { onRequestPost, leerTitulos, reiniciarTopesParaTests, MAX_TITULOS } = await import('../../functions/api/precios');

const HORA = 60 * 60 * 1000;

// ─── Un ITAD de mentira ──────────────────────────────────────────────────────────────────────────────────────────

const IDS: Record<string, string> = { 'Hollow Knight: Silksong': 'id-silk', 'Hades II': 'id-hades', Celeste: 'id-celeste' };

function itadFalso(opciones: { estado?: number; retryAfter?: string } = {}) {
  const llamadas: string[] = [];
  const fetchMock = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    llamadas.push(url.pathname);
    if (opciones.estado) {
      return new Response('{}', { status: opciones.estado, headers: opciones.retryAfter ? { 'Retry-After': opciones.retryAfter } : {} });
    }
    const cuerpo = JSON.parse(String(init?.body)) as string[];
    if (url.pathname === '/lookup/id/title/v1') {
      return Response.json(Object.fromEntries(cuerpo.map((titulo) => [titulo, IDS[titulo] ?? null])));
    }
    if (url.pathname === '/games/prices/v3') {
      return Response.json(cuerpo.map((id) => ({
        id,
        historyLow: { all: { amount: 5 }, y1: { amount: 7 }, m3: { amount: 9 } },
        deals: [
          { shop: { name: 'Steam' }, price: { amount: 19.5 }, regular: { amount: 19.5 }, cut: 0, url: `https://itad.link/steam/${id}` },
          { shop: { name: 'PlayerLand' }, price: { amount: 14.99 }, regular: { amount: 19.99 }, cut: 25, expiry: '2026-10-20T10:00:00+02:00', url: `https://itad.link/pl/${id}` },
          { shop: { name: 'GOG' }, price: { amount: 19.5 }, regular: { amount: 19.5 }, cut: 0, url: `https://itad.link/gog/${id}` },
          { shop: { name: 'Steam' }, price: { amount: 25 }, regular: { amount: 25 }, cut: 0, url: `https://itad.link/steam2/${id}` },
          { shop: { name: 'Epic' }, price: { amount: 22 }, regular: { amount: 22 }, cut: 0, url: `https://itad.link/epic/${id}` },
        ],
      })));
    }
    if (url.pathname === '/games/overview/v2') {
      return Response.json({
        prices: cuerpo.map((id) => ({ id, lowest: { price: { amount: 4.5 }, timestamp: '2026-06-11T15:35:29+02:00' }, urls: { game: `https://isthereanydeal.com/game/id:${id}/` } })),
        bundles: [{ title: 'Pack indie', url: 'https://itad.link/bundle', expiry: null, tiers: [{ games: [{ id: 'id-celeste' }] }] }],
      });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return llamadas;
}

/** Una caché en memoria con la misma forma que la del borde, con la hora a mano. */
function cacheEnMemoria(): CacheItad & { datos: Map<string, { valor: unknown; guardadoEn: number }> } {
  const datos = new Map<string, { valor: unknown; guardadoEn: number }>();
  return {
    datos,
    async leer<T>(clave: string) {
      const guardado = datos.get(clave);
      return guardado ? { valor: guardado.valor as T, guardadoEn: guardado.guardadoEn } : null;
    },
    async guardar(clave: string, valor: unknown, _segundos: number, ahora: number) {
      datos.set(clave, { valor, guardadoEn: ahora });
    },
  };
}

const sinTope = { tomar: () => true };

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Lo puro ─────────────────────────────────────────────────────────────────────────────────────────────────────

describe('varianteNumerica y normalizarTitulo', () => {
  it('pasa los romanos a arábigos y, si no hay, los arábigos a romanos; el 1 y el I no se tocan', () => {
    expect(varianteNumerica('The Witcher III: Wild Hunt')).toBe('The Witcher 3: Wild Hunt');
    expect(varianteNumerica('Hades 2')).toBe('Hades II');
    expect(varianteNumerica('Devil May Cry V')).toBe('Devil May Cry 5');
    expect(varianteNumerica('Celeste')).toBeNull();
    expect(varianteNumerica('I Am Setsuna')).toBeNull();
  });

  it('la clave de caché no distingue mayúsculas ni espacios de más', () => {
    expect(normalizarTitulo('  Hollow  Knight ')).toBe(normalizarTitulo('hollow knight'));
  });
});

describe('normalizarPrecio', () => {
  const crudo = {
    id: 'x',
    historyLow: { all: { amount: 5 }, y1: { amount: 7 }, m3: null },
    deals: [
      { shop: { name: 'Steam' }, price: { amount: 19.5 }, regular: { amount: 19.5 }, cut: 0, url: 'https://itad.link/a?x=1' },
      { shop: { name: 'PlayerLand' }, price: { amount: 14.99 }, regular: { amount: 19.99 }, cut: 25, url: 'https://itad.link/b' },
      { shop: { name: 'Steam' }, price: { amount: 30 }, url: 'https://itad.link/c' },
      { shop: { name: 'GOG' }, price: { amount: 18 }, url: 'https://itad.link/d' },
      { shop: { name: 'Epic' }, price: { amount: 21 }, url: 'https://itad.link/e' },
    ],
  };

  it('la mejor es la más barata, las otras son las dos siguientes, una por tienda, y nada se reescribe', () => {
    const precio = normalizarPrecio('Juego', 'x', crudo, undefined, []);
    expect(precio.mejor).toEqual({ tienda: 'PlayerLand', precio: 14.99, normal: 19.99, descuento: 25, hasta: null, url: 'https://itad.link/b' });
    expect(precio.otras.map((oferta) => oferta.tienda)).toEqual(['GOG', 'Steam']);
    expect(precio.otras[1].url).toBe('https://itad.link/a?x=1');
  });

  it('el mínimo histórico lleva su fecha si llega el resumen; si no, sale sin fecha', () => {
    const conResumen = normalizarPrecio('Juego', 'x', crudo, { id: 'x', lowest: { price: { amount: 4 }, timestamp: '2026-06-11T15:35:29+02:00' }, urls: { game: 'https://isthereanydeal.com/game/id:x/' } }, []);
    expect(conResumen.minimos).toEqual({ historico: { precio: 4, fecha: '2026-06-11T15:35:29+02:00' }, anio: 7, tresMeses: null });
    expect(conResumen.urlFicha).toBe('https://isthereanydeal.com/game/id:x/');
    expect(normalizarPrecio('Juego', 'x', crudo, undefined, []).minimos.historico).toEqual({ precio: 5, fecha: null });
  });

  it('sin ofertas, no hay mejor: el juego existe pero ninguna tienda lo vende', () => {
    expect(normalizarPrecio('Juego', 'x', { id: 'x', deals: [] }, undefined, []).mejor).toBeNull();
  });

  it('los packs se reparten por juego, sin repetir un juego dentro del mismo pack', () => {
    const porJuego = packsPorJuego([
      { title: 'Pack', url: 'https://itad.link/p', tiers: [{ games: [{ id: 'a' }, { id: 'b' }] }, { games: [{ id: 'a' }] }] },
      { title: 'Sin url', tiers: [{ games: [{ id: 'a' }] }] },
    ]);
    expect(porJuego.get('a')).toEqual([{ titulo: 'Pack', url: 'https://itad.link/p', expira: null }]);
    expect(porJuego.get('b')).toHaveLength(1);
  });
});

// ─── La caché y los plazos ───────────────────────────────────────────────────────────────────────────────────────

describe('resolverPrecios', () => {
  const ahora = Date.UTC(2026, 9, 16, 12);

  it('pide lo que falta, con la segunda pasada, y lo guarda; la segunda vez no llama a ITAD', async () => {
    const llamadas = itadFalso();
    const cache = cacheEnMemoria();
    const primera = await resolverPrecios(['Hollow Knight: Silksong', 'Hades 2', 'Desconocido'], { clave: 'k', plazoMs: HORA, cache, presupuesto: sinTope, ahora });
    expect(primera.preguntoAItad).toBe(true);
    expect(primera.juegos['Hades 2']?.titulo).toBe('Hades II');
    expect(primera.juegos.Desconocido).toBeNull();
    expect(primera.juegos['Hollow Knight: Silksong']?.mejor?.tienda).toBe('PlayerLand');
    expect(llamadas).toEqual(['/lookup/id/title/v1', '/lookup/id/title/v1', '/games/prices/v3', '/games/overview/v2']);

    llamadas.length = 0;
    const segunda = await resolverPrecios(['Hollow Knight: Silksong', 'Hades 2', 'Desconocido'], { clave: 'k', plazoMs: HORA, cache, presupuesto: sinTope, ahora: ahora + 10 * 60 * 1000 });
    expect(segunda.preguntoAItad).toBe(false);
    expect(llamadas).toEqual([]);
    expect(segunda.juegos['Hades 2']?.titulo).toBe('Hades II');
  });

  it('el plazo es el de quien pide: a bronce le vale un precio de hace 15 h y a mithril no', async () => {
    const llamadas = itadFalso();
    const cache = cacheEnMemoria();
    await resolverPrecios(['Celeste'], { clave: 'k', plazoMs: HORA, cache, presupuesto: sinTope, ahora });
    llamadas.length = 0;
    const despues = ahora + 15 * HORA;
    await resolverPrecios(['Celeste'], { clave: 'k', plazoMs: PROFILE_TIER_PRICE_TTL_MS.bronze, cache, presupuesto: sinTope, ahora: despues });
    expect(llamadas).toEqual([]);
    await resolverPrecios(['Celeste'], { clave: 'k', plazoMs: PROFILE_TIER_PRICE_TTL_MS.mithril, cache, presupuesto: sinTope, ahora: despues });
    expect(llamadas).toEqual(['/games/prices/v3', '/games/overview/v2']);
  });

  it('con ITAD caído, lo guardado vale aunque sea viejo, y se avisa del fallo', async () => {
    itadFalso();
    const cache = cacheEnMemoria();
    await resolverPrecios(['Celeste'], { clave: 'k', plazoMs: HORA, cache, presupuesto: sinTope, ahora });
    itadFalso({ estado: 503, retryAfter: '600' });
    const caido = await resolverPrecios(['Celeste', 'Hades II'], { clave: 'k', plazoMs: HORA, cache, presupuesto: sinTope, ahora: ahora + 5 * HORA });
    expect(caido.fallo?.name).toBe('ItadNoDisponible');
    expect(caido.juegos.Celeste?.mejor?.precio).toBe(14.99);
    expect(caido.juegos['Hades II']).toBeNull();
  });

  it('los packs llegan con el precio, sin una llamada más', async () => {
    itadFalso();
    const { juegos } = await resolverPrecios(['Celeste'], { clave: 'k', plazoMs: HORA, cache: cacheEnMemoria(), presupuesto: sinTope, ahora });
    expect(juegos.Celeste?.bundles).toEqual([{ titulo: 'Pack indie', url: 'https://itad.link/bundle', expira: null }]);
  });

  it('sin presupuesto por minuto no llama a ITAD y lo dice como falta de cupo', async () => {
    const llamadas = itadFalso();
    const sinCupo = await resolverPrecios(['Celeste'], { clave: 'k', plazoMs: HORA, cache: cacheEnMemoria(), presupuesto: { tomar: () => false }, ahora });
    expect(llamadas).toEqual([]);
    expect(sinCupo.fallo?.name).toBe('ItadSinCupo');
  });
});

// ─── El endpoint ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Una `caches.default` de mentira, por si el endpoint la usa (en Node no existe). */
function cachesDelBorde() {
  const datos = new Map<string, Response>();
  vi.stubGlobal('caches', {
    default: {
      match: async (peticion: Request) => datos.get(peticion.url)?.clone(),
      put: async (peticion: Request, respuesta: Response) => {
        datos.set(peticion.url, respuesta.clone());
      },
    },
  });
  return datos;
}

function pedir(cuerpo: unknown, entorno: Record<string, unknown> = { ITAD_API_KEY: 'clave' }) {
  return onRequestPost({
    request: new Request('https://mygamelist.pages.dev/api/precios', { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }),
    env: entorno as never,
  });
}

describe('POST /api/precios', () => {
  beforeEach(() => {
    reiniciarTopesParaTests();
    requireUserMock.mockResolvedValue({ user: { uid: 'u1', idToken: 't' }, appCheckToken: null, projectId: 'p', isAdmin: false });
    rangoMock.mockReturnValue('bronze');
  });

  it('sin sesión, lo que diga `requireUser`', async () => {
    requireUserMock.mockResolvedValue(new Response('{}', { status: 401 }));
    expect((await pedir({ titulos: ['Celeste'] })).status).toBe(401);
  });

  it('sin la clave de ITAD, 501: es configuración nuestra, no una avería', async () => {
    expect((await pedir({ titulos: ['Celeste'] }, {})).status).toBe(501);
  });

  it('valida la entrada: entre 1 y 400 títulos de texto, ni vacíos ni larguísimos', async () => {
    for (const malo of [{}, { titulos: [] }, { titulos: [1] }, { titulos: [' '] }, { titulos: ['x'.repeat(201)] }, 'no es json']) {
      expect((await pedir(malo)).status).toBe(400);
    }
    expect(leerTitulos({ titulos: Array.from({ length: MAX_TITULOS + 1 }, (_v, i) => `J${i}`) })).toBeNull();
    expect(leerTitulos({ titulos: [' Celeste ', 'Celeste'] })).toEqual(['Celeste']);
  });

  it('contesta con los precios, y `x-cache` dice si salió de la caché del borde', async () => {
    itadFalso();
    cachesDelBorde();
    const primera = await pedir({ titulos: ['Celeste'] });
    expect(primera.status).toBe(200);
    expect(primera.headers.get('x-cache')).toBe('miss');
    const cuerpo = (await primera.json()) as { juegos: Record<string, { mejor: { url: string } }> };
    expect(cuerpo.juegos.Celeste.mejor.url).toBe('https://itad.link/pl/id-celeste');
    const segunda = await pedir({ titulos: ['Celeste'] });
    expect(segunda.headers.get('x-cache')).toBe('hit');
  });

  it('cada rango tiene su tope por hora: al pasarlo, 429 con Retry-After', async () => {
    itadFalso();
    cachesDelBorde();
    const tope = PROFILE_TIER_PRICE_REQUESTS_PER_HOUR.bronze;
    for (let i = 0; i < tope; i += 1) expect((await pedir({ titulos: ['Celeste'] })).status).toBe(200);
    const pasado = await pedir({ titulos: ['Celeste'] });
    expect(pasado.status).toBe(429);
    expect(Number(pasado.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Mithril, con su propio tope, sigue.
    rangoMock.mockReturnValue('mithril');
    requireUserMock.mockResolvedValue({ user: { uid: 'u2', idToken: 't' }, appCheckToken: null, projectId: 'p', isAdmin: true });
    expect((await pedir({ titulos: ['Celeste'] })).status).toBe(200);
  });

  it('ITAD sin cupo y nada guardado: 429 con su Retry-After; caído: 503 de no disponible', async () => {
    itadFalso({ estado: 429, retryAfter: '120' });
    const sinCupo = await pedir({ titulos: ['Celeste'] });
    expect(sinCupo.status).toBe(429);
    expect(sinCupo.headers.get('Retry-After')).toBe('120');
    itadFalso({ estado: 502, retryAfter: '120' });
    const caido = await pedir({ titulos: ['Hades II'] });
    expect(caido.status).toBe(503);
    expect(((await caido.json()) as { unavailable?: boolean }).unavailable).toBe(true);
  });
});
