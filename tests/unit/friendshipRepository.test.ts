import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de la capa Firestore: getMyFriendships solo necesita initializeFirebaseServices + getDocs.
const getDocsMock = vi.fn();
const deleteDocMock = vi.fn();
const updateDocMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const docMock = vi.fn((...args: unknown[]) => ({ id: String(args[2] ?? '') }));

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
}));

vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
}));

import {
  deleteFriendship,
  friendshipDocId,
  getMyFriendships,
  healOwnFriendshipIdentity,
  invalidateMyFriendshipsCache,
} from '../../src/model/repository/firebaseFriendshipRepository';

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
}

describe('friendshipDocId', () => {
  it('es canónico (uids ordenados, independiente del orden de entrada)', () => {
    expect(friendshipDocId('a', 'b')).toBe('a__b');
    expect(friendshipDocId('b', 'a')).toBe('a__b');
  });
});

describe('getMyFriendships', () => {
  beforeEach(() => {
    getDocsMock.mockReset();
    invalidateMyFriendshipsCache();
  });

  it('categoriza amigos / recibidas / enviadas y extrae el "otro" desde los campos denormalizados', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted', updatedAt: 3,
            recipientName: 'X', recipientPhoto: 'px', recipientSocialGistId: 'gsx', recipientGamesGistId: 'ggx',
          },
        },
        {
          id: 'me__y',
          data: { users: ['me', 'y'], requester: 'y', recipient: 'me', status: 'pending', updatedAt: 2, requesterName: 'Y' },
        },
        {
          id: 'me__z',
          data: { users: ['me', 'z'], requester: 'me', recipient: 'z', status: 'pending', updatedAt: 1 },
        },
      ]),
    );

    const result = await getMyFriendships('me');

    expect(result.friends).toHaveLength(1);
    expect(result.friends[0]).toMatchObject({ otherUid: 'x', otherName: 'X', otherSocialGistId: 'gsx', state: 'friends' });
    expect(result.incoming).toHaveLength(1);
    expect(result.incoming[0]).toMatchObject({ otherUid: 'y', otherName: 'Y', state: 'incoming' });
    expect(result.outgoing).toHaveLength(1);
    expect(result.outgoing[0]).toMatchObject({ otherUid: 'z', state: 'outgoing' });
    expect(Object.keys(result.byOtherUid).sort()).toEqual(['x', 'y', 'z']);
  });

  it('cachea: una segunda llamada no relee de Firestore hasta invalidar', async () => {
    getDocsMock.mockResolvedValue(snapshot([]));

    await getMyFriendships('me');
    await getMyFriendships('me');
    expect(getDocsMock).toHaveBeenCalledTimes(1);

    invalidateMyFriendshipsCache('me');
    await getMyFriendships('me');
    expect(getDocsMock).toHaveBeenCalledTimes(2);
  });

  it('degrada a vacío si las reglas deniegan la lectura', async () => {
    getDocsMock.mockRejectedValueOnce({ code: 'permission-denied' });
    const result = await getMyFriendships('me');
    expect(result).toEqual({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
  });
});

describe('deleteFriendship', () => {
  beforeEach(() => deleteDocMock.mockReset());

  it('trata un doc ya borrado (permission-denied) como éxito idempotente', async () => {
    deleteDocMock.mockRejectedValueOnce({ code: 'permission-denied' });
    await expect(deleteFriendship({ myUid: 'me', docId: 'me__x' })).resolves.toBeUndefined();
  });

  it('propaga errores reales (no permission-denied)', async () => {
    deleteDocMock.mockRejectedValueOnce(new Error('network'));
    await expect(deleteFriendship({ myUid: 'me', docId: 'me__x' })).rejects.toThrow('network');
  });
});

describe('healOwnFriendshipIdentity', () => {
  beforeEach(() => {
    updateDocMock.mockClear();
    getDocsMock.mockReset();
    invalidateMyFriendshipsCache();
  });

  it('actualiza SOLO mis campos (requester* si soy requester, recipient* si soy recipient)', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        { id: 'me__x', data: { users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted' } },
        { id: 'y__me', data: { users: ['me', 'y'], requester: 'y', recipient: 'me', status: 'pending' } },
      ]),
    );

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs', gamesGistId: 'gg' });

    expect(updateDocMock).toHaveBeenCalledTimes(2);
    // Doc donde soy requester → solo campos requester*.
    const findFields = (docId: string): Record<string, unknown> => {
      const call = updateDocMock.mock.calls.find((c) => (c[0] as { id: string }).id === docId);
      return (call?.[1] ?? {}) as Record<string, unknown>;
    };
    const requesterUpdate = findFields('me__x');
    expect(requesterUpdate).toMatchObject({ requesterName: 'MiNick', requesterSocialGistId: 'gs' });
    expect(Object.keys(requesterUpdate)).not.toContain('recipientName');
    // Doc donde soy recipient → solo campos recipient*.
    const recipientUpdate = findFields('y__me');
    expect(recipientUpdate).toMatchObject({ recipientName: 'MiNick' });
    expect(Object.keys(recipientUpdate)).not.toContain('requesterName');
  });

  // Varios llamantes pasan `gamesGistId: mainSyncConfig?.gistId || ''`, y esa configuración se hidrata de forma
  // asíncrona: un `''` significa "aquí y ahora no lo sé", nunca "este usuario ya no tiene gist". Y estos campos
  // son de donde los AMIGOS sacan la lista de juegos, así que escribir el vacío se la dejaba en blanco a todos.
  it('un id vacío CONSERVA el que ya consta en el doc (no lo borra)', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
            requesterName: 'MiNick', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
          },
        },
      ]),
    );

    // Mismo nick y foto que ya constan: lo único "nuevo" es el vacío. Al conservarse, nada diverge y no se escribe.
    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: '', gamesGistId: '' });

    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('un id vacío no impide propagar el resto (nick nuevo) y sigue conservando el id', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
            requesterName: 'NickViejo', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
          },
        },
      ]),
    );

    await healOwnFriendshipIdentity('me', { name: 'NickNuevo', photo: 'p', socialGistId: 'gs', gamesGistId: '' });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({
      requesterName: 'NickNuevo',
      requesterGamesGistId: 'gg',
    });
  });

  // El caso que sí debe escribir: un id NUEVO reemplaza al anterior (migración de canal, gist recreado).
  it('un id nuevo sí reemplaza al anterior', async () => {
    getDocsMock.mockResolvedValueOnce(
      snapshot([
        {
          id: 'me__x',
          data: {
            users: ['me', 'x'], requester: 'me', recipient: 'x', status: 'accepted',
            requesterName: 'MiNick', requesterPhoto: 'p', requesterSocialGistId: 'gs', requesterGamesGistId: 'gg',
          },
        },
      ]),
    );

    await healOwnFriendshipIdentity('me', { name: 'MiNick', photo: 'p', socialGistId: 'gs2', gamesGistId: 'gg2' });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock.mock.calls[0][1]).toMatchObject({
      requesterSocialGistId: 'gs2',
      requesterGamesGistId: 'gg2',
    });
  });
});
