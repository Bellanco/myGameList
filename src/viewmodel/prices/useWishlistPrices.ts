import { useEffect, useState } from 'react';
import type { GameItem, TabSort } from '../../model/types/game';
import type { PrecioItad } from '../../model/types/prices';

/** Los precios de una lista, por título: solo los que tienen algo guardado (`null` = ITAD no lo tiene). */
export type WishlistPriceMap = Readonly<Record<string, PrecioItad | null>>;

/** Los precios de Deseados y lo que se hace con ellos en la lista: «En oferta» y el orden por precio o descuento. */
export interface WishlistPrices {
  prices: WishlistPriceMap;
  /** `arrangeByPrice` (core/prices/priceSort) con estos precios: llega en el mismo `import()` que ellos. */
  arrange: (games: GameItem[], sale: boolean, sort: TabSort) => GameItem[];
}

/**
 * LOS PRECIOS DE DESEADOS (P3 del plan de la ficha y los precios). `titles` es `null` cuando no tocan —interruptor
 * apagado, sin espacio social, Deseados oculta o no es la pestaña abierta— y entonces no se carga ni se pide nada.
 *
 * Primero pinta lo guardado, al momento; después pide lo caducado con el plazo del rango de quien mira (`ttlMs`), y
 * solo cuando se sabe: mientras el rango esté en vuelo (`null`), se queda con lo guardado.
 *
 * Todo lo demás va con `import()` (`wishlistPricesLoader`): el repositorio arrastra Firebase y no tiene sitio en el
 * arranque, y el orden y el filtro por precio no caben en su presupuesto (y sin precios no sirven). Nunca lanza (ante un fallo
 * devuelve lo guardado), así que lo único que puede fallar aquí es traer sus chunks, sin red y recién desplegado: sin
 * ellos no hay precios y la lista se queda como está, sin errores (memoria `degradacion-servicios`).
 */
export function useWishlistPrices(titles: readonly string[] | null, ttlMs: number | null): WishlistPrices | null {
  // La lista entra como clave de texto: el array cambia de identidad con cualquier edición, los nombres casi nunca.
  const key = titles ? titles.join('\n') : null;
  const [prices, setPrices] = useState<WishlistPrices | null>(null);

  useEffect(() => {
    if (key === null) return undefined;
    const list = key ? key.split('\n') : [];
    let cancelled = false;
    void (async () => {
      try {
        const { loadWishlistPriceView } = await import('./wishlistPricesLoader');
        await loadWishlistPriceView(list, ttlMs, setPrices, () => cancelled);
      } catch {
        // Sin los chunks de los precios no hay precios; la lista sigue igual (ver arriba).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, ttlMs]);

  return key === null ? null : prices;
}
