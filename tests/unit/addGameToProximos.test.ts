// «Añadir a próximos» desde la ruleta del perfil de un amigo: el juego entra en TUS listas, pero la reseña y la
// nota son del amigo (`buildProfilePool` las trae para la tarjeta-resultado). Copiarlas las firmaba como tuyas y
// las subía a tu gist.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EMPTY_TAB_DATA = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  loadIndexedDbState: async () => null,
  saveIndexedDbState: async () => {},
  getGamesAsTabData: async () => ({ ...EMPTY_TAB_DATA }),
  getLocalMeta: async () => null,
  mirrorTabDataToGames: async () => {},
  patchLocalMeta: async () => {},
}));

vi.mock('../../src/model/repository/firebaseGateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/firebaseGateway')>()),
  trackAnalyticsEvent: async () => {},
}));

const { useGameListViewModel } = await import('../../src/viewmodel/useGameListViewModel');
const { flushLocalState } = await import('../../src/model/repository/localRepository');
const { buildProfilePool } = await import('../../src/core/roulette/roulette');

beforeEach(() => {
  flushLocalState();
  localStorage.clear();
});

describe('añadir a próximos un juego de la ruleta de un amigo', () => {
  it('copia el juego pero no su reseña ni su nota', async () => {
    const { result } = renderHook(() => useGameListViewModel());
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });

    const [candidate] = buildProfilePool({
      c: [{ id: 7, name: 'Outer Wilds', genres: ['Aventura'], platforms: ['PC'], review: 'Lo mejor que he jugado', score: 5 }],
    });
    await act(async () => { result.current.addGameToProximos(candidate.game); });

    const [added] = result.current.data.p;
    expect(added).toMatchObject({ name: 'Outer Wilds', genres: ['Aventura'], platforms: ['PC'] });
    expect(added.review).toBe('');
    expect(added.score).toBe(0);
  });
});
