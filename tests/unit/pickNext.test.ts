import { describe, expect, it } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';
import {
  buildPickPool,
  filterPickPool,
  parsePickFilters,
  pickOptions,
  pickPath,
  serializePickFilters,
  togglePickFilter,
  EMPTY_PICK_FILTERS,
} from '../../src/core/pick/pickNext';

// «¿A qué juego ahora?» (`/elegir`): qué se ofrece, cómo se filtra y en qué orden.

const juego = (id: number, name: string, extra: Partial<GameItem> = {}): GameItem =>
  ({ id, _ts: 0, name, platforms: [], genres: [], steamDeck: false, review: '', ...extra }) as GameItem;

const DATA = {
  c: [
    juego(1, 'Doom', { genres: ['FPS'], platforms: ['Steam'], grade: 90, replayable: true }),
    juego(2, 'Halo', { genres: ['FPS'], platforms: ['Steam'], grade: 95 }),
  ],
  v: [
    juego(3, 'Metro Exodus', { genres: ['FPS'], platforms: ['GOG'], retry: true }),
    juego(4, 'Anthem', { genres: ['TPS'], platforms: ['Origin'] }),
  ],
  e: [juego(5, 'Hades', { genres: ['Roguelike'] })],
  p: [
    juego(6, 'Neon White', { genres: ['FPS', 'Cartas'], platforms: ['Steam'], grade: 80 }),
    juego(7, 'Celeste', { genres: ['Plataformas'], platforms: ['Epic'], grade: 85 }),
  ],
  d: [juego(8, 'Quake', { genres: ['FPS'], platforms: ['Steam'] })],
  deleted: [],
  updatedAt: 0,
} as unknown as TabData;

const nombres = (pool: ReturnType<typeof buildPickPool>) => pool.map(({ game }) => game.name);

describe('buildPickPool', () => {
  it('los candidatos de la ruleta: próximos, abandonados con otra oportunidad y completados con «Rejugar»', () => {
    // Fuera: Halo (sin «Rejugar»), Anthem (sin otra oportunidad), Hades (ya en curso) y Quake (deseados).
    expect(nombres(buildPickPool(DATA)).sort()).toEqual(['Celeste', 'Doom', 'Metro Exodus', 'Neon White']);
  });

  it('ordenados por el peso de la ruleta, sin azar: un próximo pesa más que un completado con más nota', () => {
    // Celeste (p, 85) > Neon White (p, 80) > Metro (v, sin nota → la neutra 70) > Doom (c, 90).
    expect(nombres(buildPickPool(DATA))).toEqual(['Celeste', 'Neon White', 'Metro Exodus', 'Doom']);
  });
});

describe('filterPickPool', () => {
  const pool = buildPickPool(DATA);

  it('sin filtros, todos', () => {
    expect(filterPickPool(pool, EMPTY_PICK_FILTERS)).toHaveLength(4);
  });

  it('varios géneros: vale cualquiera de ellos', () => {
    expect(nombres(filterPickPool(pool, { genres: ['Cartas', 'Plataformas'], platforms: [] }))).toEqual(['Celeste', 'Neon White']);
  });

  it('género y plataforma: tienen que cumplirse los dos', () => {
    expect(nombres(filterPickPool(pool, { genres: ['FPS'], platforms: ['Steam'] }))).toEqual(['Neon White', 'Doom']);
  });
});

describe('pickOptions', () => {
  const pool = buildPickPool(DATA);

  it('de la más a la menos frecuente, con cuántos quedarían contando el OTRO filtro', () => {
    expect(pickOptions(pool, { genres: [], platforms: ['GOG'] }, 'genres')).toEqual([
      { value: 'FPS', count: 1 },
      { value: 'Cartas', count: 0 },
      { value: 'Plataformas', count: 0 },
    ]);
  });

  it('lo marcado en el mismo filtro no recorta sus propias opciones (se pueden sumar géneros)', () => {
    const genres = pickOptions(pool, { genres: ['FPS'], platforms: [] }, 'genres');
    expect(genres.find((option) => option.value === 'Plataformas')).toEqual({ value: 'Plataformas', count: 1 });
  });
});

describe('dirección', () => {
  it('ida y vuelta por la query, con las mismas claves que la barra de los listados', () => {
    const filters = { genres: ['FPS', 'TPS'], platforms: ['Steam'] };
    const params = serializePickFilters(filters);
    expect(params.toString()).toBe('genre=FPS&genre=TPS&platform=Steam');
    expect(parsePickFilters(params)).toEqual(filters);
  });

  it('pickPath: sin filtros, la pantalla a secas', () => {
    expect(pickPath()).toBe('/elegir');
    expect(pickPath({ genres: ['Souls Like'], platforms: [] })).toBe('/elegir?genre=Souls+Like');
  });

  it('togglePickFilter marca y desmarca', () => {
    const una = togglePickFilter(EMPTY_PICK_FILTERS, 'genres', 'FPS');
    expect(una).toEqual({ genres: ['FPS'], platforms: [] });
    expect(togglePickFilter(una, 'genres', 'FPS')).toEqual(EMPTY_PICK_FILTERS);
  });
});
