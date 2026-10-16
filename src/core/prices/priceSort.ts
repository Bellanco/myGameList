// ORDENAR Y FILTRAR DESEADOS POR PRECIO (segunda pasada de la P3 del plan de la ficha y los precios), puro. Los precios
// no viven en `GameItem` —son de catálogo, caducan en horas y no van al gist—, así que esto se aplica sobre la lista
// ya filtrada y ordenada por el view-model, con el mapa de precios al lado. Viaja con los precios (lo carga
// `useWishlistPrices` con `import()`), no en el arranque.
import { compareText } from '../utils/compare';
import type { GameItem, TabSort } from '../../model/types/game';
import type { PrecioItad } from '../../model/types/prices';

/** Las columnas de orden que solo existen con precios: el precio de ahora y el descuento. */
export const PRICE_SORT_COLUMNS = ['price', 'discount'] as const;

/** ¿Es una columna de orden por precio? */
export function isPriceSortColumn(column: string): boolean {
  return (PRICE_SORT_COLUMNS as readonly string[]).includes(column);
}

type PriceMap = Readonly<Record<string, PrecioItad | null>>;

/** La clave de orden de un juego, o `null` si no tiene precio (ni guardado ni tienda que lo venda). */
function keyOf(game: GameItem, prices: PriceMap, column: string): number | null {
  const mejor = prices[game.name]?.mejor;
  if (!mejor) return null;
  return column === 'discount' ? mejor.descuento : mejor.precio;
}

/**
 * Ordena por precio (`price`) o descuento (`discount`) en la dirección de `sort`. Los juegos SIN precio van siempre al
 * final, en las dos direcciones: no son ni los más baratos ni los más caros. Empates, por nombre. No muta la lista.
 */
export function sortByPrice(games: readonly GameItem[], prices: PriceMap, sort: TabSort): GameItem[] {
  const decorated = games.map((game) => ({ game, key: keyOf(game, prices, sort.col) }));
  decorated.sort((a, b) => {
    if (a.key === null || b.key === null) {
      if (a.key === b.key) return compareText(a.game.name, b.game.name);
      return a.key === null ? 1 : -1;
    }
    const cmp = sort.asc ? a.key - b.key : b.key - a.key;
    return cmp || compareText(a.game.name, b.game.name);
  });
  return decorated.map((entry) => entry.game);
}

/** Solo los que están en oferta ahora: con un mejor precio rebajado. Sin precio, fuera. */
export function onSaleOnly(games: readonly GameItem[], prices: PriceMap): GameItem[] {
  return games.filter((game) => (prices[game.name]?.mejor?.descuento ?? 0) > 0);
}

/**
 * Lo que `App` hace con la lista de Deseados cuando hay precios: «En oferta» si está puesto y, si el orden es por
 * precio o descuento, ese orden. Si no, la lista tal cual (ya ordenada por el view-model).
 */
export function arrangeByPrice(games: GameItem[], prices: PriceMap, sale: boolean, sort: TabSort): GameItem[] {
  const shown = sale ? onSaleOnly(games, prices) : games;
  return isPriceSortColumn(sort.col) ? sortByPrice(shown, prices, sort) : shown;
}
