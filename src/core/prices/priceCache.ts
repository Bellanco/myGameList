// LA CACHÉ LOCAL DE PRECIOS (P2 del plan de la ficha y los precios), pura: qué hay que pedir, cómo se mezcla lo que
// llega y cómo se parte una lista larga. El almacén lo pone `pricesRepository` (un registro de IndexedDB).
import type { PrecioItad } from '../../model/types/prices';

/** Títulos por petición a `/api/precios` (su `MAX_TITULOS`): una lista mayor se pide por partes (P3). */
export const PRICE_REQUEST_MAX_TITLES = 400;

/** Lo guardado de un juego: su precio (o `null`, ITAD no lo tiene) y cuándo se pidió. */
export interface PriceCacheEntry {
  precio: PrecioItad | null;
  pedidoEn: number;
}

/** La caché entera, por título tal y como está en tu lista de deseos. */
export type PriceCache = Record<string, PriceCacheEntry>;

/**
 * Qué títulos hay que pedir: los que no tienen nada guardado y los que lo tienen más viejo que el plazo del rango de
 * quien mira (`PROFILE_TIER_PRICE_TTL_MS`). Sin repetir y en el orden en que llegan.
 */
export function titlesToRequest(cache: PriceCache, titles: readonly string[], ttlMs: number, now: number): string[] {
  const pedir: string[] = [];
  const vistos = new Set<string>();
  for (const title of titles) {
    if (vistos.has(title)) continue;
    vistos.add(title);
    const entry = cache[title];
    if (!entry || now - entry.pedidoEn >= ttlMs) pedir.push(title);
  }
  return pedir;
}

/**
 * Mezcla lo que llega de `/api/precios` con lo guardado: cada título recibido pasa a tener su precio nuevo con la hora
 * de ahora. Lo que no se pidió, o no llegó, se queda como estaba. Inmutable: devuelve una caché nueva.
 */
export function mergePrices(cache: PriceCache, received: Record<string, PrecioItad | null>, now: number): PriceCache {
  const next: PriceCache = { ...cache };
  for (const [title, precio] of Object.entries(received)) next[title] = { precio, pedidoEn: now };
  return next;
}

/** Quita de la caché lo que ya no está en tu lista de deseos, para que no crezca sin fin. */
export function pruneCache(cache: PriceCache, titles: readonly string[]): PriceCache {
  const keep = new Set(titles);
  return Object.fromEntries(Object.entries(cache).filter(([title]) => keep.has(title)));
}

/** Una lista partida en tandas del tamaño dado. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
