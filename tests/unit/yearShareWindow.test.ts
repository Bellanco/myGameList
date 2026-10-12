// La ventana de compartir el resumen del año en el servidor (UTC, con holgura de husos) y la espera por rango
// entre actualizaciones del enlace (docs/plan-resumen-del-ano.md, Fase 4).
import { describe, expect, it } from 'vitest';
import { PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS, nextYearShareUpdateAt, yearShareWindow } from '../../src/core/social/yearShareWindow';

const utc = (y: number, m: number, d: number, h = 0) => Date.UTC(y, m, d, h);

describe('la ventana del servidor', () => {
  it('abre a las 10:00 UTC del 14 de diciembre y cierra a mediodía UTC del 16 de enero', () => {
    expect(yearShareWindow(utc(2026, 11, 14, 9))).toBeNull();
    expect(yearShareWindow(utc(2026, 11, 14, 10))).toEqual({ year: 2026, opensAt: utc(2026, 11, 14, 10), closesAt: utc(2027, 0, 16, 12) });
    expect(yearShareWindow(utc(2026, 11, 31, 23))?.year).toBe(2026);
    expect(yearShareWindow(utc(2027, 0, 1))?.year).toBe(2026);
    expect(yearShareWindow(utc(2027, 0, 16, 11))?.year).toBe(2026);
    expect(yearShareWindow(utc(2027, 0, 16, 12))).toBeNull();
    expect(yearShareWindow(utc(2026, 9, 12))).toBeNull();
  });

  it('cubre el 15 de diciembre y el 15 de enero locales en los husos extremos', () => {
    // El 15 de diciembre a las 00:00 en UTC+14 (Kiritimati) son las 10:00 UTC del 14.
    expect(yearShareWindow(utc(2026, 11, 14, 10))?.year).toBe(2026);
    // El 15 de enero a las 23:59 en UTC−12 son las 11:59 UTC del 16.
    expect(yearShareWindow(utc(2027, 0, 16, 11) + 59 * 60 * 1000)?.year).toBe(2026);
  });
});

describe('la espera entre actualizaciones', () => {
  it('va por rango: mithril 1 día, oro 2, plata 3, bronce 5', () => {
    expect(PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS).toEqual({ mithril: 1, gold: 2, silver: 3, bronze: 5 });
    expect(nextYearShareUpdateAt(utc(2026, 11, 20), PROFILE_TIER_YEAR_SHARE_UPDATE_DAYS.gold)).toBe(utc(2026, 11, 22));
  });
});
