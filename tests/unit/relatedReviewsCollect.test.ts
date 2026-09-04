// Recolección de candidatas para el bloque de reseñas relacionadas.
//
// El módulo puro (`relatedReviews.test.ts`) ya cubre cómo se ordenan; aquí se comprueba lo que solo puede
// fallar al juntar las fuentes, que es donde están los cables cruzados de este canal:
//
//  1. Que las reseñas propias SIN publicar cuentan. Son la mitad del valor del bloque —tienes muchas más
//     escritas que publicadas— y solo llegan por la biblioteca local.
//  2. Que la misma reseña propia llegando por las dos puertas se ofrece UNA vez y con el texto completo.
//  3. Que el candidato ajeno se identifica con el `actorProfileId` del gist y no con el id de la entrada del
//     directorio: son identificadores distintos de la misma persona, y con el equivocado el enlace abre una
//     pantalla vacía.
//  4. Que el índice de géneros se arma con lo único que los conoce (biblioteca propia y listados bajados),
//     porque por el canal social los géneros no viajan.
//  5. Que sin reseña abierta no se recolecta nada: mientras se navega el feed, esto no debe trabajar.
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRelatedReviews } from '../../src/viewmodel/social/useRelatedReviews';
import type { RelatedReviewAnchor } from '../../src/core/social/relatedReviews';
import type { SocialActivityFeedItem } from '../../src/viewmodel/social/socialFeed';
import type { GameItem, TabData } from '../../src/model/types/game';

const T = Date.UTC(2026, 0, 15, 10, 0);

/** Entrada de actividad tal y como la deja el directorio ya hidratado. */
function activity(extra: Partial<SocialActivityFeedItem> & { gameId: number; gameName: string }): SocialActivityFeedItem {
  return {
    id: `act-${extra.gameId}`,
    key: `act-${extra.gameId}`,
    type: 'review',
    actorProfileId: 'pseudonimo-de-ana',
    actorName: 'Ana',
    rating: 4,
    grade: 80,
    recommendationText: '',
    snippet: 'Adelanto del canal…',
    createdAt: T,
    updatedAt: T,
    profileId: 'uid-de-ana',
    profileDisplayName: 'Ana',
    socialGistId: 'ffee1122aabb0001',
    photoURL: '',
    ...extra,
  } as unknown as SocialActivityFeedItem;
}

function game(extra: Partial<GameItem> & { id: number; name: string }): GameItem {
  return {
    _ts: T,
    platforms: ['PC'],
    genres: [],
    steamDeck: false,
    review: '',
    ...extra,
  } as GameItem;
}

function lists(games: Partial<Record<'c' | 'v' | 'e' | 'p', GameItem[]>>): TabData {
  return { c: [], v: [], e: [], p: [], ...games, deleted: [], updatedAt: 0 };
}

function collect(input: {
  anchor: RelatedReviewAnchor | null;
  directory?: Array<{ id: string; activity?: SocialActivityFeedItem[] }>;
  localGames?: TabData;
  foreignGames?: Record<string, Record<'c' | 'v' | 'e' | 'p', GameItem[]>>;
  ownProfileIds?: string[];
}) {
  const own = new Set(input.ownProfileIds || ['uid-propio']);
  const { result } = renderHook(() =>
    useRelatedReviews({
      anchor: input.anchor,
      directory: input.directory || [],
      localGames: input.localGames || lists({}),
      foreignGames: input.foreignGames || {},
      isOwnProfile: (profileId: string) => own.has(profileId),
      ownDisplayName: 'Diego',
    }));
  return result.current;
}

const anchorAjena: RelatedReviewAnchor = { gameName: 'Elden Ring', authorId: 'pseudonimo-de-luis', isOwn: false };

describe('useRelatedReviews — las dos puertas', () => {
  it('ofrece tus reseñas aunque NUNCA se hayan publicado al canal', () => {
    const result = collect({
      anchor: anchorAjena,
      localGames: lists({ c: [game({ id: 3, name: 'Elden Ring', review: 'Mi análisis, nunca publicado.', score: 5, grade: 92 })] }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].isOwn).toBe(true);
    expect(result[0].reason).toBe('same-game');
    expect(result[0].snippet).toBe('Mi análisis, nunca publicado.');
  });

  it('la misma reseña propia por las dos puertas se ofrece una vez y con el texto completo', () => {
    const result = collect({
      anchor: anchorAjena,
      directory: [{
        id: 'uid-propio',
        activity: [activity({
          gameId: 3,
          gameName: 'Elden Ring',
          actorProfileId: 'pseudonimo-propio',
          snippet: 'Adelanto recortado…',
          // Publicar ocurre DESPUÉS de escribir: la copia del canal es la más nueva y la mutilada.
          updatedAt: T + 60_000,
        })],
      }],
      localGames: lists({ c: [game({ id: 3, name: 'Elden Ring', review: 'Texto completo de mi análisis.', reviewedAt: T })] }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].snippet).toBe('Texto completo de mi análisis.');
  });

  it('descarta los juegos locales sin texto: un juego no es una reseña', () => {
    const result = collect({
      anchor: anchorAjena,
      localGames: lists({ c: [game({ id: 3, name: 'Elden Ring', review: '   ' })] }),
    });

    expect(result).toEqual([]);
  });
});

describe('useRelatedReviews — identidad del autor ajeno', () => {
  it('identifica al autor con el actorProfileId del gist, no con el id del directorio', () => {
    // Con el id del directorio (el uid de Firebase de la amistad), el enlace del bloque abriría una pantalla de
    // detalle que no encuentra nada: `activeDetailEvent` resuelve por `actorProfileId`.
    const result = collect({
      anchor: anchorAjena,
      directory: [{ id: 'uid-de-ana', activity: [activity({ gameId: 9, gameName: 'Elden Ring' })] }],
    });

    expect(result[0].authorId).toBe('pseudonimo-de-ana');
    expect(result[0].isOwn).toBe(false);
    expect(result[0].authorName).toBe('Ana');
  });

  it('no confunde con reseña la actividad que no lo es', () => {
    const result = collect({
      anchor: anchorAjena,
      directory: [{ id: 'uid-de-ana', activity: [activity({ gameId: 9, gameName: 'Elden Ring', type: 'recommendation' })] }],
    });

    expect(result).toEqual([]);
  });
});

describe('useRelatedReviews — índice de géneros', () => {
  it('relaciona por género usando los géneros de TU biblioteca, que el canal no publica', () => {
    // Ni el ancla ni la candidata traen géneros por el canal: los dos se conocen porque esos juegos están en las
    // listas propias. Es el caso que hace útil el motivo de género.
    const result = collect({
      anchor: anchorAjena,
      directory: [{ id: 'uid-de-ana', activity: [activity({ gameId: 9, gameName: 'Nioh 2' })] }],
      localGames: lists({
        c: [
          game({ id: 1, name: 'Elden Ring', genres: ['Acción'] }),
          game({ id: 2, name: 'Nioh 2', genres: ['Acción'] }),
        ],
      }),
    });

    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('genre');
    expect(result[0].genre).toBe('Acción');
  });

  it('también usa los listados ya bajados de una amistad', () => {
    const result = collect({
      anchor: { ...anchorAjena, genres: ['RPG'] },
      directory: [{ id: 'uid-de-ana', activity: [activity({ gameId: 9, gameName: 'Nioh 2' })] }],
      foreignGames: { 'uid-de-ana': { c: [game({ id: 9, name: 'Nioh 2', genres: ['RPG'] })], v: [], e: [], p: [] } },
    });

    expect(result[0]?.reason).toBe('genre');
  });

  it('sin géneros conocidos no relaciona por género, que es lo corriente en este canal', () => {
    const result = collect({
      anchor: anchorAjena,
      directory: [{ id: 'uid-de-ana', activity: [activity({ gameId: 9, gameName: 'Nioh 2' })] }],
    });

    expect(result).toEqual([]);
  });
});

describe('useRelatedReviews — sin reseña abierta', () => {
  it('no recolecta nada mientras se navega el feed', () => {
    const result = collect({
      anchor: null,
      directory: [{ id: 'uid-de-ana', activity: [activity({ gameId: 9, gameName: 'Elden Ring' })] }],
      localGames: lists({ c: [game({ id: 3, name: 'Elden Ring', review: 'Algo escrito.' })] }),
    });

    expect(result).toEqual([]);
  });
});
