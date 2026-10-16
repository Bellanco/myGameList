// LO QUE HACE `useWishlistPrices` AL CARGAR, fuera del arranque (P3 del plan de la ficha y los precios): el hook, que
// va en el arranque, solo trae este módulo con `import()` cuando hay precios que pintar. Con él llegan el repositorio y
// el orden y el filtro por precio, que sin precios no sirven y no cabían en el presupuesto del arranque.
import { arrangeByPrice } from '../../core/prices/priceSort';
import { loadWishlistPrices, readCachedPrices } from '../../model/repository/pricesRepository';
import type { WishlistPriceMap, WishlistPrices } from './useWishlistPrices';

function withArrange(prices: WishlistPriceMap): WishlistPrices {
  return { prices, arrange: (games, sale, sort) => arrangeByPrice(games, prices, sale, sort) };
}

/**
 * Pinta lo guardado (`onUpdate`) y, si el plazo del rango ya se sabe (`ttlMs`), pide lo caducado y lo vuelve a pintar.
 * `isCancelled` corta las actualizaciones de una carga que ya no toca (otra lista, o el hook desmontado).
 */
export async function loadWishlistPriceView(
  titles: readonly string[],
  ttlMs: number | null,
  onUpdate: (view: WishlistPrices) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const cached = await readCachedPrices(titles);
  if (isCancelled()) return;
  onUpdate(withArrange(cached));
  if (ttlMs === null || titles.length === 0) return;
  const fresh = await loadWishlistPrices(titles, ttlMs);
  if (!isCancelled()) onUpdate(withArrange(fresh.prices));
}
