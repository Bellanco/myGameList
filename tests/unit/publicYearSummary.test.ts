// Lo que sale del resumen del año al compartirlo con enlace (`core/stats/publicYearSummary`). Quien abre el enlace
// puede no ser nadie conocido: estas pruebas fijan lo que NO sale (la comparación con quien mira, la cita, el día
// de cada fin, horas) y que los listados lleguen acotados.
import { describe, expect, it } from 'vitest';
import { buildYearSummary, type YearSummary } from '../../src/core/stats/yearSummary';
import { publicYearSummary, PUBLIC_YEAR_SUMMARY_LIMITS } from '../../src/core/stats/publicYearSummary';
import { withFinishedOn, type FinishedGame } from '../../src/core/utils/finishDates';

function game(id: number, extra: Partial<FinishedGame> = {}): FinishedGame {
  return {
    id,
    _ts: 1,
    name: `Juego ${id}`,
    platforms: ['PC'],
    genres: ['RPG'],
    steamDeck: false,
    review: 'Una reseña larga que no debe salir del ámbito de sus amistades. Con más de una frase.',
    years: [2026],
    grade: 60 + id,
    hours: 40,
    strengths: ['Historia'],
    weaknesses: ['Ritmo'],
    ...extra,
  } as FinishedGame;
}

function summaryOf(games: FinishedGame[], viewer: FinishedGame[] | null = null): YearSummary {
  const summary = buildYearSummary({
    completed: withFinishedOn(games, 'day'),
    year: 2026,
    precision: 'day',
    viewerCompleted: viewer,
  });
  if (!summary) throw new Error('sin resumen');
  return summary;
}

describe('el resumen que sale por enlace', () => {
  const games = [1, 2, 3].map((id) => game(id, { finishedOn: `2026-0${id}-1${id}` }));

  it('sin la comparación con quien mira, sin cita y sin el día de cada fin', () => {
    const own = summaryOf(games, [game(1)]);
    expect(own.common).not.toBeNull();
    expect(own.best?.quote).not.toBe('');
    expect(own.when?.days).toBeDefined();

    const shared = publicYearSummary(own);
    expect(shared.common).toBeNull();
    expect(shared.best?.quote).toBe('');
    expect(shared.when?.precision).toBe('month');
    expect(shared.when?.days).toBeUndefined();
    expect(shared.when?.first).not.toHaveProperty('day');
    expect(shared.when?.last).not.toHaveProperty('day');
  });

  it('conserva las cifras del autor', () => {
    const own = summaryOf(games);
    const shared = publicYearSummary(own);
    expect(shared).toMatchObject({
      year: 2026,
      count: 3,
      avgGrade: own.avgGrade,
      withReview: 3,
      podium: own.podium,
      genres: own.genres,
      platforms: own.platforms,
      strengths: own.strengths,
      weaknesses: own.weaknesses,
    });
    expect(shared.best).toMatchObject({ name: own.best?.name, grade: own.best?.grade });
    expect(shared.when?.months).toEqual(own.when?.months);
  });

  it('ni una clave que no esté en la lista, ni horas ni reseñas en ningún nivel', () => {
    const shared = JSON.stringify(publicYearSummary(summaryOf(games, [game(1)])));
    expect(shared).not.toMatch(/"(hours|review|quote":"[^"]|days|day|enteredAt|finishedOn|uid|email)"/);
    expect(shared).not.toContain('Una reseña larga');
  });

  it('acota los listados', () => {
    const many = Array.from({ length: 40 }, (_, index) =>
      game(index + 1, { platforms: [`Plataforma ${index}`], genres: [`Género ${index}`] }),
    );
    const shared = publicYearSummary(summaryOf(many));
    expect(shared.count).toBe(40);
    expect(shared.covers).toHaveLength(PUBLIC_YEAR_SUMMARY_LIMITS.covers);
    expect(shared.platforms).toHaveLength(PUBLIC_YEAR_SUMMARY_LIMITS.ranked);
    expect(shared.genres).toHaveLength(PUBLIC_YEAR_SUMMARY_LIMITS.ranked);
  });
});
