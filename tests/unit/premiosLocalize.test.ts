import { describe, expect, it } from 'vitest';
import {
  getCategoryTitle,
  getOptionById,
  getOptionId,
  getOptionLabel,
  hasTitle,
  resolveOptionId,
  selectionsToVotes,
  tField,
} from '../../src/core/premios/localize';
import type { PremiosCategory } from '../../src/model/types/premios';

/** Categoría completa a partir de lo que cada caso necesita nombrar. */
const categoria = (partial: Partial<PremiosCategory>): PremiosCategory => ({
  id: 'cat',
  title: '',
  options: [],
  ...partial,
});

// La forma BILINGÜE de los nominados: la que se usó antes de que un nominado tuviera un solo nombre. Sigue viva
// en datos sin tocar, y por eso se prueba a la par que la actual.
const category = categoria({
  id: 'cat1',
  title: { es: 'Juego del Año', en: 'Game of the Year' },
  options: [
    { id: 'cat1_option_0', es: 'Juego A', en: 'Game A' },
    { id: 'cat1_option_1', es: 'Juego B', en: 'Game B' },
  ],
});

// La forma ACTUAL: un nominado, un nombre.
const categoryNameModel = categoria({
  id: 'cat2',
  title: { es: 'Mejor Banda Sonora', en: 'Best Score' },
  options: [
    { id: 'cat2_option_0', name: 'Hades' },
    { id: 'cat2_option_1', name: 'Hi-Fi Rush' },
  ],
});

describe('tField', () => {
  it('devuelve el idioma pedido', () => {
    expect(tField({ es: 'Hola', en: 'Hi' }, 'en')).toBe('Hi');
    expect(tField({ es: 'Hola', en: 'Hi' }, 'es')).toBe('Hola');
  });

  it('cae al otro idioma y tolera una cadena pelada', () => {
    expect(tField({ es: 'Solo ES' }, 'en')).toBe('Solo ES');
    expect(tField('texto plano')).toBe('texto plano');
  });

  it('devuelve cadena vacía si no hay nada', () => {
    expect(tField(null)).toBe('');
    expect(tField(undefined)).toBe('');
  });

  it('lee un nominado de nombre único', () => {
    expect(tField({ id: 'x', name: 'Hades' }, 'en')).toBe('Hades');
    expect(tField({ id: 'x', name: 'Hades' }, 'es')).toBe('Hades');
  });
});

describe('getCategoryTitle', () => {
  it('devuelve el título en el idioma pedido', () => {
    expect(getCategoryTitle(category, 'en')).toBe('Game of the Year');
    expect(getCategoryTitle(category, 'es')).toBe('Juego del Año');
  });
});

describe('hasTitle', () => {
  it('es cierto si hay título en algún idioma', () => {
    expect(hasTitle(category)).toBe(true);
    expect(hasTitle(categoria({ title: { es: '', en: 'X' } }))).toBe(true);
    expect(hasTitle(categoria({ title: 'legacy' }))).toBe(true);
  });

  it('es falso si está vacío o ausente', () => {
    expect(hasTitle(categoria({ title: { es: '', en: '' } }))).toBe(false);
    expect(hasTitle(categoria({ title: '   ' }))).toBe(false);
    expect(hasTitle(categoria({}))).toBe(false);
    expect(hasTitle(null)).toBe(false);
  });
});

describe('getOptionId', () => {
  it('usa el id del nominado cuando lo tiene', () => {
    expect(getOptionId({ id: 'x' }, 'cat1', 0)).toBe('x');
  });

  it('deriva uno del índice SOLO para datos antiguos sin id', () => {
    expect(getOptionId('Juego', 'cat1', 2)).toBe('cat1_option_2');
  });
});

describe('getOptionById', () => {
  it('encuentra el nominado por su id', () => {
    expect(getOptionById(category, 'cat1_option_1')).toMatchObject({ en: 'Game B' });
  });

  it('devuelve undefined si no existe', () => {
    expect(getOptionById(category, 'nope')).toBeUndefined();
  });
});

describe('getOptionLabel', () => {
  it('etiqueta por id', () => {
    expect(getOptionLabel(category, 'cat1_option_0', 'en')).toBe('Game A');
  });

  it('resuelve un nombre antiguo a su etiqueta', () => {
    expect(getOptionLabel(category, 'Juego A', 'en')).toBe('Game A');
  });

  it('devuelve el valor tal cual si no lo encuentra', () => {
    expect(getOptionLabel(category, 'desconocido', 'es')).toBe('desconocido');
  });

  it('etiqueta los nominados de nombre único', () => {
    expect(getOptionLabel(categoryNameModel, 'cat2_option_0', 'en')).toBe('Hades');
    expect(getOptionLabel(categoryNameModel, 'cat2_option_1', 'es')).toBe('Hi-Fi Rush');
  });
});

describe('resolveOptionId', () => {
  it('conserva un id que ya es válido', () => {
    expect(resolveOptionId(category, 'cat1_option_0')).toBe('cat1_option_0');
  });

  it('convierte un nombre antiguo en el id estable', () => {
    expect(resolveOptionId(category, 'Juego B')).toBe('cat1_option_1');
  });

  it('devuelve el valor original si no hay forma de resolverlo', () => {
    expect(resolveOptionId(category, 'otro')).toBe('otro');
    expect(resolveOptionId(category, '')).toBe('');
  });

  it('resuelve también por nombre único', () => {
    expect(resolveOptionId(categoryNameModel, 'cat2_option_1')).toBe('cat2_option_1');
    expect(resolveOptionId(categoryNameModel, 'Hades')).toBe('cat2_option_0');
  });
});

describe('selectionsToVotes', () => {
  const categories = [
    categoria({
      id: 'goty',
      title: { es: 'Juego del año', en: 'Game of the year' },
      options: [
        { id: 'goty_option_0', name: 'Juego A' },
        { id: 'goty_option_1', name: 'Juego B' },
      ],
    }),
    categoria({
      id: 'art',
      title: { es: 'Arte', en: 'Art' },
      options: [{ id: 'art_option_0', name: 'Juego C' }],
    }),
  ];

  it('reconstruye { id, name } desde los ids guardados', () => {
    expect(selectionsToVotes({ goty: 'goty_option_1' }, categories)).toEqual({
      goty: { id: 'goty_option_1', name: 'Juego B' },
    });
  });

  it('descarta selecciones de categorías que ya no existen', () => {
    // Reenviar un voto a una categoría borrada solo serviría para que las reglas rechazaran la corrección entera.
    expect(selectionsToVotes({ borrada: 'x_option_0' }, categories)).toEqual({});
  });

  it('tolera un voto antiguo guardado por nombre', () => {
    expect(selectionsToVotes({ art: 'Juego C' }, categories)).toEqual({
      art: { id: 'art_option_0', name: 'Juego C' },
    });
  });

  it('devuelve un mapa vacío sin selecciones', () => {
    expect(selectionsToVotes(undefined, categories)).toEqual({});
  });
});
