import { describe, expect, it } from 'vitest';
import { buildStableOptions, generateUUID } from '../../src/core/premios/options';

/** Generador determinista, para poder afirmar sobre los ids nuevos. */
const fakeIds = () => {
  let n = 0;
  return () => `new${++n}`;
};

describe('buildStableOptions', () => {
  it('conserva el id de los nominados que ya lo tenían', () => {
    const result = buildStableOptions(
      [
        { id: 'cat_option_0', value: 'Elden Ring' },
        { id: 'cat_option_1', value: 'God of War' },
      ],
      'cat',
      fakeIds(),
    );

    expect(result).toEqual([
      { id: 'cat_option_0', name: 'Elden Ring' },
      { id: 'cat_option_1', name: 'God of War' },
    ]);
  });

  it('da id nuevo a los que no tienen', () => {
    const result = buildStableOptions([{ id: null, value: 'Hades II' }], 'cat', fakeIds());
    expect(result).toEqual([{ id: 'cat_option_new1', name: 'Hades II' }]);
  });

  // REGRESIÓN: con el id derivado del índice, borrar el nominado 0 y añadir otro le daba al nuevo el id que ya
  // tenía el superviviente — y los votos de uno pasaban a contar para el otro.
  it('no colisiona al borrar un nominado y añadir otro', () => {
    const result = buildStableOptions(
      [
        { id: 'cat_option_1', value: 'God of War' },
        { id: null, value: 'Hades II' },
      ],
      'cat',
      fakeIds(),
    );

    expect(result[0].id).toBe('cat_option_1');
    expect(result[1].id).not.toBe('cat_option_1');
    expect(new Set(result.map((o) => o.id)).size).toBe(2);
  });

  it('reasigna id a los duplicados que lleguen de datos antiguos', () => {
    const result = buildStableOptions(
      [
        { id: 'dup', value: 'A' },
        { id: 'dup', value: 'B' },
        { id: 'dup', value: 'C' },
      ],
      'cat',
      fakeIds(),
    );

    expect(result[0].id).toBe('dup');
    expect(new Set(result.map((o) => o.id)).size).toBe(3);
  });

  it('recorta los nombres y aguanta una lista vacía', () => {
    expect(buildStableOptions([{ id: 'x', value: '  Balatro  ' }], 'cat')).toEqual([
      { id: 'x', name: 'Balatro' },
    ]);
    expect(buildStableOptions([], 'cat')).toEqual([]);
    expect(buildStableOptions(null, 'cat')).toEqual([]);
  });
});

describe('generateUUID', () => {
  it('no se repite', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateUUID()));
    expect(ids.size).toBe(50);
  });
});
