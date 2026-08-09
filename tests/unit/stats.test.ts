import { describe, expect, it } from 'vitest';
import { computeStats } from '../../src/core/stats/computeStats';
import type { GameItem, TabData } from '../../src/model/types/game';

// Reglas que fija este test (son decisiones de producto, no detalles de implementación):
//  - "Próximos" no cuenta como jugado: ni horas, ni géneros, ni su nota (ahí el campo es el INTERÉS previo).
//  - "En curso" no puntúa: no tiene campo de nota, solo arrastraría la de un paso anterior.
//  - Las horas de un juego completado varias veces cuentan enteras en el ÚLTIMO año (no se reparten).
//  - Los completados sin año caen en un cajón aparte en vez de desaparecer del gráfico.

function game(overrides: Partial<GameItem> & { name: string }): GameItem {
  return {
    id: 1,
    _ts: 0,
    platforms: [],
    genres: [],
    steamDeck: false,
    review: '',
    ...overrides,
  };
}

function tabData(overrides: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0, ...overrides };
}

describe('computeStats', () => {
  it('con la biblioteca vacía devuelve todo a cero y sin años', () => {
    const stats = computeStats(tabData());

    expect(stats.totalGames).toBe(0);
    expect(stats.totalHours).toBe(0);
    expect(stats.years).toEqual([]);
    expect(stats.scored).toEqual({ count: 0, avgGrade: 0 });
    expect(stats.completionRatio.percent).toBe(0);
    expect(stats.longest).toBeNull();
    expect(stats.grades.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it('suma horas de las listas jugadas y deja fuera próximos', () => {
    const stats = computeStats(tabData({
      c: [game({ id: 1, name: 'Completado', hours: 20, years: [2024] })],
      v: [game({ id: 2, name: 'Abandonado', hours: 5 })],
      e: [game({ id: 3, name: 'En curso', hours: 3 })],
      p: [game({ id: 4, name: 'Próximo', hours: 99 })],
    }));

    expect(stats.totalHours).toBe(28);
    expect(stats.completedHours).toBe(20);
    expect(stats.totalGames).toBe(4);
    expect(stats.counts).toEqual({ c: 1, v: 1, e: 1, p: 1 });
  });

  it('atribuye las horas de un rejugado al último año, sin repartirlas', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: 'Rejugado', hours: 100, years: [2019, 2023] }),
        game({ id: 2, name: 'De 2019', hours: 10, years: [2019] }),
      ],
    }));

    expect(stats.years).toEqual([
      { year: 2019, completed: 1, hours: 10 },
      { year: 2023, completed: 1, hours: 100 },
    ]);
    // El total del gráfico sigue cuadrando con las horas de completados: no se pierde ni se duplica nada.
    expect(stats.years.reduce((sum, bucket) => sum + bucket.hours, 0)).toBe(stats.completedHours);
  });

  it('manda los completados sin año a un cajón propio, al final de la serie', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: 'Sin año', hours: 4 }),
        game({ id: 2, name: 'Con año', hours: 6, years: [2021] }),
      ],
    }));

    expect(stats.years.map((bucket) => bucket.year)).toEqual([2021, null]);
    expect(stats.years[1]).toEqual({ year: null, completed: 1, hours: 4 });
  });

  it('puntúa completados y abandonados con nota, pero no próximos ni en curso', () => {
    const stats = computeStats(tabData({
      c: [game({ id: 1, name: 'Completado', grade: 90 })],
      v: [
        game({ id: 2, name: 'Abandonado puntuado', grade: 30, scored: true }),
        game({ id: 3, name: 'Abandonado sin nota', grade: 0 }),
      ],
      e: [game({ id: 4, name: 'En curso con nota heredada', grade: 100 })],
      p: [game({ id: 5, name: 'Próximo con interés alto', grade: 100 })],
    }));

    expect(stats.scored.count).toBe(2);
    expect(stats.scored.avgGrade).toBe(60);
    expect(stats.grades.find((bucket) => bucket.stars === 5)?.count).toBe(1);
    expect(stats.grades.find((bucket) => bucket.stars === 2)?.count).toBe(1);
  });

  it('cuenta la nota legacy en estrellas aunque no haya `grade` ni flag `scored`', () => {
    // Los juegos guardados antes de la nota fina traen solo `score` 0–5, y en la vergüenza tampoco traen el
    // flag: mirando el flag se les descartaría una puntuación que sí pusieron.
    const stats = computeStats(tabData({
      v: [game({ id: 1, name: 'Legacy', score: 4 })],
    }));

    expect(stats.scored.count).toBe(1);
    expect(stats.scored.avgGrade).toBe(80);
    expect(stats.grades.find((bucket) => bucket.stars === 4)?.count).toBe(1);
  });

  it('ordena los géneros por juegos y suma las horas en cada uno de los del juego', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: 'A', hours: 10, genres: ['RPG', 'Acción'], years: [2024] }),
        game({ id: 2, name: 'B', hours: 4, genres: ['RPG'], years: [2024] }),
      ],
      p: [game({ id: 3, name: 'Deseado', genres: ['Estrategia'] })],
    }));

    expect(stats.genres).toEqual([
      { tag: 'RPG', games: 2, hours: 14 },
      { tag: 'Acción', games: 1, hours: 10 },
    ]);
  });

  it('calcula el ratio de completados sobre los juegos ya cerrados', () => {
    const stats = computeStats(tabData({
      c: [game({ id: 1, name: 'A' }), game({ id: 2, name: 'B' }), game({ id: 3, name: 'C' })],
      v: [game({ id: 4, name: 'D' })],
      e: [game({ id: 5, name: 'E' })],
    }));

    expect(stats.completionRatio).toEqual({ completed: 3, abandoned: 1, percent: 75 });
  });

  it('encuentra el juego con más horas entre las listas jugadas', () => {
    const stats = computeStats(tabData({
      c: [game({ id: 1, name: 'Corto', hours: 12 })],
      v: [game({ id: 2, name: 'Larguísimo', hours: 200 })],
      p: [game({ id: 3, name: 'Deseado con horas importadas', hours: 500 })],
    }));

    expect(stats.longest).toEqual({ name: 'Larguísimo', hours: 200 });
  });

  it('ignora las filas sin nombre y las horas mal formadas', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: '   ' }),
        game({ id: 2, name: 'Válido', hours: null }),
        game({ id: 3, name: 'Horas raras', hours: Number.NaN }),
      ],
    }));

    expect(stats.counts.c).toBe(2);
    expect(stats.totalHours).toBe(0);
    expect(stats.longest).toBeNull();
  });
});
