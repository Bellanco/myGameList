import { describe, expect, it } from 'vitest';
import { MONTH_WINDOW, accumulate, fillMonthGaps, nextMonth } from '../../src/core/stats/months';
import type { ArrivalPoint } from '../../src/core/stats/types';

function point(m: string, c = 0): ArrivalPoint {
  return { m, c, v: 0, e: 0, p: 0 };
}

describe('nextMonth', () => {
  it('avanza un mes y cambia de año en diciembre', () => {
    expect(nextMonth('2026-01')).toBe('2026-02');
    expect(nextMonth('2026-09')).toBe('2026-10');
    expect(nextMonth('2026-12')).toBe('2027-01');
  });

  it('devuelve la entrada tal cual si no tiene forma de mes', () => {
    expect(nextMonth('no-es-un-mes')).toBe('no-es-un-mes');
  });
});

describe('fillMonthGaps', () => {
  it('rellena los meses sin datos entre el primero y el último', () => {
    // Un hueco es información: sin rellenarlo, marzo y junio saldrían pegados y el gráfico mentiría.
    const filled = fillMonthGaps([point('2026-03', 2), point('2026-06', 1)]);

    expect(filled.map((entry) => entry.m)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06']);
    expect(filled[1]).toEqual(point('2026-04'));
  });

  it('recorta a la ventana quedándose con los meses más recientes', () => {
    // Cuarenta meses seguidos, de 2020-01 en adelante.
    const many = Array.from({ length: 40 }, (_unused, index) =>
      point(`${2020 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`, index));
    const filled = fillMonthGaps(many);

    expect(filled).toHaveLength(MONTH_WINDOW);
    expect(filled[filled.length - 1].m).toBe('2023-04');
  });

  it('descarta claves que no son meses y tolera la lista vacía', () => {
    expect(fillMonthGaps([])).toEqual([]);
    expect(fillMonthGaps([point('2026-13'), point('vacío')])).toEqual([]);
  });
});

describe('accumulate', () => {
  it('convierte altas por mes en totales acumulados', () => {
    // Es la diferencia entre un serrucho y una evolución: las altas sueltas de una biblioteca real son
    // números pequeños y erráticos; acumuladas describen cómo ha crecido cada lista.
    const acumulado = accumulate([
      { m: '2026-01', c: 2, v: 0, e: 1, p: 3 },
      { m: '2026-02', c: 0, v: 1, e: 0, p: 0 },
      { m: '2026-03', c: 3, v: 0, e: 0, p: 1 },
    ]);

    expect(acumulado).toEqual([
      { m: '2026-01', c: 2, v: 0, e: 1, p: 3 },
      { m: '2026-02', c: 2, v: 1, e: 1, p: 3 },
      { m: '2026-03', c: 5, v: 1, e: 1, p: 4 },
    ]);
  });

  it('nunca decrece y tolera la serie vacía', () => {
    expect(accumulate([])).toEqual([]);
  });
});
