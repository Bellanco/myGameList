import { describe, it, expect } from 'vitest';
import { buildFormSuggestions, suggestForGenres } from '../../src/core/utils/formSuggestions';
import type { GameItem } from '../../src/model/types/game';

function game(over: Partial<GameItem>): GameItem {
  return { id: 1, _ts: 1, name: 'x', platforms: [], genres: [], steamDeck: false, review: '', ...over };
}

const LISTA = [
  game({ id: 1, genres: ['Metroidvania'], platforms: ['Switch'], strengths: ['Exploración', 'Combate'], weaknesses: ['Backtracking'] }),
  game({ id: 2, genres: ['Metroidvania', 'Acción'], platforms: ['Steam'], strengths: ['Exploración'], weaknesses: ['Backtracking'] }),
  game({ id: 3, genres: ['RPG'], platforms: ['Steam'], strengths: ['Historia', 'Personajes'], weaknesses: ['Ritmo'] }),
  game({ id: 4, genres: ['RPG'], platforms: ['Steam'], strengths: ['Historia'], weaknesses: ['Combate'] }),
];

describe('buildFormSuggestions', () => {
  it('ordena cada campo por frecuencia', () => {
    const s = buildFormSuggestions([LISTA]);
    expect(s.ranked.platforms).toEqual(['Steam', 'Switch']);
    expect(s.ranked.genres[0]).toBe('Metroidvania');
    expect(s.ranked.strengths.slice(0, 2)).toEqual(['Exploración', 'Historia']);
  });

  it('cuenta cada punto por género', () => {
    const s = buildFormSuggestions([LISTA]);
    expect(s.byGenre.strengths.Metroidvania).toEqual({ Exploración: 2, Combate: 1 });
    expect(s.byGenre.weaknesses.RPG).toEqual({ Ritmo: 1, Combate: 1 });
  });

  it('recorre todas las listas que recibe', () => {
    const s = buildFormSuggestions([[LISTA[0]], [LISTA[2]]]);
    expect(s.ranked.platforms).toEqual(['Switch', 'Steam']);
  });
});

describe('suggestForGenres', () => {
  const s = buildFormSuggestions([LISTA]);

  it('pone primero lo que más sale en los géneros elegidos y luego lo general', () => {
    expect(suggestForGenres(s, 'strengths', ['RPG'], [], 3)).toEqual(['Historia', 'Personajes', 'Exploración']);
  });

  it('sin géneros, sugiere lo más usado', () => {
    expect(suggestForGenres(s, 'strengths', [], [], 2)).toEqual(['Exploración', 'Historia']);
  });

  it('no repite lo ya puesto ni lo del campo contrario, sin distinguir mayúsculas', () => {
    expect(suggestForGenres(s, 'weaknesses', ['RPG'], ['combate'], 5)).toEqual(['Ritmo', 'Backtracking']);
  });

  it('respeta el tope', () => {
    expect(suggestForGenres(s, 'strengths', ['Metroidvania', 'RPG'], [], 2)).toHaveLength(2);
  });
});
