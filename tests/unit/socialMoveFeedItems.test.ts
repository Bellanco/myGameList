// F4 — los movimientos de lista DENTRO del feed: mezcla, orden, filtro de quien mira y AGRUPADO por persona,
// lista y día.
//
// Lo importante que se fija aquí: el filtro se aplica sobre lo que el directorio ya tiene cargado, así que
// encender o apagar una lista no puede costar ni una lectura de red; los movimientos comparten el orden por
// fecha con las reseñas y las publicaciones, sin desplazarlas; y ninguna persona puede copar un día: lo que mueve
// a una lista en un día es UN renglón (uno solo mueve veinte juegos en una tarde y el feed es de todos).
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayMocks = vi.hoisted(() => ({
  getPublicConfig: vi.fn(async (): Promise<unknown> => null),
  setPublicConfig: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);

import { useSocialFeed } from '../../src/viewmodel/social/socialFeed';
import type { SocialActivityFeedItem, SocialMoveFeedItem, SocialPostFeedItem } from '../../src/viewmodel/social/socialFeed';
import { feedMoveTabsPreference } from '../../src/view/hooks/preferences';
import type { TabId } from '../../src/model/types/game';

const T = Date.parse('2026-08-12T10:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

function move(gameId: number, tab: TabId, at: number, profileId = 'pid-1'): SocialMoveFeedItem {
  return {
    id: `${gameId}:${tab}`,
    gameId,
    gameName: `Juego ${gameId}`,
    tab,
    at,
    updatedAt: at,
    profileId,
    profileDisplayName: 'Nick',
    socialGistId: 'ffee1122aabb0001',
    photoURL: '',
  };
}

function review(gameId: number, updatedAt: number): SocialActivityFeedItem {
  return {
    id: `pid-1:${gameId}:review`,
    key: `pid-1:${gameId}:review`,
    type: 'review',
    actorProfileId: 'pid-1',
    actorName: 'Nick',
    gameId,
    gameName: `Juego ${gameId}`,
    rating: 4,
    grade: 80,
    recommendationText: '',
    snippet: 'algo',
    createdAt: updatedAt,
    updatedAt,
    profileId: 'pid-1',
    profileDisplayName: 'Nick',
    socialGistId: 'ffee1122aabb0001',
    photoURL: '',
  } as unknown as SocialActivityFeedItem;
}

function post(id: string, updatedAt: number): SocialPostFeedItem {
  return {
    id,
    authorProfileId: 'pid-1',
    authorName: 'Nick',
    text: 'Una noticia',
    createdAt: updatedAt,
    updatedAt,
    profileId: 'pid-1',
    profileDisplayName: 'Nick',
    socialGistId: 'ffee1122aabb0001',
    photoURL: '',
  };
}

/** Ids de juego de los movimientos que el feed deja pasar, en su orden. Estrecha la unión por el discriminante. */
function movedGameIds(items: ReturnType<typeof useSocialFeed>['feedItems']): number[] {
  return items.filter((item) => item.kind === 'move').map((item) => item.gameId);
}

/** Los renglones de movimiento, cada uno con los ids de sus juegos (del más reciente al más antiguo). */
function moveGroups(items: ReturnType<typeof useSocialFeed>['feedItems']): number[][] {
  return items.filter((item) => item.kind === 'move').map((item) => item.games.map((game) => game.gameId));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('el feed con movimientos de lista', () => {
  it('los mezcla con reseñas y publicaciones, ordenados por fecha y marcados con su `kind`', () => {
    const { result } = renderHook(() => useSocialFeed([{
      activity: [review(1, T)],
      posts: [post('p1', T + 2000)],
      moves: [move(2, 'c', T + 1000)],
    }]));

    expect(result.current.feedItems.map((item) => item.kind)).toEqual(['post', 'move', undefined]);
  });

  it('por defecto se ven los movimientos de las cuatro listas', () => {
    const { result } = renderHook(() => useSocialFeed([{
      moves: [move(1, 'c', T), move(2, 'v', T - DIA), move(3, 'e', T - 2 * DIA), move(4, 'p', T - 3 * DIA)],
    }]));

    expect(result.current.feedItems).toHaveLength(4);
    expect(result.current.feedItems.map((item) => item.kind)).toEqual(['move', 'move', 'move', 'move']);
  });

  // ── El agrupado por persona, lista y día ─────────────────────────────────────────────────────────────────
  it('lo que una persona mueve a una lista en un día es UN renglón, con todos los juegos del más reciente al más antiguo', () => {
    const { result } = renderHook(() => useSocialFeed([{
      moves: [move(3, 'd', T - 2000), move(1, 'd', T), move(5, 'd', T - 4000), move(2, 'd', T - 1000), move(4, 'd', T - 3000)],
    }]));

    const items = result.current.feedItems;
    expect(items).toHaveLength(1);
    // Sin tope: entran los cinco, no los tres últimos.
    expect(moveGroups(items)).toEqual([[1, 2, 3, 4, 5]]);
    // El renglón lleva la hora (y el resto de campos) del más reciente.
    expect(items[0].updatedAt).toBe(T);
    expect(movedGameIds(items)).toEqual([1]);
  });

  it('cada lista va en su renglón: deseos y finalizados del mismo día no se mezclan', () => {
    const { result } = renderHook(() => useSocialFeed([{
      moves: [move(1, 'd', T), move(2, 'c', T - 1000), move(3, 'd', T - 2000), move(4, 'c', T - 3000)],
    }]));

    expect(moveGroups(result.current.feedItems)).toEqual([[1, 3], [2, 4]]);
  });

  it('cada persona va en su renglón', () => {
    const { result } = renderHook(() => useSocialFeed([
      { moves: [move(1, 'c', T), move(2, 'c', T - 1000)] },
      { moves: [move(11, 'c', T - 500, 'pid-2'), move(12, 'c', T - 1500, 'pid-2')] },
    ]));

    expect(moveGroups(result.current.feedItems)).toEqual([[1, 2], [11, 12]]);
  });

  it('cada día va en su renglón: lo de ayer no se suma a lo de hoy', () => {
    const { result } = renderHook(() => useSocialFeed([{
      moves: [move(1, 'c', T), move(2, 'c', T - 1000), move(5, 'c', T - DIA), move(6, 'c', T - DIA - 1000)],
    }]));

    expect(moveGroups(result.current.feedItems)).toEqual([[1, 2], [5, 6]]);
  });

  it('las reseñas y las publicaciones no se agrupan, y no tienen tope', () => {
    // Una reseña se escribe, y quien escribe cinco tiene cinco cosas que decir.
    const { result } = renderHook(() => useSocialFeed([{
      activity: [review(1, T), review(2, T - 100), review(3, T - 200), review(4, T - 300), review(5, T - 400)],
      posts: [post('p1', T - 500), post('p2', T - 600), post('p3', T - 700), post('p4', T - 800)],
      moves: [move(6, 'c', T - 900), move(7, 'c', T - 1000), move(8, 'c', T - 1100), move(9, 'c', T - 1200)],
    }]));

    const items = result.current.feedItems;
    expect(items.filter((item) => item.kind === undefined)).toHaveLength(5);
    expect(items.filter((item) => item.kind === 'post')).toHaveLength(4);
    expect(moveGroups(items)).toEqual([[6, 7, 8, 9]]);
  });

  it('el agrupado va DESPUÉS del filtro de listas: un renglón solo cuenta juegos de lo que se mira', () => {
    localStorage.setItem('mis-listas-feed-move-tabs', 'c');
    const { result } = renderHook(() => useSocialFeed([{
      moves: [move(1, 'e', T), move(2, 'e', T - 1000), move(5, 'c', T - 4000), move(6, 'c', T - 5000)],
    }]));

    expect(moveGroups(result.current.feedItems)).toEqual([[5, 6]]);
  });

  it('el día del agrupado es el de QUIEN MIRA, el mismo que titula el grupo', () => {
    vi.stubEnv('TZ', 'Europe/Madrid');
    // 00:30 y 00:10 del 12 en Madrid (22:30 y 22:10 del 11 en UTC) y 23:50 y 23:40 del 11 en Madrid: en UTC los
    // cuatro caen el día 11 y saldrían en un solo renglón; en Madrid son dos días distintos.
    const moves = [
      move(1, 'c', Date.parse('2026-08-11T22:30:00.000Z')),
      move(2, 'c', Date.parse('2026-08-11T22:10:00.000Z')),
      move(3, 'c', Date.parse('2026-08-11T21:50:00.000Z')),
      move(4, 'c', Date.parse('2026-08-11T21:40:00.000Z')),
    ];
    const { result } = renderHook(() => useSocialFeed([{ moves }]));

    const grupos = result.current.groupedFeedItems;
    expect(grupos.map((grupo) => grupo.dayHeader)).toEqual(['12 de agosto', '11 de agosto']);
    expect(moveGroups(grupos[0].items)).toEqual([[1, 2]]);
    expect(moveGroups(grupos[1].items)).toEqual([[3, 4]]);
    vi.unstubAllEnvs();
  });

  it('apagar una lista retira sus movimientos SIN tocar el directorio ni las reseñas', () => {
    const directory = [{
      activity: [review(9, T + 5000)],
      moves: [move(1, 'c', T), move(2, 'v', T - 1000)],
    }];
    const { result, rerender } = renderHook(() => useSocialFeed(directory));

    expect(result.current.feedItems).toHaveLength(3);

    act(() => { feedMoveTabsPreference.set('c'); });
    rerender();

    // Queda el movimiento de completados y la reseña; se va el de abandonados.
    expect(result.current.feedItems.map((item) => item.kind)).toEqual([undefined, 'move']);
    expect(result.current.feedItems.filter((item) => item.kind === 'move')).toHaveLength(1);
    // La fuente sigue intacta: el filtro es de RENDER, no de datos (encenderla otra vez no relee nada).
    expect(directory[0].moves).toHaveLength(2);

    act(() => { feedMoveTabsPreference.set('cv'); });
    rerender();
    expect(result.current.feedItems.filter((item) => item.kind === 'move')).toHaveLength(2);
  });

  it('con las cuatro apagadas el feed conserva reseñas y publicaciones', () => {
    localStorage.setItem('mis-listas-feed-move-tabs', '');
    const { result } = renderHook(() => useSocialFeed([{
      activity: [review(1, T)],
      posts: [post('p1', T + 1000)],
      moves: [move(2, 'c', T + 2000), move(3, 'e', T + 3000)],
    }]));

    expect(result.current.feedItems.map((item) => item.kind)).toEqual(['post', undefined]);
  });

  it('un movimiento con fecha imposible no entra (ni copa el corte visible)', () => {
    const { result } = renderHook(() => useSocialFeed([{
      activity: [review(1, T)],
      moves: [move(2, 'c', 1e18), move(3, 'e', 0)],
    }]));

    expect(result.current.feedItems).toHaveLength(1);
    expect(result.current.feedItems[0].kind).toBeUndefined();
  });

  it('se agrupan por día local junto al resto del feed', () => {
    vi.stubEnv('TZ', 'Europe/Madrid');
    // 00:06 del 12 en Madrid = 22:06 del 11 en UTC: el día lo decide el calendario de quien mira.
    const madrugadaDel12 = Date.parse('2026-08-11T22:06:00.000Z');
    const { result } = renderHook(() => useSocialFeed([{ moves: [move(1, 'c', madrugadaDel12)] }]));

    expect(result.current.groupedFeedItems).toHaveLength(1);
    expect(result.current.groupedFeedItems[0].dayHeader).toBe('12 de agosto');
    vi.unstubAllEnvs();
  });
});
