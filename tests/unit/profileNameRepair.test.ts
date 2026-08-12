// Reparación de la RÉPLICA del nick en `profiles/{uid}`.
//
// El nick lo escribe su dueño en su gist social; `profiles.displayName` es la copia que leen el directorio y el panel
// de administración. Al guardar el perfil se escribe primero el gist y después se replica, así que un fallo en medio
// dejaba el feed con el nombre nuevo y todo lo demás con el viejo, para siempre. Esto lo reintenta al abrir el hub.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOwnProfileRefMock = vi.fn<(...a: unknown[]) => unknown>();
const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const invalidateOwnProfileCacheMock = vi.fn();
const invalidateSocialDirectoryCacheMock = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: { __fs: true }, auth: {} })),
  isPermissionDeniedError: () => false,
  getFirebaseConfig: () => null,
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  getOwnProfileRef: (...a: unknown[]) => getOwnProfileRefMock(...a),
  findSocialProfileByEmail: vi.fn(async () => null),
  invalidateOwnProfileCache: (...a: unknown[]) => invalidateOwnProfileCacheMock(...a),
  invalidateProfileByEmailCache: vi.fn(),
  invalidateSocialDirectoryCache: (...a: unknown[]) => invalidateSocialDirectoryCacheMock(...a),
  saveOwnProfileCache: vi.fn(),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
  seedProfileIdFromRemote: vi.fn((value: string) => value),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_fs: unknown, name: string, id: string) => ({ collection: name, id }),
  getDoc: vi.fn(),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: vi.fn(),
}));

import { repairProfileDisplayName } from '../../src/model/repository/firebaseRepository';

function perfil(over: Record<string, unknown> = {}) {
  return {
    id: 'uid-a',
    profileId: 'pid-a',
    schemaVersion: 1,
    displayName: 'Ada Vieja',
    email: '',
    photoURL: '',
    socialGistId: 'gs',
    gamesGistId: '',
    githubToken: '',
    socialEnabled: true,
    ...over,
  };
}

describe('repairProfileDisplayName', () => {
  beforeEach(() => {
    setDocMock.mockClear();
    invalidateOwnProfileCacheMock.mockClear();
    invalidateSocialDirectoryCacheMock.mockClear();
    getOwnProfileRefMock.mockReset();
  });

  it('reescribe la copia cuando el perfil se quedó con el nombre viejo', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfil({ displayName: 'Ada Vieja' }));

    const repaired = await repairProfileDisplayName('uid-a', 'Ada Nueva');

    expect(repaired).toBe(true);
    const [ref, payload, options] = setDocMock.mock.calls[0] as [{ collection: string; id: string }, Record<string, unknown>, unknown];
    expect(ref).toEqual({ collection: 'profiles', id: 'uid-a' });
    // Solo el nombre (y el uid que las reglas exigen): reparar una copia no debe arrastrar el resto del guardado.
    expect(Object.keys(payload).sort()).toEqual(['displayName', 'uid', 'updatedAt']);
    expect(payload.displayName).toBe('Ada Nueva');
    expect(options).toEqual({ merge: true });
    // Y se sueltan las cachés, o el directorio seguiría sirviendo el nombre viejo dentro de su TTL.
    expect(invalidateOwnProfileCacheMock).toHaveBeenCalledWith('uid-a');
    expect(invalidateSocialDirectoryCacheMock).toHaveBeenCalled();
  });

  it('no escribe nada si ya coinciden (ni gasta una escritura por sesión)', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfil({ displayName: 'Ada' }));

    expect(await repairProfileDisplayName('uid-a', 'Ada')).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('ignora los espacios al comparar', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfil({ displayName: '  Ada  ' }));

    expect(await repairProfileDisplayName('uid-a', 'Ada')).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('sin nick NO repara: escribir vacío borraría el nombre de quien lo tiene bien', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfil());

    expect(await repairProfileDisplayName('uid-a', '   ')).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
    // Ni siquiera se lee el perfil: la guarda va antes.
    expect(getOwnProfileRefMock).not.toHaveBeenCalled();
  });

  it('no toca un perfil que vive bajo otro id: ahí las reglas no dejan escribir al dueño', async () => {
    // Ese caso es del cutover de identidad del panel, no de esta reparación.
    getOwnProfileRefMock.mockResolvedValue(perfil({ id: 'doc-legacy' }));

    expect(await repairProfileDisplayName('uid-a', 'Ada Nueva')).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('sin perfil todavía no hay copia que reparar', async () => {
    getOwnProfileRefMock.mockResolvedValue(null);

    expect(await repairProfileDisplayName('uid-a', 'Ada Nueva')).toBe(false);
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('sin uid no hace nada', async () => {
    expect(await repairProfileDisplayName('', 'Ada')).toBe(false);
    expect(getOwnProfileRefMock).not.toHaveBeenCalled();
  });
});
