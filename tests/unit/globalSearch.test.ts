import { describe, expect, it } from 'vitest';
import { normalizeSearchText, matchesSearch } from '../../src/core/utils/searchText';
import { runSearch, searchRank, SEARCH_GROUP_LIMIT, type SearchSources } from '../../src/core/search/globalSearch';

// docs/plan-notificaciones-y-buscador.md, B1 — el buscador general sin interfaz.

const src = (id: string, title: string, extra: { detail?: string; keywords?: string } = {}) => ({
  id,
  title,
  detail: extra.detail ?? '',
  path: `/${id}`,
  ...(extra.keywords ? { keywords: extra.keywords } : {}),
});
const EMPTY: SearchSources = { pick: [], games: [], reviews: [], friends: [], pages: [] };

describe('normalizeSearchText', () => {
  it('quita acentos, mayúsculas, apóstrofes y signos', () => {
    expect(normalizeSearchText("  Pokémon: Marvel's Spider-Man ")).toBe('pokemon marvels spider man');
  });

  it('no borra números ni letras de otros alfabetos', () => {
    expect(normalizeSearchText('Nioh 2')).toBe('nioh 2');
    // Los diacríticos de otras escrituras también se quitan, a los dos lados: lo que importa es que case.
    expect(normalizeSearchText('ゼルダ')).not.toBe('');
    expect(matchesSearch('ゼルダの伝説', normalizeSearchText('ゼルダ'))).toBe(true);
  });

  it('casa también sin espacios', () => {
    expect(matchesSearch('Spider-Man', 'spiderman')).toBe(true);
    expect(matchesSearch('Spiderman', 'spider man')).toBe(true);
    expect(matchesSearch('Zelda', 'mario')).toBe(false);
  });
});

describe('searchRank', () => {
  it('idéntico, empieza igual, palabra que empieza igual, contiene', () => {
    expect(searchRank('Hades', 'hades')).toBe(0);
    expect(searchRank('Hades II', 'hades')).toBe(1);
    expect(searchRank('The Hades Game', 'hades')).toBe(2);
    expect(searchRank('Shadeshades', 'hades')).toBe(3);
    expect(searchRank('Celeste', 'hades')).toBe(-1);
  });
});

describe('runSearch', () => {
  it('sin nada escrito no hay resultados', () => {
    expect(runSearch({ ...EMPTY, games: [src('g1', 'Hades')] }, '   ')).toEqual([]);
  });

  it('agrupa en orden fijo y ordena por parecido', () => {
    const groups = runSearch({
      pick: [],
      games: [src('g2', 'The Hades Game'), src('g1', 'Hades')],
      reviews: [src('r1', 'Hades', { detail: 'Reseña de Marta' })],
      friends: [src('f1', 'Marta')],
      pages: [src('p1', 'Estadísticas')],
    }, 'hádes');

    expect(groups.map((group) => group.kind)).toEqual(['games', 'reviews']);
    expect(groups[0].results.map((result) => result.title)).toEqual(['Hades', 'The Hades Game']);
    expect(groups[1].results[0]).toMatchObject({ group: 'reviews', detail: 'Reseña de Marta', path: '/r1' });
  });

  it('recorta cada grupo y lo da entero si se pide «Ver más»', () => {
    const games = Array.from({ length: SEARCH_GROUP_LIMIT + 3 }, (_, index) => src(`g${index}`, `Zelda ${index}`));
    const [recortado] = runSearch({ ...EMPTY, games }, 'zelda');
    expect(recortado.results).toHaveLength(SEARCH_GROUP_LIMIT);
    expect(recortado.total).toBe(SEARCH_GROUP_LIMIT + 3);

    const [entero] = runSearch({ ...EMPTY, games }, 'zelda', new Set(['games']));
    expect(entero.results).toHaveLength(SEARCH_GROUP_LIMIT + 3);
  });

  it('las palabras clave encuentran, pero detrás de lo que casa por el título', () => {
    const [pages] = runSearch({
      ...EMPTY,
      pages: [src('diseno', 'Diseño', { keywords: 'ajustes tema' }), src('ajustes', 'Ajustes de algo')],
    }, 'ajustes');
    expect(pages.results.map((result) => result.id)).toEqual(['ajustes', 'diseno']);
  });

  it('orden: juegos, reseñas, «Elegir a qué jugar», pantallas y, al final, amistades', () => {
    const groups = runSearch({
      pick: [src('pick-fps', 'FPS', { detail: '25 opciones para empezar' })],
      games: [src('g1', 'FPS Chess')],
      reviews: [src('r1', 'FPS Chess', { detail: 'Reseña de Marta' })],
      friends: [src('f1', 'FPS Fan')],
      pages: [src('p1', 'Filtros', { keywords: 'fps' })],
    }, 'fps');
    expect(groups.map((group) => group.kind)).toEqual(['games', 'reviews', 'pick', 'pages', 'friends']);
    expect(groups[2].results[0]).toMatchObject({ group: 'pick', title: 'FPS', path: '/pick-fps' });
  });
});
