import { describe, expect, it } from 'vitest';
import {
  EMPTY_PREMIOS_SNAPSHOT,
  samePremiosSnapshot,
  sanitizePremiosSnapshot,
} from '../../src/core/premios/visibilitySnapshot';
import { shouldOfferPremios } from '../../src/core/premios/visibility';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const DIA = 24 * 3_600_000;

describe('sanitizePremiosSnapshot', () => {
  it('conserva los campos con los que se decide, y solo esos', () => {
    const foto = sanitizePremiosSnapshot({
      visible: true,
      isOpen: false,
      opensAtMillis: 1,
      closesAtMillis: 2,
      lastPublishedId: ' 2025 ',
      updatedAt: '2026-09-20T10:00:00.000Z',
      // Lo que no se necesita no viaja: en KV solo va lo que decide si se ofrece la entrada.
      seasonName: 'Test 2026',
    });

    expect(foto).toEqual({
      visible: true,
      isOpen: false,
      opensAtMillis: 1,
      closesAtMillis: 2,
      lastPublishedId: '2025',
      updatedAt: '2026-09-20T10:00:00.000Z',
    });
  });

  // Se sanea también AL LEER: lo que hay en KV lo escribió la propia función, pero un valor de otra versión —o
  // escrito a mano desde el panel de Cloudflare— no puede llegar al navegador sin pasar por aquí.
  it('lo que llegue roto cae en la foto vacía, que no ofrece nada', () => {
    expect(sanitizePremiosSnapshot(null)).toEqual(EMPTY_PREMIOS_SNAPSHOT);
    expect(sanitizePremiosSnapshot('{}')).toEqual(EMPTY_PREMIOS_SNAPSHOT);
    expect(sanitizePremiosSnapshot({ visible: 'sí', closesAtMillis: '2026' })).toEqual(EMPTY_PREMIOS_SNAPSHOT);
    expect(sanitizePremiosSnapshot({ closesAtMillis: Number.NaN }).closesAtMillis).toBeNull();
  });

  it('reconoce dos fotos iguales, para no reescribir KV en cada apertura del panel', () => {
    const una = sanitizePremiosSnapshot({ visible: null, closesAtMillis: 10 });
    const otra = sanitizePremiosSnapshot({ closesAtMillis: 10 });
    expect(samePremiosSnapshot(una, otra)).toBe(true);
    expect(samePremiosSnapshot(una, sanitizePremiosSnapshot({ closesAtMillis: 11 }))).toBe(false);
    expect(samePremiosSnapshot(una, null)).toBe(false);
  });
});

// LA REGLA ES LA MISMA para las dos fuentes: el calendario que lee el panel de Firestore y la foto que se sirve
// desde nuestro dominio. Si divergieran, el panel diría que la entrada se ofrece y el menú no la enseñaría.
describe('la foto decide lo mismo que el calendario', () => {
  it('con votación abierta se ofrece', () => {
    const foto = sanitizePremiosSnapshot({ closesAtMillis: NOW + DIA });
    expect(shouldOfferPremios(foto, NOW)).toBe(true);
  });

  it('el cierre forzado del administrador viaja y se respeta', () => {
    const foto = sanitizePremiosSnapshot({ closesAtMillis: NOW + DIA, isOpen: false });
    expect(shouldOfferPremios(foto, NOW)).toBe(false);
  });

  it('el interruptor manda sobre el calendario, en los dos sentidos', () => {
    expect(shouldOfferPremios(sanitizePremiosSnapshot({ visible: false, closesAtMillis: NOW + DIA }), NOW)).toBe(false);
    expect(shouldOfferPremios(sanitizePremiosSnapshot({ visible: true }), NOW)).toBe(true);
  });

  // Y CADUCA SOLA, que es la razón de publicar las fechas y no un «sí/no» ya resuelto: el día del cierre la
  // entrada se retira sin que nadie entre al panel a apagarla.
  it('pasado el cierre deja de ofrecerse sin que nadie toque nada', () => {
    const foto = sanitizePremiosSnapshot({ closesAtMillis: NOW - 1 });
    expect(shouldOfferPremios(foto, NOW)).toBe(false);
  });

  it('con resultados recientes se ofrece, y al mes ya no', () => {
    const publicada = { lastPublishedId: '2025', updatedAt: new Date(NOW - 10 * DIA).toISOString() };
    expect(shouldOfferPremios(sanitizePremiosSnapshot(publicada), NOW)).toBe(true);

    const vieja = { lastPublishedId: '2025', updatedAt: new Date(NOW - 40 * DIA).toISOString() };
    expect(shouldOfferPremios(sanitizePremiosSnapshot(vieja), NOW)).toBe(false);
  });
});
