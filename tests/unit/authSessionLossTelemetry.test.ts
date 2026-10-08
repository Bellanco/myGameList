import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LA SESIÓN QUE SE PIERDE SIN QUE NADIE LA CIERRE, registrada (08-10-2026).
 *
 * Hasta ahora solo se sabía porque el usuario lo contaba. Dos señales: `auth-lost-at-boot` (había sesión guardada y
 * el SDK la descarta al restaurarla) y `auth-lost` (había usuario en la visita y se va sin «salir»). Un «salir» de
 * verdad no cuenta, y con varios suscriptores se registra una sola vez.
 */
const { listeners, reportHandledError, bootHadStoredUser } = vi.hoisted(() => ({
  listeners: [] as Array<(user: unknown) => void>,
  reportHandledError: vi.fn(async () => {}),
  bootHadStoredUser: { value: false as boolean | null },
}));

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    listeners.push(cb);
    return () => {};
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/firebaseClient', () => ({
  authBootHadStoredUser: () => bootHadStoredUser.value,
  getFirebaseErrorCode: () => '',
  getFirebaseWebConfig: () => ({}),
  initializeFirebaseServices: async () => ({ app: {}, auth: {} }),
}));
vi.mock('../../src/model/repository/telemetryRepository', () => ({ reportHandledError }));
vi.mock('../../src/model/repository/appCheckRepository', () => ({ ensureAppCheck: async () => {} }));

const USUARIO = { uid: 'u1', displayName: 'Ana', email: null, photoURL: null };

async function suscribir(veces = 1) {
  const auth = await import('../../src/model/repository/firebaseAuthRepository');
  for (let i = 0; i < veces; i += 1) auth.onSocialAuthChanged(() => {});
  await vi.waitFor(() => expect(listeners).toHaveLength(veces));
  return { auth, emite: (user: unknown) => listeners.forEach((cb) => cb(user)) };
}

const contextos = () => reportHandledError.mock.calls.map((call) => (call as unknown[])[2]);

beforeEach(() => {
  localStorage.clear();
  listeners.length = 0;
  reportHandledError.mockClear();
  bootHadStoredUser.value = false;
  vi.resetModules();
});

describe('registro de las pérdidas de sesión', () => {
  it('una sesión que se va sin «salir» se registra una vez, aunque haya varios suscritos', async () => {
    const { emite } = await suscribir(3);
    emite(USUARIO);
    emite(null);

    expect(contextos()).toEqual(['auth-lost']);
  });

  it('con «salir» no se registra nada', async () => {
    const { auth, emite } = await suscribir();
    emite(USUARIO);
    await auth.signOutSocialUser();
    emite(null);

    expect(reportHandledError).not.toHaveBeenCalled();
  });

  it('si había sesión guardada y el arranque responde «nadie», es que el SDK la descartó', async () => {
    bootHadStoredUser.value = true;
    const { emite } = await suscribir();
    emite(null);

    expect(contextos()).toEqual(['auth-lost-at-boot']);
  });

  it('un visitante sin sesión no registra nada', async () => {
    const { emite } = await suscribir();
    emite(null);
    emite(null);

    expect(reportHandledError).not.toHaveBeenCalled();
  });
});
