import { describe, expect, it } from 'vitest';
import type { GameItem, ToolbarFilters } from '../../src/model/types/game';
import {
  DEFAULT_FILTERS,
  computeTabOptions,
  countActiveFilters,
  filterGames,
  parseFilters,
  serializeFilters,
} from '../../src/viewmodel/toolbarFilters';

function game(overrides: Partial<GameItem>): GameItem {
  return {
    id: 1,
    _ts: 0,
    name: 'Juego',
    platforms: [],
    genres: [],
    steamDeck: false,
    review: '',
    ...overrides,
  };
}

function withFilters(overrides: Partial<ToolbarFilters>): ToolbarFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe('filterGames', () => {
  it('género usa igualdad exacta (Acción no arrastra Acción-Aventura)', () => {
    const games = [
      game({ id: 1, name: 'A', genres: ['Acción'] }),
      game({ id: 2, name: 'B', genres: ['Acción-Aventura'] }),
    ];
    const result = filterGames(games, withFilters({ genres: ['Acción'] }), 'c');
    expect(result.map((g) => g.id)).toEqual([1]);
  });

  it('plataforma usa igualdad exacta (PC no arrastra PC VR)', () => {
    const games = [
      game({ id: 1, name: 'A', platforms: ['PC'] }),
      game({ id: 2, name: 'B', platforms: ['PC VR'] }),
    ];
    const result = filterGames(games, withFilters({ platforms: ['PC'] }), 'c');
    expect(result.map((g) => g.id)).toEqual([1]);
  });

  it('varios géneros se combinan con OR', () => {
    const games = [
      game({ id: 1, genres: ['Acción'] }),
      game({ id: 2, genres: ['RPG'] }),
      game({ id: 3, genres: ['Puzzle'] }),
    ];
    const result = filterGames(games, withFilters({ genres: ['Acción', 'RPG'] }), 'c');
    expect(result.map((g) => g.id)).toEqual([1, 2]);
  });

  it('búsqueda por nombre sí es subcadena e insensible a mayúsculas', () => {
    const games = [game({ id: 1, name: 'Super Mario' }), game({ id: 2, name: 'Zelda' })];
    expect(filterGames(games, withFilters({ search: 'mario' }), 'c').map((g) => g.id)).toEqual([1]);
  });

  it('puntuación filtra por umbral mínimo (≥)', () => {
    const games = [game({ id: 1, score: 5 }), game({ id: 2, score: 3 }), game({ id: 3, score: 4 })];
    expect(filterGames(games, withFilters({ score: '4' }), 'c').map((g) => g.id)).toEqual([1, 3]);
  });

  it('horas filtra por el rango seleccionado', () => {
    const games = [game({ id: 1, hours: 3 }), game({ id: 2, hours: 30 })];
    expect(filterGames(games, withFilters({ hours: '0-5' }), 'c').map((g) => g.id)).toEqual([1]);
  });

  it('el toggle booleano "only" usa el campo de la pestaña (replayable en c)', () => {
    const games = [game({ id: 1, replayable: true }), game({ id: 2, replayable: false })];
    expect(filterGames(games, withFilters({ only: true }), 'c').map((g) => g.id)).toEqual([1]);
  });
});

describe('computeTabOptions', () => {
  it('solo devuelve valores presentes en la pestaña, géneros/plataformas ordenados', () => {
    const games = [
      game({ id: 1, genres: ['RPG', 'Acción'], platforms: ['PC'], score: 4, hours: 3 }),
      game({ id: 2, genres: ['Acción'], platforms: ['PS5'], score: 2, hours: 30 }),
    ];
    const options = computeTabOptions(games);
    expect(options.genres).toEqual(['Acción', 'RPG']);
    expect(options.platforms).toEqual(['PC', 'PS5']);
    // umbrales ≥N con sentido: hasta la puntuación máxima presente (4)
    expect(options.scores).toEqual([4, 3, 2, 1]);
    // solo los rangos de horas con algún juego (3h → 0-5, 30h → 20-40)
    expect(options.hours).toEqual(['0-5', '20-40']);
  });

  it('lista vacía no ofrece opciones', () => {
    const options = computeTabOptions([]);
    expect(options).toEqual({ genres: [], platforms: [], scores: [], hours: [] });
  });
});

describe('parseFilters / serializeFilters', () => {
  it('round-trip conserva todos los campos (incluida multiselección)', () => {
    const filters = withFilters({
      search: 'mario',
      genres: ['Acción', 'RPG'],
      platforms: ['PC'],
      score: '4',
      hours: '0-5',
      only: true,
      deck: true,
    });
    expect(parseFilters(serializeFilters(filters))).toEqual(filters);
  });

  it('serialize omite los campos vacíos (URL limpia)', () => {
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('parse de query vacía devuelve los filtros por defecto', () => {
    expect(parseFilters(new URLSearchParams())).toEqual(DEFAULT_FILTERS);
  });
});

describe('countActiveFilters', () => {
  it('cuenta cada valor de la multiselección por separado', () => {
    expect(countActiveFilters(withFilters({ genres: ['Acción', 'RPG'], platforms: ['PC'], deck: true }))).toBe(4);
  });
});
