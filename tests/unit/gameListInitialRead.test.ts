import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// El estado de arranque se lee UNA vez por montaje, no en cada render.
//
// `loadLocalState` no es barato: `localStorage.getItem` + `JSON.parse` del payload completo + `migrateData` +
// una pasada de `normalizeData` (y la del hook encima). Con la biblioteca entera en juego, el coste es
// proporcional al número de juegos. Estaba escrito en el CUERPO del hook y como ARGUMENTO de `useState`, no
// como inicializador perezoso, así que se pagaba en cada render de la raíz —cada filtro, cada fila expandida,
// cada aviso, cada ciclo de sync— para tirar el resultado a la basura.
//
// La prueba mide llamadas, no tiempo: es lo único que no se vuelve inestable en CI.

const loadLocalState = vi.fn();

vi.mock('../../src/model/repository/localRepository', async () => {
  const actual = await vi.importActual<typeof import('../../src/model/repository/localRepository')>(
    '../../src/model/repository/localRepository',
  );
  return {
    ...actual,
    loadLocalState: (...args: []) => {
      loadLocalState(...args);
      return actual.loadLocalState(...args);
    },
  };
});

// El hook arranca una hidratación asíncrona desde IndexedDB que aquí no aporta nada (y jsdom no trae IDB).
const EMPTY_TAB_DATA = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  loadIndexedDbState: async () => null,
  saveIndexedDbState: async () => {},
  getGamesAsTabData: async () => ({ ...EMPTY_TAB_DATA }),
  getLocalMeta: async () => null,
  mirrorTabDataToGames: async () => {},
  patchLocalMeta: async () => {},
}));

const { useGameListViewModel } = await import('../../src/viewmodel/useGameListViewModel');

beforeEach(() => {
  localStorage.clear();
  loadLocalState.mockClear();
});

describe('lectura del estado de arranque', () => {
  it('no se repite en cada render', async () => {
    const { result, rerender } = renderHook(() => useGameListViewModel());

    const afterMount = loadLocalState.mock.calls.length;
    expect(afterMount).toBeGreaterThan(0); // se lee al montar

    rerender();
    rerender();
    rerender();

    expect(loadLocalState).toHaveBeenCalledTimes(afterMount);

    // Y tampoco tras un cambio de estado real (que es lo que de verdad re-renderiza en la app).
    await act(async () => {
      result.current.setExpandedId(1);
    });

    expect(loadLocalState).toHaveBeenCalledTimes(afterMount);
  });
});
