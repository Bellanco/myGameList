import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de la capa Firestore: el heal solo usa initializeFirebaseServices + getDoc/setDoc.
const getDocMock = vi.fn<(...a: unknown[]) => unknown>();
const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
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
  });

  it('reescribe con el gist ACTUAL cuando el del directorio diverge', async () => {
    getDocMock.mockResolvedValue(snap(true, { social: { gistId: 'viejo' } }));
    const healed = await healOwnDirectoryGist('u1', 'nuevo', 'etag1');
    expect(healed).toBe(true);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const payload = setDocMock.mock.calls[0][1] as unknown as { uid: string; social: Record<string, unknown> };
    expect(payload.uid).toBe('u1');
    expect(payload.social).toEqual({ gistId: 'nuevo', etag: 'etag1' });
  });

  it('NO escribe si el directorio ya coincide (evita writes/invalidaciones en cada apertura)', async () => {
    getDocMock.mockResolvedValue(snap(true, { social: { gistId: 'mismo' } }));
    const healed = await healOwnDirectoryGist('u1', 'mismo');
    expect(healed).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('NO escribe si el perfil aún no existe (se creará al publicar)', async () => {
    getDocMock.mockResolvedValue(snap(false));
    const healed = await healOwnDirectoryGist('u1', 'nuevo');
    expect(healed).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('no toca Firestore sin uid o sin gistId', async () => {
    expect(await healOwnDirectoryGist('', 'g')).toBe(false);
    expect(await healOwnDirectoryGist('u1', '')).toBe(false);
    expect(getDocMock).not.toHaveBeenCalled();
  });
});
