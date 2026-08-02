import { beforeEach, describe, expect, it, vi } from 'vitest';

// `ensureProfileByEmail` corre en CADA publicación de reseña, y su chequeo de cambios existe para no reescribir el
// documento público cuando no hay nada que cambiar. Al dejar de publicarse `social.gistId`, ese chequeo comparaba un
// campo ya purgado (vacío en el doc) contra el id real de la sesión: daba SIEMPRE distinto y la escritura de ahorro
// dejó de ahorrar nada. Aquí se fija que un perfil sin cambios no se reescribe, y que uno con restos legacy sí.

const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const getOwnProfileRefMock = vi.fn<(...a: unknown[]) => unknown>(async () => null);

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  findSocialProfileByEmail: vi.fn(async () => null),
  getOwnProfileRef: (...a: unknown[]) => getOwnProfileRefMock(...a),
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
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

import { ensureProfileByEmail } from '../../src/model/repository/firebaseRepository';

const UID = 'uid-1';
const SOCIAL_GIST = 'social-222';

/** Perfil ya migrado: sin email ni ids de gist publicados, con el nick y la foto al día. */
function perfilAlDia(overrides: Record<string, unknown> = {}) {
  return {
    id: UID,
    profileId: 'pid-1',
    email: '',
    displayName: 'Nick',
    photoURL: 'https://x/foto.png',
    socialGistId: '',
    gamesGistId: '',
    githubToken: '',
    socialEnabled: true,
    tier: 'bronze',
    ...overrides,
  };
}

function profileWrites() {
  return setDocMock.mock.calls.filter((call) => (call[0] as { collection?: string })?.collection === 'profiles');
}

async function guardar() {
  await ensureProfileByEmail({
    user: { uid: UID, email: 'yo@example.com', displayName: 'Yo', photoURL: 'https://x/foto.png' },
    socialGistId: SOCIAL_GIST,
    gamesGistId: 'games-111',
    socialGistEtag: null,
    preferredName: 'Nick',
  });
}

beforeEach(() => {
  setDocMock.mockClear();
  getOwnProfileRefMock.mockReset();
});

describe('ensureProfileByEmail — chequeo de cambios del perfil público', () => {
  it('NO reescribe el perfil cuando nada ha cambiado (ya migrado)', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia());

    await guardar();

    expect(profileWrites()).toHaveLength(0);
  });

  it('reescribe UNA vez el perfil que aún publica `social.gistId`, para purgarlo', async () => {
    // Único resto legacy: el id del gist social. Sin contarlo como tal, este perfil no se purgaría nunca.
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia({ socialGistId: 'social-viejo' }));

    await guardar();

    const writes = profileWrites();
    expect(writes).toHaveLength(1);
    const social = (writes[0][1] as { social: Record<string, unknown> }).social;
    expect(social.gistId).toBe('__del__');
    expect(social.gamesGistId).toBe('__del__');
  });

  it('sigue reescribiendo cuando cambia algo de verdad (el nick)', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia({ displayName: 'NickViejo' }));

    await guardar();

    expect(profileWrites()).toHaveLength(1);
  });
});
