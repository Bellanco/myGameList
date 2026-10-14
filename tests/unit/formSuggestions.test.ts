import { describe, it, expect } from 'vitest';
import { buildFormSuggestions, filterSuggestions, matchCloseness, matchGlow, suggestForGenres } from '../../src/core/utils/formSuggestions';
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

describe('filterSuggestions', () => {
  const POOL = ['Acción/Aventura', 'Plataformas', 'Acción', 'Rogue-like', 'Puzle', 'Metroidvania'];

  it('sin nada escrito, las primeras del orden recibido', () => {
    expect(filterSuggestions(POOL, '', [], 3)).toEqual(['Acción/Aventura', 'Plataformas', 'Acción']);
  });

  it('casa sin mayúsculas ni tildes', () => {
    expect(filterSuggestions(POOL, 'ACCION', [], 8)).toEqual(['Acción/Aventura', 'Acción']);
  });

  it('primero lo que empieza así, luego un inicio de palabra, y al final lo que lo lleva en medio', () => {
    expect(filterSuggestions(POOL, 'a', [], 8)).toEqual([
      'Acción/Aventura', 'Acción', 'Plataformas', 'Metroidvania',
    ]);
    expect(filterSuggestions(POOL, 'like', [], 8)).toEqual(['Rogue-like']);
    expect(filterSuggestions(['Plataformas', 'Acción/Aventura'], 'av', [], 8)).toEqual(['Acción/Aventura']);
  });

  it('sin lo ya puesto, sin repetir y con tope', () => {
    expect(filterSuggestions([...POOL, 'acción'], 'acc', ['Acción'], 8)).toEqual(['Acción/Aventura']);
    expect(filterSuggestions(POOL, 'a', [], 2)).toHaveLength(2);
  });

  it('si nada casa, ninguna', () => {
    expect(filterSuggestions(POOL, 'zz', [], 8)).toEqual([]);
  });
});

describe('matchCloseness', () => {
  it('crece según se escribe el nombre y vale 1 al completarlo', () => {
    const steps = ['m', 'met', 'metroid', 'metroidvania'].map((q) => matchCloseness('Metroidvania', q));
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps[3]).toBe(1);
    expect(matchCloseness('Acción', 'accion')).toBe(1);
  });

  it('pesa menos si no casa por el principio', () => {
    expect(matchCloseness('Rogue-like', 'like')).toBeLessThan(matchCloseness('Likeable', 'like'));
    expect(matchCloseness('Plataformas', 'tafo')).toBeLessThan(matchCloseness('Rogue-like', 'like'));
  });

  it('0 sin nada escrito o si no casa', () => {
    expect(matchCloseness('Puzle', '')).toBe(0);
    expect(matchCloseness('Puzle', 'rpg')).toBe(0);
  });
});

describe('matchGlow', () => {
  it('cuantas menos quedan, más brillan, a igual cercanía', () => {
    const glows = [8, 4, 2, 1].map((remaining) => matchGlow(0.1, remaining));
    expect(glows).toEqual([...glows].sort((a, b) => a - b));
    expect(matchGlow(0.1, 1)).toBeGreaterThan(0.85);
    expect(matchGlow(0.1, 8) - 0.1).toBeLessThan(0.15);
  });

  it('la cercanía sigue mandando entre las que quedan, y nunca pasa de 1', () => {
    expect(matchGlow(0.6, 3)).toBeGreaterThan(matchGlow(0.2, 3));
    expect(matchGlow(1, 1)).toBe(1);
    expect(matchGlow(0, 0)).toBe(0);
  });
});
