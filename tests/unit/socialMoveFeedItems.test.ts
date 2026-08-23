// F4 — los movimientos de lista DENTRO del feed: mezcla, orden y filtro de quien mira.
//
// Lo importante que se fija aquí: el filtro se aplica sobre lo que el directorio ya tiene cargado, así que
// encender o apagar una lista no puede costar ni una lectura de red; y los movimientos comparten el orden por
// fecha con las reseñas y las publicaciones, sin desplazarlas.
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

function move(gameId: number, tab: TabId, at: number): SocialMoveFeedItem {
  return {
    id: `${gameId}:${tab}`,
    gameId,
    gameName: `Juego ${gameId}`,
    tab,
    at,
    updatedAt: at,
    profileId: 'pid-1',
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
      moves: [move(1, 'c', T), move(2, 'v', T - 1), move(3, 'e', T - 2), move(4, 'p', T - 3)],
    }]));

    expect(result.current.feedItems).toHaveLength(4);
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
