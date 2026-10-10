import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendshipView, MyFriendships } from '../../src/model/types/social';

// Fase 2 de docs/plan-historial-amigo-nuevo.md. Quien pidió una amistad se enteraba de que se la habían aceptado
// cuando caducaba su copia (15 min), y con el hub abierto no se releía nunca. Ahora las aristas pendientes se miran
// una a una al abrir el hub y al volver a la pestaña, y solo si alguna ha cambiado se relee la lista entera.

const DIA = 24 * 60 * 60 * 1000;
const getMyFriendships = vi.hoisted(() => vi.fn());
const haveFriendshipEdgesChanged = vi.hoisted(() => vi.fn(async (_uid: string, _views: unknown[]) => false));

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  acceptFriendRequest: vi.fn(),
  deleteFriendship: vi.fn(),
  getMyFriendships,
  haveFriendshipEdgesChanged,
  MY_FRIENDSHIPS_REQUESTS_MAX_AGE_MS: 60_000,
  readFriendship: vi.fn(),
  sendFriendRequest: vi.fn(),
}));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  invalidateCachedSocialDirectory: vi.fn(async () => {}),
}));

const { edgesAwaitingOtherSide, resetFriendshipEdgeCheckForTests, useSocialFriendships } = await import(
  '../../src/viewmodel/social/useSocialFriendships'
);

const vista = (docId: string, state: FriendshipView['state'], extra: Partial<FriendshipView> = {}): FriendshipView => ({
  docId, otherUid: docId, otherName: docId, otherPhoto: '', otherSocialGistId: '', otherGamesGistId: '',
  state, createdAt: Date.now() - DIA, updatedAt: Date.now() - DIA, ...extra,
});
const lista = (partial: Partial<MyFriendships>): MyFriendships => ({ friends: [], incoming: [], outgoing: [], byOtherUid: {}, ...partial });

const montar = () => renderHook(() => useSocialFriendships({
  myUid: 'yo',
  socialGistId: 'gist-yo',
  socialSpaceOpen: true,
  buildSelfInfo: () => ({ name: 'Yo', photo: '', socialGistId: 'gist-yo', gamesGistId: '' }),
  setFeedback: vi.fn(),
  reportFailure: vi.fn(),
}));

beforeEach(() => {
  resetFriendshipEdgeCheckForTests();
  getMyFriendships.mockReset();
  haveFriendshipEdgesChanged.mockReset();
  haveFriendshipEdgesChanged.mockResolvedValue(false);
});

describe('edgesAwaitingOtherSide', () => {
  it('mira las enviadas y los amigos sin ids del otro, solo si son de esta semana', () => {
    const ahora = Date.now();
    const elegidas = edgesAwaitingOtherSide(lista({
      outgoing: [vista('enviada', 'outgoing'), vista('olvidada', 'outgoing', { createdAt: ahora - 8 * DIA })],
      friends: [
        vista('sin-ids', 'friends'),
        vista('con-ids', 'friends', { otherSocialGistId: 'g' }),
        vista('sin-ids-vieja', 'friends', { updatedAt: ahora - 8 * DIA }),
      ],
      incoming: [vista('recibida', 'incoming')],
    }), ahora);
    expect(elegidas.map((view) => view.docId)).toEqual(['enviada', 'sin-ids']);
  });
});

describe('useSocialFriendships — aristas pendientes', () => {
  it('sin nada pendiente no gasta ni una lectura', async () => {
    getMyFriendships.mockResolvedValue(lista({ friends: [vista('amigo', 'friends', { otherSocialGistId: 'g' })] }));
    const { result } = montar();
    await waitFor(() => expect(result.current.friendshipsResolved).toBe(true));
    expect(haveFriendshipEdgesChanged).not.toHaveBeenCalled();
  });

  it('una petición enviada que ya está aceptada: relee la lista al abrir el hub', async () => {
    getMyFriendships
      .mockResolvedValueOnce(lista({ outgoing: [vista('b', 'outgoing')] }))
      .mockResolvedValueOnce(lista({ friends: [vista('b', 'friends', { otherSocialGistId: 'gsB' })] }));
    haveFriendshipEdgesChanged.mockResolvedValueOnce(true);

    const { result } = montar();

    await waitFor(() => expect(result.current.friendships.friends.map((view) => view.docId)).toEqual(['b']));
    expect(getMyFriendships).toHaveBeenLastCalledWith('yo', expect.objectContaining({ forceRefresh: true }));
  });

  it('al volver a la pestaña vuelve a mirar, pero no más de una vez por minuto', async () => {
    getMyFriendships.mockResolvedValue(lista({ outgoing: [vista('b', 'outgoing')] }));
    const { result } = montar();
    await waitFor(() => expect(haveFriendshipEdgesChanged).toHaveBeenCalledTimes(1));
    expect(result.current.friendshipsResolved).toBe(true);

    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(haveFriendshipEdgesChanged).toHaveBeenCalledTimes(1);

    resetFriendshipEdgeCheckForTests(); // pasa el minuto
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(haveFriendshipEdgesChanged).toHaveBeenCalledTimes(2));
  });
});
