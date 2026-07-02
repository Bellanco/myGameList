import { afterEach, describe, expect, it, vi } from 'vitest';
import { readSocialGist } from '../../src/model/repository/gistRepository';

// BUG 4/5: la actividad social se normaliza al leer (y al escribir). Dentro de UN gist (un único actor) el par
// (gameId, type) identifica una sola reseña, así que:
//  - BUG 4: para una misma clave gana la entrada de `updatedAt` MAYOR (antes ganaba la más antigua → título viejo).
//  - BUG 5: la transición de identidad uid→profileId deja dos entradas del MISMO juego con claves DISTINTAS; se
//    colapsan en la más reciente → un lector ve UNA tarjeta con el título actualizado (no dos, ni la vieja).
const TOKEN = 'ghp_0123456789abcdefghij';
const SOCIAL_GIST_FILENAME = 'myGameList.social.json';

/** Stub de fetch que devuelve un gist social con el contenido dado (200, sin honrar If-None-Match). */
function stubSocialGist(content: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ files: { [SOCIAL_GIST_FILENAME]: { content: JSON.stringify(content) } } }), {
      status: 200,
      headers: { etag: 'W/"soc-1"' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalización de actividad social (dedup por gameId+type)', () => {
  it('BUG 5: colapsa la reseña duplicada por identidad legacy (uid + profileId) en la más reciente', async () => {
    const raw = {
      profile: { name: 'Ana', private: false, favoriteGames: [], visibility: {} },
      activity: [
        // Entrada VIEJA keyed por uid (título antiguo, updatedAt menor).
        { type: 'review', actorProfileId: 'uid-1', gameId: 5, gameName: 'Nombre Viejo', rating: 4, snippet: 'x', createdAt: 1000, updatedAt: 1000 },
        // Entrada NUEVA keyed por profileId (mismo juego, título nuevo, updatedAt mayor).
        { type: 'review', actorProfileId: 'pid-1', gameId: 5, gameName: 'Nombre Nuevo', rating: 5, snippet: 'y', createdAt: 1000, updatedAt: 2000 },
      ],
    };
    stubSocialGist(raw);

    const { data } = await readSocialGist(TOKEN, 'ded00001');
    const reviews = data.activity.filter((a) => a.type === 'review' && a.gameId === 5);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].gameName).toBe('Nombre Nuevo');
  });

  it('BUG 4: para la misma clave conserva el título de la entrada con updatedAt mayor, no la primera del array', async () => {
    const raw = {
      profile: { name: 'Ana', private: false, favoriteGames: [], visibility: {} },
      activity: [
        // La MÁS NUEVA aparece primero en el array...
        { type: 'review', actorProfileId: 'pid-1', gameId: 9, gameName: 'Título Actual', rating: 5, snippet: 'y', createdAt: 1000, updatedAt: 3000 },
        // ...y una copia VIEJA con la MISMA clave después (título viejo, updatedAt menor).
        { type: 'review', actorProfileId: 'pid-1', gameId: 9, gameName: 'Título Rancio', rating: 3, snippet: 'x', createdAt: 1000, updatedAt: 1500 },
      ],
    };
    stubSocialGist(raw);

    const { data } = await readSocialGist(TOKEN, 'ded00002');
    const reviews = data.activity.filter((a) => a.type === 'review' && a.gameId === 9);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].gameName).toBe('Título Actual');
  });

  it('no colapsa reseña y recomendación del mismo juego (distinto type)', async () => {
    const raw = {
      profile: { name: 'Ana', private: false, favoriteGames: [], visibility: {} },
      activity: [
        { type: 'review', actorProfileId: 'pid-1', gameId: 7, gameName: 'Celeste', rating: 5, snippet: 'buenísimo', createdAt: 1000, updatedAt: 2000 },
        { type: 'recommendation', actorProfileId: 'pid-1', gameId: 7, gameName: 'Celeste', rating: 5, snippet: '', createdAt: 1000, updatedAt: 2000 },
      ],
    };
    stubSocialGist(raw);

    const { data } = await readSocialGist(TOKEN, 'ded00003');
    const forGame = data.activity.filter((a) => a.gameId === 7);
    expect(forGame).toHaveLength(2);
    expect(new Set(forGame.map((a) => a.type))).toEqual(new Set(['review', 'recommendation']));
  });
});
