import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LA SESIÓN DE GOOGLE NO SE DA POR PERDIDA POR UN PARPADEO (08-10-2026).
 *
 * El síntoma: de vez en cuando el tema volvía al de por defecto y lo social pedía volver a entrar, sobre todo con una
 * versión nueva. Lo provocaba otra pestaña al arrancar (ver `startAuth` en `firebaseClient`), pero cualquier «nadie»
 * pasajero tenía el mismo efecto, porque cada suscriptor lo apuntaba al momento. Aquí se prueba la pasarela, que es
 * la que reparte la sesión a toda la aplicación:
 *
 *  - un «nadie» sin haber pulsado «salir» espera; si el usuario vuelve, no ha pasado nada;
 *  - un «salir» de verdad llega al instante;
 *  - y con un espacio social en el dispositivo se carga Firebase aunque falte la clave de la sesión (la que quedó
 *    solo en IndexedDB).
 *
 * Lo que pasa si la fachada no se puede cargar está en `firebaseFacadeLoadFailure.test.ts`: necesita un fichero
 * propio, porque Vitest reutiliza la fábrica del mock entre casos y el fallo no se repetiría.
 */

const { emitir } = vi.hoisted(() => ({
  emitir: { cb: null as null | ((user: unknown) => void) },
}));

vi.mock('../../src/model/repository/firebaseRepository', () => {
  return {
    onSocialAuthChanged: (cb: (user: unknown) => void) => {
      emitir.cb = cb;
      return () => {};
    },
  };
});

const CLAVE_DE_SESION = 'firebase:authUser:clave:[DEFAULT]';
const USUARIO = { uid: 'u1', displayName: 'Ana', email: '', photoURL: '' };

beforeEach(() => {
  localStorage.clear();
  emitir.cb = null;
  vi.resetModules(); // cada caso arranca como una pestaña nueva
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

async function suscribir() {
  const gateway = await import('../../src/model/repository/firebaseGateway');
  const recibido: unknown[] = [];
  const parar = gateway.subscribeSocialAuth((user) => recibido.push(user));
  await vi.waitFor(() => expect(emitir.cb).not.toBeNull());
  return { gateway, recibido, parar, emite: (user: unknown) => emitir.cb?.(user) };
}

describe('la gracia ante una sesión que se va sola', () => {
  it('si el mismo usuario vuelve dentro de la gracia, nadie se entera', async () => {
    localStorage.setItem(CLAVE_DE_SESION, '{}');
    const { recibido, emite } = await suscribir();
    vi.useFakeTimers();

    emite(USUARIO);
    emite(null);
    vi.advanceTimersByTime(3000);
    emite(USUARIO);
    vi.advanceTimersByTime(20_000);

    expect(recibido).toEqual([USUARIO]);
  });

  it('si no vuelve, se da por perdida al acabar la gracia, y no antes', async () => {
    localStorage.setItem(CLAVE_DE_SESION, '{}');
    const { recibido, emite } = await suscribir();
    vi.useFakeTimers();

    emite(USUARIO);
    emite(null);
    vi.advanceTimersByTime(7000);
    expect(recibido).toEqual([USUARIO]);
    vi.advanceTimersByTime(2000);
    expect(recibido).toEqual([USUARIO, null]);
  });

  it('un «salir» de verdad, aquí o en otra pestaña, llega al instante', async () => {
    localStorage.setItem(CLAVE_DE_SESION, '{}');
    const { gateway, recibido, emite } = await suscribir();

    emite(USUARIO);
    gateway.markSignedOut();
    emite(null);

    expect(recibido).toEqual([USUARIO, null]);
  });

  it('quien no tenía usuario recibe el «nadie» al momento: no hay nada que perder', async () => {
    localStorage.setItem(CLAVE_DE_SESION, '{}');
    const { recibido, emite } = await suscribir();

    emite(null);

    expect(recibido).toEqual([null]);
  });

  it('otro usuario no espera a nadie', async () => {
    localStorage.setItem(CLAVE_DE_SESION, '{}');
    const { recibido, emite } = await suscribir();

    emite(USUARIO);
    emite({ ...USUARIO, uid: 'u2' });

    expect(recibido).toEqual([USUARIO, { ...USUARIO, uid: 'u2' }]);
  });

  it('desuscribirse con la gracia en marcha no deja un «nadie» colgando', async () => {
    localStorage.setItem(CLAVE_DE_SESION, '{}');
    const { recibido, emite, parar } = await suscribir();
    vi.useFakeTimers();

    emite(USUARIO);
    emite(null);
    parar();
    vi.advanceTimersByTime(20_000);

    expect(recibido).toEqual([USUARIO]);
  });
});

describe('cuándo hay que cargar Firebase para restaurar la sesión', () => {
  it('con espacio social y sin la clave de la sesión, se carga igual: puede estar en IndexedDB', async () => {
    localStorage.setItem('mis-listas-social-gist-config', JSON.stringify({ gistId: 'g1', tokenEnc: 'x' }));
    const { gateway } = await suscribir();

    expect(gateway.mayRestoreAuthSession()).toBe(true);
    expect(gateway.hasStoredAuthSession()).toBe(false);
    expect(gateway.isFirebaseFacadeLoaded()).toBe(true);
  });

  it('una configuración social sin gist no cuenta', async () => {
    localStorage.setItem('mis-listas-social-gist-config', JSON.stringify({ gistId: '  ' }));
    const gateway = await import('../../src/model/repository/firebaseGateway');

    expect(gateway.mayRestoreAuthSession()).toBe(false);
  });
});
