import { useEffect, useState } from 'react';
import type { PrecioItad } from '../../model/types/prices';

/** Los precios de una lista, por título: solo los que tienen algo guardado (`null` = ITAD no lo tiene). */
export type WishlistPriceMap = Readonly<Record<string, PrecioItad | null>>;

/**
 * LOS PRECIOS DE DESEADOS (P3 del plan de la ficha y los precios). `titles` es `null` cuando no tocan —interruptor
 * apagado, sin espacio social, Deseados oculta o no es la pestaña abierta— y entonces no se carga ni se pide nada.
 *
 * Primero pinta lo guardado, al momento; después pide lo caducado con el plazo del rango de quien mira (`ttlMs`), y
 * solo cuando se sabe: mientras el rango esté en vuelo (`null`), se queda con lo guardado.
 *
 * El repositorio va con `import()`: arrastra Firebase y no tiene sitio en el arranque. Nunca lanza (ante un fallo
 * devuelve lo guardado), así que lo único que puede fallar aquí es traer su chunk, sin red y recién desplegado: sin
 * él no hay precios y la lista se queda como está, sin errores (memoria `degradacion-servicios`).
 */
export function useWishlistPrices(titles: readonly string[] | null, ttlMs: number | null): WishlistPriceMap | null {
  // La lista entra como clave de texto: el array cambia de identidad con cualquier edición, los nombres casi nunca.
  const key = titles ? titles.join('\n') : null;
  const [prices, setPrices] = useState<WishlistPriceMap | null>(null);

  useEffect(() => {
    if (key === null) return undefined;
    const list = key ? key.split('\n') : [];
    let cancelled = false;
    void (async () => {
      try {
        const repo = await import('../../model/repository/pricesRepository');
        const cached = await repo.readCachedPrices(list);
        if (cancelled) return;
        setPrices(cached);
        if (ttlMs === null || list.length === 0) return;
        const fresh = await repo.loadWishlistPrices(list, ttlMs);
        if (!cancelled) setPrices(fresh.prices);
      } catch {
        // Sin el chunk del repositorio no hay precios; la lista sigue igual (ver arriba).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, ttlMs]);

  return key === null ? null : prices;
}
