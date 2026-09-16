import { useCallback, useEffect } from 'react';
import { listShapePreference, type ListShape } from './preferences';
import { usePreference } from './usePreference';

/**
 * F5 — Forma del listado (renglones o mosaico). Persiste en local y se replica a la nube si hay sesión, igual
 * que el resto de la apariencia; todas las instancias comparten el store, así que el conmutador de la barra y
 * el listado se sincronizan solos.
 */
export function useListShape(): { shape: ListShape; setShape: (shape: ListShape) => void } {
  const shape = usePreference(listShapePreference);

  // La forma no la pinta el anti-flash (no hay listado antes de React), así que el atributo lo estrena el
  // primer montaje.
  useEffect(() => { listShapePreference.apply(); }, []);

  const setShape = useCallback((next: ListShape) => listShapePreference.set(next), []);

  return { shape, setShape };
}
