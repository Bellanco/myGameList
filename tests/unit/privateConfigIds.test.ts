import { beforeEach, describe, expect, it, vi } from 'vitest';

// LOS DOS IDENTIFICADORES DE GIST (juegos y social) tienen que acabar guardados en `privateConfig`, que es
// owner-only y la única fuente que le queda al usuario para recuperar sus canales en otro dispositivo: el perfil
// público ya no los publica. Estos tests cubren las dos formas de perderlos que había.

const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const getDocMock = vi.fn<(...a: unknown[]) => unknown>(async () => ({ exists: () => false, data: () => undefined }));
const batchSetMock = vi.fn();
const batchCommitMock = vi.fn(async () => {});

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  findSocialProfileByEmail: vi.fn(async () => null),
  getOwnProfileRef: vi.fn(async () => null),
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
  peekOwnProfileTier: () => 'bronze',
  saveOwnProfileCache: vi.fn(),
  saveProfileByEmailCache: vi.fn(),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  seedProfileIdFromRemote: vi.fn(async (remote: string | null) => remote || 'pid-local'),
}));

vi.mock('../../src/model/repository/gistRepository', () => ({
  probeSocialGistEvidence: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (_fs: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: batchSetMock, commit: batchCommitMock }),
}));

import { ensureProfileByEmail, establishProfileIdentity } from '../../src/model/repository/firebaseRepository';

/** Escrituras dirigidas a `privateConfig`, en orden. */
function privateConfigWrites() {
  return setDocMock.mock.calls
    .filter((call) => (call[0] as { collection?: string })?.collection === 'privateConfig')
    .map((call) => call[1] as Record<string, unknown>);
}

/** Escrituras dirigidas a `profiles`, en orden. */
function profileWrites() {
  return setDocMock.mock.calls
    .filter((call) => (call[0] as { collection?: string })?.collection === 'profiles')
    .map((call) => call[1] as Record<string, unknown>);
}

beforeEach(() => {
  setDocMock.mockClear();
  getDocMock.mockClear();
});

describe('establishProfileIdentity — no pisar ids con vacío', () => {
  it('guarda los dos ids cuando se conocen', async () => {
    await establishProfileIdentity('uid-1', 'pid-1', 'games-111', 'social-222');

    expect(privateConfigWrites()[0]).toMatchObject({
      profileId: 'pid-1',
      gamesGistId: 'games-111',
      socialGistId: 'social-222',
    });
  });

  // `setPrivateConfig` hace merge: mandar `gamesGistId: ''` no es "no tocarlo", es BORRARLO. Guardar el perfil
  // social desde un dispositivo sin la sincronización principal dejaba a cero el id del gist de juegos.
  it('NO escribe el id de juegos si no se conoce, en vez de borrarlo', async () => {
    await establishProfileIdentity('uid-1', 'pid-1', '', 'social-222');

    const written = privateConfigWrites()[0];
    expect(written).not.toHaveProperty('gamesGistId');
    expect(written).toMatchObject({ socialGistId: 'social-222' });
  });

  it('tampoco escribe el id social vacío', async () => {
    await establishProfileIdentity('uid-1', 'pid-1', 'games-111', '');

    const written = privateConfigWrites()[0];
    expect(written).not.toHaveProperty('socialGistId');
    expect(written).toMatchObject({ gamesGistId: 'games-111' });
  });
});

describe('ensureProfileByEmail — orden de guardado y purga', () => {
  // El perfil público purga `social.gistId`/`social.gamesGistId` con `deleteField()`, y el guardado en
  // `privateConfig` es best-effort (se traga sus errores). Si la purga fuera primero, un fallo de red entre
  // ambos dejaría al usuario purgado y sin guardar: sin canal social y sin gist de juegos recuperables.
  it('guarda los ids en privateConfig ANTES de purgarlos del perfil público', async () => {
    await ensureProfileByEmail({
      user: { uid: 'uid-1', email: 'yo@example.com', displayName: 'Yo', photoURL: '' },
      socialGistId: 'social-222',
      gamesGistId: 'games-111',
      socialGistEtag: null,
      preferredName: 'Nick',
    });

    const orden = setDocMock.mock.calls.map((call) => (call[0] as { collection?: string })?.collection);
    const iPrivate = orden.indexOf('privateConfig');
    const iProfile = orden.indexOf('profiles');

    expect(iPrivate).toBeGreaterThanOrEqual(0);
    expect(iProfile).toBeGreaterThanOrEqual(0);
    expect(iPrivate).toBeLessThan(iProfile);

    // Y lo que se purga es justamente lo que se acaba de guardar.
    expect(privateConfigWrites()[0]).toMatchObject({ gamesGistId: 'games-111', socialGistId: 'social-222' });
    const social = profileWrites()[0].social as Record<string, unknown>;
    expect(social.gistId).toBe('__del__');
    expect(social.gamesGistId).toBe('__del__');
  });
});
