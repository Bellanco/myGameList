import { describe, expect, it } from 'vitest';
import {
  CONTENT_MAX_WIDTH_PX,
  MIN_CARD_HEIGHT_PX,
  balanceColumns,
  cardHeightFor,
  estimateCardWidth,
  getGridColumns,
  type GridContext,
} from '../../src/core/premios/gridDensity';

const columns = (overrides: Partial<GridContext>) =>
  getGridColumns({
    width: 1280,
    optionCount: 5,
    isMobile: false,
    isLandscape: false,
    ...overrides,
  });

describe('getGridColumns', () => {
  it('nunca pone más columnas que nominados', () => {
    // Una fila a medias queda fea: con dos nominados, dos columnas como mucho.
    expect(columns({ optionCount: 2, width: 1920 })).toBe(2);
    expect(columns({ optionCount: 1, width: 1920 })).toBe(1);
  });

  it('siempre devuelve al menos una columna', () => {
    expect(columns({ width: 200, optionCount: 10, isMobile: true })).toBeGreaterThanOrEqual(1);
    expect(columns({ width: 0, optionCount: 0 })).toBeGreaterThanOrEqual(1);
  });

  // El salto de dos a tres columnas entre 5 y 6 nominados daba un cambio brusco de tamaño en un móvil normal.
  it('en móvil vertical estrecho se queda en dos columnas como máximo', () => {
    for (const optionCount of [4, 5, 6, 7, 8]) {
      expect(columns({ width: 412, optionCount, isMobile: true, isLandscape: false })).toBeLessThanOrEqual(2);
    }
  });

  it('da tarjetas más grandes cuando hay pocos nominados', () => {
    expect(columns({ width: 1920, optionCount: 4 })).toBeLessThan(columns({ width: 1920, optionCount: 12 }));
  });

  it('aprovecha más columnas cuanto más ancha es la pantalla', () => {
    expect(columns({ width: 1920, optionCount: 12 })).toBeGreaterThan(columns({ width: 900, optionCount: 12 }));
  });

  it('en móvil apaisado prioriza que quepan sin scroll', () => {
    const vertical = columns({ width: 740, optionCount: 8, isMobile: true, isLandscape: false });
    const apaisado = columns({ width: 740, optionCount: 8, isMobile: true, isLandscape: true });
    expect(apaisado).toBeGreaterThanOrEqual(vertical);
  });

  it('tolera un ancho ausente sin romperse', () => {
    expect(
      getGridColumns({ optionCount: 6, isMobile: true, isLandscape: false } as GridContext),
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('balanceColumns', () => {
  it('evita la fila huérfana repartiendo a partes iguales', () => {
    expect(balanceColumns(5, 6)).toBe(3); // 3+3 antes que 5+1
    expect(balanceColumns(6, 7)).toBe(4); // 4+3 antes que 6+1
    expect(balanceColumns(4, 5)).toBe(3); // 3+2 antes que 4+1
  });

  // Si caben todos en una fila, eso gana: ningún reparto en dos filas mejora ver la categoría de un vistazo.
  it('prefiere menos filas antes que mejor reparto', () => {
    expect(balanceColumns(6, 6)).toBe(6);
    expect(balanceColumns(7, 7)).toBe(7);
    expect(balanceColumns(5, 5)).toBe(5);
  });

  it('nunca devuelve más columnas que nominados', () => {
    expect(balanceColumns(8, 3)).toBe(3);
    expect(balanceColumns(8, 1)).toBe(1);
  });
});

// Estos casos fijan el reparto en los tamaños habituales, para que un retoque de la calibración no los rompa sin
// querer. OJO: los números salen de la maqueta de origen; al rehacer la pantalla (F3) hay que volver a medirlos,
// y entonces estos valores esperados cambiarán a propósito. Lo que NO puede cambiar es la regla de reparto.
describe('reparto con los tamaños reales de una edición', () => {
  const cases: Array<[number, boolean, number, number]> = [
    [320, true, 5, 2], // móvil pequeño
    [390, true, 5, 2],
    [390, true, 6, 2],
    [412, true, 7, 2],
    [768, false, 5, 3], // tablet vertical
    [768, false, 6, 3],
    [1280, false, 5, 5], // portátil: con portada, la categoría entera cabe en una fila
    [1280, false, 6, 6],
    [1280, false, 7, 4],
    [1920, false, 5, 5], // monitor: la categoría entera en una fila
    [1920, false, 6, 6],
    [2560, false, 7, 7],
  ];

  it.each(cases)('%ipx (móvil: %s) con %i nominados → %i columnas', (width, isMobile, optionCount, expected) => {
    expect(getGridColumns({ width, optionCount, isMobile, isLandscape: false })).toBe(expected);
  });

  // Donde se ve la categoría entera, un 5+1 o un 6+1 canta mucho. En móvil vertical no siempre se puede evitar
  // (7 nominados en 3 columnas son 3+3+1) y ahí prima hacer menos scroll.
  it('no deja una tarjeta sola en la última fila en tablet y escritorio', () => {
    for (const width of [768, 834, 900, 1024, 1280, 1440, 1600, 1920, 2560]) {
      for (const optionCount of [5, 6, 7]) {
        const cols = getGridColumns({ width, optionCount, isMobile: false, isLandscape: false });
        const lastRow = optionCount % cols;
        const isOrphan = lastRow === 1 && cols > 2;
        expect({ width, optionCount, cols, isOrphan }).toEqual({ width, optionCount, cols, isOrphan: false });
      }
    }
  });
});

// LA CAJA LLEVA SIEMPRE PORTADA: es la pieza del mosaico de la biblioteca, estrecha y alta, calibrada en ~205 px.
describe('getGridColumns con carátulas', () => {
  it('en un portátil caben los cinco nominados en una fila', () => {
    expect(getGridColumns({ width: 1280, optionCount: 5, isMobile: false, isLandscape: true })).toBe(5);
  });

  it('en un teléfono se queda en dos columnas, como el mosaico', () => {
    expect(getGridColumns({ width: 358, optionCount: 5, isMobile: true, isLandscape: false })).toBe(2);
  });

  // La regla de la fila huérfana sigue mandando por encima de la densidad: siete nominados con sitio para seis
  // columnas se reparten 4+3, no 6+1. (Seis con sitio para seis van en una sola fila: menos filas gana.)
  it('sigue evitando la fila huérfana', () => {
    expect(getGridColumns({ width: 1280, optionCount: 7, isMobile: false, isLandscape: true })).toBe(4);
    expect(getGridColumns({ width: 1280, optionCount: 6, isMobile: false, isLandscape: true })).toBe(6);
  });
});

describe('estimateCardWidth', () => {
  it('reparte el ancho disponible entre las columnas', () => {
    expect(estimateCardWidth({ width: 1280, columns: 4 })).toBe(312);
  });

  it('no estira las tarjetas más allá del ancho máximo de contenido', () => {
    expect(estimateCardWidth({ width: 3440, columns: 5 })).toBe(Math.floor(CONTENT_MAX_WIDTH_PX / 5));
  });
});

describe('cardHeightFor', () => {
  it('reparte el alto descontando separaciones y reserva', () => {
    // (300 - 24 de separaciones - 12 reservados) / 3 filas = 88
    expect(cardHeightFor({ areaHeight: 300, rows: 3, gapPx: 12, reservedPx: 12 })).toBe(88);
  });

  it('el alto por fila es lo que decide si se puede prescindir del scroll', () => {
    const cabe = cardHeightFor({ areaHeight: 300, rows: 3, gapPx: 12, reservedPx: 12 });
    expect(cabe).toBeGreaterThanOrEqual(MIN_CARD_HEIGHT_PX);

    // Cuatro filas en una pantalla muy corta: ni encogiendo se leen, así que ahí sí toca scroll.
    expect(cardHeightFor({ areaHeight: 200, rows: 4, gapPx: 12, reservedPx: 12 })).toBeLessThan(MIN_CARD_HEIGHT_PX);
  });

  it('sin medida todavía devuelve cero', () => {
    // Primer render: no hay área medida, así que no se decide nada.
    expect(cardHeightFor({ areaHeight: 0, rows: 3, gapPx: 12 })).toBe(0);
  });
});
