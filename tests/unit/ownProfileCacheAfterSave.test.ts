import { beforeEach, describe, expect, it, vi } from 'vitest';

// Guardar el perfil (`ensureProfileByEmail`, que corre al abrir el hub y en cada publicación) reescribe la caché
// en memoria del perfil propio. Si esa copia pierde lo que el guardado no toca —la vitrina (`achievementsMirror`),
// el palmarés y la fecha de alta—, la siguiente lectura en los 60 s de vida de la caché dice «sin vitrina», y el
// publicador de logros sube la de este dispositivo como REEMPLAZO: las medallas de otros aparatos se pierden.

const PROFILE_DOC = {
  uid: 'uid-1',
  profileId: 'pid-1',
  displayName: 'Nick',
  photoURL: 'https://x/foto.png',
  social: { enabled: true },
  tier: 'silver',
  createdAt: 1_700_000_000_000,
  achievements: { list: '2:ABCD' },
  palmares: [{ edition: 'goty-2025', award: 'mejor-resena' }],
};

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  seedProfileIdFromRemote: vi.fn(async (remote: string | null) => remote || 'pid-1'),
  getLocalMeta: vi.fn(async () => ({ lastProfileTouchAt: Date.now() })),
  patchLocalMeta: vi.fn(async () => {}),
}));

vi.mock('../../src/model/repository/gistRepository', () => ({
  probeSocialGistEvidence: vi.fn(),
}));

const getDocMock = vi.fn(async (ref: { collection: string; id: string }) => (
  ref.collection === 'profiles'
    ? { id: ref.id, exists: () => true, data: () => PROFILE_DOC }
    : { id: ref.id, exists: () => false, data: () => undefined }
));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_fs: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (ref: { collection: string; id: string }) => getDocMock(ref),
  setDoc: vi.fn(async () => {}),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

const { ensureProfileByEmail, upsertProfileSocialReferences } = await import('../../src/model/repository/firebaseRepository');
const { getOwnProfileRef, invalidateOwnProfileCache } = await import('../../src/model/repository/firebaseSocialRepository');

const USER = { uid: 'uid-1', email: 'yo@example.com', displayName: 'Yo', photoURL: 'https://x/foto.png' };

beforeEach(() => {
  invalidateOwnProfileCache();
  getDocMock.mockClear();
});

describe('caché del perfil propio tras guardarlo', () => {
  it('ensureProfileByEmail conserva la vitrina, el palmarés y la fecha de alta', async () => {
    await ensureProfileByEmail({ user: USER, socialGistId: 's-1', socialGistEtag: null, preferredName: 'Otro nick' });

    const reads = getDocMock.mock.calls.length;
    const cached = await getOwnProfileRef('uid-1');
    // Servido de la caché (sin volver a leer), y con lo que el guardado no ha tocado.
    expect(getDocMock.mock.calls.length).toBe(reads);
    expect(cached).toMatchObject({
      displayName: 'Otro nick',
      tier: 'silver',
      createdAt: PROFILE_DOC.createdAt,
      achievementsMirror: '2:ABCD',
      palmares: PROFILE_DOC.palmares,
    });
  });

  it('upsertProfileSocialReferences no deja en caché un perfil sin vitrina', async () => {
    await upsertProfileSocialReferences({ user: USER, socialGistId: 's-1', socialGistEtag: null, preferredName: 'Nick' });

    const cached = await getOwnProfileRef('uid-1');
    expect(cached?.achievementsMirror).toBe('2:ABCD');
    expect(cached?.createdAt).toBe(PROFILE_DOC.createdAt);
  });
});
