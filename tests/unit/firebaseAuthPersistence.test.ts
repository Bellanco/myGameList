import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUTH ARRANCA CON `localStorage` PRIMERO, fijado al crearla (08-10-2026).
 *
 * Con `getAuth` + `setPersistence` el SDK prefería IndexedDB: en cada arranque movía allí la sesión y BORRABA la
 * clave de `localStorage` hasta comprobar la cuenta por red, y las demás pestañas, al ver la clave vacía, se daban por
 * desconectadas (tema por defecto, «vuelve a entrar»). Lo que se fija aquí es la llamada: la jerarquía con
 * `localStorage` delante —IndexedDB detrás, para recoger las sesiones que se quedaron allí— y el resolutor de
 * ventanas, sin el que no hay `signInWithPopup`.
 */
const { initializeAuth, getAuth } = vi.hoisted(() => ({
  initializeAuth: vi.fn(() => ({ name: 'auth-nueva' })),
  getAuth: vi.fn(() => ({ name: 'auth-existente' })),
}));

vi.mock('firebase/app', () => ({
  getApps: () => [],
  getApp: () => ({}),
  initializeApp: () => ({ name: 'app' }),
}));
vi.mock('firebase/firestore/lite', () => ({ getFirestore: () => ({}) }));
vi.mock('firebase/auth', () => ({
  initializeAuth,
  getAuth,
  browserLocalPersistence: 'local',
  indexedDBLocalPersistence: 'indexeddb',
  browserPopupRedirectResolver: 'popups',
}));

beforeEach(() => {
  localStorage.clear();
  initializeAuth.mockClear();
  getAuth.mockClear();
  vi.resetModules();
});

describe('arranque de Auth', () => {
  it('fija localStorage delante de IndexedDB y el resolutor de ventanas, sin pasar por getAuth', async () => {
    const client = await import('../../src/model/repository/firebaseClient');
    const services = await client.initializeFirebaseServices();

    expect(initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: ['local', 'indexeddb'],
      popupRedirectResolver: 'popups',
    });
    expect(getAuth).not.toHaveBeenCalled();
    expect(services?.auth).toEqual({ name: 'auth-nueva' });
  });

  it('si Auth ya estaba creada, usa la que hay en vez de romper el arranque', async () => {
    initializeAuth.mockImplementationOnce(() => {
      throw new Error('auth/already-initialized');
    });
    const client = await import('../../src/model/repository/firebaseClient');

    expect((await client.initializeFirebaseServices())?.auth).toEqual({ name: 'auth-existente' });
  });

  it('apunta si había sesión guardada justo antes de arrancar', async () => {
    const sin = await import('../../src/model/repository/firebaseClient');
    expect(sin.authBootHadStoredUser()).toBeNull();
    await sin.initializeFirebaseServices();
    expect(sin.authBootHadStoredUser()).toBe(false);

    vi.resetModules();
    localStorage.setItem('firebase:authUser:clave:[DEFAULT]', '{}');
    const con = await import('../../src/model/repository/firebaseClient');
    await con.initializeFirebaseServices();
    expect(con.authBootHadStoredUser()).toBe(true);
  });
});
