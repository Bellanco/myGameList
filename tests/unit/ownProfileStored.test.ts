import { beforeEach, describe, expect, it, vi } from 'vitest';

// TU RANGO CUANDO FIRESTORE NO ATIENDE (docs/plan-degradacion-servicios.md, fase 5). Sin copia, un plata o un oro
// caía a bronce —sin compositor de publicaciones y con el cupo mínimo en Premios— por un cupo diario agotado.

const getDocMock = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: (error: unknown) => (error as { code?: string } | null)?.code === 'permission-denied',
}));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getCachedDirectoryQuery: async () => null,
  putCachedDirectoryQuery: async () => {},
  invalidateCachedDirectoryQueries: async () => {},
  getCachedDirectoryProfiles: async () => ({}),
  putCachedDirectoryProfiles: async () => {},
  invalidateCachedDirectoryProfiles: async () => {},
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(),
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  Timestamp: { fromMillis: (millis: number) => ({ millis }) },
}));

const repo = await import('../../src/model/repository/firebaseSocialRepository');

const SIN_CUOTA = Object.assign(new Error('Quota exceeded.'), { code: 'resource-exhausted' });

function perfil() {
  return {
    id: 'u1',
    exists: () => true,
    data: () => ({
      uid: 'u1', profileId: 'pid-1', displayName: 'Nick', photoURL: '', tier: 'gold', social: { enabled: true },
      // Restos legacy que el documento aún pueda tener: se leen para purgarlos, NUNCA se copian.
      email: 'yo@example.com', social_githubToken: 'x',
    }),
  };
}

beforeEach(() => {
  getDocMock.mockReset();
  localStorage.clear();
  repo.invalidateOwnProfileCache();
});

describe('getOwnProfileRef con Firestore sin atender', () => {
  it('sirve el último perfil leído en este navegador: el rango no cae a bronce', async () => {
    getDocMock.mockResolvedValueOnce(perfil());
    await repo.getOwnProfileRef('u1');
    repo.invalidateOwnProfileCache();
    getDocMock.mockRejectedValueOnce(SIN_CUOTA);

    const profile = await repo.getOwnProfileRef('u1');

    expect(profile).toMatchObject({ tier: 'gold', profileId: 'pid-1', socialEnabled: true, displayName: 'Nick' });
  });

  it('la copia no guarda el correo ni nada legacy', async () => {
    getDocMock.mockResolvedValueOnce(perfil());
    await repo.getOwnProfileRef('u1');

    const guardado = localStorage.getItem('mis-listas-own-profile-u1') || '';
    expect(guardado).toContain('gold');
    expect(guardado).not.toContain('yo@example.com');
    expect(guardado).not.toContain('githubToken');
  });

  it('sin copia, el fallo se propaga como siempre (quien llama degrada a bronce)', async () => {
    getDocMock.mockRejectedValueOnce(SIN_CUOTA);
    await expect(repo.getOwnProfileRef('u1')).rejects.toThrow('Quota exceeded.');
  });

  it('un `permission-denied` no saca la copia: es una respuesta, no un fallo', async () => {
    getDocMock.mockResolvedValueOnce(perfil());
    await repo.getOwnProfileRef('u1');
    repo.invalidateOwnProfileCache();
    getDocMock.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    await expect(repo.getOwnProfileRef('u1')).resolves.toBeNull();
  });
});
