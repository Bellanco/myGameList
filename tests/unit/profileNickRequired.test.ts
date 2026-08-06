import { beforeEach, describe, expect, it, vi } from 'vitest';

// EL NOMBRE PÚBLICO: nick del perfil social → lo que ya hubiera publicado → nombre de la cuenta de Google. EL CORREO
// NUNCA.
//
// Los dos caminos que escriben el perfil de Firestore caían a `user.displayName || user.email`, y el correo es el
// único de los tres que su dueño no ha elegido mostrar: publicarlo en un documento que lee cualquier usuario
// autenticado es la fuga. El nombre de Google sí vale —coincidir con él es lo normal— y evita el otro extremo: un
// perfil con `displayName` vacío (la anomalía `no-display-name`) o un guardado abortado. Solo si no hay ningún
// nombre en ninguna parte se rechaza crear el perfil.

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

vi.mock('firebase/firestore/lite', () => ({
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

describe('ensureProfileByEmail — el nombre público nunca es el correo', () => {
  it('sin nick cae al nombre de la cuenta de Google, no al correo', async () => {
    await ensureProfileByEmail({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
      preferredName: '   ', // solo espacios: cuenta como vacío
    });

    expect(profileWrites()[0]).toMatchObject({ displayName: 'Nombre Real' });
    expect(profileWrites()[0].displayName).not.toBe(GOOGLE_USER.email);
  });

  // Solo se rechaza cuando no hay NINGÚN nombre en ninguna parte: crear el perfil con el nombre vacío sería la
  // anomalía `no-display-name`, y el correo no es una alternativa.
  it('sin nick y sin nombre de Google no se crea perfil, y no escribe nada', async () => {
    await expect(ensureProfileByEmail({
      user: { ...GOOGLE_USER, displayName: '' },
      socialGistId: 'social-222',
      socialGistEtag: null,
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

  // Un perfil que YA existe con el nombre vacío (la anomalía `no-display-name` de los que se crearon así) se arregla
  // en el siguiente guardado con el nombre de la cuenta: mejor eso que dejarlo sin identificar para sus amigos.
  it('rellena el nombre vacío de un perfil existente en vez de perpetuarlo', async () => {
    getOwnProfileRefMock.mockResolvedValue({
      id: 'uid-1', profileId: 'pid-1', schemaVersion: 1, email: '', displayName: '', photoURL: '',
      socialGistId: 'social-222', gamesGistId: '', githubToken: '', socialEnabled: true, tier: 'bronze',
    });

    await expect(ensureProfileByEmail({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
    })).resolves.toMatchObject({ displayName: 'Nombre Real' });
  });
});

describe('upsertProfileSocialReferences — mismo criterio de nombre', () => {
  it('sin nick usa el de Google; sin ninguno de los dos, lanza y no escribe', async () => {
    await upsertProfileSocialReferences({
      user: GOOGLE_USER,
      socialGistId: 'social-222',
      socialGistEtag: null,
    });
    const written = batchSetMock.mock.calls
      .map((call) => call[1] as Record<string, unknown>)
      .find((payload) => 'displayName' in payload);
    expect(written).toMatchObject({ displayName: 'Nombre Real' });
    expect(written?.displayName).not.toBe(GOOGLE_USER.email);

    batchSetMock.mockClear();
    await expect(upsertProfileSocialReferences({
      user: { ...GOOGLE_USER, displayName: '' },
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
