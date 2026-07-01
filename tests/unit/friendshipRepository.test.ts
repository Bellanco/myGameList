import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock de la capa Firestore: getMyFriendships solo necesita initializeFirebaseServices + getDocs.
const getDocsMock = vi.fn();

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: vi.fn(async () => ({ firestore: {} })),
  isPermissionDeniedError: (error: unknown) =>
    Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'permission-denied'),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

import {
  friendshipDocId,
  getMyFriendships,
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
