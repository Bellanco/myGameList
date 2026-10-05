// Tope de la lista de deseos (`WISHLIST_MAX_GAMES`): pasado el número no se añade nada más, ni desde el
// formulario ni desde la ruleta de un amigo. Editar lo que ya está sigue funcionando.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EMPTY_TAB_DATA = { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0 };
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
const { WISHLIST_MAX_GAMES } = await import('../../src/core/constants/uiConfig');
const { UI_MESSAGES } = await import('../../src/core/constants/labels');

const draft = (name: string, id?: number) => ({
  ...(id ? { id } : {}),
  name,
  genres: ['Aventura'],
  platforms: ['PC'],
  steamDeck: false,
  score: 0,
  years: [],
  strengths: [],
  weaknesses: [],
  reasons: [],
  replayable: false,
  retry: false,
  hours: null,
  scored: false,
  review: '',
});

async function withFullWishlist() {
  const hook = renderHook(() => useGameListViewModel());
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  for (let index = 1; index <= WISHLIST_MAX_GAMES; index += 1) {
    await act(async () => { hook.result.current.addGameToWishlist({ name: `Deseo ${index}`, genres: ['Aventura'], platforms: ['PC'] }); });
  }
  expect(hook.result.current.data.d).toHaveLength(WISHLIST_MAX_GAMES);
  return hook;
}

beforeEach(() => {
  flushLocalState();
  localStorage.clear();
});

describe('tope de la lista de deseos', () => {
  it('la ruleta de un amigo no añade más con la lista llena, y avisa', async () => {
    const { result } = await withFullWishlist();

    let outcome: string | undefined;
    await act(async () => { outcome = result.current.addGameToWishlist({ name: 'Outer Wilds', genres: ['Aventura'], platforms: ['PC'] }); });

    expect(outcome).toBe('full');
    expect(result.current.data.d).toHaveLength(WISHLIST_MAX_GAMES);
    expect(result.current.notice?.message).toBe(UI_MESSAGES.games.wishlistFull);
  });

  it('con la lista llena el formulario no se abre para deseados, pero sí para el resto de listas', async () => {
    const { result } = await withFullWishlist();

    await act(async () => { result.current.openNewGame('d'); });
    expect(result.current.formModalOpen).toBe(false);
    expect(result.current.notice?.message).toBe(UI_MESSAGES.games.wishlistFull);

    await act(async () => { result.current.openNewGame('p'); });
    expect(result.current.formModalOpen).toBe(true);
  });

  it('guardar un deseo nuevo se rechaza, pero editar uno que ya está no', async () => {
    const { result } = await withFullWishlist();

    let saved: unknown;
    await act(async () => { saved = result.current.saveDraft('d', draft('Outer Wilds')); });
    expect(saved).toBeNull();
    expect(result.current.data.d).toHaveLength(WISHLIST_MAX_GAMES);

    const [first] = result.current.data.d;
    await act(async () => { saved = result.current.saveDraft('d', draft('Deseo 1 (edición)', first.id)); });
    expect(saved).not.toBeNull();
    expect(result.current.data.d.find((game) => game.id === first.id)?.name).toBe('Deseo 1 (edición)');
  });
});
