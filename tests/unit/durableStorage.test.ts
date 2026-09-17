// Pedir que el navegador no desaloje lo guardado, y a quién no se le pregunta.
//
// Lo que se protege aquí no es el valor que devuelve —no lo usa nadie, y es a propósito: la aplicación funciona
// igual con un no—, sino la promesa de que esto no interrumpe a nadie. `persist()` se resuelve en silencio en
// Chromium y en WebKit, pero en Firefox abre un diálogo; que ese diálogo no llegue a aparecer es justo lo que
// sujetan estas pruebas.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  pedirAlmacenamientoDuradero,
  reiniciarAlmacenamientoDuradero,
  vigilarAlmacenamientoDuradero,
} from '../../src/core/utils/durableStorage';

/** Deja `navigator.storage` diciendo lo que haga falta, o lo quita del todo. */
function almacenamiento(valor: unknown) {
  Object.defineProperty(navigator, 'storage', { configurable: true, value: valor });
}

/** El navegador que dice ser. Firefox es el único al que no se le pide. */
function navegador(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: ua });
}

const CHROME = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Macintosh; rv:133.0) Gecko/20100101 Firefox/133.0';
const FIREFOX_IOS = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 FxiOS/133.0 Mobile/15E148 Safari/605.1.15';

const uaOriginal = navigator.userAgent;

beforeEach(() => {
  reiniciarAlmacenamientoDuradero();
  navegador(CHROME);
});

afterEach(() => {
  navegador(uaOriginal);
  vi.restoreAllMocks();
});

describe('a quién se le pide la persistencia', () => {
  it('se pide, y se sobrevive a un no', async () => {
    const persist = vi.fn(async () => true);
    almacenamiento({ persist, persisted: async () => false });
    expect(await pedirAlmacenamientoDuradero()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);

    almacenamiento({ persist: async () => false, persisted: async () => false });
    expect(await pedirAlmacenamientoDuradero()).toBe(false);
  });

  it('no se pide si ya está concedida', async () => {
    const persist = vi.fn(async () => true);
    almacenamiento({ persist, persisted: async () => true });

    expect(await pedirAlmacenamientoDuradero()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  /* LA REGLA DE ESTE MÓDULO. En los demás navegadores `persist()` no enseña nada; en Firefox abre un diálogo, y
     un permiso que aparece solo se rechaza por reflejo. Como la respuesta no cambia nada de lo que se ve, no
     merece la pena interrumpir a nadie por ella. */
  it('a Firefox no se le pide: es el único que abriría un diálogo', async () => {
    const persist = vi.fn(async () => true);
    almacenamiento({ persist, persisted: async () => false });

    navegador(FIREFOX);
    expect(await pedirAlmacenamientoDuradero()).toBe(false);
    navegador(FIREFOX_IOS);
    expect(await pedirAlmacenamientoDuradero()).toBe(false);

    expect(persist).not.toHaveBeenCalled();
  });

  it('pero si su dueño ya la concedió a mano, se dice la verdad: consultar no abre ningún diálogo', async () => {
    const persist = vi.fn(async () => true);
    almacenamiento({ persist, persisted: async () => true });
    navegador(FIREFOX);

    expect(await pedirAlmacenamientoDuradero()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('sin la API, o con ella rota, no pasa nada', async () => {
    almacenamiento(undefined);
    expect(await pedirAlmacenamientoDuradero()).toBe(false);

    almacenamiento({ persist: async () => { throw new Error('bloqueado'); }, persisted: async () => false });
    expect(await pedirAlmacenamientoDuradero()).toBe(false);
  });
});

describe('el enganche del arranque', () => {
  it('pide una sola vez por carga, aunque se llame de más', async () => {
    const persist = vi.fn(async () => false);
    almacenamiento({ persist, persisted: async () => false });

    vigilarAlmacenamientoDuradero();
    vigilarAlmacenamientoDuradero();
    await Promise.resolve();
    await Promise.resolve();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  /* Instalar es JUSTO la señal que hace que Chromium conceda, así que quien lo haga por su cuenta se lleva la
     persistencia en el acto. La aplicación no propone instalar en ningún sitio: solo aprovecha el momento. */
  it('y vuelve a pedirla si la aplicación se instala', async () => {
    const persist = vi.fn(async () => false);
    almacenamiento({ persist, persisted: async () => false });

    vigilarAlmacenamientoDuradero();
    await Promise.resolve();
    window.dispatchEvent(new Event('appinstalled'));
    await Promise.resolve();
    await Promise.resolve();

    expect(persist).toHaveBeenCalledTimes(2);
  });
});
