import { describe, expect, it } from 'vitest';
import { nextSort } from '../../src/core/utils/sortGames';

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
