import { describe, expect, it } from 'vitest';
import {
  friendGamesAreFull,
  friendStatsBlocks,
  friendStatsData,
  friendStatsHasYearTabs,
  friendVisibleTabs,
  toFriendTabData,
} from '../../src/core/stats/friendStats';
import { computeStats } from '../../src/core/stats/computeStats';
import type { SocialSharedGame } from '../../src/model/repository/socialGistRepository';
import type { GameItem } from '../../src/model/types/game';

function shared(overrides: Partial<SocialSharedGame> & { id: number; name: string }): SocialSharedGame {
  return { platforms: [], genres: [], rating: 0, grade: 0, snippet: '', ...overrides };
}

describe('friendStats · qué ve cada rango', () => {
  it('bronce se queda en el retrato: nada de notas ni de ratio', () => {
    const blocks = friendStatsBlocks('bronze');

    expect(blocks).toEqual(['top', 'years', 'radar', 'genres']);
    expect(blocks).not.toContain('grades');
    expect(blocks).not.toContain('ratio');
  });

  it('plata y oro ven lo mismo: todo lo que se puede calcular del canal social', () => {
    expect(friendStatsBlocks('silver')).toEqual(friendStatsBlocks('gold'));
    expect(friendStatsBlocks('gold')).toContain('grades');
    expect(friendStatsBlocks('gold')).toContain('ratio');
    // Las listas y el backlog se quedan para la administración.
    expect(friendStatsBlocks('gold')).not.toContain('shame');
    expect(friendStatsBlocks('gold')).not.toContain('backlog');
  });

  it('mithril ve el panel completo, el mismo que en su perfil', () => {
    const blocks = friendStatsBlocks('mithril');

    expect(blocks).toContain('shame');
    expect(blocks).toContain('wishlist');
    expect(blocks).toContain('backlog');
    // Menos las reseñas, que tienen su propio apartado en el perfil.
    expect(blocks).not.toContain('reviews');
  });

  it('solo la administración calcula con los juegos completos', () => {
    expect(friendStatsData('mithril')).toBe('full');
    expect(friendStatsData('gold')).toBe('public');
    expect(friendStatsData('silver')).toBe('public');
    expect(friendStatsData('bronze')).toBe('public');
  });

  it('solo mithril puede cambiar de periodo', () => {
    expect(friendStatsHasYearTabs('mithril')).toBe(true);
    expect(friendStatsHasYearTabs('gold')).toBe(false);
    expect(friendStatsHasYearTabs('bronze')).toBe(false);
  });
});

describe('friendStats · reciprocidad', () => {
  it('lo que escondes de tus listas tampoco lo ves de las suyas', () => {
    const { tabs, blockedByViewer } = friendVisibleTabs(['c', 'v', 'p'], ['v'], 'gold');

    expect(tabs).toEqual(['c', 'p']);
    expect(blockedByViewer).toEqual(['v']);
  });

  it('quien lo esconde todo se queda sin panel', () => {
    const { tabs, blockedByViewer } = friendVisibleTabs(['c', 'v'], ['c', 'v', 'e', 'p'], 'silver');

    expect(tabs).toEqual([]);
    expect(blockedByViewer).toEqual(['c', 'v']);
  });

  it('la cuenta de administración ve lo que le llegue, esconda lo que esconda', () => {
    const { tabs, blockedByViewer } = friendVisibleTabs(['c', 'v'], ['c', 'v'], 'mithril');

    expect(tabs).toEqual(['c', 'v']);
    expect(blockedByViewer).toEqual([]);
  });

  it('lo que el amigo no comparte no aparece por mucho rango que se tenga', () => {
    expect(friendVisibleTabs(['c'], [], 'mithril').tabs).toEqual(['c']);
  });
});

describe('friendStats · datos que llegan del canal social', () => {
  const lists = {
    c: [
      shared({ id: 1, name: 'Uno', grade: 90, genres: ['RPG'], platforms: ['PC'], years: [2023, 2024] }),
      shared({ id: 2, name: 'Dos', grade: 60, genres: ['RPG'] }),
    ],
    v: [shared({ id: 3, name: 'Tres', genres: ['Acción'] })],
  };

  it('solo pasa las listas permitidas', () => {
    const data = toFriendTabData(lists, ['c']);

    expect(data.c).toHaveLength(2);
    expect(data.v).toHaveLength(0);
  });

  it('conserva años y nota, y deja en blanco lo que el canal no publica', () => {
    const [game] = toFriendTabData(lists, ['c']).c;

    expect(game.years).toEqual([2023, 2024]);
    expect(game.grade).toBe(90);
    expect(game.scored).toBe(true);
    // Las horas son privadas: no viajan y aquí no se inventan.
    expect(game.hours).toBeUndefined();
    expect(game.review).toBe('');
  });

  it('un juego sin nota no cuenta como puntuado', () => {
    const [, sinNota] = toFriendTabData({ c: [lists.c[0], shared({ id: 9, name: 'Sin nota' })] }, ['c']).c;

    expect(sinNota.scored).toBe(false);
    expect(sinNota.grade).toBeNull();
  });

  it('el panel del amigo se calcula con el mismo motor que el propio', () => {
    const stats = computeStats(toFriendTabData(lists, ['c', 'v']));

    expect(stats.totalGames).toBe(3);
    expect(stats.counts.c).toBe(2);
    expect(stats.counts.v).toBe(1);
    // 90 y 60 puntuados; el abandonado sin nota no entra en la media.
    expect(stats.scored.count).toBe(2);
    expect(stats.scored.avgGrade).toBe(75);
    // Los años publicados alimentan el "año a año": 2024 es el último en que completó "Uno".
    expect(stats.years.map((bucket) => bucket.year)).toContain(2024);
    // Y sin horas, las cifras de tiempo se quedan a cero en vez de mentir.
    expect(stats.totalHours).toBe(0);
  });

  it('con las listas escondidas por reciprocidad, esas partidas no cuentan', () => {
    const { tabs } = friendVisibleTabs(['c', 'v'], ['v'], 'silver');
    const stats = computeStats(toFriendTabData(lists, tabs));

    expect(stats.totalGames).toBe(2);
    expect(stats.counts.v).toBe(0);
  });
});

// ── Nivel `full`: los juegos del gist de LISTADOS, que solo usa la administración ───────────────────────────

describe('friendStats · juegos completos del amigo', () => {
  const completos: Record<'c' | 'v', GameItem[]> = {
    c: [{ id: 1, _ts: 5, name: 'Uno', platforms: ['PC'], genres: ['RPG'], steamDeck: true, review: 'Un juegazo', strengths: ['Historia'], grade: 90, hours: 30, years: [2024], listedAt: 1_700_000_000_000 }],
    v: [{ id: 2, _ts: 6, name: 'Dos', platforms: ['PC'], genres: ['Terror'], steamDeck: false, review: '', grade: 30, hours: 4, retry: true, reasons: ['Se hace repetitivo'] }],
  };

  it('distingue los juegos completos de la proyección pública', () => {
    expect(friendGamesAreFull(completos)).toBe(true);
    expect(friendGamesAreFull({ c: [shared({ id: 1, name: 'Uno' })] })).toBe(false);
    expect(friendGamesAreFull({})).toBe(false);
  });

  it('en `full` conserva horas, razones y fecha de llegada', () => {
    const data = toFriendTabData(completos, ['c', 'v'], 'full');

    expect(data.c[0].hours).toBe(30);
    expect(data.c[0].listedAt).toBe(1_700_000_000_000);
    expect(data.v[0].retry).toBe(true);
    expect(data.v[0].reasons).toEqual(['Se hace repetitivo']);
  });

  it('pero nunca sus reseñas: eso tiene su propio apartado en el perfil', () => {
    const data = toFriendTabData(completos, ['c'], 'full');

    expect(data.c[0].review).toBe('');
    expect(data.c[0].strengths).toEqual([]);
    expect(data.c[0].weaknesses).toEqual([]);
  });

  it('en `public` los juegos completos se aplastan a lo que publica el canal social', () => {
    const data = toFriendTabData(completos, ['c', 'v'], 'public');

    expect(data.c[0].hours).toBeUndefined();
    expect(data.c[0].listedAt).toBeUndefined();
    expect(data.c[0].steamDeck).toBe(false);
    expect(data.v[0].retry).toBeUndefined();
    expect(data.v[0].reasons).toBeUndefined();
    // Lo que sí publica sigue en pie: nombre, géneros, nota y años.
    expect(data.c[0].grade).toBe(90);
    expect(data.c[0].years).toEqual([2024]);
  });

  it('con los juegos completos el panel puede contar horas y evolución del backlog', () => {
    const stats = computeStats(toFriendTabData(completos, ['c', 'v'], 'full'));

    expect(stats.totalHours).toBe(34);
    expect(stats.shame.retry).toBe(1);
    expect(stats.shame.reasons.map((tag) => tag.tag)).toEqual(['Se hace repetitivo']);
    expect(stats.arrivals.length).toBeGreaterThan(0);
    // Y sus reseñas siguen fuera del cálculo, no solo del pintado.
    expect(stats.reviews.count).toBe(0);
  });
});
