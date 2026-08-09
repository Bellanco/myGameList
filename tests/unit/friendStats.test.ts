import { describe, expect, it } from 'vitest';
import {
  friendStatsBlocks,
  friendStatsHasYearTabs,
  friendVisibleTabs,
  toFriendTabData,
} from '../../src/core/stats/friendStats';
import { computeStats } from '../../src/core/stats/computeStats';
import type { SocialSharedGame } from '../../src/model/repository/socialGistRepository';

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
