// LOS PRECIOS EN EL CLIENTE (P2 del plan de la ficha y los precios): el formato del importe, la caché local pura y el
// repositorio que habla con `/api/precios`. Lo que se protege aquí:
//  · que se pida SOLO lo caducado o sin precio, con el plazo del rango de quien mira, y por partes de 400;
//  · que un fallo (sin sesión, sin cupo, sin red) devuelva lo guardado, aunque sea viejo, y nunca lance;
//  · que se apunte el precio anterior cuando cambia, para el aviso de bajada (P4).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => ({ cache: null as unknown }));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getPriceCache: vi.fn(async () => idb.cache),
  putPriceCache: vi.fn(async (entries: unknown) => {
    idb.cache = entries;
  }),
}));
const session = vi.hoisted(() => ({ signedIn: true }));
vi.mock('../../src/model/repository/shareRepository', () => ({
  shareAuthHeaders: vi.fn(async (missing: () => Error) => {
    if (!session.signedIn) throw missing();
    return { Authorization: 'Bearer prueba', 'Content-Type': 'application/json' };
  }),
}));

import { formatPrice } from '../../src/core/utils/money';
import {
  PRICE_REQUEST_MAX_TITLES,
  chunk,
  mergePrices,
  pruneCache,
  titlesToRequest,
  type PriceCache,
} from '../../src/core/prices/priceCache';
import { loadWishlistPrices, readCachedPrices } from '../../src/model/repository/pricesRepository';
import type { PrecioItad } from '../../src/model/types/prices';

const HORA = 60 * 60 * 1000;

function precio(titulo: string, mejor: number | null): PrecioItad {
  return {
    titulo,
    itadId: `id-${titulo}`,
    mejor:
      mejor === null
        ? null
        : { tienda: 'Steam', precio: mejor, normal: 20, descuento: 0, hasta: null, url: 'https://itad.link/x' },
    otras: [],
    minimos: { historico: null, anio: null, tresMeses: null },
    urlFicha: null,
    bundles: [],
  };
}

describe('formatPrice', () => {
  it('pinta el importe como se lee en España', () => {
    expect(formatPrice(11.99)).toMatch(/^11,99\s€$/);
    expect(formatPrice(0)).toMatch(/^0,00\s€$/);
  });

  it('respeta la moneda que viaja con el importe', () => {
    expect(formatPrice(5, 'USD')).toMatch(/5,00\sUS\$/);
  });
});

describe('caché de precios (pura)', () => {
  const ahora = 1_000 * HORA;
  const cache: PriceCache = {
    Fresco: { precio: precio('Fresco', 10), pedidoEn: ahora - HORA },
    Viejo: { precio: precio('Viejo', 10), pedidoEn: ahora - 20 * HORA },
    'Sin precio': { precio: null, pedidoEn: ahora - HORA },
  };

  it('pide lo que no tiene nada y lo que ha caducado con el plazo del rango, sin repetir', () => {
    expect(titlesToRequest(cache, ['Fresco', 'Viejo', 'Nuevo', 'Nuevo', 'Sin precio'], 18 * HORA, ahora)).toEqual([
      'Viejo',
      'Nuevo',
    ]);
    // Con un plazo más corto (otro rango), lo fresco de antes también caduca.
    expect(titlesToRequest(cache, ['Fresco'], 15 * 60 * 1000, ahora)).toEqual(['Fresco']);
  });

  it('un «no está en ITAD» guardado también vale hasta que caduca', () => {
    expect(titlesToRequest(cache, ['Sin precio'], 18 * HORA, ahora)).toEqual([]);
  });

  it('al mezclar apunta el precio anterior solo si cambia, y lo conserva en un refresco igual', () => {
    const bajada = mergePrices(cache, { Viejo: precio('Viejo', 4) }, ahora);
    expect(bajada.Viejo).toEqual({ precio: precio('Viejo', 4), pedidoEn: ahora, anterior: { precio: 10, vistoEn: ahora - 20 * HORA } });
    expect(bajada.Fresco).toBe(cache.Fresco);

    const igual = mergePrices(bajada, { Viejo: precio('Viejo', 4) }, ahora + HORA);
    expect(igual.Viejo.anterior).toEqual({ precio: 10, vistoEn: ahora - 20 * HORA });
    expect(igual.Viejo.pedidoEn).toBe(ahora + HORA);
  });

  it('no inventa un anterior cuando antes no había precio', () => {
    const nuevo = mergePrices(cache, { 'Sin precio': precio('Sin precio', 7) }, ahora);
    expect(nuevo['Sin precio'].anterior).toBeUndefined();
  });

  it('no muta la caché que recibe', () => {
    const copia = structuredClone(cache);
    mergePrices(cache, { Viejo: precio('Viejo', 1) }, ahora);
    pruneCache(cache, ['Fresco']);
    expect(cache).toEqual(copia);
  });

  it('poda lo que ya no está en la lista y parte en tandas', () => {
    expect(Object.keys(pruneCache(cache, ['Fresco', 'Otro']))).toEqual(['Fresco']);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 400)).toEqual([]);
  });
});

describe('loadWishlistPrices', () => {
  const fetchMock = vi.fn<typeof fetch>();

  function responde(cuerpo: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(cuerpo), { status }));
  }
  function titulosPedidos(llamada: number): string[] {
    const init = fetchMock.mock.calls[llamada][1];
    return (JSON.parse(String(init?.body)) as { titulos: string[] }).titulos;
  }

  beforeEach(() => {
    idb.cache = null;
    session.signedIn = true;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sin nada guardado pide toda la lista, con la sesión, y guarda lo que llega', async () => {
    responde({ juegos: { Hades: precio('Hades', 9), Raro: null } });
    const out = await loadWishlistPrices(['Hades', 'Raro'], 18 * HORA, 100 * HORA);

    expect(out).toEqual({ prices: { Hades: precio('Hades', 9), Raro: null }, status: 'ok' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/precios');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer prueba');
    expect(titulosPedidos(0)).toEqual(['Hades', 'Raro']);
    expect(await readCachedPrices()).toMatchObject({ Hades: { pedidoEn: 100 * HORA }, Raro: { precio: null } });
  });

  it('con todo fresco no pide nada', async () => {
    idb.cache = { Hades: { precio: precio('Hades', 9), pedidoEn: 99 * HORA } } satisfies PriceCache;
    const out = await loadWishlistPrices(['Hades'], 18 * HORA, 100 * HORA);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toEqual({ prices: { Hades: precio('Hades', 9) }, status: 'ok' });
  });

  it('pide solo lo caducado y quita de la caché lo que ya no está en la lista', async () => {
    idb.cache = {
      Fresco: { precio: precio('Fresco', 5), pedidoEn: 99 * HORA },
      Viejo: { precio: precio('Viejo', 5), pedidoEn: 50 * HORA },
      Fuera: { precio: precio('Fuera', 5), pedidoEn: 99 * HORA },
    } satisfies PriceCache;
    responde({ juegos: { Viejo: precio('Viejo', 3) } });
    await loadWishlistPrices(['Fresco', 'Viejo'], 18 * HORA, 100 * HORA);

    expect(titulosPedidos(0)).toEqual(['Viejo']);
    const guardado = await readCachedPrices();
    expect(Object.keys(guardado).sort()).toEqual(['Fresco', 'Viejo']);
    expect(guardado.Viejo.anterior).toEqual({ precio: 5, vistoEn: 50 * HORA });
  });

  it('una lista de más de 400 se pide por partes', async () => {
    const titulos = Array.from({ length: PRICE_REQUEST_MAX_TITLES + 3 }, (_, i) => `Juego ${i}`);
    responde({ juegos: {} });
    responde({ juegos: {} });
    await loadWishlistPrices(titulos, 18 * HORA, 100 * HORA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(titulosPedidos(0)).toHaveLength(PRICE_REQUEST_MAX_TITLES);
    expect(titulosPedidos(1)).toEqual(titulos.slice(PRICE_REQUEST_MAX_TITLES));
  });

  it('con el cupo agotado devuelve lo guardado, aunque esté viejo, y no pide las tandas siguientes', async () => {
    const titulos = Array.from({ length: PRICE_REQUEST_MAX_TITLES + 1 }, (_, i) => `Juego ${i}`);
    idb.cache = { 'Juego 0': { precio: precio('Juego 0', 8), pedidoEn: 1 } } satisfies PriceCache;
    responde({ error: 'Demasiadas' }, 429);
    const out = await loadWishlistPrices(titulos, 18 * HORA, 100 * HORA);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ prices: { 'Juego 0': precio('Juego 0', 8) }, status: 'sin-cupo' });
  });

  it.each([
    [401, 'sin-sesion'],
    [501, 'sin-configurar'],
    [503, 'no-disponible'],
  ] as const)('un %i se traduce a «%s» sin lanzar', async (codigo, estado) => {
    responde({ error: 'x' }, codigo);
    await expect(loadWishlistPrices(['Hades'], HORA, 100 * HORA)).resolves.toEqual({ prices: {}, status: estado });
  });

  it('sin red tampoco lanza', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(loadWishlistPrices(['Hades'], HORA, 100 * HORA)).resolves.toEqual({ prices: {}, status: 'no-disponible' });
  });

  it('sin sesión no llega a llamar', async () => {
    session.signedIn = false;
    await expect(loadWishlistPrices(['Hades'], HORA, 100 * HORA)).resolves.toEqual({ prices: {}, status: 'sin-sesion' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('una respuesta a medias del borde se dice como «incompleto»', async () => {
    responde({ juegos: { Hades: precio('Hades', 9) }, incompleto: true });
    const out = await loadWishlistPrices(['Hades'], HORA, 100 * HORA);
    expect(out.status).toBe('incompleto');
    expect(out.prices.Hades).toEqual(precio('Hades', 9));
  });
});
