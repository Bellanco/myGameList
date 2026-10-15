import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocialReactionEntry } from '../../src/core/social/reactions';

// FASE 3 de docs/plan-reacciones.md — el hook del hub: tus «me gusta», los de tus amistades y el gesto.

const repo = vi.hoisted(() => ({
  own: [] as SocialReactionEntry[],
  resolveOwn: null as null | ((value: SocialReactionEntry[]) => void),
  deferOwn: false,
  setSocialLike: vi.fn(async (_target: unknown, _liked: boolean) => {}),
  retireSocialLikesTo: vi.fn(async (_profileId: string) => {}),
  flushSocialLikes: vi.fn(async () => 'nothing'),
}));

vi.mock('../../src/model/repository/socialReactionsRepository', () => ({
  getOwnSocialLikes: vi.fn(() => (repo.deferOwn
    ? new Promise<SocialReactionEntry[]>((resolve) => { repo.resolveOwn = resolve; })
    : Promise.resolve(repo.own))),
  setSocialLike: repo.setSocialLike,
  retireSocialLikesTo: repo.retireSocialLikesTo,
  flushSocialLikes: repo.flushSocialLikes,
}));

const { useSocialLikes } = await import('../../src/viewmodel/social/useSocialLikes');

const REVIEW = { id: 'pm:42:review', type: 'review', actorProfileId: 'pm' };
const POST = { kind: 'post', id: 'pm:99', authorProfileId: 'pm' };
const like = (on: 'activity' | 'post', to: string, item: string, at = 1): SocialReactionEntry => ({ on, to, item, kind: 'like', at });

const MARTA = {
  id: 'uid-marta',
  uid: 'uid-marta',
  displayName: 'Marta',
  reactions: [],
  activity: [{ actorProfileId: 'pm' }],
  posts: [{ authorProfileId: 'pm' }],
} as never;
const NACHO = { id: 'uid-nacho', uid: 'uid-nacho', displayName: 'Nacho', reactions: [like('activity', 'pm', REVIEW.id, 5)], activity: [], posts: [] } as never;

beforeEach(() => {
  repo.own = [];
  repo.deferOwn = false;
  repo.resolveOwn = null;
  vi.clearAllMocks();
});

describe('useSocialLikes', () => {
  it('nombra a las amistades que han dado «me gusta» y marca el tuyo leído de tu fichero', async () => {
    repo.own = [like('post', 'pm', POST.id)];
    const { result } = renderHook(() => useSocialLikes({ enabled: true, others: [MARTA, NACHO] }));

    await waitFor(() => expect(result.current.likesFor(POST).mine).toBe(true));
    expect(result.current.likesFor(REVIEW)).toEqual({ names: ['Nacho'], mine: false });
    expect(repo.flushSocialLikes).toHaveBeenCalledTimes(1);
  });

  it('cerrado el espacio social no lee ni sube nada', () => {
    renderHook(() => useSocialLikes({ enabled: false, others: [] }));
    expect(repo.flushSocialLikes).not.toHaveBeenCalled();
  });

  it('pulsar se ve al momento y deja la subida a la cola', async () => {
    const { result } = renderHook(() => useSocialLikes({ enabled: true, others: [] }));
    await waitFor(() => expect(repo.flushSocialLikes).toHaveBeenCalled());

    act(() => result.current.toggleLike(REVIEW));
    expect(result.current.likesFor(REVIEW).mine).toBe(true);
    expect(repo.setSocialLike).toHaveBeenLastCalledWith({ on: 'activity', to: 'pm', item: REVIEW.id }, true);

    act(() => result.current.toggleLike(REVIEW));
    expect(result.current.likesFor(REVIEW).mine).toBe(false);
    expect(repo.setSocialLike).toHaveBeenLastCalledWith({ on: 'activity', to: 'pm', item: REVIEW.id }, false);
  });

  it('lo que no admite «me gusta» no hace nada al pulsarlo', async () => {
    const { result } = renderHook(() => useSocialLikes({ enabled: true, others: [] }));
    // La lectura de los tuyos sale al montar: se deja llegar para que no actualice con el test ya acabado.
    await waitFor(() => expect(repo.flushSocialLikes).toHaveBeenCalled());
    const move = { kind: 'move', id: '7:v' };
    expect(result.current.canLike(move)).toBe(false);
    act(() => result.current.toggleLike(move));
    expect(repo.setSocialLike).not.toHaveBeenCalled();
  });

  it('una lectura que llega TARDE no pisa lo pulsado mientras tanto', async () => {
    repo.deferOwn = true;
    const { result } = renderHook(() => useSocialLikes({ enabled: true, others: [] }));
    await waitFor(() => expect(repo.resolveOwn).not.toBeNull());

    act(() => result.current.toggleLike(POST)); // pone uno que la lectura no trae
    await act(async () => repo.resolveOwn?.([like('activity', 'pm', REVIEW.id)]));
    act(() => result.current.toggleLike(REVIEW)); // quita uno que la lectura sí trae
    expect(result.current.likesFor(POST).mine).toBe(true);
    expect(result.current.likesFor(REVIEW).mine).toBe(false);
  });

  it('una lectura tardía tampoco resucita lo que se quitó antes de que llegara', async () => {
    repo.deferOwn = true;
    const { result } = renderHook(() => useSocialLikes({ enabled: true, others: [] }));
    await waitFor(() => expect(repo.resolveOwn).not.toBeNull());

    act(() => result.current.toggleLike(REVIEW)); // pone…
    act(() => result.current.toggleLike(REVIEW)); // …y quita, antes de que llegue la lectura
    await act(async () => repo.resolveOwn?.([like('activity', 'pm', REVIEW.id)]));
    expect(result.current.likesFor(REVIEW).mine).toBe(false);
  });

  it('dejar de ser amigos retira tus «me gusta» a todos los pseudónimos con que firma esa persona', async () => {
    repo.own = [like('activity', 'pm', REVIEW.id), like('post', 'pm', POST.id)];
    const { result } = renderHook(() => useSocialLikes({ enabled: true, others: [MARTA] }));
    await waitFor(() => expect(result.current.likesFor(REVIEW).mine).toBe(true));

    act(() => result.current.retireLikesOf('uid-marta'));

    expect(result.current.likesFor(REVIEW).mine).toBe(false);
    expect(result.current.likesFor(POST).mine).toBe(false);
    expect(repo.retireSocialLikesTo.mock.calls.map(([id]) => id)).toEqual(['pm']);
  });
});
