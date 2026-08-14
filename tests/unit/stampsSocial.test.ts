// Los sellos automáticos frente al CANAL SOCIAL y al panel de otra persona.
//
// Dos preguntas distintas y las dos importan:
//  1. Que `enteredAt`/`gradedAt` no salgan de este aparato. Son un registro de cuándo mueves cada juego y a qué
//     hora usas la app: describe hábitos, no una lista de juegos.
//  2. Que el panel de un amigo no enseñe como completo un dato que llega a medias, ahora que hay dos cifras
//     nuevas en la cabecera.
import { describe, expect, it } from 'vitest';
import { assertNoSocialPrivateFields, toPublicGame } from '../../src/model/repository/socialProjection';
import { applyProfileVisibility } from '../../src/core/utils/profileVisibility';
import { friendStatsBlocks, toFriendTabData } from '../../src/core/stats/friendStats';
import { computeStats } from '../../src/core/stats/computeStats';
import type { GameItem, TabData } from '../../src/model/types/game';

const STAMPS = { p: 1_700_000_000_000, e: 1_740_000_000_000, c: 1_780_000_000_000 };

function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return {
    _ts: 1_780_000_000_000,
    name: `Game ${extra.id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: 'Una reseña cualquiera',
    enteredAt: STAMPS,
    gradedAt: STAMPS.c,
    listedAt: STAMPS.c,
    ...extra,
  };
}

function tabData(lists: Partial<Record<'c' | 'v' | 'e' | 'p', GameItem[]>>): TabData {
  return { c: [], v: [], e: [], p: [], ...lists, deleted: [], updatedAt: 0 };
}

describe('el canal social no publica los sellos', () => {
  const shared = game({ id: 1, years: [2024], grade: 90, score: 5, replayable: true, hours: 42 });

  it('la proyección pública de un juego no los copia', () => {
    const published = toPublicGame(shared, 'c') as unknown as Record<string, unknown>;
    expect('enteredAt' in published).toBe(false);
    expect('gradedAt' in published).toBe(false);
    // Y lo que sí publica sigue siendo lo de siempre: el año, no el día.
    expect(published.years).toEqual([2024]);
  });

  it('la guarda de privacidad los rechaza si alguien los cuela en el gist', () => {
    expect(() => assertNoSocialPrivateFields({ profile: { sharedLists: { c: [{ id: 1, enteredAt: STAMPS }] } } })).toThrow(
      /enteredAt/,
    );
    expect(() => assertNoSocialPrivateFields({ profile: { sharedLists: { c: [{ id: 1, gradedAt: 1 }] } } })).toThrow(
      /gradedAt/,
    );
  });

  it('la proyección de una lista entera pasa la guarda', () => {
    const published = tabData({ c: [shared] }).c.map((item) => toPublicGame(item, 'c'));
    expect(() => assertNoSocialPrivateFields({ profile: { sharedLists: { c: published } } })).not.toThrow();
  });
});

describe('el panel de otra persona', () => {
  /** Lo que de verdad llega de un amigo: la proyección pública, sin sellos ni campos privados. */
  const publicGames = [toPublicGame(game({ id: 1, years: [2024], grade: 90, score: 5, replayable: true }), 'c')].map(
    (published) => ({
      id: published.id,
      name: published.name,
      platforms: published.platforms,
      genres: published.genres,
      rating: published.rating ?? 0,
      grade: published.grade ?? 0,
      snippet: published.snippet,
      years: published.years ?? [],
    }),
  );

  it('lo que se calcula de un amigo no trae sellos: no hay constancia que enseñar', () => {
    const data = toFriendTabData({ c: publicGames }, ['c'], 'public');
    const stats = computeStats(data);
    expect(data.c[0].enteredAt).toBeUndefined();
    expect(stats.activity.weeks).toEqual([]);
  });

  it('la constancia no es un bloque que ningún rango pueda ver', () => {
    for (const tier of ['bronze', 'silver', 'gold', 'mithril'] as const) {
      expect(friendStatsBlocks(tier)).not.toContain('activity');
    }
  });

  it('la rejugabilidad se queda en la administración: `replayable` es privado', () => {
    expect(friendStatsBlocks('silver')).not.toContain('replay');
    expect(friendStatsBlocks('gold')).not.toContain('replay');
    expect(friendStatsBlocks('mithril')).toContain('replay');
  });

  it('la exigencia sí se puede calcular de un amigo: sale de las notas, que el canal publica', () => {
    const stats = computeStats(toFriendTabData({ c: publicGames }, ['c'], 'public'));
    expect(stats.demand.count).toBe(1);
    expect(stats.demand.avgGrade).toBe(90);
    expect(friendStatsBlocks('silver')).toContain('demand');
  });

  it('la evolución del gusto también: género y año viajan por el canal', () => {
    const stats = computeStats(toFriendTabData({ c: publicGames }, ['c'], 'public'));
    expect(stats.genreRanks.series.length + stats.genreRanks.years.length).toBeGreaterThanOrEqual(0);
    expect(friendStatsBlocks('bronze')).toContain('genreRanks');
  });

  it('el gist de LISTADOS tampoco los deja pasar, ni siquiera a la administración', () => {
    // Este es el otro camino, y es el que se escapaba: una amistad baja el gist de listados para ver su perfil,
    // y ahí los juegos van completos. El filtro de visibilidad —donde ya se recortan horas y marcas— los quita.
    const visibility = { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true };
    for (const tier of ['gold', 'mithril'] as const) {
      const visible = applyProfileVisibility(tabData({ c: [game({ id: 1, years: [2024], grade: 90, score: 5 })] }), visibility, tier);
      expect(visible.c[0].enteredAt).toBeUndefined();
      expect(visible.c[0].gradedAt).toBeUndefined();
      // Y lo que sí es del juego sigue llegando.
      expect(visible.c[0].years).toEqual([2024]);
    }
  });

  it('con datos COMPLETOS, lo que llega ya viene sin sellos', () => {
    const data = toFriendTabData({ c: publicGames }, ['c'], 'full');
    expect(data.c[0].enteredAt).toBeUndefined();
    expect(data.c[0].gradedAt).toBeUndefined();
  });
});

describe('el hub social y la ruleta', () => {
  it('la ruleta no depende de los sellos: su pool sale de `replayable` y `retry`', async () => {
    const { buildListsPool } = await import('../../src/core/roulette/roulette');
    const withStamps = tabData({
      c: [game({ id: 1, replayable: true, grade: 90, score: 5, years: [2024] })],
      v: [game({ id: 2, retry: true, grade: 40, score: 2 })],
    });
    const withoutStamps = tabData({
      c: [{ ...game({ id: 1, replayable: true, grade: 90, score: 5, years: [2024] }), enteredAt: undefined, gradedAt: undefined }],
      v: [{ ...game({ id: 2, retry: true, grade: 40, score: 2 }), enteredAt: undefined, gradedAt: undefined }],
    });
    // El mismo pool con sellos y sin ellos: los campos nuevos no cambian a qué juega la ruleta.
    expect(buildListsPool(withStamps).map((entry) => entry.game.id)).toEqual(
      buildListsPool(withoutStamps).map((entry) => entry.game.id),
    );
  });

  it('un juego añadido desde el perfil de otra persona nace con su sello de próximos', () => {
    // La ruleta social ofrece «añadir a mis próximos»: ese alta también tiene que quedar fechada, porque es el
    // principio de la historia de ese juego en la biblioteca de quien lo añade.
    const now = 1_800_000_000_000;
    const added: GameItem = {
      id: 9,
      _ts: now,
      name: 'Prestado',
      platforms: ['Steam'],
      genres: ['RPG'],
      steamDeck: false,
      review: '',
      listedAt: now,
      enteredAt: { p: now },
    };
    const stats = computeStats(tabData({ p: [added] }));
    expect(stats.activity.active).toBe(1);
  });
});
