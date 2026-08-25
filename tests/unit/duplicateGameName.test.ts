// Último cortafuegos contra los duplicados por nombre: el formulario ya avisa mientras se escribe, pero el alta
// también llega desde la graduación de un importado, así que `saveDraft` tiene que rechazarla igual. Y tiene que
// hacerlo SIN estorbar a los dos casos en los que el nombre repetido es legítimo: editar el juego y moverlo de
// lista (ambos conservan el id, que es lo que los distingue de un alta nueva).
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

// La telemetría, fuera: `saveDraft`/`moveGameToTab` la disparan con `void`, y dejar que cargue de verdad el chunk
// perezoso de Firebase solo consigue que la carga siga en vuelo cuando el test ya ha acabado (en CI, con el
// entorno ya desmontado, ese import rechazaba y tumbaba la suite). Del gateway se conserva todo lo demás.
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
  flushLocalState();
  localStorage.clear();
});

/**
 * Monta el view-model y agota su lectura inicial (asíncrona) antes de tocar nada.
 */
async function mountViewModel() {
  const view = renderHook(() => useGameListViewModel());
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0); }); });
  return view;
}


describe('alta con un nombre que ya está en las listas', () => {
  it('rechaza el duplicado, avisa de dónde está y no toca la lista', async () => {
    const { result } = await mountViewModel();

    await act(async () => { result.current.saveDraft('p', draftFor('Hollow Knight')); });
    expect(result.current.data.p).toHaveLength(1);

    let saved: number | null | undefined;
    // Otra grafía y con espacios: la comparación normaliza igual que la importación y la ruleta.
    await act(async () => { saved = result.current.saveDraft('p', draftFor('  hollow knight ')); });

    // `saveDraft` devuelve el id guardado, así que un rechazo es `null` (nunca un id: el alta empieza en 1).
    expect(saved).toBeNull();
    expect(result.current.data.p).toHaveLength(1);
    expect(result.current.notice?.message).toBe('Ya tienes "Hollow Knight" en Próximos.');
  });

  it('el duplicado también se bloquea entre listas distintas', async () => {
    const { result } = await mountViewModel();

    await act(async () => { result.current.saveDraft('e', draftFor('Elden Ring')); });
    await act(async () => { result.current.saveDraft('c', draftFor('Elden Ring', { years: [2024] })); });

    expect(result.current.data.c).toHaveLength(0);
    expect(result.current.notice?.message).toBe('Ya tienes "Elden Ring" en En curso.');
  });

  it('editar un juego conservando su nombre sigue guardando', async () => {
    const { result } = await mountViewModel();

    await act(async () => { result.current.saveDraft('p', draftFor('Celeste')); });
    const created = result.current.data.p[0];

    let saved: number | null | undefined;
    await act(async () => {
      saved = result.current.saveDraft('p', draftFor('Celeste', { id: created.id, review: 'Precioso' }));
    });

    // Y devuelve el id del juego editado: es lo que `App` necesita para publicar la reseña sobre ESE juego.
    expect(saved).toBe(created.id);
    expect(result.current.data.p).toHaveLength(1);
    expect(result.current.data.p[0].review).toBe('Precioso');
  });

  it('mover un juego de lista desde el formulario sigue guardando', async () => {
    const { result } = await mountViewModel();

    await act(async () => { result.current.saveDraft('p', draftFor('Outer Wilds')); });
    const created = result.current.data.p[0];

    // Lo que hace `migrateGame`: mismo id, con la lista de origen marcada para retirarlo de ella.
    await act(async () => {
      result.current.saveDraft('c', draftFor('Outer Wilds', {
        id: created.id, sourceTab: 'p', sourceId: created.id, years: [2024],
      }));
    });

    expect(result.current.data.p).toHaveLength(0);
    expect(result.current.data.c).toHaveLength(1);
  });
});
