import { describe, expect, it } from 'vitest';
import { mergeSocialGistData, type SocialGistData } from '../../src/model/repository/gistRepository';

// Deriva de gist social: las dos fuentes que apuntan al gist de un amigo (el `otherSocialGistId` del doc de
// amistad y el `social.gistId` del directorio) pueden divergir, y la deriva va en cualquier dirección — publicar
// una reseña sanea el directorio pero no la amistad; abrir el hub sanea ambos. Elegir a ciegas una de las dos
// dejaba al amigo sin actividad en el feed (con su perfil completo, porque ese sale del gist de juegos).

function activity(gameId: number, gameName: string, updatedAt: number, actor = 'pid-1') {
  return {
    id: `${actor}:${gameId}:review`,
    key: `${actor}:${gameId}:review`,
    type: 'review' as const,
    actorProfileId: actor,
    actorName: 'Ada',
    gameId,
    gameName,
    rating: 4,
    grade: 80,
    recommendationText: '',
    snippet: 'algo',
    createdAt: updatedAt,
    updatedAt,
  };
}

function post(id: string, text: string, updatedAt: number) {
  return { id, authorProfileId: 'pid-1', authorName: 'Ada', text, createdAt: updatedAt, updatedAt };
}

function gist(input: {
  name?: string;
  updatedAt: number;
  activity?: SocialGistData['activity'];
  posts?: SocialGistData['posts'];
  favorites?: Array<{ id: number; name: string }>;
}): SocialGistData {
  return {
    profile: {
      name: input.name ?? 'Ada',
      private: false,
      favoriteGames: input.favorites ?? [],
      visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true },
      sharedLists: {},
    },
    activity: input.activity ?? [],
    posts: input.posts ?? [],
    updatedAt: input.updatedAt,
    schemaVersion: 2,
  } as unknown as SocialGistData;
}

describe('mergeSocialGistData (deriva de gist social)', () => {
  it('une la actividad de los dos gists sin perder la del que resultó ser el antiguo', () => {
    const viejo = gist({ updatedAt: 1_000, activity: [activity(1, 'Celeste', 900)] });
    const nuevo = gist({ updatedAt: 2_000, activity: [activity(2, 'Hades', 1_900)] });

    const merged = mergeSocialGistData(viejo, nuevo);

    expect(merged.activity.map((entry) => entry.gameId)).toEqual([2, 1]); // ordenada por fecha desc
  });

  it('es simétrica en la actividad (da igual el orden de lectura)', () => {
    const a = gist({ updatedAt: 1_000, activity: [activity(1, 'Celeste', 900)] });
    const b = gist({ updatedAt: 2_000, activity: [activity(2, 'Hades', 1_900)] });

    expect(mergeSocialGistData(a, b).activity.map((e) => e.gameId).sort())
      .toEqual(mergeSocialGistData(b, a).activity.map((e) => e.gameId).sort());
  });

  it('con la misma reseña en ambos, conserva la versión más reciente', () => {
    const viejo = gist({ updatedAt: 1_000, activity: [activity(1, 'Titulo viejo', 900)] });
    const nuevo = gist({ updatedAt: 2_000, activity: [activity(1, 'Titulo nuevo', 1_900)] });

    const merged = mergeSocialGistData(viejo, nuevo);

    expect(merged.activity).toHaveLength(1);
    expect(merged.activity[0].gameName).toBe('Titulo nuevo');
  });

  it('el perfil sale del gist con updatedAt mayor', () => {
    const viejo = gist({ name: 'Nick viejo', updatedAt: 5_000, favorites: [{ id: 1, name: 'Celeste' }] });
    const nuevo = gist({ name: 'Nick nuevo', updatedAt: 9_000, favorites: [{ id: 2, name: 'Hades' }] });

    expect(mergeSocialGistData(viejo, nuevo).profile.name).toBe('Nick nuevo');
    expect(mergeSocialGistData(nuevo, viejo).profile.name).toBe('Nick nuevo');
    expect(mergeSocialGistData(viejo, nuevo).profile.favoriteGames).toEqual([{ id: 2, name: 'Hades' }]);
  });

  it('une también las publicaciones, deduplicadas por id', () => {
    const a = gist({ updatedAt: 1_000, posts: [post('p1', 'hola', 900)] });
    const b = gist({ updatedAt: 2_000, posts: [post('p1', 'hola editado', 1_800), post('p2', 'otra', 1_900)] });

    const merged = mergeSocialGistData(a, b);

    expect(merged.posts?.map((entry) => entry.id)).toEqual(['p2', 'p1']);
    expect(merged.posts?.find((entry) => entry.id === 'p1')?.text).toBe('hola editado');
  });

  it('un gist vacío no borra la actividad del otro', () => {
    const conActividad = gist({ updatedAt: 1_000, activity: [activity(1, 'Celeste', 900)] });
    const vacioPeroReciente = gist({ updatedAt: 3_000 });

    expect(mergeSocialGistData(conActividad, vacioPeroReciente).activity).toHaveLength(1);
  });
});
