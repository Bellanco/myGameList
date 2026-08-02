import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de la capa Firestore: el heal solo usa initializeFirebaseServices + getDoc/setDoc.
const getDocMock = vi.fn<(...a: unknown[]) => unknown>();
const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

const probeMock = vi.fn<(gistId: string) => Promise<unknown>>();
vi.mock('../../src/model/repository/gistRepository', () => ({
  probeSocialGistEvidence: (gistId: string) => probeMock(gistId),
}));

vi.mock('firebase/firestore', () => ({
  doc: (...a: unknown[]) => ({ path: a.slice(1).join('/') }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  serverTimestamp: () => '__ts__',
  deleteField: () => '__del__',
  writeBatch: vi.fn(),
}));

import { healOwnDirectoryGist } from '../../src/model/repository/firebaseRepository';

function snap(exists: boolean, data?: Record<string, unknown>) {
  return { exists: () => exists, data: () => data };
}

describe('healOwnDirectoryGist', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    setDocMock.mockClear();
    // Por defecto, ilegibles (como sin red): el veredicto es `sin-evidencia` y manda la sesión.
    probeMock.mockReset();
    probeMock.mockImplementation(async (gistId: string) => ({ gistId, isPublic: null, contentCount: 0, updatedAt: 0 }));
  });

  // Con los ids divergentes ahora se arbitra con evidencia (`probeSocialGistEvidence` lee los gists de GitHub).
  // En el test no hay red, así que ninguno se puede leer: el veredicto es `sin-evidencia` y se conserva el
  // comportamiento de siempre, que es que manda el gist de la sesión. Es lo correcto sin red: la configuración
  // local es la única verdad de la que dispone el dispositivo.
  it('sin poder leer los gists (offline) manda el gist ACTUAL de la sesión', async () => {
    getDocMock.mockResolvedValue(snap(true, { social: { gistId: 'viejo' } }));
    const result = await healOwnDirectoryGist('u1', 'nuevo', 'etag1');
    expect(result).toEqual({ healed: true, adoptGistId: '' });
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const payload = setDocMock.mock.calls[0][1] as unknown as { uid: string; social: Record<string, unknown> };
    expect(payload.uid).toBe('u1');
    expect(payload.social).toEqual({ gistId: 'nuevo', etag: 'etag1' });
  });

  it('NO escribe si el directorio ya coincide (evita writes/invalidaciones en cada apertura)', async () => {
    getDocMock.mockResolvedValue(snap(true, { social: { gistId: 'mismo' } }));
    const result = await healOwnDirectoryGist('u1', 'mismo');
    expect(result).toEqual({ healed: false, adoptGistId: '' });
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('NO escribe si el perfil aún no existe (se creará al publicar)', async () => {
    getDocMock.mockResolvedValue(snap(false));
    const result = await healOwnDirectoryGist('u1', 'nuevo');
    expect(result.healed).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('no toca Firestore sin uid o sin gistId', async () => {
    expect((await healOwnDirectoryGist('', 'g')).healed).toBe(false);
    expect((await healOwnDirectoryGist('u1', '')).healed).toBe(false);
    expect(getDocMock).not.toHaveBeenCalled();
  });

  // EL CASO NUEVO: el gist vivo es el que ya estaba publicado, y el equivocado es ESTE dispositivo. No basta con no
  // escribir en Firestore: si el usuario sigue con el perdedor configurado, volvería a publicar ahí y a divergir.
  // Por eso se le pide al llamador que lo adopte en su configuración local.
  it('pide ADOPTAR el gist publicado cuando es el vivo y este dispositivo tiene el perdedor', async () => {
    getDocMock.mockResolvedValue(snap(true, { social: { gistId: 'publicado' } }));
    probeMock.mockImplementation(async (gistId: string) => ({
      gistId,
      isPublic: gistId === 'publicado', // el de la sesión es secreto: no puede ser el canal vivo
      contentCount: 5,
      updatedAt: 1_000,
    }));

    const result = await healOwnDirectoryGist('u1', 'sesion-secreto', null);

    expect(result).toEqual({ healed: false, adoptGistId: 'publicado' });
    // Y NO se toca el directorio: el que estaba publicado ya era el bueno.
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('si ninguno es legible sin autenticación no escribe ni pide adoptar nada', async () => {
    getDocMock.mockResolvedValue(snap(true, { social: { gistId: 'publicado' } }));
    probeMock.mockImplementation(async (gistId: string) => ({ gistId, isPublic: false, contentCount: 2, updatedAt: 1 }));

    const result = await healOwnDirectoryGist('u1', 'sesion', null);

    expect(result).toEqual({ healed: false, adoptGistId: '' });
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
