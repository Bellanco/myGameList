// Agrupado por día del feed social.
//
// Bug que fija: una reseña publicada a las 00:06 del 12 (hora de España) salía bajo la cabecera "11 de agosto"
// mientras su propia tarjeta decía "12 de agosto a las 00:06". La cabecera se calculaba con `toISOString()` —día
// en Greenwich, donde ese instante es 22:06 del 11— y la tarjeta con `toLocaleDateString`. Dos relojes distintos
// para el mismo dato.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSocialFeed } from '../../src/viewmodel/social/socialFeed';
import type { SocialActivityFeedItem } from '../../src/viewmodel/social/socialFeed';

afterEach(() => {
  vi.unstubAllEnvs();
});

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

function agrupar(items: SocialActivityFeedItem[]) {
  const { result } = renderHook(() => useSocialFeed([{ activity: items, posts: [] }]));
  return result.current.groupedFeedItems;
}

/** Los `gameId` de un grupo. El feed devuelve la unión con publicaciones, que no tienen juego. */
function juegosDe(group: { items: ReadonlyArray<{ kind?: 'post' }> }): number[] {
  return group.items.filter((item) => item.kind !== 'post').map((item) => (item as SocialActivityFeedItem).gameId);
}

describe('useSocialFeed — agrupado por día', () => {
  // 00:06 del 12 de agosto en Madrid (UTC+2) = 22:06 del 11 en UTC.
  const MADRUGADA_DEL_12 = Date.parse('2026-08-11T22:06:00.000Z');
  // 18:30 del mismo 12, sin ambigüedad de huso.
  const TARDE_DEL_12 = Date.parse('2026-08-12T16:30:00.000Z');

  it('la reseña de después de medianoche cae en SU día local, no en el anterior', () => {
    vi.stubEnv('TZ', 'Europe/Madrid');
    const groups = agrupar([review(1, MADRUGADA_DEL_12)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].dayHeader).toBe('12 de agosto');
    expect(groups[0].dayDate.getDate()).toBe(12);
    expect(juegosDe(groups[0])).toEqual([1]);
  });

  it('agrupa junto lo de la madrugada y lo de la tarde del mismo día local', () => {
    vi.stubEnv('TZ', 'Europe/Madrid');
    const groups = agrupar([review(1, TARDE_DEL_12), review(2, MADRUGADA_DEL_12)]);

    expect(groups).toHaveLength(1);
    expect(groups[0].dayHeader).toBe('12 de agosto');
    // Dentro del día, lo más reciente primero (el orden lo fija `feedItems`).
    expect(juegosDe(groups[0])).toEqual([1, 2]);
  });

  it('la cabecera respeta la zona del dispositivo: el mismo instante es día 11 en Los Ángeles', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const groups = agrupar([review(1, MADRUGADA_DEL_12)]);

    expect(groups[0].dayHeader).toBe('11 de agosto');
    expect(groups[0].dayDate.getDate()).toBe(11);
  });

  it('el titular no baja un día al reconstruir la fecha del grupo (medianoche local, no UTC)', () => {
    // Con `new Date('2026-08-12')` este caso daba "11 de agosto": la clave corta se parsea como medianoche UTC y
    // la cabecera la leía con getters locales.
    vi.stubEnv('TZ', 'America/Los_Angeles');
    const groups = agrupar([review(1, Date.parse('2026-08-12T20:00:00.000Z'))]);

    expect(groups[0].dayHeader).toBe('12 de agosto');
  });

  it('ordena los días de más reciente a más antiguo', () => {
    vi.stubEnv('TZ', 'Europe/Madrid');
    const groups = agrupar([
      review(1, Date.parse('2026-07-31T09:00:00.000Z')),
      review(2, TARDE_DEL_12),
      review(3, Date.parse('2026-08-09T09:00:00.000Z')),
    ]);

    expect(groups.map((group) => group.dayHeader)).toEqual(['12 de agosto', '9 de agosto', '31 de julio']);
  });

  it('descarta los timestamps inválidos sin crear un grupo fantasma', () => {
    vi.stubEnv('TZ', 'Europe/Madrid');
    const groups = agrupar([review(1, TARDE_DEL_12), review(2, 8.64e15 * 10), review(3, 0)]);

    expect(groups).toHaveLength(1);
    expect(juegosDe(groups[0])).toEqual([1]);
  });
});
