import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PremiosCategory } from '../../src/model/types/premios';

// Se captura lo que se manda a Firestore para poder afirmar sobre ello.
const state: {
  sets: Array<{ path: string; data: Record<string, unknown> }>;
  updates: Array<{ path: string; data: Record<string, unknown> }>;
  deletes: string[];
  commits: number;
  stored: Record<string, unknown> | null;
} = { sets: [], updates: [], deletes: [], commits: 0, stored: null };

vi.mock('../../src/model/repository/firebaseClient', () => ({
  initializeFirebaseServices: async () => ({ firestore: {}, auth: {}, app: {}, analytics: null }),
}));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collectionName: string, id: string) => ({ path: `${collectionName}/${id}` }),
  getDoc: async (ref: { path: string }) => ({
    exists: () => state.stored !== null,
    data: () => state.stored,
    ref,
  }),
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    state.sets.push({ path: ref.path, data });
    state.stored = data;
  },
  deleteDoc: async (ref: { path: string }) => {
    state.deletes.push(ref.path);
    state.stored = null;
  },
  deleteField: () => '__deleted__',
  writeBatch: () => ({
    update: (ref: { path: string }, data: Record<string, unknown>) => state.updates.push({ path: ref.path, data }),
    commit: async () => {
      state.commits += 1;
    },
  }),
}));

const { clearLegacyWinnerField, clearWinners, fetchWinners, saveWinners } = await import(
  '../../src/model/repository/premios/premiosWinnersRepository'
);

const category = (id: string, extra: Partial<PremiosCategory> = {}): PremiosCategory => ({
  id,
  title: { es: 'Categoría' },
  options: [{ id: `${id}_option_0`, name: 'A' }],
  ...extra,
});

beforeEach(() => {
  state.sets = [];
  state.updates = [];
  state.deletes = [];
  state.commits = 0;
  state.stored = null;
});

describe('saveWinners', () => {
  // EL MOTIVO DEL CAMBIO: la colección de categorías es de lectura abierta, así que un ganador guardado ahí es un
  // ganador consultable por cualquiera antes de anunciarlo.
  it('escribe los ganadores en el documento de administración, no en las categorías', async () => {
    const result = await saveWinners([category('c1'), category('c2')], { c1: 'c1_option_0' });

    expect(state.sets).toHaveLength(1);
    expect(state.sets[0].path).toBe('premiosAdmin/winners');
    expect(state.sets[0].data.winners).toEqual({ c1: 'c1_option_0' });
    expect(result.saved).toBe(1);
    expect(state.updates.filter((u) => u.path.startsWith('premiosCategories/'))).toHaveLength(0);
  });

  it('omite las categorías sin nominados', async () => {
    const sinOpciones = { id: 'c3', title: '', options: [] } as PremiosCategory;
    const result = await saveWinners([category('c1'), sinOpciones], { c1: 'c1_option_0' });

    expect(result.skipped).toBe(1);
    expect(state.sets[0].data.winners).not.toHaveProperty('c3');
  });

  it('no guarda las categorías que quedaron sin ganador', async () => {
    await saveWinners([category('c1'), category('c2')], { c1: 'c1_option_0' });
    expect(state.sets[0].data.winners).toEqual({ c1: 'c1_option_0' });
  });

  it('MIGRA: borra el campo del ganador de las categorías que aún lo tengan', async () => {
    const result = await saveWinners([category('c1', { winner: 'c1_option_0' }), category('c2')], {
      c1: 'c1_option_0',
    });

    expect(result.migrated).toBe(1);
    const limpieza = state.updates.find((u) => u.path === 'premiosCategories/c1');
    expect(limpieza?.data.winner).toBe('__deleted__');
    expect(limpieza?.data.winnerSelectedAt).toBe('__deleted__');
  });

  it('no escribe en las categorías si ya están migradas', async () => {
    const result = await saveWinners([category('c1')], { c1: 'c1_option_0' });
    expect(result.migrated).toBe(0);
    expect(state.commits).toBe(0);
  });
});

describe('fetchWinners', () => {
  it('lee el documento de ganadores cuando existe', async () => {
    state.stored = { winners: { c1: 'c1_option_0' }, updatedAt: 'x' };
    await expect(fetchWinners([category('c1')])).resolves.toEqual({ c1: 'c1_option_0' });
  });

  it('cae al campo de la categoría si el documento no existe todavía', async () => {
    await expect(fetchWinners([category('c1', { winner: 'c1_option_0' }), category('c2')])).resolves.toEqual({
      c1: 'c1_option_0',
    });
  });

  it('devuelve un mapa vacío si no hay ni documento ni datos antiguos', async () => {
    await expect(fetchWinners([category('c1')])).resolves.toEqual({});
  });
});

describe('clearWinners', () => {
  it('borra el documento de ganadores', async () => {
    await clearWinners();
    expect(state.deletes).toEqual(['premiosAdmin/winners']);
  });
});

describe('clearLegacyWinnerField', () => {
  it('es idempotente: sin datos antiguos no escribe nada', async () => {
    await expect(clearLegacyWinnerField([category('c1')])).resolves.toBe(0);
    expect(state.commits).toBe(0);
  });
});
