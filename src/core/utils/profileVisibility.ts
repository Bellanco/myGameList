import { ADMIN_ONLY_TIER, type ProfileTier } from '../constants/tiers';
import { TAB_IDS, type GameItem, type TabData, type TabId } from '../../model/types/game';
import type { SocialProfileVisibility } from '../../model/repository/socialGistRepository';

/**
 * Bloque 6 — Filtra la lista de juegos de OTRO perfil según la visibilidad que ese usuario publicó (respeto de la
 * visibilidad del lado cliente): vacía las pestañas ocultas y elimina los campos que no quiere exponer
 * (horas/rejugable/reintentar). PURA. La lista cruda llega del gist de listados; este filtro decide qué se muestra.
 *
 * LA CUENTA DE ADMINISTRACIÓN (mithril) es la excepción, y solo hasta cierto punto: ve las listas que el dueño
 * esconde y sus marcas de rejugable y de "merece otra oportunidad", pero NO sus horas. El tiempo de juego es el
 * único ajuste que se respeta frente a todo el mundo, así que quien lo oculta lo oculta de verdad. Está declarado
 * en la política de privacidad (ver `core/constants/legal`): sin decirlo, no valdría hacerlo.
 */
export function applyProfileVisibility(
  games: TabData,
  visibility: SocialProfileVisibility,
  viewerTier: ProfileTier | null = null,
): Record<TabId, GameItem[]> {
  const isAdmin = viewerTier === ADMIN_ONLY_TIER;
  const hidden = new Set(isAdmin ? [] : visibility.hiddenTabs || []);
  const scrub = (game: GameItem): GameItem => {
    const next: GameItem = { ...game };
    if (visibility.hideGameTime) next.hours = null;
    if (!isAdmin && visibility.hideReplayable) next.replayable = false;
    if (!isAdmin && visibility.hideRetry) next.retry = false;
    return next;
  };
  const out = { c: [], v: [], e: [], p: [] } as Record<TabId, GameItem[]>;
  for (const tab of TAB_IDS) {
    out[tab] = hidden.has(tab) ? [] : (games[tab] || []).map(scrub);
  }
  return out;
}
