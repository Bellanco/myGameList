import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import type { SocialProfileVisibility } from '../../model/repository/gistRepository';

/**
 * Bloque 6 — Filtra la lista de juegos de OTRO perfil según la visibilidad que ese usuario publicó (respeto de la
 * visibilidad del lado cliente): vacía las pestañas ocultas y elimina los campos que no quiere exponer
 * (horas/rejugable/reintentar). PURA. La lista cruda llega del gist de listados; este filtro decide qué se muestra.
 */
export function applyProfileVisibility(games: TabData, visibility: SocialProfileVisibility): Record<TabId, GameItem[]> {
  const hidden = new Set(visibility.hiddenTabs || []);
  const scrub = (game: GameItem): GameItem => {
    const next: GameItem = { ...game };
    if (visibility.hideGameTime) next.hours = null;
    if (visibility.hideReplayable) next.replayable = false;
    if (visibility.hideRetry) next.retry = false;
    return next;
  };
  const out = { c: [], v: [], e: [], p: [] } as Record<TabId, GameItem[]>;
  for (const tab of TAB_IDS) {
    out[tab] = hidden.has(tab) ? [] : (games[tab] || []).map(scrub);
  }
  return out;
}
