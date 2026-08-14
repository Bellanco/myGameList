// El recorrido REAL de un juego por las listas, ejercitado sobre el view-model: es lo que de verdad rellena los
// sellos. Los tests de `gameStamps` cubren las funciones puras; esto comprueba que están enchufadas en los tres
// caminos por los que un juego cambia de lista (formulario, movimiento directo y alta desde un perfil ajeno).
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameItem } from '../../src/model/types/game';

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
const { flushLocalState } = await import('../../src/model/repository/localRepository');
type GameDraft = import('../../src/viewmodel/useGameListViewModel').GameDraft;

/** Borrador vacío equivalente al del formulario (allí es privado; aquí se declara para no exportarlo solo por un test). */
const BLANK_DRAFT: GameDraft = {
  name: '', genres: [], platforms: [], steamDeck: false, score: 3, grade: 60, years: [],
  strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: null, scored: false, review: '',
};

beforeEach(() => {
  // El repositorio local difiere la escritura y guarda lo pendiente en memoria de MÓDULO, que sobrevive entre
  // tests: sin volcarlo antes, cada test arrancaría con la biblioteca del anterior.
  flushLocalState();
  localStorage.clear();
});

/** El juego por su nombre: los índices de lista no son estables entre pasos. */
function byName(list: readonly GameItem[], name: string): GameItem {
  const found = list.find((game) => game.name === name);
  if (!found) throw new Error(`No está "${name}" en la lista`);
  return found;
}

/** Borrador mínimo válido: nombre, un género y una plataforma (lo que exige `saveDraft`). */
function draftFor(name: string, extra: Partial<GameDraft> = {}): GameDraft {
  return { ...BLANK_DRAFT, name, genres: ['RPG'], platforms: ['Steam'], ...extra };
}

describe('sellos a lo largo de la vida de un juego', () => {
  it('acumula una marca por lista sin pisar las anteriores', async () => {
    const { result } = renderHook(() => useGameListViewModel());

    // 1) Entra en próximos desde el formulario.
    await act(async () => { result.current.saveDraft('p', draftFor('Hollow Knight')); });
    const created = byName(result.current.data.p, 'Hollow Knight');
    expect(Object.keys(created.enteredAt ?? {})).toEqual(['p']);

    // 2) Pasa a "en curso" por el camino directo (el de la ruleta), que no abre el formulario.
    await act(async () => { result.current.moveGameToTab('p', created.id, 'e'); });
    const playing = byName(result.current.data.e, 'Hollow Knight');
    expect(playing.enteredAt?.p).toBe(created.enteredAt?.p);
    expect(playing.enteredAt?.e).toBeGreaterThan(0);

    // 3) Lo termina: el formulario guarda en `c` arrastrando el historial de la lista de origen.
    await act(async () => {
      result.current.saveDraft('c', draftFor('Hollow Knight', {
        id: playing.id, sourceTab: 'e', sourceId: playing.id, years: [2026], score: 5,
      }));
    });
    const done = byName(result.current.data.c, 'Hollow Knight');
    expect(done.enteredAt?.p).toBe(created.enteredAt?.p);
    expect(done.enteredAt?.e).toBe(playing.enteredAt?.e);
    expect(done.enteredAt?.c).toBeGreaterThan(0);
  });

  it('editar un juego que ya está en la lista no reescribe su sello', async () => {
    const { result } = renderHook(() => useGameListViewModel());
    await act(async () => { result.current.saveDraft('p', draftFor('Celeste')); });
    const first = byName(result.current.data.p, 'Celeste');

    await act(async () => {
      result.current.saveDraft('p', draftFor('Celeste', { id: first.id, review: 'Buenísimo' }));
    });
    expect(byName(result.current.data.p, 'Celeste').enteredAt?.p).toBe(first.enteredAt?.p);
  });

  it('un alta desde el perfil de otra persona también queda sellada', async () => {
    const { result } = renderHook(() => useGameListViewModel());
    await act(async () => {
      result.current.addGameToProximos({ name: 'Outer Wilds', genres: ['Aventura'], platforms: ['Steam'] });
    });
    expect(byName(result.current.data.p, 'Outer Wilds').enteredAt?.p).toBeGreaterThan(0);
  });

  it('la fecha de la nota se estrena al puntuar y no la mueve reescribir la reseña', async () => {
    const { result } = renderHook(() => useGameListViewModel());
    await act(async () => {
      result.current.saveDraft('c', draftFor('Bloodborne', { years: [2026], score: 4 }));
    });
    const scored = byName(result.current.data.c, 'Bloodborne');
    expect(scored.gradedAt).toBeGreaterThan(0);

    await act(async () => {
      result.current.saveDraft('c', draftFor('Bloodborne', {
        id: scored.id, years: [2026], score: 4, grade: scored.grade, review: 'Otra vuelta de tuerca',
      }));
    });
    expect(byName(result.current.data.c, 'Bloodborne').gradedAt).toBe(scored.gradedAt);
  });

  // Regresión: `existing` solo mira la lista DESTINO, así que al mover un juego con reseña el texto anterior se
  // leía como vacío y la fecha de la reseña se estrenaba en cada movimiento — justo lo que ese campo evita.
  it('mover de lista NO mueve la fecha de la reseña', async () => {
    const { result } = renderHook(() => useGameListViewModel());
    await act(async () => {
      result.current.saveDraft('e', draftFor('Disco Elysium', { review: 'Reseña escrita hace tiempo' }));
    });
    const playing = byName(result.current.data.e, 'Disco Elysium');
    expect(playing.reviewedAt).toBeGreaterThan(0);

    await act(async () => {
      result.current.saveDraft('c', draftFor('Disco Elysium', {
        id: playing.id, sourceTab: 'e', sourceId: playing.id, years: [2026], score: 5,
        review: 'Reseña escrita hace tiempo',
      }));
    });
    expect(byName(result.current.data.c, 'Disco Elysium').reviewedAt).toBe(playing.reviewedAt);
  });
});
