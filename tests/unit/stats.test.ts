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
    expect(stats.scored).toEqual({ count: 0, avgGrade: 0, games: [] });
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

    // Del más reciente al más antiguo (ver `computeStats`): el año en curso es lo primero que se quiere mirar.
    expect(stats.years).toEqual([
      { year: 2023, completed: 1, hours: 100 },
      { year: 2019, completed: 1, hours: 10 },
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

    expect(stats.longest).toMatchObject({ id: 2, name: 'Larguísimo', hours: 200 });
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

// ── Resumen por año, entradas por mes y los dos apartados de listas sin año ──────────────────────────────

describe('computeStats · resumen por año', () => {
  const stats = computeStats(tabData({
    c: [
      game({ id: 1, name: 'Alto', hours: 40, grade: 95, genres: ['RPG'], platforms: ['PC'], years: [2024] }),
      game({ id: 2, name: 'Bajo', hours: 5, grade: 40, genres: ['Puzles'], platforms: ['Switch'], years: [2024] }),
      game({ id: 3, name: 'Otro año', hours: 10, grade: 80, genres: ['RPG'], years: [2023] }),
      game({ id: 4, name: 'Sin año', hours: 3, grade: 70, genres: ['RPG'] }),
    ],
  }));

  it('solo lista los años con juegos completados, del más reciente al más antiguo', () => {
    expect(stats.byYear.map((year) => year.year)).toEqual([2024, 2023]);
  });

  it('resume cada año con sus propios juegos, géneros y notas', () => {
    const y2024 = stats.byYear[0];

    expect(y2024.completed).toBe(2);
    expect(y2024.hours).toBe(45);
    expect(y2024.avgGrade).toBe(67.5);
    // Empatados a un juego: manda el que más horas acumula.
    expect(y2024.genres.map((tag) => tag.tag)).toEqual(['RPG', 'Puzles']);
    expect(y2024.platforms.map((tag) => tag.tag)).toEqual(['PC', 'Switch']);
    expect(y2024.grades.find((bucket) => bucket.stars === 5)?.count).toBe(1);
  });

  it('ordena los juegos del año de mejor a peor nota y destaca el mejor y el más largo', () => {
    const y2024 = stats.byYear[0];

    expect(y2024.games.map((entry) => entry.name)).toEqual(['Alto', 'Bajo']);
    expect(y2024.best?.name).toBe('Alto');
    expect(y2024.longest?.name).toBe('Alto');
  });

  it('el juego sin año no entra en ninguna pestaña de año', () => {
    expect(stats.byYear.flatMap((year) => year.games).map((entry) => entry.name)).not.toContain('Sin año');
  });
});

describe('computeStats · entradas por mes', () => {
  it('agrupa por el mes de `listedAt` y separa por lista', () => {
    const enero = new Date(2026, 0, 10).getTime();
    const febrero = new Date(2026, 1, 3).getTime();

    const stats = computeStats(tabData({
      c: [game({ id: 1, name: 'A', listedAt: enero }), game({ id: 2, name: 'B', listedAt: febrero })],
      p: [game({ id: 3, name: 'C', listedAt: febrero })],
    }));

    expect(stats.arrivals).toEqual([
      { m: '2026-01', c: 1, v: 0, e: 0, p: 0 },
      { m: '2026-02', c: 1, v: 0, e: 0, p: 1 },
    ]);
  });
});

describe('computeStats · lista de la vergüenza', () => {
  const stats = computeStats(tabData({
    c: [
      game({ id: 1, name: 'RPG acabado', genres: ['RPG'] }),
      game({ id: 2, name: 'Otro RPG', genres: ['RPG'] }),
      game({ id: 3, name: 'Shooter acabado', genres: ['Shooter'] }),
    ],
    v: [
      game({ id: 10, name: 'Dejado 1', hours: 6, grade: 40, genres: ['RPG'], reasons: ['Falta de tiempo'], retry: true, listedAt: 200 }),
      game({ id: 11, name: 'Dejado 2', hours: 2, genres: ['RPG'], reasons: ['Falta de tiempo', 'Repetitivo'], listedAt: 300 }),
    ],
  }));

  it('resume horas, notas y los que merecen otra oportunidad', () => {
    expect(stats.shame.total).toBe(2);
    expect(stats.shame.hours).toBe(8);
    expect(stats.shame.scored).toBe(1);
    expect(stats.shame.avgGrade).toBe(40);
    expect(stats.shame.retry).toBe(1);
  });

  it('cuenta las razones de abandono, que solo existen en esta lista', () => {
    expect(stats.shame.reasons[0]).toMatchObject({ tag: 'Falta de tiempo', games: 2 });
  });

  it('calcula el índice de abandono solo con géneros que tengan recorrido', () => {
    // RPG: 2 completados + 2 abandonados = 50%. Shooter solo tiene 1 decidido → fuera.
    expect(stats.shame.abandonRate).toEqual([{ tag: 'RPG', completed: 2, abandoned: 2, decided: 4, percent: 50 }]);
  });

  it('ordena los últimos abandonos por fecha de llegada a la lista', () => {
    expect(stats.shame.recent.map((entry) => entry.name)).toEqual(['Dejado 2', 'Dejado 1']);
  });
});

describe('computeStats · próximos', () => {
  const stats = computeStats(tabData({
    p: [
      game({ id: 1, name: 'Viejo deseo', genres: ['RPG'], platforms: ['PC'], grade: 80, listedAt: 100 }),
      game({ id: 2, name: 'Recién llegado', genres: ['RPG'], steamDeck: true, listedAt: 900 }),
    ],
  }));

  it('resume el interés previo aparte, sin mezclarlo con las valoraciones', () => {
    expect(stats.wishlist.interest).toEqual({ count: 1, avgGrade: 80 });
    // Y esa nota no cuenta como valoración en el resumen general.
    expect(stats.scored.count).toBe(0);
  });

  it('distingue los que más esperan de los últimos en llegar', () => {
    expect(stats.wishlist.oldest[0].name).toBe('Viejo deseo');
    expect(stats.wishlist.recent[0].name).toBe('Recién llegado');
    expect(stats.wishlist.deck).toBe(1);
  });
});

describe('computeStats · el mejor del año', () => {
  it('lo decide la nota; a igualdad, las horas', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: 'Empatado corto', grade: 90, hours: 10, years: [2025] }),
        game({ id: 2, name: 'Empatado largo', grade: 90, hours: 80, years: [2025] }),
        game({ id: 3, name: 'Peor pero larguísimo', grade: 60, hours: 200, years: [2025] }),
      ],
    }));

    const y2025 = stats.byYear[0];
    expect(y2025.best?.name).toBe('Empatado largo');
    // Y el más largo del año es otro juego distinto: son dos preguntas diferentes.
    expect(y2025.longest?.name).toBe('Peor pero larguísimo');
  });
});

// ── Lo que escribes: reseñas, citas y puntos fuertes/débiles ────────────────────────────────────────────

describe('computeStats · reseñas', () => {
  it('cuenta las reseñas y su cobertura sobre lo que has cerrado', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: 'Uno', grade: 90, review: 'Una reseña con cuerpo suficiente para citarse entera.' }),
        game({ id: 2, name: 'Dos', grade: 60 }),
      ],
      v: [game({ id: 3, name: 'Tres', review: 'Lo dejé por la mitad y no me arrepiento en absoluto.' })],
      // En curso cuenta como reseña escrita, pero NO como juego cerrado: la cobertura mide lo cerrado.
      e: [game({ id: 4, name: 'Cuatro', review: 'Voy por la mitad y ya sé que va a estar en mi top del año.' })],
    }));

    expect(stats.reviews.count).toBe(3);
    expect(stats.reviews.closed).toBe(3);
    expect(stats.reviews.coverage).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('una reseña de dos letras cuenta, pero no se cita', () => {
    const stats = computeStats(tabData({
      c: [game({ id: 1, name: 'Uno', grade: 90, review: 'x' })],
    }));
    const [ref] = stats.reviews.games;

    expect(stats.reviews.count).toBe(1);
    expect(ref.hasReview).toBe(true);
    // El panel no enseña "x" como si fuera una cita.
    expect(ref.quote).toBe('');
  });

  it('la cita corta por el punto y no a mitad de palabra', () => {
    const largo = `${'Primera frase que ya es larga de por sí y sirve de cita. '}${'Segunda frase que sobra. '.repeat(20)}`;
    const stats = computeStats(tabData({ c: [game({ id: 1, name: 'Uno', grade: 90, review: largo })] }));
    const [ref] = stats.reviews.games;

    expect(ref.quote.endsWith('.')).toBe(true);
    expect(ref.quote.length).toBeLessThanOrEqual(220);
    expect(ref.quote).toContain('Primera frase');
  });

  it('agrega puntos fuertes y débiles aunque el texto esté vacío', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: 'Uno', grade: 90, strengths: ['Historia', 'Banda sonora'], weaknesses: ['Bugs'] }),
        game({ id: 2, name: 'Dos', grade: 70, strengths: ['Historia'], weaknesses: ['Bugs', 'Cámara'] }),
      ],
    }));

    expect(stats.reviews.strengths[0]).toMatchObject({ tag: 'Historia', games: 2 });
    expect(stats.reviews.weaknesses[0]).toMatchObject({ tag: 'Bugs', games: 2 });
  });

  it('los juegos reseñados salen de mejor a peor nota', () => {
    const stats = computeStats(tabData({
      c: [
        game({ id: 1, name: 'Flojo', grade: 40, review: 'Reseña con longitud suficiente para contar como cita.' }),
        game({ id: 2, name: 'Bueno', grade: 95, review: 'Otra reseña con longitud más que suficiente para citarse.' }),
      ],
    }));

    expect(stats.reviews.games.map((ref) => ref.name)).toEqual(['Bueno', 'Flojo']);
  });
});
