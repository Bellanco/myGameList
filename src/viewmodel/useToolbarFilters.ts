import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ToolbarFilters } from '../model/types/game';
import { DEFAULT_FILTERS, parseFilters, serializeFilters } from './toolbarFilters';

type MultiKey = 'genres' | 'platforms';

// Los filtros de la pestaña actual viven en la query string (fuente única de verdad): se comparten por
// enlace, sobreviven a recarga/atrás y, al estar ligados a la ruta, se vacían solos al cambiar de tab.
export function useToolbarFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  // `replace: true` para no inundar el historial con cada pulsación; el updater funcional evita closures
  // obsoletos (siempre parte de la query vigente).
  const setFilter = useCallback(
    (key: keyof ToolbarFilters, value: string | boolean | string[]) => {
      setSearchParams((prev) => serializeFilters({ ...parseFilters(prev), [key]: value }), { replace: true });
    },
    [setSearchParams],
  );

  const toggleFilterValue = useCallback(
    (key: MultiKey, value: string) => {
      setSearchParams(
        (prev) => {
          const current = parseFilters(prev);
          const list = current[key];
          const next = list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
          return serializeFilters({ ...current, [key]: next });
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const clearFilter = useCallback(
    (key: keyof ToolbarFilters) => {
      setSearchParams((prev) => serializeFilters({ ...parseFilters(prev), [key]: DEFAULT_FILTERS[key] }), { replace: true });
    },
    [setSearchParams],
  );

  const clearAllFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  return { filters, setFilter, toggleFilterValue, clearFilter, clearAllFilters };
}
