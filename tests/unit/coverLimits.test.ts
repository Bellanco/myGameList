// Los topes LOCALES de las carátulas y cuándo dejan de aplicarse.
//
// Lo que se protege aquí es la guarda, no el privilegio: levantar un tope de almacenamiento sin mirar cuánto
// queda es lo que acaba haciendo que el navegador desaloje el origen entero —shell y chunks incluidos— y que la
// aplicación deje de arrancar sin red. El rango concede; el espacio disponible decide.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  evaluarTopesDeImagenes,
  hayHolguraDeAlmacenamiento,
  reiniciarTopesDeImagenes,
  topesLevantados,
} from '../../src/core/utils/coverLimits';

/** Deja `navigator.storage.estimate` diciendo lo que haga falta, o lo quita del todo. */
function almacenamiento(estimate: (() => Promise<{ usage?: number; quota?: number }>) | null) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: estimate ? { estimate } : undefined,
  });
}

beforeEach(() => {
  reiniciarTopesDeImagenes();
});

afterEach(() => {
  reiniciarTopesDeImagenes();
  vi.restoreAllMocks();
});

describe('cuándo se levantan los topes de imágenes', () => {
  it('de partida están puestos: es el comportamiento de siempre', () => {
    expect(topesLevantados()).toBe(false);
  });

  it('con rango y sitio de sobra se levantan', async () => {
    almacenamiento(async () => ({ usage: 50_000_000, quota: 1_000_000_000 }));
    expect(await evaluarTopesDeImagenes(true)).toBe(true);
    expect(topesLevantados()).toBe(true);
  });

  it('sin rango no se levantan aunque sobre sitio', async () => {
    almacenamiento(async () => ({ usage: 1, quota: 1_000_000_000 }));
    expect(await evaluarTopesDeImagenes(false)).toBe(false);
  });

  // Al 85 % de ocupación, seguir acumulando es jugarse que el navegador desaloje el origen ENTERO.
  it('con el almacenamiento apurado vuelven los topes aunque haya rango', async () => {
    almacenamiento(async () => ({ usage: 850_000_000, quota: 1_000_000_000 }));
    expect(await evaluarTopesDeImagenes(true)).toBe(false);
  });

  it('y vuelven también si el navegador no sabe decir cuánto queda', async () => {
    // Ante la duda, lo de siempre: nunca se deja a nadie sin aplicación por falta de espacio.
    almacenamiento(null);
    expect(await hayHolguraDeAlmacenamiento()).toBe(false);
    expect(await evaluarTopesDeImagenes(true)).toBe(false);

    almacenamiento(async () => ({}));
    expect(await hayHolguraDeAlmacenamiento()).toBe(false);

    almacenamiento(async () => { throw new Error('bloqueado'); });
    expect(await hayHolguraDeAlmacenamiento()).toBe(false);
  });

  it('se lo cuenta al service worker, que no puede mirar ni el rango ni el espacio', async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ active: { postMessage } }) },
    });
    almacenamiento(async () => ({ usage: 10, quota: 1_000_000_000 }));

    await evaluarTopesDeImagenes(true);

    expect(postMessage).toHaveBeenCalledWith({ tipo: 'covers-sin-tope', valor: true });
  });
});
