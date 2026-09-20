import { beforeEach, describe, expect, it, vi } from 'vitest';

const state: {
  sets: Array<{ path: string; data: Record<string, unknown>; options: Record<string, unknown> }>;
  updates: Array<{ path: string; data: Record<string, unknown> }>;
  deletes: string[];
  commits: number;
} = { sets: [], updates: [], deletes: [], commits: 0 };

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: async () => ({ firestore: {}, auth: {}, app: {}, analytics: null }),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}`, id }),
  collection: (_db: unknown, name: string) => ({ name }),
  getDocs: async () => ({ docs: [] }),
  setDoc: async (ref: { path: string }, data: Record<string, unknown>, options: Record<string, unknown>) => {
    state.sets.push({ path: ref.path, data, options });
  },
  deleteDoc: async (ref: { path: string }) => {
    state.deletes.push(ref.path);
  },
  writeBatch: () => ({
    update: (ref: { path: string }, data: Record<string, unknown>) => state.updates.push({ path: ref.path, data }),
    commit: async () => {
      state.commits += 1;
    },
  }),
}));

const { deleteCategory, reorderCategories, saveCategory, sortCategoriesByOrder } = await import(
  '../../src/model/repository/premios/premiosCategoriesRepository'
);

beforeEach(() => {
  state.sets = [];
  state.updates = [];
  state.deletes = [];
  state.commits = 0;
});

describe('saveCategory', () => {
  it('crea una categoría con su orden, su fecha y activa', async () => {
    const { docId, isNew } = await saveCategory({
      titleEs: 'Juego del año',
      titleEn: 'Game of the year',
      options: [{ value: 'Elden Ring' }],
      weight: 2,
      orderIndex: 3,
    });

    expect(isNew).toBe(true);
    const escrito = state.sets[0];
    expect(escrito.path).toBe(`premiosCategories/${docId}`);
    expect(escrito.data.orderIndex).toBe(3);
    expect(escrito.data.isActive).toBe(true);
    expect(escrito.data.createdAt).toBeTruthy();
  });

  // Sin esto, guardar una categoría le borraba su orden: con `merge: false` los campos ausentes desaparecen.
  it('al EDITAR no toca el orden, la fecha de creación ni el estado', async () => {
    await saveCategory({
      docId: 'cat-1',
      titleEs: 'Arte',
      options: [{ id: 'cat-1_option_0', value: 'Hades' }],
      weight: 1,
    });

    const escrito = state.sets[0];
    expect(escrito.options).toEqual({ merge: true });
    expect(escrito.data).not.toHaveProperty('orderIndex');
    expect(escrito.data).not.toHaveProperty('createdAt');
    expect(escrito.data).not.toHaveProperty('isActive');
  });

  it('usa el título español cuando el inglés va vacío', async () => {
    await saveCategory({ docId: 'c', titleEs: 'Arte', titleEn: '  ', options: [], weight: 1 });
    expect(state.sets[0].data.title).toEqual({ es: 'Arte', en: 'Arte' });
  });

  it('conserva los ids existentes y da uno único a los nuevos', async () => {
    await saveCategory({
      docId: 'cat-1',
      titleEs: 'Arte',
      options: [
        { id: 'cat-1_option_0', value: 'Hades' },
        { value: 'Balatro' },
      ],
      weight: 1,
    });

    const options = state.sets[0].data.options as Array<{ id: string; name: string }>;
    expect(options[0].id).toBe('cat-1_option_0');
    expect(options[1].id).not.toBe('cat-1_option_0');
    expect(new Set(options.map((o) => o.id)).size).toBe(2);
  });

  it('mantiene el espejo plano de ids', async () => {
    await saveCategory({
      docId: 'cat-1',
      titleEs: 'Arte',
      options: [{ id: 'a', value: 'A' }, { id: 'b', value: 'B' }],
      weight: 1,
    });

    expect(state.sets[0].data.optionIds).toEqual(['a', 'b']);
  });
});

describe('deleteCategory', () => {
  it('borra el documento cuando no es la última', async () => {
    const result = await deleteCategory('cat-1', false);
    expect(result.kept).toBe(false);
    expect(state.deletes).toEqual(['premiosCategories/cat-1']);
  });

  // Una colección sin documentos deja de existir en Firestore, y con ella se va su rastro en la consola.
  it('conserva la última como placeholder en vez de borrarla', async () => {
    const result = await deleteCategory('cat-1', true);

    expect(result.kept).toBe(true);
    expect(state.deletes).toEqual([]);
    expect(state.sets[0].data.isPlaceholder).toBe(true);
    expect(state.sets[0].data.options).toEqual([]);
  });
});

describe('reorderCategories', () => {
  it('reasigna un orden contiguo desde cero en un único lote', async () => {
    const result = await reorderCategories([{ id: 'c3' }, { id: 'c1' }, { id: 'c2' }]);

    expect(result.reordered).toBe(3);
    expect(state.commits).toBe(1);
    expect(state.updates.map((u) => [u.path, u.data.orderIndex])).toEqual([
      ['premiosCategories/c3', 0],
      ['premiosCategories/c1', 1],
      ['premiosCategories/c2', 2],
    ]);
  });
});

describe('sortCategoriesByOrder', () => {
  it('ordena de menor a mayor y trata la ausencia de orden como cero', () => {
    const ordenadas = sortCategoriesByOrder([{ orderIndex: 2 }, {}, { orderIndex: 1 }]);
    expect(ordenadas.map((c) => c.orderIndex ?? 0)).toEqual([0, 1, 2]);
  });

  it('devuelve una lista vacía si no le llega una', () => {
    expect(sortCategoriesByOrder(null as unknown as [])).toEqual([]);
  });
});
