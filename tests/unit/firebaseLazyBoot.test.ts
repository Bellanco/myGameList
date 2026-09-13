import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EL SDK DE FIREBASE NO SE DESCARGA PARA QUIEN NUNCA HA INICIADO SESIÓN.
 *
 * Son ~65 kB comprimidos, y se los bajaba todo el mundo porque la app se suscribe a los cambios de sesión nada
 * más montarse — también quien solo usa sus listas, para quien no hay ni sesión que restaurar ni nada que
 * consultar (las reglas de Firestore exigen estar autenticado para toda lectura).
 *
 * Lo que hay que demostrar aquí es que el ahorro no le quita nada a nadie: quien tiene sesión sigue igual, y
 * quien inicia una durante la visita se engancha sin recargar.
 */

const { onSocialAuthChanged, usuarioActual } = vi.hoisted(() => ({
  onSocialAuthChanged: vi.fn(),
  usuarioActual: { value: null as { uid: string } | null },
}));

// La factoría se ejecuta la PRIMERA vez que alguien importa el módulo: es el contador de descargas del chunk.
vi.mock('../../src/model/repository/firebaseRepository', () => {
  return {
    onSocialAuthChanged: (cb: (u: unknown) => void) => {
      onSocialAuthChanged(cb);
      cb(usuarioActual.value);
      return () => {};
    },
    getCurrentSocialAuthUser: async () => usuarioActual.value,
    initializeFirebaseServices: async () => null,
  };
});

const CLAVE_DE_SESION = 'firebase:authUser:AIzaSyD0S3Dn3GXMvJqZLPTOE8t_56iyngl_VZY:[DEFAULT]';

beforeEach(() => {
  localStorage.clear();
  usuarioActual.value = null;
  onSocialAuthChanged.mockClear();
  vi.resetModules(); // cada caso arranca como una pestaña nueva
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('arranque perezoso de Firebase', () => {
  it('sin sesión guardada no se descarga el SDK, y la sesión se resuelve como «no hay»', async () => {
    const { isFirebaseFacadeLoaded, subscribeSocialAuth } = await import('../../src/model/repository/firebaseGateway');

    const recibido: Array<unknown> = [];
    subscribeSocialAuth((user) => recibido.push(user));
    await Promise.resolve();
    await Promise.resolve();

    expect(isFirebaseFacadeLoaded()).toBe(false); // ni siquiera se ha pedido el chunk
    expect(onSocialAuthChanged).not.toHaveBeenCalled();
    expect(recibido).toEqual([null]); // resuelta, no «pendiente para siempre»
  });

  it('con sesión guardada se carga y se suscribe, como siempre', async () => {
    localStorage.setItem(CLAVE_DE_SESION, JSON.stringify({ uid: 'u1' }));
    usuarioActual.value = { uid: 'u1' };
    const { isFirebaseFacadeLoaded, subscribeSocialAuth } = await import('../../src/model/repository/firebaseGateway');

    const recibido: Array<unknown> = [];
    subscribeSocialAuth((user) => recibido.push(user));
    await vi.waitFor(() => expect(recibido.length).toBeGreaterThan(0));

    expect(isFirebaseFacadeLoaded()).toBe(true);
    expect(onSocialAuthChanged).toHaveBeenCalled();
    expect(recibido).toEqual([{ uid: 'u1' }]);
  });

  it('quien inicia sesión durante la visita se engancha sin recargar', async () => {
    const gateway = await import('../../src/model/repository/firebaseGateway');

    const recibido: Array<unknown> = [];
    gateway.subscribeSocialAuth((user) => recibido.push(user));
    await Promise.resolve();
    expect(gateway.isFirebaseFacadeLoaded()).toBe(false);
    expect(recibido).toEqual([null]);

    // Algo carga la fachada (el botón de iniciar sesión, abrir el hub social…).
    usuarioActual.value = { uid: 'u2' };
    await gateway.getCurrentSocialAuthUser();
    await vi.waitFor(() => expect(recibido.length).toBeGreaterThan(1));

    expect(onSocialAuthChanged).toHaveBeenCalledTimes(1); // se engancha UNA vez, no una por cada carga
    expect(recibido[recibido.length - 1]).toEqual({ uid: 'u2' });
  });

  it('darse de baja antes de que llegue la sesión no deja nada colgando', async () => {
    const gateway = await import('../../src/model/repository/firebaseGateway');

    const recibido: Array<unknown> = [];
    const baja = gateway.subscribeSocialAuth((user) => recibido.push(user));
    baja();

    usuarioActual.value = { uid: 'u3' };
    await gateway.getCurrentSocialAuthUser();
    await Promise.resolve();

    // Ni el `null` inicial ni el usuario posterior: ya no había nadie escuchando.
    expect(recibido).toEqual([]);
    expect(onSocialAuthChanged).not.toHaveBeenCalled();
  });

  it('si no se puede mirar el almacenamiento, se carga como antes', async () => {
    const { hasStoredAuthSession } = await import('../../src/model/repository/firebaseGateway');
    vi.spyOn(Storage.prototype, 'length', 'get').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    // Ante la duda, SÍ: cargar de más es un coste; cargar de menos sería perder la sesión de alguien.
    expect(hasStoredAuthSession()).toBe(true);
  });
});
