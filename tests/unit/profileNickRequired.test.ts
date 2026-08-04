import { beforeEach, describe, expect, it, vi } from 'vitest';

// EL NICK PÚBLICO ES EL QUE ESCRIBE EL USUARIO, Y NADA MÁS.
//
// Los dos caminos que escriben el perfil de Firestore tenían un respaldo a `user.displayName || user.email`: sin nick,
// publicaban el nombre real de Google —o el correo— en un documento que lee cualquier usuario autenticado. Y cuando
// ni eso había, creaban el perfil con `displayName` vacío, que es la anomalía `no-display-name` del panel: un perfil
// a medio crear que sus amigos no pueden identificar. Aquí se fija la regla: sin nick no se crea perfil.

const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const getDocMock = vi.fn<(...a: unknown[]) => unknown>(async () => ({ exists: () => false, data: () => undefined }));
const batchSetMock = vi.fn();
const batchCommitMock = vi.fn(async () => {});
const getOwnProfileRefMock = vi.fn<(...a: unknown[]) => unknown>(async () => null);
const findSocialProfileByEmailMock = vi.fn<(...a: unknown[]) => unknown>(async () => null);

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  findSocialProfileByEmail: (...a: unknown[]) => findSocialProfileByEmailMock(...a),
  getOwnProfileRef: (...a: unknown[]) => getOwnProfileRefMock(...a),
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
  peekOwnProfileTier: () => 'bronze',
  saveOwnProfileCache: vi.fn(),
  saveProfileByEmailCache: vi.fn(),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  seedProfileIdFromRemote: vi.fn(async (remote: string | null) => remote || 'pid-local'),
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_fs: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: batchSetMock, commit: batchCommitMock }),
}));

import { ensureProfileByEmail, upsertProfileSocialReferences } from '../../src/model/repository/firebaseRepository';

// Una sesión de Google con nombre real y correo: justo lo que NO debe acabar en el perfil público.
const GOOGLE_USER = { uid: 'uid-1', email: 'nombre.real@example.com', displayName: 'Nombre Real', photoURL: '' };

function profileWrites() {
  return setDocMock.mock.calls
    .filter((call) => (call[0] as { collection?: string })?.collection === 'profiles')
    .map((call) => call[1] as Record<string, unknown>);
}

beforeEach(() => {
  setDocMock.mockClear();
  getDocMock.mockClear();
  batchSetMock.mockClear();
  getOwnProfileRefMock.mockClear();
  getOwnProfileRefMock.mockResolvedValue(null);
  findSocialProfileByEmailMock.mockClear();
  findSocialProfileByEmailMock.mockResolvedValue(null);
});

describe('ensureProfileByEmail — sin nick no se crea perfil', () => {
  it('rechaza crear el perfil y no escribe NADA en `profiles`', async () => {
    await expect(ensureProfileByEmail({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
      preferredName: '   ', // solo espacios: tampoco vale
    })).rejects.toThrow(/sin nombre público/);

    expect(profileWrites()).toHaveLength(0);
  });

  it('con nick, el nombre público es el nick y NUNCA el de Google ni el correo', async () => {
    await ensureProfileByEmail({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
      preferredName: 'Nick',
    });

    expect(profileWrites()[0]).toMatchObject({ displayName: 'Nick' });
  });

  // Un perfil que YA existe no es asunto de este camino: rebautizarlo o vaciarle el nombre sería peor. Su dueño lo
  // arregla desde la pantalla de perfil, y el panel lo sigue marcando mientras tanto.
  it('respeta un perfil existente sin nombre en vez de reventar la publicación', async () => {
    getOwnProfileRefMock.mockResolvedValue({
      id: 'uid-1', profileId: 'pid-1', schemaVersion: 1, email: '', displayName: '', photoURL: '',
      socialGistId: 'social-222', gamesGistId: '', githubToken: '', socialEnabled: true, tier: 'bronze',
    });

    await expect(ensureProfileByEmail({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
    })).resolves.toMatchObject({ displayName: '' });
  });
});

describe('upsertProfileSocialReferences — sin nick no publica', () => {
  it('lanza en vez de caer al nombre real de Google o al correo', async () => {
    await expect(upsertProfileSocialReferences({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
    })).rejects.toThrow(/sin nombre público/);

    expect(batchSetMock).not.toHaveBeenCalled();
  });

  it('con nick sí escribe, y el nombre público es el nick', async () => {
    await upsertProfileSocialReferences({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
      preferredName: 'Nick',
    });

    const profileBatch = batchSetMock.mock.calls
      .map((call) => call[1] as Record<string, unknown>)
      .find((payload) => 'displayName' in payload);
    expect(profileBatch).toMatchObject({ displayName: 'Nick' });
  });
});
