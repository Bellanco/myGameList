import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';

/**
 * Regresión (D1): `connectSyncWithCredentials` era la ÚNICA de las cuatro rutas del ciclo CRDT que no sellaba
 * el meta (`setMeta`) ni pasaba por `persist(reconcileWithLocal(…))`. Las otras tres —`refreshRemote`,
 * `syncNow` e `initializeSync`— sí. De ahí dos fallos con la misma raíz:
 *
 *  1. Tras conectar contra un gist existente, el meta local se quedaba sin `etag` ni `lastRemoteUpdatedAt`, así
 *     que el siguiente `mergeCrdt` decidía con marcas viejas hasta que un refresco lo corregía.
 *  2. Esa ruta quedaba fuera de la protección de `reconcileWithLocal`, que existe justo para que una edición
 *     guardada mientras el ciclo espera a la red no la pise el `setData` final. Es el mismo fallo que ya se
 *     cerró en las otras tres (ver `syncEditDuringSyncRace.test.ts`).
 *
 * La ventana que se ejercita aquí es la de la ESCRITURA, no la de la lectura: `getData()` va por ref, así que
 * una edición anterior al merge ya se ve; la que se perdía es la que llega mientras `writeGist` está en vuelo.
 */

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// --- Estado del stub de red, mutable entre pasos del test ---
let remoteSnapshot: TabData;
/** Gate de la ESCRITURA: mientras esté armado, `writeGist` se queda en vuelo. */
let pendingWrite: { promise: Promise<void>; resolve: (v: void) => void } | null = null;

const writeGistMock = vi.fn(async (_t: string, _g: string, _payload: TabData) => {
  if (pendingWrite) await pendingWrite.promise;
  return { etag: 'etag-written', updatedAt: 5_000 };
});
const saveSyncConfigMock = vi.fn();

vi.mock('../../src/model/repository/gistRepository', () => ({
  readGist: vi.fn(async () => ({
    notModified: false,
    data: JSON.parse(JSON.stringify(remoteSnapshot)) as TabData,
    etag: 'etag-remote',
  })),
  writeGist: (...args: [string, string, TabData]) => writeGistMock(...args),
  // `null` a propósito: sin config guardada, el `initializeSync` del montaje sale por su primera guarda y no
  // mete ruido en el ciclo que se quiere observar. `connectSyncWithCredentials` no lee la config: la recibe.
  getSyncConfig: () => null,
  saveSyncConfig: (...args: unknown[]) => saveSyncConfigMock(...args),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  clearSyncConfig: vi.fn(),
  createGist: vi.fn(),
  findGamesGistId: vi.fn(async () => ''),
  whoAmI: vi.fn(async () => {}),
  getRetryAfterMs: () => 0,
  isDeferredNetworkError: () => false,
}));

// Dependencias importadas pero no ejercitadas en esta ruta.
vi.mock('../../src/model/repository/firebaseGateway', () => ({
  getCurrentSocialAuthUser: vi.fn(),
  getPrivateConfig: vi.fn(),
  recoverGithubToken: vi.fn(),
  resolveOwnProfile: vi.fn(),
  resolveStableProfileId: vi.fn(),
  setAnalyticsUser: vi.fn(),
  setPrivateConfig: vi.fn(),
  signInWithGoogle: vi.fn(),
  trackAnalyticsEvent: vi.fn(),
}));
vi.mock('../../src/model/migration/legacyTokenRecovery', () => ({
  readLegacyPlaintextToken: vi.fn(() => null),
}));

import { useSyncViewModel } from '../../src/viewmodel/useSyncViewModel';
import { clearDirty, markDirty } from '../../src/model/repository/syncStateRepository';
import { transitionTo } from '../../src/model/repository/syncMachineRepository';

function makeGame(over: Partial<GameItem>): GameItem {
  return {
    id: 1,
    _ts: 1_000,
    name: 'Elden Ring',
    genres: ['rpg'],
    platforms: ['pc'],
    strengths: [],
    weaknesses: [],
    reasons: [],
    years: [],
    steamDeck: false,
    replayable: false,
    retry: false,
    review: '',
    score: 0,
    hours: null,
    listedAt: 1_000,
    ...over,
  } as GameItem;
}

function emptyTabData(): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1_000 };
}

type Meta = { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number };

/** Monta el hook con un estado local mutable expuesto por refs, igual que hace `App.tsx`. */
function mountWithLocalState(initial: { data: TabData; meta: Meta }) {
  const local = { ...initial };
  const deps = {
    getData: () => local.data,
    getMeta: () => local.meta,
    setData: (next: TabData) => {
      local.data = next;
    },
    setMeta: (m: Meta) => {
      local.meta = m;
    },
    onNotice: vi.fn(),
    persist: (next: TabData, m?: Meta) => {
      local.data = next;
      if (m) local.meta = { ...local.meta, ...m };
    },
  };
  return { local, deps, ...renderHook(() => useSyncViewModel(deps)) };
}

beforeEach(() => {
  localStorage.clear();
  clearDirty();
  pendingWrite = null;
  transitionTo('idle', { errorCount: 0, pendingAction: null });
});

afterEach(() => {
  vi.clearAllMocks();
  pendingWrite = null;
  localStorage.clear();
  transitionTo('idle', { errorCount: 0, pendingAction: null });
});

describe('conexión inicial contra un gist existente', () => {
  it('sella el meta local con el etag y la marca del remoto', async () => {
    remoteSnapshot = { ...emptyTabData(), updatedAt: 3_000, e: [makeGame({ id: 1, _ts: 1_000 })] };

    const { local, result, unmount } = mountWithLocalState({
      data: { ...emptyTabData(), e: [makeGame({ id: 1, _ts: 1_000 })] },
      meta: { updatedAt: 1_000, etag: null, lastRemoteUpdatedAt: 0 },
    });

    await act(async () => {
      result.current.setToken('ghp_tokentokentokentoken');
      result.current.setGistId('gist-1');
    });
    await act(async () => {
      await result.current.connectSync();
    });

    // Sin esto, el siguiente mergeCrdt compara contra un `lastRemoteUpdatedAt` de 0 y un etag nulo.
    expect(local.meta.lastRemoteUpdatedAt).toBe(3_000);
    expect(local.meta.etag).not.toBeNull();

    unmount();
  });

  it('una edición guardada mientras la escritura está en vuelo no se revierte', async () => {
    // El remoto NO tiene el juego 2, así que el merge decide que hay que escribir y entramos en la ventana.
    remoteSnapshot = { ...emptyTabData(), updatedAt: 3_000, e: [makeGame({ id: 1, _ts: 1_000 })] };

    const { local, result, unmount } = mountWithLocalState({
      data: {
        ...emptyTabData(),
        e: [makeGame({ id: 1, _ts: 1_000 })],
        c: [makeGame({ id: 2, _ts: 2_000, name: 'Hollow Knight' })],
      },
      meta: { updatedAt: 2_000, etag: null, lastRemoteUpdatedAt: 0 },
    });

    await act(async () => {
      result.current.setToken('ghp_tokentokentokentoken');
      result.current.setGistId('gist-1');
    });

    // Arma el gate de la escritura y lanza la conexión SIN await.
    pendingWrite = deferred<void>();
    let connectDone!: Promise<void>;
    await act(async () => {
      connectDone = result.current.connectSync();
      await Promise.resolve();
    });

    // Mientras `writeGist` está bloqueado, el usuario completa el juego 1: lo mueve a "Completados" con
    // estrellas y horas y un `_ts` nuevo, y marca dirty (como haría saveDraft → persist).
    local.data = {
      ...emptyTabData(),
      c: [
        makeGame({ id: 1, _ts: 4_000, score: 5, hours: 42 }),
        makeGame({ id: 2, _ts: 2_000, name: 'Hollow Knight' }),
      ],
    };
    markDirty();

    await act(async () => {
      pendingWrite!.resolve();
      await connectDone;
    });

    // La edición sobrevive: el juego 1 sigue completado, con sus horas y estrellas.
    expect(local.data.e).toHaveLength(0);
    expect(local.data.c.map((g) => g.id).sort()).toEqual([1, 2]);
    expect(local.data.c.find((g) => g.id === 1)).toMatchObject({ score: 5, hours: 42 });

    unmount();
  });
});
