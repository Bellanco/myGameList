// El día de un instante depende de QUIÉN MIRA. Estos tests fijan la zona del proceso antes de cada cuenta, así
// que fallan si alguien vuelve a calcular días con `toISOString()`: en UTC, un instante de las 22:06Z pertenece
// al día 11 pase lo que pase, y aquí tiene que pertenecer al 12 en Madrid y al 11 en Los Ángeles.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDayKey, localMonthKey, noonOfLocalDay, startOfLocalDay } from '../../src/core/utils/dateTime';

/** Ejecuta el cuerpo con la zona indicada. Node revalida la caché de husos al reasignar `TZ`. */
function enZona<T>(timeZone: string, body: () => T): T {
  vi.stubEnv('TZ', timeZone);
  try {
    return body();
  } finally {
    vi.unstubAllEnvs();
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('localDayKey', () => {
  // El caso reportado: reseña publicada a las 00:06 del 12 en España. En UTC son las 22:06 del 11.
  const MADRUGADA_DEL_12 = Date.parse('2026-08-11T22:06:00.000Z');

  it('devuelve el día del calendario del dispositivo, no el de Greenwich', () => {
    expect(enZona('Europe/Madrid', () => localDayKey(MADRUGADA_DEL_12))).toBe('2026-08-12');
    expect(enZona('America/Los_Angeles', () => localDayKey(MADRUGADA_DEL_12))).toBe('2026-08-11');
    expect(enZona('Pacific/Kiritimati', () => localDayKey(MADRUGADA_DEL_12))).toBe('2026-08-12');
    expect(enZona('UTC', () => localDayKey(MADRUGADA_DEL_12))).toBe('2026-08-11');
  });

  it('rellena mes y día a dos cifras', () => {
    expect(enZona('Europe/Madrid', () => localDayKey(Date.parse('2026-01-05T10:00:00.000Z')))).toBe('2026-01-05');
  });

  it('acepta indistintamente milisegundos y Date', () => {
    enZona('Europe/Madrid', () => {
      expect(localDayKey(new Date(MADRUGADA_DEL_12))).toBe(localDayKey(MADRUGADA_DEL_12));
    });
  });

  it('devuelve cadena vacía ante un instante inválido (timestamp corrupto o en micro/nanosegundos)', () => {
    expect(localDayKey(Number.NaN)).toBe('');
    expect(localDayKey(8.64e15 * 10)).toBe('');
    expect(localDayKey(new Date('no es una fecha'))).toBe('');
  });
});

describe('startOfLocalDay', () => {
  it('es medianoche LOCAL, así que el día que se lee es el día que se pidió', () => {
    // `new Date('2026-08-12')` sería medianoche UTC: en Los Ángeles se leería como el día 11.
    enZona('America/Los_Angeles', () => {
      const date = startOfLocalDay('2026-08-12');
      expect(date.getDate()).toBe(12);
      expect(date.getMonth()).toBe(7);
      expect(date.getFullYear()).toBe(2026);
      expect(date.getHours()).toBe(0);
    });
  });

  it('conserva el día también en husos adelantados', () => {
    enZona('Pacific/Kiritimati', () => {
      expect(startOfLocalDay('2026-08-12').getDate()).toBe(12);
    });
  });

  it('devuelve fecha inválida si la clave no es AAAA-MM-DD', () => {
    expect(Number.isNaN(startOfLocalDay('').getTime())).toBe(true);
    expect(Number.isNaN(startOfLocalDay('2026-8-12').getTime())).toBe(true);
    expect(Number.isNaN(startOfLocalDay('2026-08-12T00:00:00Z').getTime())).toBe(true);
  });
});

describe('noonOfLocalDay', () => {
  it('sella el mediodía local del día pedido', () => {
    enZona('Europe/Madrid', () => {
      const stamp = noonOfLocalDay('2026-05-12');
      expect(localDayKey(stamp)).toBe('2026-05-12');
      expect(new Date(stamp).getHours()).toBe(12);
    });
  });

  it('el margen de doce horas mantiene el día al leerlo desde otro huso', () => {
    const stamp = enZona('Europe/Madrid', () => noonOfLocalDay('2026-05-12'));
    expect(enZona('America/Los_Angeles', () => localDayKey(stamp))).toBe('2026-05-12');
    expect(enZona('Asia/Tokyo', () => localDayKey(stamp))).toBe('2026-05-12');
  });

  it('devuelve NaN si la clave no es válida', () => {
    expect(Number.isNaN(noonOfLocalDay('12-05-2026'))).toBe(true);
  });
});

describe('localMonthKey', () => {
  it('una instantánea del 31 a las 23:00 no se va al mes siguiente', () => {
    const fin = Date.parse('2026-01-31T23:00:00.000Z'); // 00:00 del 1 de febrero en UTC+1
    expect(enZona('UTC', () => localMonthKey(fin))).toBe('2026-01');
    expect(enZona('Europe/Madrid', () => localMonthKey(fin))).toBe('2026-02');
  });

  it('devuelve cadena vacía ante un instante inválido', () => {
    expect(localMonthKey(Number.NaN)).toBe('');
  });
});
