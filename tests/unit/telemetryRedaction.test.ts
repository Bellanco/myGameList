import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * S5 — Ni el token de GitHub ni un id de gist pueden salir hacia Analytics.
 *
 * El mensaje y la pila de un error los escribe quien lanza, no la telemetría, así que la única forma de
 * garantizarlo es tapar en la salida. Estos casos fijan que se tapa donde se tapa, y que el resto del mensaje
 * sigue llegando entero: un informe de error censurado de más no sirve para diagnosticar nada.
 */

const logEvent = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ analytics: { fake: true } })),
  getAnalyticsModule: vi.fn(async () => ({ logEvent, setUserId: vi.fn() })),
}));

import { reportHandledError } from '../../src/model/repository/telemetryRepository';

/** Los parámetros del último `logEvent`, que es lo que de verdad viaja a GA4. */
function lastEventParams(): Record<string, unknown> {
  expect(logEvent).toHaveBeenCalled();
  return logEvent.mock.calls[logEvent.mock.calls.length - 1][2] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('telemetría (S5) — redacción de secretos', () => {
  it('tapa un PAT clásico incrustado en el mensaje', async () => {
    await reportHandledError(new Error('fallo al leer el gist con ghp_abcdefghijklmnopqrstuvwxyz012345'));

    const description = String(lastEventParams().description);
    expect(description).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345');
    expect(description).toContain('[token]');
    // El resto del mensaje sobrevive: se tapa el secreto, no el diagnóstico.
    expect(description).toContain('fallo al leer el gist');
  });

  it('tapa las otras dos formas de token de GitHub', async () => {
    await reportHandledError(new Error('gho_0123456789abcdefghij y github_pat_0123456789abcdefghij fallaron'));

    const description = String(lastEventParams().description);
    expect(description).not.toMatch(/gho_0123456789|github_pat_0123456789/);
    expect(description.match(/\[token\]/g)).toHaveLength(2);
  });

  it('tapa el id de un gist', async () => {
    await reportHandledError(new Error('gist a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6 no encontrado'));

    const description = String(lastEventParams().description);
    expect(description).not.toContain('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    expect(description).toContain('[gist]');
  });

  it('tapa también lo que venga en la pila', async () => {
    const error = new Error('fallo genérico');
    error.stack = 'Error: fallo\n    at readGist (token=ghp_abcdefghijklmnopqrstuvwxyz012345)';

    await reportHandledError(error);

    expect(String(lastEventParams().error_stack)).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz012345');
  });

  it('deja intacto un mensaje sin secretos', async () => {
    await reportHandledError(new Error('no hay conexión con GitHub'));

    expect(String(lastEventParams().description)).toBe('no hay conexión con GitHub');
  });
});
