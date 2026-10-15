// Borrar un juego con reseña la retira también del canal social, como vaciarla en el formulario. Antes solo lo hacía la
// reconciliación al abrir el hub: tus amistades seguían viendo la reseña de un juego que ya no tenías hasta que
// entraras en Social.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EMPTY_TAB_DATA = { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0 };
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  loadIndexedDbState: async () => null,
  saveIndexedDbState: async () => {},
  getGamesAsTabData: async () => null,
  getLocalMeta: async () => null,
  mirrorTabDataToGames: async () => {},
  patchLocalMeta: async () => {},
}));

vi.mock('../../src/model/repository/firebaseGateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/firebaseGateway')>()),
  trackAnalyticsEvent: async () => {},
}));

const publication = vi.hoisted(() => ({ applyReviewPublication: vi.fn(async () => {}) }));
vi.mock('../../src/viewmodel/applyReviewPublication', () => publication);

const { useGameListViewModel } = await import('../../src/viewmodel/useGameListViewModel');
const { flushLocalState, saveLocalState } = await import('../../src/model/repository/localRepository');

const T = Date.parse('2026-10-15T10:00:00.000Z');
const base = { _ts: T, platforms: ['PC'], genres: ['RPG'], steamDeck: false };

beforeEach(() => {
  flushLocalState();
  localStorage.clear();
  publication.applyReviewPublication.mockClear();
  saveLocalState({
    ...EMPTY_TAB_DATA,
    c: [
      { ...base, id: 1, name: 'Con reseña', review: 'Muy bueno' },
      { ...base, id: 2, name: 'Sin reseña', review: '  ' },
    ],
    etag: null,
    lastRemoteUpdatedAt: 0,
  });
  flushLocalState();
});

async function borrar(id: number) {
  const { result } = renderHook(() => useGameListViewModel());
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  act(() => { result.current.deleteGame('c', id); });
  act(() => { result.current.confirmState?.action(); });
  return result;
}

describe('borrar un juego retira su reseña del canal social', () => {
  it('con reseña, la despublica en ese mismo momento', async () => {
    const result = await borrar(1);

    expect(result.current.data.c.map((game) => game.id)).toEqual([2]);
    expect(publication.applyReviewPublication).toHaveBeenCalledTimes(1);
    expect(publication.applyReviewPublication).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, publication: { kind: 'unpublish' } }),
    );
  });

  it('sin reseña no toca el canal (ni una lectura del gist)', async () => {
    await borrar(2);
    expect(publication.applyReviewPublication).not.toHaveBeenCalled();
  });
});
