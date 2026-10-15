import { describe, expect, it } from 'vitest';
import { capGrowth, capList, capTag } from '../../src/core/utils/fieldLimits';

describe('capGrowth', () => {
  it('deja pasar lo que cabe', () => {
    expect(capGrowth('Hades', 'Hade', 10)).toBe('Hades');
  });

  it('lo que crece por el final entra hasta el tope, como el maxLength del navegador', () => {
    expect(capGrowth('abcdef', 'abc', 5)).toBe('abcde');
    expect(capGrowth('abcdef', 'abcde', 5)).toBe('abcde');
  });

  it('lo que crece por en medio por encima del tope no entra: no se come el final', () => {
    expect(capGrowth('abXcde', 'abcde', 5)).toBe('abcde');
  });

  it('un valor que ya pasaba del tope no se recorta: se puede acortar, no alargar', () => {
    expect(capGrowth('abcdefg', 'abcdefgh', 5)).toBe('abcdefg');
    expect(capGrowth('abcdefghi', 'abcdefgh', 5)).toBe('abcdefgh');
  });
});

describe('capTag', () => {
  it('recorta al tope sin dejar un espacio colgando', () => {
    expect(capTag('Historia que engancha', 9)).toBe('Historia');
    expect(capTag('RPG', 9)).toBe('RPG');
  });
});

describe('capList', () => {
  it('lo nuevo entra mientras quepa', () => {
    expect(capList(['a', 'b', 'c', 'd'], ['a'], 3)).toEqual(['a', 'b', 'c']);
  });

  it('lo que ya había se queda entero aunque pase del tope', () => {
    expect(capList(['a', 'b', 'c', 'd'], ['a', 'b', 'c'], 2)).toEqual(['a', 'b', 'c']);
  });
});
