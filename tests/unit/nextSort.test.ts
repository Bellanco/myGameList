import { describe, expect, it } from 'vitest';
import { nextSort, sortGames } from '../../src/core/utils/sortGames';
import { DEFAULT_FILTERS, filterGames } from '../../src/viewmodel/toolbarFilters';
import { resolveStars } from '../../src/core/utils/scoreScale';
import type { GameItem } from '../../src/model/types/game';

// Fábrica mínima: solo lo que necesita el orden por puntuación (id + nota fina/espejo).
function game(id: number, fields: Partial<GameItem>): GameItem {
  return {
    id,
    _ts: 0,
    name: `g${id}`,
    genres: [],
    platforms: [],
    steamDeck: false,
    review: '',
    score: 0,
    years: [],
    strengths: [],
    weaknesses: [],
    reasons: [],
    replayable: false,
    retry: false,
    hours: null,
    ...fields,
  } as GameItem;
}

// Fuente única del toggle de orden al pulsar una cabecera (listado principal + perfil social).
describe('nextSort', () => {
  it('invierte la dirección si se repulsa la columna activa', () => {
    expect(nextSort({ col: 'name', asc: true }, 'name')).toEqual({ col: 'name', asc: false });
    expect(nextSort({ col: 'name', asc: false }, 'name')).toEqual({ col: 'name', asc: true });
  });

  it('columna de texto nueva → ascendente', () => {
    expect(nextSort({ col: 'score', asc: false }, 'name')).toEqual({ col: 'name', asc: true });
    expect(nextSort({ col: 'name', asc: true }, 'platforms')).toEqual({ col: 'platforms', asc: true });
  });

  it('columna numérica/booleana nueva → descendente (mayor primero)', () => {
    for (const col of ['score', 'years', 'hours', 'retry', 'replayable']) {
      expect(nextSort({ col: 'name', asc: true }, col)).toEqual({ col, asc: false });
    }
  });
});

// Regresión: ordenar por puntuación usa la nota fina 0–100, no el espejo 0–5. Antes, notas 90–100 caían todas
// en 5★, empataban y quedaban en orden de inserción (p. ej. 96-98-90-99-100).
describe('sortGames — columna de puntuación', () => {
  const order = (games: GameItem[], asc: boolean) =>
    sortGames(games, { col: 'score', asc }, 'p').map((g) => g.grade);

  it('ordena por la nota fina (grade), no por las estrellas', () => {
    const games = [
      game(1, { grade: 96, score: 5 }),
      game(2, { grade: 98, score: 5 }),
      game(3, { grade: 90, score: 5 }),
      game(4, { grade: 99, score: 5 }),
      game(5, { grade: 100, score: 5 }),
    ];
    expect(order(games, false)).toEqual([100, 99, 98, 96, 90]);
    expect(order(games, true)).toEqual([90, 96, 98, 99, 100]);
  });

  it('deriva la nota del espejo 0–5 cuando no hay grade (juegos legacy)', () => {
    const games = [
      game(1, { score: 3, grade: undefined }),
      game(2, { score: 5, grade: undefined }),
      game(3, { score: 1, grade: undefined }),
    ];
    // 3★→60, 5★→100, 1★→20 → desc: 100, 60, 20 (ids 2,1,3)
    expect(sortGames(games, { col: 'score', asc: false }, 'p').map((g) => g.id)).toEqual([2, 1, 3]);
  });

  // Barrido amplio 0–100 (todos los tramos de estrellas, incluidos empates de espejo dentro de un mismo tramo)
  // + entradas legacy solo-espejo, desordenadas de entrada. gradeOf refleja la nota EFECTIVA que resuelve el orden.
  const SPREAD: Array<{ grade?: number; score: number; gradeOf: number }> = [
    { grade: 100, score: 5, gradeOf: 100 },
    { grade: 90, score: 5, gradeOf: 90 }, // mismo tramo 5★ que 96/98/99/100
    { grade: 96, score: 5, gradeOf: 96 },
    { grade: 89, score: 4, gradeOf: 89 },
    { grade: 70, score: 4, gradeOf: 70 }, // suelo de 4★
    { grade: 82, score: 4, gradeOf: 82 },
    { grade: 69, score: 3, gradeOf: 69 }, // techo de 3★
    { grade: 50, score: 3, gradeOf: 50 },
    { grade: 47, score: 2, gradeOf: 47 },
    { grade: 30, score: 2, gradeOf: 30 },
    { grade: 29, score: 1, gradeOf: 29 },
    { grade: 10, score: 1, gradeOf: 10 },
    { grade: 9, score: 0, gradeOf: 9 }, // sin estrellas pero > 0
    { grade: 0, score: 0, gradeOf: 0 },
    { score: 3, gradeOf: 60 }, // legacy solo-espejo: 3★ → 60
    { score: 1, gradeOf: 20 }, // legacy solo-espejo: 1★ → 20
  ];

  const spreadGames = () => SPREAD.map((entry, i) => game(i + 1, { grade: entry.grade, score: entry.score }));

  it('ordena correctamente un barrido amplio 0–100 (asc y desc), sin empates espurios', () => {
    const games = spreadGames();
    const expectedAsc = [...SPREAD].map((e) => e.gradeOf).sort((a, b) => a - b);
    const expectedDesc = [...expectedAsc].reverse();

    expect(sortGames(games, { col: 'score', asc: true }, 'p').map((g) => resolveGradeOf(g))).toEqual(expectedAsc);
    expect(sortGames(games, { col: 'score', asc: false }, 'p').map((g) => resolveGradeOf(g))).toEqual(expectedDesc);
  });

  // Nota efectiva de un juego de test (grade fino o espejo 0–5 × 20), replicando resolveGrade sin acoplar el import.
  function resolveGradeOf(g: GameItem): number {
    return typeof g.grade === 'number' ? g.grade : (g.score ?? 0) * 20;
  }

  it('combina filtro por estrellas + orden por nota fina (pipeline del view-model)', () => {
    const games = spreadGames();
    // Filtro "≥4★": el filtro es por estrellas (resolveStars), el orden por nota fina. Solo pasan grades 70–100.
    const filters = { ...DEFAULT_FILTERS, score: '4' };
    const filtered = filterGames(games, filters, 'p');

    // Todos los supervivientes tienen ≥4★…
    expect(filtered.every((g) => resolveStars(g) >= 4)).toBe(true);
    // …y son exactamente las notas 70–100 del barrido.
    expect(filtered.map((g) => resolveGradeOf(g)).sort((a, b) => a - b)).toEqual([70, 82, 89, 90, 96, 100]);

    // Aplicando el orden encima (como getFilteredList: sortGames(filterGames(...))) queda descendente fino.
    const ordered = sortGames(filtered, { col: 'score', asc: false }, 'p');
    expect(ordered.map((g) => resolveGradeOf(g))).toEqual([100, 96, 90, 89, 82, 70]);
  });

  it('filtro "≥1★" excluye las notas 0–9 (sin estrellas) aunque tengan nota > 0', () => {
    const games = spreadGames();
    const filtered = filterGames(games, { ...DEFAULT_FILTERS, score: '1' }, 'p');
    // grade 9 → 0★ y grade 0 → 0★ quedan fuera; el resto (incl. legacy) entra.
    expect(filtered.map((g) => resolveStars(g)).every((s) => s >= 1)).toBe(true);
    expect(filtered.some((g) => resolveGradeOf(g) === 9 || resolveGradeOf(g) === 0)).toBe(false);
  });
});
