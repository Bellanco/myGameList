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
    /**
     * Los sellos automáticos se caen SIEMPRE, para cualquier rango y sin ajuste que los rescate.
     *
     * No son un dato del juego sino un registro de cuándo su dueño lo movió de lista y cuándo le cambió la nota:
     * a qué horas usa la app y qué días juega. El canal social ya los tiene prohibidos, pero el gist de LISTADOS
     * —que una amistad sí baja para ver su perfil— los llevaba, y ese es el mismo dato por otra puerta. Aquí, que
     * es donde se recorta lo que no debe verse de otra persona, se van.
     */
    delete next.enteredAt;
    delete next.gradedAt;
    return next;
  };
  const out = { c: [], v: [], e: [], p: [] } as Record<TabId, GameItem[]>;
  for (const tab of TAB_IDS) {
    out[tab] = hidden.has(tab) ? [] : (games[tab] || []).map(scrub);
  }
  return out;
}
