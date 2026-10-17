// Pasar un juego a completados abre el formulario con el año en curso ya puesto: terminarlo ahora es terminarlo
// este año. Entra también cuando el juego ya traía años (una rejugada que vuelve a cerrarse) y queda editable,
// porque es una propuesta del borrador, no algo que imponga el guardado.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EMPTY_TAB_DATA = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  loadIndexedDbState: async () => null,
  saveIndexedDbState: async () => {},
  getGamesAsTabData: async () => ({ ...EMPTY_TAB_DATA }),
  getLocalMeta: async () => null,
  mirrorTabDataToGames: async () => {},
  patchLocalMeta: async () => {},
}));

// La telemetría, fuera (ver `gameStampsFlow.test.ts`): el chunk perezoso de Firebase seguiría cargando con el
// test ya acabado.
vi.mock('../../src/model/repository/firebaseGateway', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/firebaseGateway')>()),
  trackAnalyticsEvent: async () => {},
}));

const { useGameListViewModel } = await import('../../src/viewmodel/useGameListViewModel');
const { flushLocalState } = await import('../../src/model/repository/localRepository');
type GameDraft = import('../../src/viewmodel/useGameListViewModel').GameDraft;

const BLANK_DRAFT: GameDraft = {
  name: '', genres: [], platforms: [], steamDeck: false, score: 3, grade: 60, years: [],
  strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: null, scored: false, review: '',
};

/** Borrador mínimo válido: nombre, un género y una plataforma (lo que exige `saveDraft`). */
function draftFor(name: string, extra: Partial<GameDraft> = {}): GameDraft {
  return { ...BLANK_DRAFT, name, genres: ['RPG'], platforms: ['Steam'], ...extra };
}

beforeEach(() => {
  vi.useFakeTimers({ now: Date.parse('2026-10-17T12:00:00Z'), toFake: ['Date'] });
  flushLocalState();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Monta el view-model con un juego en curso ya guardado y devuelve su id. */
async function mountWithPlaying(years: number[]) {
  const view = renderHook(() => useGameListViewModel());
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  await act(async () => { view.result.current.saveDraft('e', draftFor('Hollow Knight', { years })); });
  const playing = view.result.current.data.e.find((game) => game.name === 'Hollow Knight');
  if (!playing) throw new Error('No se guardó el juego en curso');
  return { ...view, id: playing.id };
}

describe('en curso → completados', () => {
  it('propone el año en curso en un juego sin años', async () => {
    const { result, id } = await mountWithPlaying([]);
    act(() => { result.current.migrateGame('e', id, 'c'); });
    expect(result.current.draft.years).toEqual([2026]);
  });

  it('añade el año en curso a los que ya traía, sin repetirlo y en orden', async () => {
    const { result, id } = await mountWithPlaying([2027, 2019]);
    act(() => { result.current.migrateGame('e', id, 'c'); });
    expect(result.current.draft.years).toEqual([2019, 2026, 2027]);
  });

  it('no lo duplica si ya estaba', async () => {
    const { result, id } = await mountWithPlaying([2026]);
    act(() => { result.current.migrateGame('e', id, 'c'); });
    expect(result.current.draft.years).toEqual([2026]);
  });

  it('se puede quitar antes de guardar', async () => {
    const { result, id } = await mountWithPlaying([2019]);
    act(() => { result.current.migrateGame('e', id, 'c'); });
    await act(async () => { result.current.saveDraft('c', { ...result.current.draft, years: [2019] }); });
    expect(result.current.data.c.find((game) => game.id === id)?.years).toEqual([2019]);
  });
});
