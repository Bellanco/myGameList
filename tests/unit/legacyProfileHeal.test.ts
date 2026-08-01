import { beforeEach, describe, expect, it, vi } from 'vitest';

// Auto-saneado del perfil legacy al iniciar sesión. Lo que se verifica aquí es sobre todo el ORDEN: preservar en
// `privateConfig` y solo entonces borrar del documento público. Si el respaldo falla, no se purga nada.
const getOwnProfileRefMock = vi.fn<(...a: unknown[]) => unknown>();
const getPrivateConfigMock = vi.fn<(...a: unknown[]) => unknown>();
const setPrivateConfigMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const backupGithubTokenMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const updateDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const invalidateOwnProfileCacheMock = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: { __fs: true } })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPrivateConfig: (...a: unknown[]) => getPrivateConfigMock(...a),
  setPrivateConfig: (...a: unknown[]) => setPrivateConfigMock(...a),
  backupGithubToken: (...a: unknown[]) => backupGithubTokenMock(...a),
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  getOwnProfileRef: (...a: unknown[]) => getOwnProfileRefMock(...a),
  invalidateOwnProfileCache: (...a: unknown[]) => invalidateOwnProfileCacheMock(...a),
  invalidateSocialDirectoryCache: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_fs: unknown, name: string, id: string) => ({ collection: name, id }),
  updateDoc: (...a: unknown[]) => updateDocMock(...a),
  deleteField: () => '__del__',
}));

import { healOwnLegacyProfile } from '../../src/model/repository/firebaseProfileHealRepository';

function profile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uid-a',
    displayName: 'Ada',
    email: '',
    photoURL: '',
    socialGistId: 'gs',
    gamesGistId: '',
    githubToken: '',
    socialEnabled: true,
    ...overrides,
  };
}

describe('healOwnLegacyProfile', () => {
  beforeEach(() => {
    getOwnProfileRefMock.mockReset();
    getPrivateConfigMock.mockReset();
    getPrivateConfigMock.mockResolvedValue(null);
    setPrivateConfigMock.mockClear();
    backupGithubTokenMock.mockClear();
    backupGithubTokenMock.mockResolvedValue(undefined);
    updateDocMock.mockClear();
    invalidateOwnProfileCacheMock.mockClear();
  });

  it('un perfil ya limpio no provoca NINGUNA escritura', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile());

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult.status).toBe('clean');
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(setPrivateConfigMock).not.toHaveBeenCalled();
    expect(backupGithubTokenMock).not.toHaveBeenCalled();
  });

  it('respalda el token cifrado ANTES de borrar el que está en claro', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ githubToken: 'ghp_legacy' }));
    const order: string[] = [];
    backupGithubTokenMock.mockImplementation(async () => { order.push('backup'); });
    updateDocMock.mockImplementation(async () => { order.push('purge'); });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', backedUpToken: true });
    expect(backupGithubTokenMock).toHaveBeenCalledWith('uid-a', 'ghp_legacy');
    expect(order).toEqual(['backup', 'purge']);
  });

  // EL TEST QUE IMPORTA: si el respaldo falla, purgar dejaría al usuario sin token en su próximo dispositivo.
  it('si el respaldo del token falla, NO purga nada y lo deja para el próximo arranque', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ githubToken: 'ghp_legacy' }));
    backupGithubTokenMock.mockRejectedValue(new Error('offline'));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult.status).toBe('deferred');
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('si ya existe el respaldo cifrado no lo reescribe, pero sí purga el token en claro', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ githubToken: 'ghp_legacy' }));
    getPrivateConfigMock.mockResolvedValue({ encryptedGithubToken: 'ya-cifrado' });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', backedUpToken: false });
    expect(backupGithubTokenMock).not.toHaveBeenCalled();
    expect(updateDocMock).toHaveBeenCalledTimes(1);
  });

  it('siembra el id del gist en privateConfig antes de borrarlo del perfil público', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ gamesGistId: 'gg-legacy' }));

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', seededGamesGistId: true });
    expect(setPrivateConfigMock).toHaveBeenCalledWith('uid-a', { gamesGistId: 'gg-legacy' });
  });

  it('no pisa el id del gist que ya tenga la configuración privada', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ gamesGistId: 'gg-viejo' }));
    getPrivateConfigMock.mockResolvedValue({ gamesGistId: 'gg-bueno' });

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult).toMatchObject({ status: 'healed', seededGamesGistId: false });
    expect(setPrivateConfigMock).not.toHaveBeenCalled();
  });

  it('la purga incluye `uid`, sin el cual las reglas la denegarían en perfiles viejos', async () => {
    getOwnProfileRefMock.mockResolvedValue(profile({ email: 'legacy@example.com' }));

    await healOwnLegacyProfile('uid-a');

    expect(updateDocMock.mock.calls[0][1]).toEqual({
      uid: 'uid-a',
      email: '__del__',
      'social.gamesGistId': '__del__',
      'social.githubToken': '__del__',
    });
    // El directorio y el perfil propio cacheados ya no valen tras la purga.
    expect(invalidateOwnProfileCacheMock).toHaveBeenCalledWith('uid-a');
  });

  it('no toca un perfil legacy que vive bajo otro id: su email es su única vía de recuperación', async () => {
    getOwnProfileRefMock.mockResolvedValue(null); // `profiles/{uid}` no existe

    const healResult = await healOwnLegacyProfile('uid-a');

    expect(healResult.status).toBe('foreign-doc');
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('sin uid no hace nada', async () => {
    expect((await healOwnLegacyProfile('')).status).toBe('deferred');
    expect(getOwnProfileRefMock).not.toHaveBeenCalled();
  });
});
