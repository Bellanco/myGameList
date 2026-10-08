import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * SI LA FACHADA DE FIREBASE NO SE PUEDE CARGAR, LA SESIÓN NO SE DA POR CERRADA (08-10-2026).
 *
 * Con sesión guardada, un chunk que no baja —sin red, o un despliegue que rotó los hashes con la pestaña abierta—
 * no dice nada de la sesión. Emitir «nadie» desconectaba lo social, tema incluido, de quien la seguía teniendo. La
 * pasarela se calla y lo vuelve a intentar cuando la pestaña vuelve a estar a la vista o vuelve la red.
 *
 * Fichero propio a propósito: la fábrica del mock tiene que FALLAR la primera vez y funcionar la segunda, y Vitest
 * reutiliza su resultado entre casos de un mismo fichero.
 */

const { emitir, fallar, cargas } = vi.hoisted(() => ({
  emitir: { cb: null as null | ((user: unknown) => void) },
  fallar: { value: true },
  cargas: { value: 0 },
}));

vi.mock('../../src/model/repository/firebaseRepository', () => {
  cargas.value += 1;
  if (fallar.value) throw new Error('chunk no disponible');
  return {
    onSocialAuthChanged: (cb: (user: unknown) => void) => {
      emitir.cb = cb;
      return () => {};
    },
  };
});

const USUARIO = { uid: 'u1', displayName: 'Ana', email: '', photoURL: '' };

afterEach(() => {
  localStorage.clear();
});

describe('si la fachada no se puede cargar', () => {
  it('no dice «nadie», y lo vuelve a intentar al volver a la pestaña', async () => {
    localStorage.setItem('firebase:authUser:clave:[DEFAULT]', '{}');
    const gateway = await import('../../src/model/repository/firebaseGateway');
    const recibido: unknown[] = [];
    gateway.subscribeSocialAuth((user) => recibido.push(user));
    await vi.waitFor(() => expect(cargas.value).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(recibido).toEqual([]);

    fallar.value = false;
    vi.resetModules();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(emitir.cb).not.toBeNull());
    emitir.cb?.(USUARIO);

    expect(recibido).toEqual([USUARIO]);
  });
});
