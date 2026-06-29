import { FILTER_BOOL } from '../core/constants/labels';
import { HOURS_RANGES } from '../core/constants/uiConfig';
import { sortEs } from '../core/utils/compare';
import type { GameItem, TabId, ToolbarFilters } from '../model/types/game';

// Filtros de la Toolbar como funciones puras: testeables sin montar el hook y reutilizables tanto por
// el view-model (filtrado) como por el hook de URL (parse/serialize). Fuente única de la semántica.

export const DEFAULT_FILTERS: ToolbarFilters = {
  search: '',
  genres: [],
  platforms: [],
  score: '',
  hours: '',
  only: false,
  deck: false,
};

// Claves de la query string (cortas y legibles); géneros/plataformas van como valores repetidos.
const PARAM = {
  search: 'q',
  genre: 'genre',
  platform: 'platform',
  score: 'score',
  hours: 'hours',
  only: 'only',
  deck: 'deck',
} as const;

const SCORE_LEVELS = [5, 4, 3, 2, 1] as const;

export function parseFilters(params: URLSearchParams): ToolbarFilters {
  return {
    search: params.get(PARAM.search) ?? '',
    genres: params.getAll(PARAM.genre),
    platforms: params.getAll(PARAM.platform),
    score: params.get(PARAM.score) ?? '',
    hours: params.get(PARAM.hours) ?? '',
    only: params.get(PARAM.only) === '1',
    deck: params.get(PARAM.deck) === '1',
  };
}

export function serializeFilters(filters: ToolbarFilters): URLSearchParams {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set(PARAM.search, search);
  filters.genres.forEach((value) => params.append(PARAM.genre, value));
  filters.platforms.forEach((value) => params.append(PARAM.platform, value));
  if (filters.score) params.set(PARAM.score, filters.score);
  if (filters.hours) params.set(PARAM.hours, filters.hours);
  if (filters.only) params.set(PARAM.only, '1');
  if (filters.deck) params.set(PARAM.deck, '1');
  return params;
}

export function countActiveFilters(filters: ToolbarFilters): number {
  return (
    (filters.search.trim() ? 1 : 0) +
    filters.genres.length +
    filters.platforms.length +
    (filters.score ? 1 : 0) +
    (filters.hours ? 1 : 0) +
    (filters.only ? 1 : 0) +
    (filters.deck ? 1 : 0)
  );
}

// Filtra (sin ordenar; el orden lo aplica el view-model). Género/plataforma: igualdad exacta + OR
// dentro de cada dimensión. El texto libre (`search`) sí usa subcadena, que es lo correcto.
export function filterGames(games: GameItem[], filters: ToolbarFilters, tab: TabId): GameItem[] {
  const config = FILTER_BOOL[tab];
  const search = filters.search.trim().toLowerCase();
  const minScore = filters.score ? Number(filters.score) : 0;
  const range = filters.hours ? HOURS_RANGES.find((entry) => entry.key === filters.hours) : undefined;

  return games.filter((game) => {
    if (search && !game.name.toLowerCase().includes(search)) return false;
    if (filters.genres.length && !game.genres.some((value) => filters.genres.includes(value))) return false;
    if (filters.platforms.length && !game.platforms.some((value) => filters.platforms.includes(value))) return false;
    if (filters.deck && !game.steamDeck) return false;
    if (minScore && Number(game.score || 0) < minScore) return false;
    if (filters.only && config && !Boolean(game[config.field])) return false;
    if (filters.hours) {
      if (!range || !range.check(Number(game.hours || 0))) return false;
    }
    return true;
  });
}

export interface TabOptions {
  genres: string[];
  platforms: string[];
  scores: number[]; // umbrales "≥N" con sentido en la pestaña (1..máxima puntuación presente)
  hours: string[]; // claves de HOURS_RANGES con al menos un juego en la pestaña
}

// Opciones realmente presentes en la pestaña: evita ofrecer filtros que no devolverían nada.
export function computeTabOptions(games: GameItem[]): TabOptions {
  const genres = new Set<string>();
  const platforms = new Set<string>();
  const hours = new Set<string>();
  let maxScore = 0;

  for (const game of games) {
    game.genres.forEach((value) => genres.add(value));
    game.platforms.forEach((value) => platforms.add(value));
    const score = Number(game.score || 0);
    if (score > maxScore) maxScore = score;
    const range = HOURS_RANGES.find((entry) => entry.check(Number(game.hours || 0)));
    if (range) hours.add(range.key);
  }

  return {
    genres: [...genres].sort(sortEs),
    platforms: [...platforms].sort(sortEs),
    scores: SCORE_LEVELS.filter((level) => level <= maxScore),
    hours: HOURS_RANGES.filter((range) => hours.has(range.key)).map((range) => range.key),
  };
}
