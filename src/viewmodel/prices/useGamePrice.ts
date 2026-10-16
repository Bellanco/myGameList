import { useEffect, useState } from 'react';
import type { PrecioItad } from '../../model/types/prices';

/**
 * EL PRECIO DE UN JUEGO, para la ficha (P3 del plan de la ficha y los precios). `title` es `null` cuando no toca, y
 * entonces no se pide nada. Lo guardado se pinta al momento; si ha caducado con el plazo de quien mira (`ttlMs`), se
 * pide ese título solo. Mientras el rango esté en vuelo (`ttlMs` a `null`), vale lo guardado.
 *
 * Devuelve `undefined` mientras no se sabe nada (ni guardado ni pedido) y `null` si ITAD no lo tiene. Como en
 * `useWishlistPrices`, el repositorio va con `import()` y sin su chunk la ficha se queda sin precio, sin errores.
 */
export function useGamePrice(title: string | null, ttlMs: number | null): PrecioItad | null | undefined {
  const [state, setState] = useState<{ title: string; precio: PrecioItad | null | undefined } | null>(null);

  useEffect(() => {
    if (!title) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const repo = await import('../../model/repository/pricesRepository');
        const cached = (await repo.readCachedPrices([title]))[title];
        if (cancelled) return;
        if (cached !== undefined) setState({ title, precio: cached });
        if (ttlMs === null) return;
        const precio = await repo.loadGamePrice(title, ttlMs);
        if (!cancelled) setState({ title, precio });
      } catch {
        // Sin el chunk del repositorio no hay precio; la ficha enseña lo demás.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [title, ttlMs]);

  return title && state?.title === title ? state.precio : undefined;
}
