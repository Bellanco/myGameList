// DE DÓNDE SACA EL BUSCADOR GENERAL LO QUE ENCUENTRA (docs/plan-notificaciones-y-buscador.md, B1), con el destino de
// cada cosa ya resuelto. Puro salvo `loadSocialSearchSources`, que lee la copia del directorio social de IndexedDB.
import { generatePath } from 'react-router-dom';
import { SEARCH_UI } from '../../core/constants/searchLabels';
import { TAB_ROUTE, TAB_TOOLTIPS } from '../../core/constants/labels';
import { SETTINGS_ROUTES } from '../../core/constants/routes';
import { STATS_REVIEWS_ROUTE, statsReviewPath } from '../../core/utils/reviewPath';
import { friendUidsFromDirectoryKey } from '../../core/social/directoryFriendsKey';
import type { SearchSource } from '../../core/search/globalSearch';
import { buildPickPool, pickOptions, pickPath, EMPTY_PICK_FILTERS, PICK_ROUTE } from '../../core/pick/pickNext';
import { TAB_IDS, type TabData, type TabId } from '../../model/types/game';
import { getSocialSyncConfig } from '../../model/repository/gistConfigRepository';
import { getLocalMeta, peekCachedSocialDirectory } from '../../model/repository/indexedDbRepository';
import { SOCIAL_ROUTES } from '../social/socialRoutes';

/** Tus juegos: cada uno lleva a su lista con el filtro de texto puesto (decisión del usuario, 13-10-2026). */
export function gameSearchSources(data: TabData, visibleTabs: readonly TabId[]): SearchSource[] {
  return visibleTabs.flatMap((tab) => (data[tab] ?? []).map((game) => ({
    id: `game:${tab}:${game.id}`,
    title: game.name,
    detail: TAB_TOOLTIPS[tab],
    path: `${TAB_ROUTE[tab]}?q=${encodeURIComponent(game.name)}`,
  })));
}

/**
 * Tus reseñas, sacadas de tus listas y no del social: así salen también sin espacio social. Llevan a su página en las
 * estadísticas (`/stats/resenas/:id-huella`), que es la tuya y no depende de nada más.
 */
export function ownReviewSearchSources(data: TabData): SearchSource[] {
  return TAB_IDS.flatMap((tab) => (data[tab] ?? [])
    .filter((game) => String(game.review || '').trim().length > 0)
    .map((game) => ({
      id: `own-review:${tab}:${game.id}`,
      title: game.name,
      detail: SEARCH_UI.details.ownReview,
      path: statsReviewPath(game.id, game.name),
    })));
}

/**
 * Los géneros de «¿A qué juego ahora?»: uno por género que tenga algo que empezar, con cuántos, y que lleva a la
 * pantalla con ese género ya marcado. Lo que se busca es el género («FPS»), no la frase.
 */
export function pickSearchSources(data: TabData): SearchSource[] {
  return pickOptions(buildPickPool(data), EMPTY_PICK_FILTERS, 'genres').map(({ value, count }) => ({
    id: `pick:genre:${value}`,
    title: value,
    detail: SEARCH_UI.details.pickGenre(count),
    path: pickPath({ genres: [value], platforms: [] }),
  }));
}

/** Lo justo de una entrada del directorio guardado. */
export interface CachedDirectoryEntry {
  id: string;
  uid?: string;
  displayName?: string;
  activity?: ReadonlyArray<{ id?: string; type?: string; actorProfileId?: string; gameId?: number; gameName?: string }>;
}

/**
 * Las reseñas y los perfiles de tus AMISTADES, de la copia del directorio. Con huella (`friendUids`), solo quien está
 * en ella. Sin huella (copia de antes de existir), las entradas con actividad: de quien no es amistad no se lee el gist,
 * así que no la tienen. La tuya no entra nunca (`ownUid`): tus reseñas salen de tus listas.
 */
export function friendSearchSources(
  entries: readonly CachedDirectoryEntry[],
  friendUids: ReadonlySet<string> | null,
  ownUid: string,
): { reviews: SearchSource[]; friends: SearchSource[] } {
  const reviews: SearchSource[] = [];
  const friends: SearchSource[] = [];
  for (const entry of entries) {
    const uid = String(entry.uid || entry.id || '');
    if (!uid || uid === ownUid) continue;
    const isFriend = friendUids ? friendUids.has(uid) : (entry.activity?.length ?? 0) > 0;
    if (!isFriend) continue;
    const name = String(entry.displayName || '').trim();
    if (name) {
      friends.push({
        id: `friend:${uid}`,
        title: name,
        detail: SEARCH_UI.details.friend,
        path: generatePath(SOCIAL_ROUTES.profileDetail, { profileId: entry.id }),
      });
    }
    for (const item of entry.activity ?? []) {
      if (item.type !== 'review' || !item.actorProfileId || !item.gameId || !item.gameName) continue;
      reviews.push({
        id: `review:${uid}:${item.id || item.gameId}`,
        title: item.gameName,
        detail: SEARCH_UI.details.reviewBy(name || SEARCH_UI.details.friend),
        path: generatePath(SOCIAL_ROUTES.activityDetail, {
          userId: item.actorProfileId,
          gameId: String(item.gameId),
          eventType: 'review',
        }),
      });
    }
  }
  return { reviews, friends };
}

/**
 * Las pantallas, con las mismas puertas que la navegación: Deseados solo si la lista está activa, y lo que exige espacio
 * social (Perfiles, Diseño) solo con él. Las palabras clave encuentran la pantalla por lo que hay en ella.
 */
export function pageSearchSources({ visibleTabs, hasSocial, achievements, pick = hasSocial }: {
  visibleTabs: readonly TabId[];
  hasSocial: boolean;
  achievements: boolean;
  /** «¿A qué juego ahora?». Va con lo social, salvo en desarrollo (ver `GlobalSearch`). */
  pick?: boolean;
}): SearchSource[] {
  const P = SEARCH_UI.pages;
  const D = SEARCH_UI.details;
  const pages: SearchSource[] = visibleTabs.map((tab) => ({
    id: `page:list:${tab}`,
    title: TAB_TOOLTIPS[tab],
    detail: D.page,
    path: TAB_ROUTE[tab],
    keywords: 'lista listados',
  }));
  if (pick) pages.push({ id: 'page:pick', title: P.pick, detail: D.page, path: PICK_ROUTE, keywords: 'elegir siguiente juego jugar ruleta dado empezar' });
  pages.push({ id: 'page:stats', title: P.stats, detail: D.page, path: '/stats', keywords: 'resumen numeros graficas' });
  pages.push({ id: 'page:reviews', title: P.reviews, detail: D.page, path: STATS_REVIEWS_ROUTE, keywords: 'reseñas analisis' });
  if (achievements) pages.push({ id: 'page:achievements', title: P.achievements, detail: D.page, path: '/logros', keywords: 'medallas trofeos' });
  pages.push({ id: 'page:social', title: P.social, detail: D.page, path: '/social', keywords: 'social feed actividad amigos' });
  if (hasSocial) pages.push({ id: 'page:profiles', title: P.profiles, detail: D.page, path: SOCIAL_ROUTES.profiles, keywords: 'amigos amistades directorio' });
  if (hasSocial) pages.push({ id: 'page:design', title: P.settingsDesign, detail: D.settings, path: SETTINGS_ROUTES.design, keywords: 'ajustes tema paleta apariencia' });
  pages.push({ id: 'page:filters', title: P.settingsFilters, detail: D.settings, path: SETTINGS_ROUTES.filters, keywords: 'ajustes' });
  pages.push({ id: 'page:data', title: P.settingsData, detail: D.settings, path: SETTINGS_ROUTES.data, keywords: 'ajustes sincronizacion github importar exportar legal' });
  pages.push({ id: 'page:inbox', title: P.inbox, detail: D.page, path: '/bandeja', keywords: 'importar importacion' });
  return pages;
}

/**
 * Lo social guardado en este dispositivo: la copia del directorio de tu última visita al hub, sin red y sin Firebase.
 * Vacío si no hay espacio social aquí o no se puede leer.
 */
export async function loadSocialSearchSources(): Promise<{ reviews: SearchSource[]; friends: SearchSource[]; hasSocial: boolean }> {
  const empty = { reviews: [], friends: [], hasSocial: false };
  try {
    const gistId = getSocialSyncConfig()?.gistId || '';
    if (!gistId) return empty;
    const [cached, meta] = await Promise.all([
      peekCachedSocialDirectory<CachedDirectoryEntry>(gistId),
      getLocalMeta().catch(() => null),
    ]);
    if (!cached) return { ...empty, hasSocial: true };
    return {
      ...friendSearchSources(cached.entries, friendUidsFromDirectoryKey(cached.friendsKey), meta?.uid || ''),
      hasSocial: true,
    };
  } catch {
    return empty;
  }
}
