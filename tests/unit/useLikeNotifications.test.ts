import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialReactionEntry } from '../../src/core/social/reactions';

// docs/plan-notificaciones-y-buscador.md — la campana: solo lo nuevo, visto al abrir la pantalla, y lo enseñado sigue
// mientras el hub esté montado.

const repo = vi.hoisted(() => ({
  seen: new Set<string>(),
  addSeenLikeKeys: vi.fn(async (_uid: string, _keys: readonly string[]) => {}),
}));

vi.mock('../../src/model/repository/likeNotificationsSeen', () => ({
  getSeenLikeKeys: vi.fn(async () => new Set(repo.seen)),
  addSeenLikeKeys: repo.addSeenLikeKeys,
}));

const { useLikeNotifications } = await import('../../src/viewmodel/social/useLikeNotifications');
const { getSeenLikeKeys } = await import('../../src/model/repository/likeNotificationsSeen');

const like = (item: string, at = 1): SocialReactionEntry => ({ on: 'activity', to: 'yo', item, kind: 'like', at });
const OWN = {
  activity: [
    { id: 'yo:7:review', type: 'review', actorProfileId: 'yo', gameId: 7, gameName: 'Hades' },
    { id: 'yo:8:review', type: 'review', actorProfileId: 'yo', gameId: 8, gameName: 'Celeste' },
  ],
  posts: [],
} as never;
const MARTA = { id: 'uid-marta', uid: 'uid-marta', displayName: 'Marta', reactions: [like('yo:7:review', 2)] } as never;
const NACHO = { id: 'uid-nacho', uid: 'uid-nacho', displayName: 'Nacho', reactions: [like('yo:8:review', 1)] } as never;

const base = { enabled: true, uid: 'uid-yo', friends: [MARTA, NACHO], ownEntry: OWN, screenOpen: false };

beforeEach(() => {
  repo.seen = new Set();
  vi.clearAllMocks();
});

describe('useLikeNotifications', () => {
  it('cuenta las filas con algo nuevo', async () => {
    const { result } = renderHook(() => useLikeNotifications(base));

    await waitFor(() => expect(result.current.newCount).toBe(2));
    expect(result.current.notifications.map((row) => row.own.gameName)).toEqual(['Hades', 'Celeste']);
  });

  it('lo visto en otra visita no vuelve a salir', async () => {
    repo.seen = new Set(['uid-marta|activity|yo|yo:7:review']);
    const { result } = renderHook(() => useLikeNotifications(base));

    await waitFor(() => expect(result.current.newCount).toBe(1));
    expect(result.current.notifications.map((row) => row.own.gameName)).toEqual(['Celeste']);
  });

  it('al abrir la pantalla pasa a visto, pero sigue en ella mientras dure la visita', async () => {
    const { result, rerender } = renderHook((props) => useLikeNotifications(props), { initialProps: base });
    await waitFor(() => expect(result.current.newCount).toBe(2));

    rerender({ ...base, screenOpen: true });
    await waitFor(() => expect(result.current.newCount).toBe(0));
    expect(result.current.notifications).toHaveLength(2);
    expect(repo.addSeenLikeKeys).toHaveBeenCalledWith('uid-yo', [
      'uid-marta|activity|yo|yo:7:review',
      'uid-nacho|activity|yo|yo:8:review',
    ]);

    // De vuelta al feed: la campana sigue (sin número) hasta salir del social.
    rerender({ ...base, screenOpen: false });
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.newCount).toBe(0);
  });

  it('al volver a entrar en el social (hub nuevo), lo visto ya no está', async () => {
    const first = renderHook((props) => useLikeNotifications(props), { initialProps: { ...base, screenOpen: true } });
    await waitFor(() => expect(repo.addSeenLikeKeys).toHaveBeenCalled());
    repo.seen = new Set(repo.addSeenLikeKeys.mock.calls.flatMap(([, keys]) => [...keys]));
    first.unmount();

    // Mientras tanto, Lucía da «me gusta» a Hades: es lo único que debe salir.
    const LUCIA = { id: 'uid-lucia', uid: 'uid-lucia', displayName: 'Lucía', reactions: [like('yo:7:review', 9)] } as never;
    const { result } = renderHook(() => useLikeNotifications({ ...base, friends: [MARTA, NACHO, LUCIA] }));
    await waitFor(() => expect(result.current.notifications.map((row) => row.names)).toEqual([['Lucía']]));
    expect(getSeenLikeKeys).toHaveBeenCalledTimes(2);
    expect(result.current.newCount).toBe(1);
  });

  it('cerrado el espacio social no lee nada ni avisa', () => {
    const { result } = renderHook(() => useLikeNotifications({ ...base, enabled: false }));
    expect(result.current.notifications).toEqual([]);
    expect(result.current.newCount).toBe(0);
  });
});
