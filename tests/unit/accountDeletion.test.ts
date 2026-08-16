import { beforeEach, describe, expect, it, vi } from 'vitest';

// L3 — Borrado de cuenta (RGPD art. 17). Requisitos que fijan estos tests:
//  - se borran las amistades (aceptadas y pendientes) y los cuatro documentos propios;
//  - un fallo parcial NO aborta el resto: la sesión se cierra y el dispositivo se limpia igualmente, y el
//    resultado lo reporta para poder avisar al usuario;
//  - los Gists no se tocan (no hay ninguna llamada a GitHub aquí, por diseño).

const deleteDocMock = vi.fn(async () => {});
const getMyFriendshipsMock = vi.fn(async () => ({ friends: [], incoming: [], outgoing: [], byOtherUid: {} }));
const deleteFriendshipMock = vi.fn(async () => {});
const signOutMock = vi.fn(async () => {});
const closeSharedDatabaseMock = vi.fn(async () => {});
const clearSyncConfigMock = vi.fn();
const removeAllMySharesMock = vi.fn(async () => 0);

vi.mock('firebase/firestore/lite', () => ({
  deleteDoc: (...args: unknown[]) => deleteDocMock(...(args as [])),
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
}));

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
}));

vi.mock('../../src/model/repository/firebaseFriendshipRepository', () => ({
  getMyFriendships: (...args: unknown[]) => getMyFriendshipsMock(...(args as [])),
  deleteFriendship: (...args: unknown[]) => deleteFriendshipMock(...(args as [])),
  invalidateMyFriendshipsCache: vi.fn(),
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
}));

vi.mock('../../src/model/repository/firebaseAuthRepository', () => ({
  signOutSocialUser: (...args: unknown[]) => signOutMock(...(args as [])),
}));

vi.mock('../../src/model/repository/idbConnectionRepository', () => ({
  closeSharedDatabase: (...args: unknown[]) => closeSharedDatabaseMock(...(args as [])),
  SHARED_DB_NAME: 'myGameList',
}));

vi.mock('../../src/model/repository/shareRepository', () => ({
  removeAllMyShares: (...args: unknown[]) => removeAllMySharesMock(...(args as [])),
}));

vi.mock('../../src/model/repository/gistConfigRepository', () => ({
  clearSyncConfig: (...args: unknown[]) => clearSyncConfigMock(...(args as [])),
}));

import { deleteOwnAccount } from '../../src/model/repository/accountDeletionRepository';
import { ANALYTICS_CONSENT_KEY, GIST_CFG_KEY, SOCIAL_GIST_CFG_KEY, STORAGE_KEY } from '../../src/core/constants/storageKeys';

const deletedDatabases: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  deletedDatabases.length = 0;
  localStorage.clear();
  removeAllMySharesMock.mockResolvedValue(0);
  getMyFriendshipsMock.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
  deleteDocMock.mockResolvedValue(undefined);

  // jsdom no implementa deleteDatabase de forma útil: se sustituye por un doble que resuelve al momento.
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    value: {
      deleteDatabase: (name: string) => {
        deletedDatabases.push(name);
        const request = { onsuccess: null as null | (() => void), onerror: null, onblocked: null };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    },
  });
});

describe('deleteOwnAccount', () => {
  it('borra amistades y los cuatro documentos propios, cierra sesión y limpia el dispositivo', async () => {
    getMyFriendshipsMock.mockResolvedValue({
      friends: [{ docId: 'a__b' }],
      incoming: [{ docId: 'b__c' }],
      outgoing: [{ docId: 'c__d' }],
      byOtherUid: {},
    } as never);
    localStorage.setItem(STORAGE_KEY, '{}');
    localStorage.setItem(GIST_CFG_KEY, '{}');
    localStorage.setItem(SOCIAL_GIST_CFG_KEY, '{}');
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied');

    const result = await deleteOwnAccount('uid-1');

    expect(result.remoteComplete).toBe(true);
    // Los enlaces públicos se retiran ANTES de borrar el perfil: después, la Function ya no podría resolver
    // identidad ni rango, y las reseñas se quedarían publicadas hasta caducar solas.
    expect(removeAllMySharesMock).toHaveBeenCalled();
    expect(deleteFriendshipMock).toHaveBeenCalledTimes(3);
    expect(deleteDocMock).toHaveBeenCalledTimes(4);
    expect(signOutMock).toHaveBeenCalled();
    expect(clearSyncConfigMock).toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(GIST_CFG_KEY)).toBeNull();
    expect(localStorage.getItem(SOCIAL_GIST_CFG_KEY)).toBeNull();
    expect(deletedDatabases).toEqual(['myGameList']);
    // La decisión sobre la analítica es una preferencia de privacidad del NAVEGADOR: no se resetea, porque volver
    // a preguntar a quien acaba de rechazarla sería lo contrario de respetarla.
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied');
  });

  it('un documento que falla no aborta el resto: se informa y aun así se cierra sesión y se limpia', async () => {
    deleteDocMock.mockRejectedValueOnce(new Error('permission-denied'));
    localStorage.setItem(STORAGE_KEY, '{}');

    const result = await deleteOwnAccount('uid-1');

    expect(result.remoteComplete).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(deleteDocMock).toHaveBeenCalledTimes(4); // los otros tres se intentan igualmente
    expect(signOutMock).toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(deletedDatabases).toEqual(['myGameList']);
  });

  it('si la lectura de amistades falla, sigue con el borrado de documentos y lo reporta', async () => {
    getMyFriendshipsMock.mockRejectedValue(new Error('offline'));

    const result = await deleteOwnAccount('uid-1');

    expect(result.remoteComplete).toBe(false);
    expect(result.failures[0]).toContain('amistades');
    expect(deleteDocMock).toHaveBeenCalledTimes(4);
  });

  it('sin uid (uso puramente local) no toca Firestore pero limpia el dispositivo', async () => {
    localStorage.setItem(STORAGE_KEY, '{}');

    const result = await deleteOwnAccount('');

    expect(result.remoteComplete).toBe(true);
    expect(deleteDocMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(deletedDatabases).toEqual(['myGameList']);
  });
});

describe('deleteOwnAccount — enlaces públicos', () => {
  // Que la supresión falle en silencio aquí sería lo más grave de todo el flujo: las reseñas del usuario
  // seguirían siendo visibles para cualquiera con el enlace. Tiene que reportarse.
  it('reports a failure when the public links could not be withdrawn', async () => {
    removeAllMySharesMock.mockRejectedValueOnce(new Error('sin red'));

    const result = await deleteOwnAccount('uid-1');

    expect(result.remoteComplete).toBe(false);
    expect(result.failures.join(' ')).toMatch(/enlaces compartidos/i);
    // Y aun así el resto del borrado sigue adelante: un fallo parcial no aborta la limpieza.
    expect(signOutMock).toHaveBeenCalled();
  });
});
