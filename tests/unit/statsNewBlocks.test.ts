// Las cinco piezas nuevas del panel: evolución del gusto, notas por año, constancia, rejugabilidad y exigencia.
// Se prueban las REGLAS que las hacen honestas —los mínimos por debajo de los cuales un dato no significa nada—
// más que los números en sí.
import { describe, expect, it } from 'vitest';
import { computeStats, GENRE_RANK_MIN_GAMES, GENRE_RANK_WINDOW } from '../../src/core/stats/computeStats';
import { localWeekKey } from '../../src/core/utils/dateTime';
import type { GameItem, TabData } from '../../src/model/types/game';

function game(extra: Partial<GameItem> & { id: number }): GameItem {
  return {
    _ts: 1000,
    name: `Game ${extra.id}`,
    platforms: ['Steam'],
    genres: ['RPG'],
    steamDeck: false,
    review: '',
    ...extra,
  };
}

function tabData(lists: Partial<Record<'c' | 'v' | 'e' | 'p', GameItem[]>>): TabData {
  return { c: [], v: [], e: [], p: [], ...lists, deleted: [], updatedAt: 0 };
}

/** N completados de un género en un año, con nota. */
function completed(from: number, count: number, genre: string, year: number, grade = 60): GameItem[] {
  return Array.from({ length: count }, (_unused, index) =>
    game({ id: from + index, genres: [genre], years: [year], grade, score: Math.round(grade / 20) }),
  );
}

describe('evolución del gusto (bump)', () => {
  it('no dibuja años cuya ventana no reúne juegos suficientes', () => {
    // Dos juegos en 2019 y nada más: un ranking sacado de ahí lo decide el azar de la temporada.
    const stats = computeStats(tabData({ c: completed(1, 2, 'RPG', 2019) }));
    expect(stats.genreRanks.years).toEqual([]);
  });

  it('dibuja el año en cuanto la ventana reúne el mínimo', () => {
    const stats = computeStats(
      tabData({ c: [...completed(1, GENRE_RANK_MIN_GAMES, 'RPG', 2020), ...completed(50, 2, 'FPS', 2020)] }),
    );
    expect(stats.genreRanks.years).toContain(2020);
    expect(stats.genreRanks.window).toBe(GENRE_RANK_WINDOW);
  });

  it('acumula la ventana móvil: el puesto de un año mira también a los anteriores', () => {
    const stats = computeStats(
      tabData({
        c: [
          ...completed(1, 4, 'RPG', 2020),
          ...completed(20, 4, 'FPS', 2021),
          // En 2022 solo hay un RPG, pero la ventana 2020–2022 le sigue dando cuatro más.
          ...completed(40, 1, 'RPG', 2022),
        ],
      }),
    );
    const rpg = stats.genreRanks.series.find((entry) => entry.tag === 'RPG');
    const point = rpg?.points.find((entry) => entry.year === 2022);
    expect(point?.games).toBe(5);
  });

  it('ordena las series por su puesto en el último año, para que la leyenda se lea de arriba abajo', () => {
    const stats = computeStats(
      tabData({
        c: [
          ...completed(1, 3, 'RPG', 2020),
          ...completed(20, 3, 'FPS', 2020),
          // FPS se dispara al final: debe quedar el primero de la lista.
          ...completed(40, 6, 'FPS', 2022),
        ],
      }),
    );
    expect(stats.genreRanks.series[0].tag).toBe('FPS');
  });

  it('con huecos entre años no recorta a ciegas los primeros', () => {
    // Nada entre 2006 y 2011: recortar "los primeros N años" dejaría fuera un año bueno.
    const stats = computeStats(
      tabData({ c: [...completed(1, 2, 'RPG', 2006), ...completed(20, GENRE_RANK_MIN_GAMES, 'RPG', 2011)] }),
    );
    expect(stats.genreRanks.years).toEqual([2011]);
  });
});

describe('constancia semanal', () => {
  const monday = new Date(2026, 0, 5, 12).getTime(); // lunes
  const week = (offsetWeeks: number) => monday + offsetWeeks * 7 * 24 * 60 * 60 * 1000;

  it('cuenta las reseñas y los movimientos de lista por separado', () => {
    const stats = computeStats(
      tabData({ c: [game({ id: 1, reviewedAt: monday, enteredAt: { c: monday } })] }),
    );
    const first = stats.activity.weeks[0];
    expect(first.reviews).toBe(1);
    expect(first.moves).toBe(1);
    expect(first.total).toBe(2);
  });

  it('rellena las semanas vacías: una racha se ve porque a su lado hay blancos', () => {
    const stats = computeStats(
      tabData({
        c: [game({ id: 1, enteredAt: { c: monday } }), game({ id: 2, enteredAt: { c: week(3) } })],
      }),
    );
    expect(stats.activity.weeks).toHaveLength(4);
    expect(stats.activity.active).toBe(2);
    expect(stats.activity.weeks[1].total).toBe(0);
  });

  it('mide la mejor racha y la que sigue viva al final', () => {
    const stats = computeStats(
      tabData({
        c: [
          game({ id: 1, enteredAt: { c: monday } }),
          game({ id: 2, enteredAt: { c: week(1) } }),
          game({ id: 3, enteredAt: { c: week(2) } }),
          // Un hueco en la semana 3 y vuelta en la 4: la racha viva es de una, la mejor de tres.
          game({ id: 4, enteredAt: { c: week(4) } }),
        ],
      }),
    );
    expect(stats.activity.bestStreak).toBe(3);
    expect(stats.activity.currentStreak).toBe(1);
  });

  it('un juego que pasa por tres listas deja marca en tres semanas', () => {
    const stats = computeStats(
      tabData({ c: [game({ id: 1, enteredAt: { p: monday, e: week(1), c: week(2) } })] }),
    );
    expect(stats.activity.active).toBe(3);
  });

  it('no cuenta `_ts`: una importación no es una semana frenética', () => {
    // Sin sellos ni fecha de reseña no hay actividad que contar, por mucho que el juego tenga `_ts`.
    const stats = computeStats(tabData({ c: [game({ id: 1, _ts: monday, enteredAt: {} })] }));
    expect(stats.activity.weeks).toEqual([]);
  });

  it('agrupa por semana ISO del calendario del dispositivo', () => {
    const stats = computeStats(tabData({ c: [game({ id: 1, enteredAt: { c: monday } })] }));
    expect(stats.activity.weeks[0].w).toBe(localWeekKey(monday));
  });
});

describe('a cuáles vuelves', () => {
  it('separa haber vuelto (un hecho) de querer volver (una intención)', () => {
    const stats = computeStats(
      tabData({
        c: [
          game({ id: 1, years: [2020, 2022], grade: 90, score: 5 }),
          game({ id: 2, years: [2021], replayable: true, grade: 80, score: 4 }),
          game({ id: 3, years: [2021], grade: 50, score: 3 }),
        ],
      }),
    );
    expect(stats.replay.replayed).toBe(1);
    expect(stats.replay.willReplay).toBe(1);
    expect(stats.replay.once).toBe(1);
  });

  it('un juego ya rejugado no cuenta ADEMÁS como intención', () => {
    // Si contara en los dos montones, el reparto pasaría del 100% y la barra se saldría de la tarjeta.
    const stats = computeStats(
      tabData({ c: [game({ id: 1, years: [2020, 2022], replayable: true, grade: 90, score: 5 })] }),
    );
    expect(stats.replay.replayed).toBe(1);
    expect(stats.replay.willReplay).toBe(0);
    expect(stats.replay.replayed + stats.replay.willReplay + stats.replay.once).toBe(stats.replay.total);
  });

  it('cuenta las vueltas extra, no los años registrados', () => {
    const stats = computeStats(tabData({ c: [game({ id: 1, years: [2018, 2020, 2022], grade: 90, score: 5 })] }));
    expect(stats.replay.extraRuns).toBe(2);
  });

  it('el ranking por género pide recorrido suficiente', () => {
    const stats = computeStats(
      tabData({ c: [game({ id: 1, genres: ['Puzzles'], years: [2020, 2021], grade: 90, score: 5 })] }),
    );
    expect(stats.replay.byGenre).toEqual([]);
  });
});

describe('exigencia', () => {
  it('mide cuánto se separan las notas de la media', () => {
    const stats = computeStats(
      tabData({
        c: [
          game({ id: 1, years: [2020], grade: 40, score: 2 }),
          game({ id: 2, years: [2020], grade: 60, score: 3 }),
          game({ id: 3, years: [2020], grade: 80, score: 4 }),
        ],
      }),
    );
    expect(stats.demand.avgGrade).toBe(60);
    // Desviación poblacional de 40/60/80: √((400+0+400)/3) ≈ 16,33.
    expect(stats.demand.deviation).toBeCloseTo(16.33, 1);
    expect(stats.demand.low).toBeCloseTo(43.67, 1);
    expect(stats.demand.high).toBeCloseTo(76.33, 1);
  });

  it('distingue a quien puntúa parejo de quien va a los extremos', () => {
    const flat = computeStats(
      tabData({ c: [1, 2, 3].map((id) => game({ id, years: [2020], grade: 70, score: 4 })) }),
    );
    const spread = computeStats(
      tabData({
        c: [
          game({ id: 1, years: [2020], grade: 20, score: 1 }),
          game({ id: 2, years: [2020], grade: 100, score: 5 }),
        ],
      }),
    );
    expect(flat.demand.deviation).toBe(0);
    expect(spread.demand.deviation).toBeGreaterThan(30);
  });

  it('acota la banda a la escala: no existe una nota de 110', () => {
    const stats = computeStats(
      tabData({
        c: [game({ id: 1, years: [2020], grade: 100, score: 5 }), game({ id: 2, years: [2020], grade: 95, score: 5 })],
      }),
    );
    expect(stats.demand.high).toBeLessThanOrEqual(100);
    expect(stats.demand.low).toBeGreaterThanOrEqual(0);
  });

  it('sin notas no inventa una desviación', () => {
    const stats = computeStats(tabData({ p: [game({ id: 1 })] }));
    expect(stats.demand.count).toBe(0);
    expect(stats.demand.deviation).toBe(0);
  });
});

describe('cotas de la constancia', () => {
  const monday = new Date(2020, 0, 6, 12).getTime();
  const W = 7 * 24 * 60 * 60 * 1000;

  it('la serie no crece con la antigüedad de la biblioteca', async () => {
    const { ACTIVITY_WEEKS_LIMIT } = await import('../../src/core/stats/computeStats');
    // Seis años de historia: sin cota serían más de trescientas semanas en cada recálculo del panel.
    const stats = computeStats(
      tabData({
        c: [
          game({ id: 1, enteredAt: { c: monday } }),
          game({ id: 2, enteredAt: { c: monday + 300 * W } }),
        ],
      }),
    );
    expect(stats.activity.weeks.length).toBeLessThanOrEqual(ACTIVITY_WEEKS_LIMIT);
    // Y lo que se conserva es la COLA: el ritmo reciente es lo que interesa.
    expect(stats.activity.weeks[stats.activity.weeks.length - 1].total).toBe(1);
  });
});

describe('un género que entra y sale del top', () => {
  it('marca con cero los años en los que no aparece, para que la vista pueda partir la línea', () => {
    const stats = computeStats(
      tabData({
        c: [
          ...completed(1, 6, 'RPG', 2020),
          ...completed(20, 6, 'RPG', 2021),
          ...completed(40, 6, 'RPG', 2022),
          // Souls Like solo existe en 2022: en 2020 y 2021 no ocupa ningún puesto.
          ...completed(60, 4, 'Souls Like', 2022),
        ],
      }),
    );
    const souls = stats.genreRanks.series.find((entry) => entry.tag === 'Souls Like');
    expect(souls).toBeDefined();
    const first = souls?.points.find((point) => point.year === 2020);
    const last = souls?.points.find((point) => point.year === 2022);
    expect(first?.games).toBe(0);
    expect(last?.games).toBe(4);
  });
});
