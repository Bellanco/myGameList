// @vitest-environment-options { "url": "https://mygamelist.pages.dev/" }

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// El SW ya hace `skipWaiting()`, así que la versión nueva entra sola EN CUANTO el navegador vuelve a mirar
// `/service-worker.js`. Lo que se prueba aquí es justo eso: que alguien le pida mirar (una SPA no navega nunca,
// así que el navegador no lo hace por su cuenta) y que el aviso resultante distinga una actualización de verdad
// de la primera toma de control, que no lo es.

type Listener = (event?: unknown) => void;

let controllerListeners: Listener[] = [];
let updateMock: ReturnType<typeof vi.fn>;
let registerMock: ReturnType<typeof vi.fn>;
let unregisterMock: ReturnType<typeof vi.fn>;

function installServiceWorkerMock(options: { controlled: boolean }): void {
  controllerListeners = [];
  updateMock = vi.fn().mockResolvedValue(undefined);
  unregisterMock = vi.fn().mockResolvedValue(true);
  registerMock = vi.fn().mockResolvedValue({ update: updateMock });

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: options.controlled ? {} : null,
      register: registerMock,
      getRegistrations: vi.fn().mockResolvedValue([{ unregister: unregisterMock }]),
      addEventListener: (type: string, listener: Listener) => {
        if (type === 'controllerchange') {
          controllerListeners.push(listener);
        }
      },
      removeEventListener: () => {},
    },
  });
}

/** Simula que un service worker nuevo toma el control de esta página. */
function fireControllerChange(): void {
  controllerListeners.forEach((listener) => listener());
}

/** Simula volver a la app: es el disparador principal de la comprobación. */
function returnToApp(): void {
  document.dispatchEvent(new Event('visibilitychange'));
}

async function loadModule(): Promise<typeof import('../../src/core/utils/appUpdate')> {
  vi.resetModules(); // el módulo guarda estado (registro, último chequeo): cada caso arranca limpio
  return import('../../src/core/utils/appUpdate');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('detección de versión nueva', () => {
  it('registra el service worker en producción', async () => {
    installServiceWorkerMock({ controlled: true });
    const { registerServiceWorker } = await loadModule();

    registerServiceWorker();

    expect(registerMock).toHaveBeenCalledWith('/service-worker.js');
    expect(unregisterMock).not.toHaveBeenCalled();
  });

  it('avisa cuando un service worker nuevo releva al que ya controlaba la página', async () => {
    installServiceWorkerMock({ controlled: true });
    const { registerServiceWorker, APP_UPDATE_EVENT } = await loadModule();
    const listener = vi.fn();
    window.addEventListener(APP_UPDATE_EVENT, listener);

    registerServiceWorker();
    fireControllerChange();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(APP_UPDATE_EVENT, listener);
  });

  it('NO avisa en la primera toma de control: no hay versión anterior de la que venir', async () => {
    installServiceWorkerMock({ controlled: false });
    const { registerServiceWorker, APP_UPDATE_EVENT } = await loadModule();
    const listener = vi.fn();
    window.addEventListener(APP_UPDATE_EVENT, listener);

    registerServiceWorker();
    fireControllerChange();

    expect(listener).not.toHaveBeenCalled();

    // Pero el SIGUIENTE relevo, ya con la página controlada, sí es una actualización (dos despliegues seguidos
    // sin que la página se haya recargado por medio).
    fireControllerChange();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(APP_UPDATE_EVENT, listener);
  });

  it('pregunta por una versión nueva al volver a la app, sin repetirlo en cada disparador', async () => {
    installServiceWorkerMock({ controlled: true });
    const { registerServiceWorker } = await loadModule();

    registerServiceWorker();
    await vi.waitFor(() => expect(registerMock).toHaveBeenCalled());
    await Promise.resolve(); // deja resolver la promesa del registro (es la que engancha los disparadores)

    // El propio registro acaba de comprobar el script: volver de inmediato no vuelve a pedirlo.
    returnToApp();
    expect(updateMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(61_000);
    returnToApp();
    expect(updateMock).toHaveBeenCalledTimes(1);

    // Volver a la app dispara a la vez `visibilitychange` y `focus`: el tope evita pedirlo dos veces.
    window.dispatchEvent(new Event('focus'));
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('comprueba sola cada cuarto de hora aunque el usuario no salga de la app', async () => {
    installServiceWorkerMock({ controlled: true });
    const { registerServiceWorker } = await loadModule();

    registerServiceWorker();
    await vi.waitFor(() => expect(registerMock).toHaveBeenCalled());
    await Promise.resolve();

    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('una restauración desde la bfcache comprueba siempre: el documento vuelve con el bundle viejo dentro', async () => {
    installServiceWorkerMock({ controlled: true });
    const { registerServiceWorker } = await loadModule();

    registerServiceWorker();
    await vi.waitFor(() => expect(registerMock).toHaveBeenCalled());
    await Promise.resolve();

    const event = new Event('pageshow') as Event & { persisted?: boolean };
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);

    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});
