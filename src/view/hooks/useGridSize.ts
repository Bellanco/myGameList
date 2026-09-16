import { useCallback, useEffect } from 'react';
import { gridSizePreference, type GridSize } from './preferences';
import { usePreference } from './usePreference';

/** Los tres pasos, en el orden en el que se recorren con los botones. */
export const GRID_SIZES: readonly GridSize[] = ['sm', 'md', 'lg'];

/**
 * TAMAÑO DE LOS CUADROS del mosaico. Persiste en local (ver `GRID_SIZE_KEY` para por qué todavía no viaja a la
 * nube) y todas las instancias comparten el store, así que el control de la cabecera y el listado se sincronizan
 * solos, igual que con la forma.
 */
export function useGridSize(): { size: GridSize; setSize: (size: GridSize) => void } {
  const size = usePreference(gridSizePreference);

  // No la pinta el anti-flash (no hay mosaico antes de React), así que el atributo lo estrena el primer montaje.
  useEffect(() => { gridSizePreference.apply(); }, []);

  const setSize = useCallback((next: GridSize) => gridSizePreference.set(next), []);

  return { size, setSize };
}
