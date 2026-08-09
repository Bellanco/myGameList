import { describe, expect, it } from 'vitest';
import { timeTicks } from '../../src/core/stats/timeAxis';

// El eje temporal tiene que ADAPTARSE al recorrido: con unos días, marcas de días; con unos meses, meses; con
// una década, años salteados. Un eje fijo dejaba los periodos cortos sin una sola referencia y los largos con
// una hilera apelmazada.

const at = (y: number, m: number, d = 1) => new Date(y, m - 1, d).getTime();

describe('timeTicks', () => {
  it('con unos pocos días, marca días', () => {
    const ticks = timeTicks(at(2026, 3, 2), at(2026, 3, 9));

    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => tick.unit === 'day')).toBe(true);
  });

  it('con dos meses largos, reparte marcas quincenales', () => {
    const ticks = timeTicks(at(2026, 6, 12), at(2026, 8, 20));

    expect(ticks.every((tick) => tick.unit === 'day')).toBe(true);
    expect(ticks.length).toBeGreaterThanOrEqual(4);
  });

  it('respeta el escalón mínimo de quien dibuja', () => {
    // Una serie agrupada por meses no puede rotular días: dos marcas del mismo mes caerían en el mismo sitio.
    const ticks = timeTicks(at(2026, 6, 1), at(2026, 8, 1), 6, 'month');

    expect(ticks.map((tick) => tick.unit)).toEqual(['month', 'month', 'month']);
    expect(ticks.every((tick) => new Date(tick.at).getDate() === 1)).toBe(true);
  });

  it('con una década, marca años salteados sin pasarse del tope', () => {
    const ticks = timeTicks(at(2014, 1), at(2026, 12), 6);

    expect(ticks.every((tick) => tick.unit === 'year')).toBe(true);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    // Alineadas al 1 de enero: las referencias son años redondos, no fechas arbitrarias.
    expect(ticks.every((tick) => new Date(tick.at).getMonth() === 0 && new Date(tick.at).getDate() === 1)).toBe(true);
  });

  it('reparte más marcas cuando se le permite', () => {
    const pocas = timeTicks(at(2014, 1), at(2026, 12), 6);
    const muchas = timeTicks(at(2014, 1), at(2026, 12), 8);

    expect(muchas.length).toBeGreaterThan(pocas.length);
  });

  it('devuelve nada si no hay recorrido', () => {
    expect(timeTicks(at(2026, 3), at(2026, 3))).toEqual([]);
    expect(timeTicks(at(2026, 5), at(2026, 3))).toEqual([]);
    expect(timeTicks(Number.NaN, at(2026, 3))).toEqual([]);
  });
});
