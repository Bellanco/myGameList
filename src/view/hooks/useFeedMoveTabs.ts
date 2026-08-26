import { useCallback, useMemo } from 'react';
import { moveTabsFromValue, toggleMoveTabValue } from '../../core/social/moveTabsFilter';
import type { TabId } from '../../model/types/game';
import { feedMoveTabsPreference } from '../../model/repository/feedMovePreference';
import { usePreference } from './usePreference';

/**
 * F4 — de qué listas ve QUIEN MIRA los mensajes de actividad («comenzó», «finalizó», «abandonó», «añadió»).
 *
 * Es un ajuste de LECTURA, no de privacidad: no decide qué se publica —eso son las listas ocultas del perfil—,
 * solo qué aparece en el feed de quien lo toca, sea suyo o de sus amistades. Por defecto, todas.
 *
 * Devuelve el valor CRUDO además de la lista: el string es el primitivo estable que compara
 * `useSyncExternalStore` y el que sirve como dependencia de un `useMemo` sin invalidarlo en cada render (la
 * lista, en cambio, estrena identidad si no se memoiza, y es justo lo que este hook resuelve una vez).
 */
export function useFeedMoveTabs(): {
  moveTabsValue: string;
  moveTabs: TabId[];
  toggleMoveTab: (tab: TabId) => void;
} {
  const moveTabsValue = usePreference(feedMoveTabsPreference);
  const moveTabs = useMemo(() => moveTabsFromValue(moveTabsValue), [moveTabsValue]);
  const toggleMoveTab = useCallback(
    // Se lee del store y no del valor capturado: dos clics seguidos en el mismo render no se pisan.
    (tab: TabId) => feedMoveTabsPreference.set(toggleMoveTabValue(feedMoveTabsPreference.get(), tab)),
    [],
  );

  return { moveTabsValue, moveTabs, toggleMoveTab };
}
