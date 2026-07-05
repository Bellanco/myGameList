import { describe, expect, it } from 'vitest';
import { removeReviewActivity, type SocialActivityEntry, type SocialGistData } from '../../src/model/repository/gistRepository';

function activity(over: Partial<SocialActivityEntry>): SocialActivityEntry {
  const actorProfileId = over.actorProfileId ?? 'me';
  const gameId = over.gameId ?? 1;
  const type = over.type ?? 'review';
  return {
    id: `${actorProfileId}:${gameId}:${type}`,
    key: `${actorProfileId}:${gameId}:${type}`,
    type,
    actorProfileId,
    actorName: 'Yo',
    gameId,
    gameName: 'Juego',
    rating: 4,
    grade: 80,
    recommendationText: '',
    snippet: 'reseña',
    createdAt: 1_000,
    updatedAt: 1_000,
    ...over,
  };
}

function baseData(entries: SocialActivityEntry[]): SocialGistData {
  return {
    profile: { name: 'Yo', private: false, favoriteGames: [], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
    activity: entries,
    posts: [],
    updatedAt: 1_000,
    schemaVersion: 2,
  } as unknown as SocialGistData;
}

describe('removeReviewActivity — despublicar reseña huérfana', () => {
  it('elimina la reseña del juego indicado del autor indicado', () => {
    const data = baseData([
      activity({ actorProfileId: 'me', gameId: 7, type: 'review' }),
      activity({ actorProfileId: 'me', gameId: 9, type: 'review' }),
    ]);
    const next = removeReviewActivity(data, { actorProfileId: 'me', gameId: 7, timestamp: 5_000 });
    expect(next).not.toBe(data);
    expect(next.activity.map((e) => e.gameId)).toEqual([9]);
    expect(next.updatedAt).toBe(5_000);
  });

  it('no toca recomendaciones ni reseñas de otros juegos/autores', () => {
    const data = baseData([
      activity({ actorProfileId: 'me', gameId: 7, type: 'review' }),
      activity({ actorProfileId: 'me', gameId: 7, type: 'recommendation' }), // mismo juego, otro tipo
      activity({ actorProfileId: 'other', gameId: 7, type: 'review' }), // otro autor
    ]);
    const next = removeReviewActivity(data, { actorProfileId: 'me', gameId: 7 });
    expect(next.activity).toHaveLength(2);
    expect(next.activity.some((e) => e.actorProfileId === 'me' && e.gameId === 7 && e.type === 'review')).toBe(false);
    expect(next.activity.some((e) => e.type === 'recommendation')).toBe(true);
    expect(next.activity.some((e) => e.actorProfileId === 'other')).toBe(true);
  });

  it('devuelve la MISMA referencia si no hay nada que quitar (no fuerza reescritura del gist)', () => {
    const data = baseData([activity({ actorProfileId: 'me', gameId: 9, type: 'review' })]);
    expect(removeReviewActivity(data, { actorProfileId: 'me', gameId: 7 })).toBe(data);
    expect(removeReviewActivity(data, { actorProfileId: 'me', gameId: 0 })).toBe(data); // gameId inválido
    expect(removeReviewActivity(data, { actorProfileId: '', gameId: 9 })).toBe(data); // sin autor
  });
});
