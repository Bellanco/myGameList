import { beforeEach, describe, expect, it, vi } from 'vitest';

// CUTOVER DE IDENTIDAD (`foreign-doc-id`): mover un perfil legacy a `profiles/{uid}` y retirar el huérfano.
//
// Es la única operación del panel que BORRA un documento de perfil, así que lo que se fija aquí es que no se pierda
// nada por el camino: el rango (que el dueño no puede escribir), la fecha de alta (inmutable para él) y los restos
// que solo existen en el huérfano y que su navegador tiene que poder rescatar después. Y que las amistades, que
// referencian uids y no ids de documento, no se tocan.

const getDocMock = vi.fn<(...a: unknown[]) => unknown>();
const batchSetMock = vi.fn();
const batchDeleteMock = vi.fn();
const batchCommitMock = vi.fn(async () => {});
const deleteDocMock = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {});

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: { __fs: true } })),
  isPermissionDeniedError: (error: unknown) => (error as { code?: string } | null)?.code === 'permission-denied',
}));

vi.mock('../../src/model/repository/firebaseSocialRepository', () => ({
  invalidateOwnProfileCache: vi.fn(),
  invalidateSocialDirectoryCache: vi.fn(),
}));

vi.mock('../../src/model/repository/firebaseFriendshipRepository', () => ({
  invalidateMyFriendshipsCache: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_fs: unknown, name: string) => ({ collection: name }),
  doc: (_fs: unknown, name: string, id: string) => ({ collection: name, id }),
  query: (base: Record<string, unknown>, ...constraints: unknown[]) => ({ ...base, constraints }),
  limit: (n: number) => ({ limit: n }),
  where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
  getDoc: (...a: unknown[]) => getDocMock(...a),
  getDocs: vi.fn(),
  updateDoc: vi.fn(async () => {}),
  deleteDoc: (...a: unknown[]) => deleteDocMock(...a),
  deleteField: () => '__del__',
  writeBatch: () => ({ set: batchSetMock, delete: batchDeleteMock, commit: batchCommitMock }),
}));

import { migrateForeignProfileDoc } from '../../src/model/repository/firebaseAdminRepository';

/** `getDoc` responde por id de documento: el huérfano y el canónico. */
function docs(byId: Record<string, Record<string, unknown> | null>) {
  getDocMock.mockImplementation((ref: unknown) => {
    const id = (ref as { id: string }).id;
    const data = byId[id] ?? null;
    return Promise.resolve({ exists: () => data !== null, data: () => data });
  });
}

/** Lo escrito en `profiles/{id}`, con las opciones del set (para distinguir mover de fusionar). */
function writeTo(id: string) {
  const call = batchSetMock.mock.calls.find((entry) => (entry[0] as { id?: string })?.id === id);
  return call ? { payload: call[1] as Record<string, unknown>, options: call[2] as { merge?: boolean } | undefined } : null;
}

const LEGACY_ID = 'doc-legacy';
const UID = 'uid-a';

const LEGACY_DOC = {
  uid: UID,
  email: 'yo@example.com',
  displayName: 'Ada',
  photoURL: 'https://example.com/a.png',
  tier: 'gold',
  createdAt: 1000,
  updatedAt: 5000,
  social: { enabled: true, gistId: 'gs-legacy', gamesGistId: 'gg-legacy', githubToken: 'ghp_legacy' },
};

beforeEach(() => {
  getDocMock.mockReset();
  batchSetMock.mockClear();
  batchDeleteMock.mockClear();
  batchCommitMock.mockClear();
  deleteDocMock.mockClear();
});

describe('migrateForeignProfileDoc — mover el documento', () => {
  it('copia el perfil ENTERO a `profiles/{uid}` y borra el original, en el mismo lote', async () => {
    docs({ [LEGACY_ID]: LEGACY_DOC, [UID]: null });

    const result = await migrateForeignProfileDoc(LEGACY_ID, UID);

    expect(result).toEqual({ outcome: 'moved', carried: [] });

    // El rango y la fecha de alta viajan con el documento: son justo lo que el dueño no puede escribir.
    const moved = writeTo(UID);
    expect(moved?.payload).toMatchObject({ uid: UID, displayName: 'Ada', tier: 'gold', createdAt: 1000 });
    // Y los restos legacy también: en el huérfano el auto-saneado no podía tocarlos; en el canónico, sí.
    expect(moved?.payload.social).toMatchObject({ gistId: 'gs-legacy', gamesGistId: 'gg-legacy', githubToken: 'ghp_legacy' });
    // Sin `merge`: es el mismo perfil cambiando de sitio, no una fusión.
    expect(moved?.options).toBeUndefined();

    expect(batchDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ collection: 'profiles', id: LEGACY_ID }));
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
    // Las amistades no se tocan: sus documentos referencian uids, no ids de perfil.
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  // Hay perfiles tan viejos que no traen `uid`, y sin ese campo la regla `profileWriteIsValid` denegaría al dueño
  // cualquier escritura sobre su perfil recién movido: se lo dejaría congelado otra vez.
  it('fuerza el campo `uid` del destino aunque el documento legacy no lo tuviera', async () => {
    const { uid: _omitted, ...sinUid } = LEGACY_DOC;
    docs({ [LEGACY_ID]: sinUid, [UID]: null });

    await migrateForeignProfileDoc(LEGACY_ID, UID);

    expect(writeTo(UID)?.payload).toMatchObject({ uid: UID });
  });
});

describe('migrateForeignProfileDoc — el documento canónico ya existe', () => {
  it('manda el vivo: solo rescata lo que le falta y retira el huérfano', async () => {
    docs({
      [LEGACY_ID]: LEGACY_DOC,
      [UID]: { uid: UID, displayName: 'Ada nueva', photoURL: '', social: { enabled: true }, updatedAt: 9000 },
    });

    const result = await migrateForeignProfileDoc(LEGACY_ID, UID);

    expect(result.outcome).toBe('merged');
    expect(result.carried).toEqual(['tier', 'createdAt', 'social.githubToken', 'social.gamesGistId', 'social.gistId']);

    const merged = writeTo(UID);
    expect(merged?.options).toEqual({ merge: true });
    // NO se pisa el nick ni la foto del documento vivo con los del huérfano.
    expect(merged?.payload).not.toHaveProperty('displayName');
    expect(merged?.payload).not.toHaveProperty('photoURL');
    expect(merged?.payload).toMatchObject({
      uid: UID,
      tier: 'gold',
      createdAt: 1000,
      'social.githubToken': 'ghp_legacy',
      'social.gamesGistId': 'gg-legacy',
      'social.gistId': 'gs-legacy',
    });
    expect(batchDeleteMock).toHaveBeenCalledWith(expect.objectContaining({ id: LEGACY_ID }));
  });

  it('no rescata nada que el vivo ya tenga', async () => {
    docs({
      [LEGACY_ID]: LEGACY_DOC,
      [UID]: {
        uid: UID, displayName: 'Ada', tier: 'silver', createdAt: 500, updatedAt: 9000,
        social: { enabled: true, gistId: 'gs-vivo', gamesGistId: 'gg-vivo', githubToken: 'ghp_vivo' },
      },
    });

    const result = await migrateForeignProfileDoc(LEGACY_ID, UID);

    expect(result.carried).toEqual([]);
    // Solo el `uid`, que es idempotente; el huérfano se retira igual.
    expect(writeTo(UID)?.payload).toEqual({ uid: UID });
    expect(batchDeleteMock).toHaveBeenCalledTimes(1);
  });

  it('conserva la fecha de alta MÁS ANTIGUA de las dos', async () => {
    docs({
      [LEGACY_ID]: { ...LEGACY_DOC, createdAt: 3000 },
      [UID]: { uid: UID, displayName: 'Ada', createdAt: 1500, social: { enabled: true } },
    });

    const result = await migrateForeignProfileDoc(LEGACY_ID, UID);

    expect(result.carried).not.toContain('createdAt');
    expect(writeTo(UID)?.payload).not.toHaveProperty('createdAt');
  });
});

describe('migrateForeignProfileDoc — guardas', () => {
  it('no acepta el centinela, ni un destino vacío, ni un perfil que ya es canónico', async () => {
    await expect(migrateForeignProfileDoc('_placeholder', UID)).rejects.toThrow(/no válido/);
    await expect(migrateForeignProfileDoc(LEGACY_ID, '')).rejects.toThrow(/uid de destino/);
    await expect(migrateForeignProfileDoc(UID, UID)).rejects.toThrow(/ya vive/);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });

  it('si el documento legacy ya no está, no escribe nada', async () => {
    docs({ [LEGACY_ID]: null, [UID]: null });

    await expect(migrateForeignProfileDoc(LEGACY_ID, UID)).rejects.toThrow(/ya no existe/);
    expect(batchCommitMock).not.toHaveBeenCalled();
  });
});
