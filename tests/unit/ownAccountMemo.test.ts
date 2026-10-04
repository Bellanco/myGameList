import { beforeEach, describe, expect, it, vi } from 'vitest';

// LECTURAS Y ESCRITURAS QUE SE REPETÍAN SIN QUE NADA CAMBIARA (recuento del 04-10-2026, docs/plan-capacidad-gratuita.md):
//   · `publicConfig` se leía dos veces al arrancar y otra en cada montaje del social;
//   · `privateConfig` se releía para el pseudónimo en cada montaje y en cada publicación;
//   · publicar escribía siempre la identidad (`userMap` + `privateConfig`) y el respaldo del token;
//   · y tiraba la copia del directorio aunque el perfil no se hubiera reescrito, con 50 lecturas en la siguiente visita.

const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const getDocMock = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ exists: () => false, data: () => undefined }));
const getOwnProfileRefMock = vi.fn<(...a: unknown[]) => unknown>(async () => null);
const invalidateSocialDirectoryCache = vi.hoisted(() => vi.fn());

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  findSocialProfileByEmail: vi.fn(async () => null),
  getOwnProfileRef: (...a: unknown[]) => getOwnProfileRefMock(...a),
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache,
  invalidateProfileByEmailCache: vi.fn(),
  peekOwnProfileTier: () => 'bronze',
  peekOwnProfileCache: () => null,
  saveOwnProfileCache: vi.fn(),
  saveProfileByEmailCache: vi.fn(),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  seedProfileIdFromRemote: vi.fn(async (remote: string | null) => remote || 'pid-local'),
  // Latido reciente: no escribe, para que las cuentas de escrituras sean solo las que se prueban.
  getLocalMeta: vi.fn(async () => ({ profileTouchedAt: Date.now() })),
  patchLocalMeta: vi.fn(async () => {}),
}));

vi.mock('../../src/core/security/crypto', () => ({
  encryptToString: vi.fn(async (token: string) => `enc(${token})`),
  decryptFromString: vi.fn(async () => ''),
}));

vi.mock('../../src/model/repository/gistRepository', () => ({ probeSocialGistEvidence: vi.fn() }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_fs: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({ set: vi.fn(), commit: vi.fn(async () => {}) }),
}));

const repo = await import('../../src/model/repository/firebaseRepository');

const UID = 'uid-1';

function readsOf(collection: string): number {
  return getDocMock.mock.calls.filter((call) => (call[0] as { collection?: string })?.collection === collection).length;
}

function writesOf(collection: string): Array<Record<string, unknown>> {
  return setDocMock.mock.calls
    .filter((call) => (call[0] as { collection?: string })?.collection === collection)
    .map((call) => call[1] as Record<string, unknown>);
}

function perfilAlDia(overrides: Record<string, unknown> = {}) {
  return {
    id: UID, profileId: 'pid-1', email: '', displayName: 'Nick', photoURL: 'https://x/foto.png',
    socialGistId: '', gamesGistId: '', githubToken: '', socialEnabled: true, tier: 'bronze',
    ...overrides,
  };
}

async function publicar(overrides: Record<string, unknown> = {}) {
  await repo.ensureProfileByEmail({
    user: { uid: UID, email: 'yo@example.com', displayName: 'Yo', photoURL: 'https://x/foto.png' },
    socialGistId: 'social-222',
    gamesGistId: 'games-111',
    githubToken: 'ghp_token',
    socialGistEtag: null,
    preferredName: 'Nick',
    ...overrides,
  });
}

function privateConfigConPseudonimo() {
  getDocMock.mockImplementation(async (ref) =>
    (ref as { collection: string }).collection === 'privateConfig'
      ? { exists: () => true, data: () => ({ profileId: 'pid-1' }) }
      : { exists: () => false, data: () => undefined },
  );
}

beforeEach(() => {
  repo.forgetOwnAccountMemo();
  setDocMock.mockClear();
  getDocMock.mockReset();
  getDocMock.mockImplementation(async () => ({ exists: () => false, data: () => undefined }));
  getOwnProfileRefMock.mockReset();
  getOwnProfileRefMock.mockResolvedValue(perfilAlDia());
  invalidateSocialDirectoryCache.mockClear();
});

describe('publicConfig — una lectura para todos los que la piden', () => {
  it('escala de nota, apariencia y consentimiento comparten la misma lectura', async () => {
    await Promise.all([repo.getPublicConfig(UID), repo.getPublicConfig(UID)]);
    await repo.getPublicConfig(UID);
    expect(readsOf('publicConfig')).toBe(1);
  });

  it('una escritura propia la tira: lo siguiente se lee de Firestore', async () => {
    await repo.getPublicConfig(UID);
    await repo.setPublicConfig(UID, { scoreScale: 'stars' } as never);
    await repo.getPublicConfig(UID);
    expect(readsOf('publicConfig')).toBe(2);
  });

  it('pasado el plazo se vuelve a leer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await repo.getPublicConfig(UID);
      vi.setSystemTime(Date.now() + repo.PUBLIC_CONFIG_MAX_AGE_MS + 1);
      await repo.getPublicConfig(UID);
      expect(readsOf('publicConfig')).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('quien la recibe no puede estropear la copia de los demás', async () => {
    getDocMock.mockImplementation(async () => ({ exists: () => true, data: () => ({ scoreScale: 'grade' }) }));
    const primera = await repo.getPublicConfig(UID);
    (primera as Record<string, unknown>).scoreScale = 'manipulada';
    expect((await repo.getPublicConfig(UID))?.scoreScale).toBe('grade');
  });
});

describe('resolveStableProfileId — el pseudónimo no se relee', () => {
  it('una vez que viene de Firestore, no vuelve a leer privateConfig', async () => {
    privateConfigConPseudonimo();
    expect(await repo.resolveStableProfileId(UID)).toBe('pid-1');
    expect(await repo.resolveStableProfileId(UID)).toBe('pid-1');
    expect(readsOf('privateConfig')).toBe(1);
  });

  it('sin pseudónimo en remoto (primer dispositivo, sin red) se vuelve a preguntar', async () => {
    await repo.resolveStableProfileId(UID);
    await repo.resolveStableProfileId(UID);
    expect(readsOf('privateConfig')).toBe(2);
  });
});

describe('ensureProfileByEmail — escrituras que no se repiten en cada reseña', () => {
  it('la identidad y el respaldo del token se escriben una sola vez', async () => {
    privateConfigConPseudonimo();
    await publicar();
    await publicar();

    expect(writesOf('userMap')).toHaveLength(1);
    // Una de la identidad y otra del token cifrado; la segunda publicación no añade ninguna.
    expect(writesOf('privateConfig')).toHaveLength(2);
    expect(writesOf('profiles').filter((w) => 'social' in w && Object.keys(w).length === 1)).toHaveLength(1);
  });

  it('si cambia un gist, la identidad se vuelve a escribir', async () => {
    privateConfigConPseudonimo();
    await publicar();
    await publicar({ socialGistId: 'social-nuevo' });

    expect(writesOf('userMap')).toHaveLength(2);
  });

  it('si cambia el token, se vuelve a respaldar', async () => {
    privateConfigConPseudonimo();
    await publicar();
    await publicar({ githubToken: 'ghp_otro' });

    expect(writesOf('privateConfig').filter((w) => 'encryptedGithubToken' in w)).toHaveLength(2);
  });

  it('el borrado de cuenta lo olvida: volver a activar lo social reescribe el userMap', async () => {
    privateConfigConPseudonimo();
    await publicar();
    repo.forgetOwnAccountMemo();
    await publicar();

    expect(writesOf('userMap')).toHaveLength(2);
  });

  it('si la identidad falla, la siguiente publicación lo reintenta', async () => {
    privateConfigConPseudonimo();
    setDocMock.mockImplementationOnce(async () => {
      throw new Error('red');
    });
    await publicar();
    await publicar();

    expect(writesOf('userMap')).toHaveLength(2);
  });
});

describe('ensureProfileByEmail — la copia del directorio', () => {
  it('con el perfil igual no se tira: la reseña vive en el gist, no en el directorio', async () => {
    await publicar();
    expect(invalidateSocialDirectoryCache).not.toHaveBeenCalled();
  });

  it('si el perfil se reescribe (nick nuevo), sí', async () => {
    getOwnProfileRefMock.mockResolvedValue(perfilAlDia({ displayName: 'NickViejo' }));
    await publicar();
    expect(invalidateSocialDirectoryCache).toHaveBeenCalledTimes(1);
  });
});
