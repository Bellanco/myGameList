// LOS PRECIOS DE ISTHEREANYDEAL EN EL CLIENTE (P2 del plan de la ficha y los precios): la llamada a `/api/precios` y
// la caché local, con el plazo del rango de quien mira por juego (P0.7).
//
// Arrastra Firebase (la sesión de las cabeceras), así que se carga con `import()` desde quien lo usa, nunca en el
// arranque. Y no lanza a la pantalla: ante cualquier fallo se queda con lo guardado y lo dice en `status`, para que
// quien pinta decida (memoria `degradacion-servicios`: sin red o sin cupo, lo local y sin errores).
import { PRICE_REQUEST_MAX_TITLES, chunk, mergePrices, pruneCache, titlesToRequest, type PriceCache } from '../../core/prices/priceCache';
import type { PrecioItad, PreciosRespuesta } from '../types/prices';
import { getPriceCache, putPriceCache } from './indexedDbRepository';
import { shareAuthHeaders } from './shareRepository';

const ENDPOINT = '/api/precios';
const TIMEOUT_MS = 15_000;

/**
 * Cómo ha ido la última consulta:
 *  · `ok`: todo al día;
 *  · `incompleto`: ITAD no contestó del todo y parte salió de lo guardado;
 *  · `sin-cupo`: el tope por hora del rango o el de ITAD; se vuelve a intentar en el siguiente plazo;
 *  · `no-disponible`: sin red, ITAD caído o el servidor sin cuota;
 *  · `sin-sesion` / `sin-configurar`: no hay nada que hacer desde aquí (sin espacio social, o el borde sin clave).
 */
export type PricesStatus = 'ok' | 'incompleto' | 'sin-cupo' | 'no-disponible' | 'sin-sesion' | 'sin-configurar';

/** Lo que se sabe de los precios de una lista: solo de los títulos con algo guardado (`null` = ITAD no lo tiene). */
export interface WishlistPrices {
  prices: Record<string, PrecioItad | null>;
  status: PricesStatus;
}

/** Un fallo de `/api/precios`, ya traducido a lo que significa para quien pinta. */
export class PricesRequestError extends Error {
  readonly status: Exclude<PricesStatus, 'ok' | 'incompleto'>;

  constructor(status: Exclude<PricesStatus, 'ok' | 'incompleto'>) {
    super(`precios: ${status}`);
    this.name = 'PricesRequestError';
    this.status = status;
  }
}

function statusFromHttp(code: number): Exclude<PricesStatus, 'ok' | 'incompleto'> {
  if (code === 401 || code === 403) return 'sin-sesion';
  if (code === 501) return 'sin-configurar';
  if (code === 429) return 'sin-cupo';
  return 'no-disponible';
}

/** UNA petición a `/api/precios`, con la sesión. Hasta `PRICE_REQUEST_MAX_TITLES` títulos. */
export async function fetchWishlistPrices(titles: readonly string[]): Promise<PreciosRespuesta> {
  let headers: Record<string, string>;
  try {
    headers = await shareAuthHeaders(() => new PricesRequestError('sin-sesion'));
  } catch (error) {
    throw error instanceof PricesRequestError ? error : new PricesRequestError('sin-sesion');
  }
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ titulos: titles }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PricesRequestError('no-disponible');
  }
  if (!response.ok) throw new PricesRequestError(statusFromHttp(response.status));
  try {
    return (await response.json()) as PreciosRespuesta;
  } catch {
    throw new PricesRequestError('no-disponible');
  }
}

/**
 * Pide lo que haga falta de `titles` por partes de 400 y lo mezcla con `cache`. Si una tanda falla, las siguientes
 * no se piden: lo guardado vale hasta el siguiente intento.
 */
async function refresh(cache: PriceCache, titles: readonly string[], now: number): Promise<{ cache: PriceCache; status: PricesStatus }> {
  let next = cache;
  let status: PricesStatus = 'ok';
  for (const part of chunk(titles, PRICE_REQUEST_MAX_TITLES)) {
    try {
      const answer = await fetchWishlistPrices(part);
      next = mergePrices(next, answer.juegos, now);
      if (answer.incompleto) status = 'incompleto';
    } catch (error) {
      status = error instanceof PricesRequestError ? error.status : 'no-disponible';
      break;
    }
  }
  return { cache: next, status };
}

/**
 * LOS PRECIOS DE TU LISTA DE DESEOS, con la caché local por delante: se pide solo lo que no tiene precio o lo tiene
 * más viejo que `ttlMs` (el plazo del rango de quien mira), por partes de 400, y lo que llega se mezcla con lo
 * guardado. Lo que ya no está en la lista sale de la caché. Si una tanda falla, las siguientes no se piden: lo
 * guardado vale hasta el siguiente intento.
 */
export async function loadWishlistPrices(titles: readonly string[], ttlMs: number, now: number = Date.now()): Promise<WishlistPrices> {
  const stored: PriceCache = (await getPriceCache<PriceCache>()) ?? {};
  const pending = titlesToRequest(stored, titles, ttlMs, now);
  const { cache: merged, status } = await refresh(stored, pending, now);
  const cache = pruneCache(merged, titles);
  // Solo se escribe si algo cambió: con todo fresco, abrir Deseados no toca IndexedDB.
  if (pending.length > 0 || Object.keys(cache).length !== Object.keys(stored).length) {
    await putPriceCache(cache);
  }
  return { prices: pricesOf(cache, titles), status };
}

/**
 * EL PRECIO DE UN JUEGO, para la ficha: lo guardado si aún vale con el plazo de quien mira y, si no, una petición con
 * ese título solo. No poda: la caché es de toda la lista de deseos, y la ficha solo añade o refresca su juego. Sin
 * nada guardado y sin poder pedirlo, `undefined` (no se sabe), que no es lo mismo que `null` (ITAD no lo tiene).
 */
export async function loadGamePrice(title: string, ttlMs: number, now: number = Date.now()): Promise<PrecioItad | null | undefined> {
  const stored: PriceCache = (await getPriceCache<PriceCache>()) ?? {};
  if (titlesToRequest(stored, [title], ttlMs, now).length === 0) return stored[title].precio;
  const { cache } = await refresh(stored, [title], now);
  if (cache !== stored) await putPriceCache(cache);
  return cache[title]?.precio;
}

/** Lo que se sabe de `titles` en `cache`: solo los títulos con algo guardado. */
function pricesOf(cache: PriceCache, titles: readonly string[]): Record<string, PrecioItad | null> {
  const prices: Record<string, PrecioItad | null> = {};
  for (const title of titles) {
    const entry = cache[title];
    if (entry) prices[title] = entry.precio;
  }
  return prices;
}

/** Lo guardado de `titles`, sin pedir nada: para pintar al momento lo que ya se sabe mientras llega lo demás. */
export async function readCachedPrices(titles: readonly string[]): Promise<Record<string, PrecioItad | null>> {
  return pricesOf((await getPriceCache<PriceCache>()) ?? {}, titles);
}
