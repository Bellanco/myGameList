import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_INACTIVITY_MS } from '../../src/core/constants/socialActivity';

// LA SEÑAL DE REGRESO (docs/plan-feed-sin-vacio.md, Fase 4).
//
// Un amigo que llevaba más de 30 días sin aparecer queda fuera del feed de los demás, y la copia de su perfil de
// dormido vale un día entero: si volvía, sus amigos tardaban hasta 24 h en verlo. Ahora, al refrescar su «última vez
// activo» y ver que venía de dormir, sella el `updatedAt` de sus amistades —una escritura por amistad, una vez por
// regreso— y la otra parte relee su perfil en cuanto relee las amistades.

const DIA = 24 * 60 * 60 * 1000;
const setDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});
const getDocMock = vi.fn<(...a: unknown[]) => unknown>();
const getDocsMock = vi.fn<(...a: unknown[]) => unknown>();
const batchUpdates: Array<{ ref: { id: string }; fields: Record<string, unknown> }> = [];

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: () => false,
}));

// El perfil propio ya existe, con otro nick: `ensureProfileByEmail` tiene que reescribirlo.
vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  findSocialProfileByEmail: vi.fn(async () => null),
  getOwnProfileRef: vi.fn(async () => ({
    id: 'uid-1', profileId: 'pid-1', email: '', displayName: 'Nick viejo', photoURL: '', socialGistId: '',
    gamesGistId: '', githubToken: '', socialEnabled: true, tier: 'bronze',
  })),
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
  peekOwnProfileTier: () => 'bronze',
  peekOwnProfileCache: () => null,
  saveOwnProfileCache: vi.fn(),
  saveProfileByEmailCache: vi.fn(),
}));

vi.mock('../../src/model/repository/gistRepository', () => ({
  probeSocialGistEvidence: vi.fn(),
}));

vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  seedProfileIdFromRemote: vi.fn(async (remote: string | null) => remote || 'pid-local'),
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
  invalidateCachedSocialDirectory: vi.fn(async () => {}),
  getPersistedFriendships: vi.fn(async () => null),
  putPersistedFriendships: vi.fn(async () => {}),
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: (_fs: unknown, name: string) => ({ name }),
  doc: (_fs: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  getDocs: (...a: unknown[]) => getDocsMock(...a),
  setDoc: (...a: unknown[]) => setDocMock(...a),
  updateDoc: vi.fn(async () => {}),
  query: (...a: unknown[]) => a,
  where: (...a: unknown[]) => a,
  limit: (...a: unknown[]) => a,
  deleteField: () => '__del__',
  serverTimestamp: () => '__ts__',
  writeBatch: () => ({
    set: vi.fn(),
    update: (ref: { id: string }, fields: Record<string, unknown>) => batchUpdates.push({ ref, fields }),
    delete: vi.fn(),
    commit: vi.fn(async () => {}),
  }),
}));

const { ensureProfileByEmail, touchOwnProfileActivity, touchOwnProfileActivityThrottled } = await import('../../src/model/repository/firebaseRepository');

function conPerfil(updatedAt: number | null) {
  getDocMock.mockImplementation(async (ref: unknown) => {
    const { collection } = ref as { collection: string };
    if (collection !== 'profiles') return { exists: () => false, data: () => undefined };
    return { exists: () => true, data: () => ({ uid: 'uid-1', ...(updatedAt === null ? {} : { updatedAt: { toMillis: () => updatedAt } }) }) };
  });
}

function conAmistades(docs: Array<{ id: string; status: string }>) {
  getDocsMock.mockResolvedValue({
    docs: docs.map((d) => ({ id: d.id, data: () => ({ users: ['uid-1', 'otro'], status: d.status, requester: 'uid-1', recipient: 'otro' }) })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  batchUpdates.length = 0;
  conAmistades([{ id: 'a__uid-1', status: 'accepted' }, { id: 'b__uid-1', status: 'pending' }, { id: 'c__uid-1', status: 'accepted' }]);
});

describe('touchOwnProfileActivity · señal de regreso', () => {
  it('si venía de más de 30 días sin aparecer, sella SOLO el `updatedAt` de sus amistades aceptadas', async () => {
    conPerfil(Date.now() - PROFILE_INACTIVITY_MS - DIA);

    await touchOwnProfileActivity('uid-1');

    expect(batchUpdates.map((u) => u.ref.id).sort()).toEqual(['a__uid-1', 'c__uid-1']);
    batchUpdates.forEach((u) => expect(Object.keys(u.fields)).toEqual(['updatedAt']));
    // La recencia del perfil va ANTES: quien relea su perfil por el sello tiene que encontrarlo ya despierto.
    expect(setDocMock).toHaveBeenCalled();
  });

  it('si es un uso normal (menos de 30 días), no toca las amistades', async () => {
    conPerfil(Date.now() - 2 * DIA);

    await touchOwnProfileActivity('uid-1');

    expect(setDocMock).toHaveBeenCalled();
    expect(getDocsMock).not.toHaveBeenCalled();
    expect(batchUpdates).toEqual([]);
  });

  it('sin marca anterior (perfil de antes de existir) no se da por regreso', async () => {
    conPerfil(null);

    await touchOwnProfileActivity('uid-1');

    expect(getDocsMock).not.toHaveBeenCalled();
  });

  it('si sellar las amistades falla, la recencia del perfil ya está escrita y no lanza', async () => {
    conPerfil(Date.now() - PROFILE_INACTIVITY_MS - DIA);
    getDocsMock.mockRejectedValue(new Error('offline'));

    await expect(touchOwnProfileActivity('uid-1')).resolves.toBeUndefined();
    expect(setDocMock).toHaveBeenCalled();
  });
});

describe('ensureProfileByEmail · señal de regreso al reescribir el perfil', () => {
  // Cambiar de nick o de foto reescribe `updatedAt` sin pasar por el latido: quien vuelve así también avisa.
  it('si el perfil propio venía de más de 30 días, sella las amistades tras reescribirlo', async () => {
    conPerfil(Date.now() - PROFILE_INACTIVITY_MS - DIA);

    await ensureProfileByEmail({
      user: { uid: 'uid-1', email: 'yo@example.com', displayName: 'Yo', photoURL: null } as never,
      socialGistId: 'social-1',
      preferredName: 'Nick nuevo',
      photoURL: '',
    });

    expect(batchUpdates.map((u) => u.ref.id).sort()).toEqual(['a__uid-1', 'c__uid-1']);
  });
});

describe('touchOwnProfileActivityThrottled · sin solaparse', () => {
  // El hub y la pasada de fondo de la app principal pueden pedirla en el mismo arranque: con las dos leyendo la
  // recencia vieja, eran dos escrituras y, si venía de dormir, dos sellos de regreso en cada amistad.
  it('dos peticiones a la vez hacen UNA escritura y UN sello de regreso', async () => {
    conPerfil(Date.now() - PROFILE_INACTIVITY_MS - DIA);

    await Promise.all([touchOwnProfileActivityThrottled('uid-1'), touchOwnProfileActivityThrottled('uid-1')]);

    const recencias = setDocMock.mock.calls.filter((call) => (call[0] as { collection?: string }).collection === 'profiles');
    expect(recencias).toHaveLength(1);
    expect(batchUpdates.map((u) => u.ref.id).sort()).toEqual(['a__uid-1', 'c__uid-1']);
  });
});
