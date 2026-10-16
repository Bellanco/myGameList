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
 * LOS PRECIOS DE TU LISTA DE DESEOS, con la caché local por delante: se pide solo lo que no tiene precio o lo tiene
 * más viejo que `ttlMs` (el plazo del rango de quien mira), por partes de 400, y lo que llega se mezcla con lo
 * guardado. Lo que ya no está en la lista sale de la caché. Si una tanda falla, las siguientes no se piden: lo
 * guardado vale hasta el siguiente intento.
 */
export async function loadWishlistPrices(titles: readonly string[], ttlMs: number, now: number = Date.now()): Promise<WishlistPrices> {
  let cache: PriceCache = (await getPriceCache<PriceCache>()) ?? {};
  let status: PricesStatus = 'ok';
  const pending = titlesToRequest(cache, titles, ttlMs, now);
  for (const part of chunk(pending, PRICE_REQUEST_MAX_TITLES)) {
    try {
      const answer = await fetchWishlistPrices(part);
      cache = mergePrices(cache, answer.juegos, now);
      if (answer.incompleto) status = 'incompleto';
    } catch (error) {
      status = error instanceof PricesRequestError ? error.status : 'no-disponible';
      break;
    }
  }
  cache = pruneCache(cache, titles);
  await putPriceCache(cache);
  const prices: Record<string, PrecioItad | null> = {};
  for (const title of titles) {
    const entry = cache[title];
    if (entry) prices[title] = entry.precio;
  }
  return { prices, status };
}

/** La caché local entera, sin pedir nada: para pintar al momento lo que ya se sabe mientras llega lo demás. */
export async function readCachedPrices(): Promise<PriceCache> {
  return (await getPriceCache<PriceCache>()) ?? {};
}
