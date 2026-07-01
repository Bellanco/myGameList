import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameItem, TabData } from '../../src/model/types/game';

/**
 * Regresión: una edición del usuario guardada MIENTRAS un ciclo de sync está en vuelo (esperando la red)
 * no debe perderse. El bug original: el sync leía el estado local por una foto del render (`() => vm.data`),
 * así que un ciclo iniciado antes de la edición fusionaba/persistía la versión vieja, revertía la edición y
 * limpiaba dirty. El fix: getData/getMeta vía ref (siempre el último estado) + reconcileWithLocal antes de
 * persistir + clearDirtyIfUnchanged (no limpiar dirty si llegó una edición durante la escritura).
 */

// Deferred controlable para simular una lectura de red "en vuelo".
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// --- Estado del stub de red, mutable entre pasos del test ---
let pendingConditionalRead: { promise: Promise<void>; resolve: (v: void) => void } | null = null;
let remoteSnapshot: TabData;
const writeGistMock = vi.fn(async (_t: string, _g: string, _payload: TabData) => ({ etag: 'etag-written', updatedAt: 5_000 }));

vi.mock('../../src/model/repository/gistRepository', () => ({
  // Lectura condicional (con etag): si hay una lectura "en vuelo" armada, espera al gate y luego 304.
  // Lectura completa (etag null, la de pushDirtyWithMerge): devuelve el remoto ACTUAL (versión vieja).
  readGist: vi.fn(async (_token: string, _gistId: string, etag: string | null = null) => {
    if (etag === null) {
      return { notModified: false, data: JSON.parse(JSON.stringify(remoteSnapshot)) as TabData, etag: 'etag-remote' };
    }
    if (pendingConditionalRead) await pendingConditionalRead.promise;
    return { notModified: true, etag };
  }),
  writeGist: (...args: [string, string, TabData]) => writeGistMock(...args),
  getSyncConfig: () => ({ token: 'ghp_token', gistId: 'gist-1', etag: 'etag-remote', lastRemoteUpdatedAt: 1_000 }),
  saveSyncConfig: vi.fn(),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  clearSyncConfig: vi.fn(),
  createGist: vi.fn(),
  whoAmI: vi.fn(async () => {}),
  getRetryAfterMs: () => 0,
  isDeferredNetworkError: () => false,
}));

// Dependencias importadas pero no ejercitadas en esta ruta.
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  findSocialProfileByEmail: vi.fn(),
  getCurrentSocialAuthUser: vi.fn(),
  recoverGithubToken: vi.fn(),
  resolveStableProfileId: vi.fn(),
  signInWithGoogle: vi.fn(),
}));
vi.mock('../../src/model/migration/legacyTokenRecovery', () => ({
  readLegacyPlaintextToken: vi.fn(() => null),
}));

import { useSyncViewModel } from '../../src/viewmodel/useSyncViewModel';
import { clearDirty, clearDirtyIfUnchanged, loadSyncDirtyState, markDirty } from '../../src/model/repository/syncStateRepository';
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

afterEach(() => {
  vi.clearAllMocks();
  pendingConditionalRead = null;
  localStorage.clear();
  transitionTo('idle', { errorCount: 0, pendingAction: null });
});

beforeEach(() => {
  localStorage.clear();
  clearDirty();
  transitionTo('idle', { errorCount: 0, pendingAction: null });
});

describe('edición concurrente con un ciclo de sync en vuelo', () => {
  it('una edición guardada durante un readGist en vuelo sobrevive y se sube (no revierte)', async () => {
    // Remoto: el juego sigue en "En curso" (e), sin horas ni estrellas, _ts viejo.
    remoteSnapshot = { ...emptyTabData(), e: [makeGame({ id: 1, _ts: 1_000, score: 0, hours: null })] };

    // Estado local mutable, expuesto vía "refs" como hace App.tsx.
    const local: { data: TabData; meta: { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number } } = {
      data: { ...emptyTabData(), e: [makeGame({ id: 1, _ts: 1_000, score: 0, hours: null })] },
      meta: { updatedAt: 1_000, etag: 'etag-remote', lastRemoteUpdatedAt: 1_000 },
    };

    const deps = {
      getData: () => local.data,
      getMeta: () => local.meta,
      setData: (next: TabData) => {
        local.data = next;
      },
      setMeta: (m: { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number }) => {
        local.meta = m;
      },
      onNotice: vi.fn(),
      persist: (next: TabData, m?: { updatedAt: number; etag: string | null; lastRemoteUpdatedAt: number }) => {
        local.data = next;
        if (m) local.meta = { ...local.meta, ...m };
      },
    };

    const { result, unmount } = renderHook(() => useSyncViewModel(deps));

    // Deja que el initializeSync del montaje (304, sin dirty) se asiente en idle.
    await waitFor(() => expect(result.current.connectedGistId).toBe('gist-1'));
    await act(async () => {
      await Promise.resolve();
    });

    // Arma una lectura condicional "en vuelo" y lanza syncNow SIN await.
    pendingConditionalRead = deferred<void>();
    let syncDone!: Promise<void>;
    await act(async () => {
      syncDone = result.current.syncNow();
      await Promise.resolve();
    });

    // Mientras el readGist(etag) está bloqueado, el usuario completa el juego: lo mueve a "Completados" (c)
    // con estrellas y horas y un _ts nuevo, y marca dirty (como haría saveDraft → persist).
    local.data = {
      ...emptyTabData(),
      c: [makeGame({ id: 1, _ts: 4_000, score: 5, hours: 42, weaknesses: ['final flojo'], strengths: ['combate'] })],
    };
    markDirty();

    // Libera la lectura en vuelo (→ 304 → pushDirtyWithMerge) y espera a que termine el ciclo.
    await act(async () => {
      pendingConditionalRead!.resolve();
      await syncDone;
    });

    // La escritura al gist debe contener la edición: juego en "Completados" con horas/estrellas, no en "En curso".
    expect(writeGistMock).toHaveBeenCalled();
    const written = writeGistMock.mock.calls[writeGistMock.mock.calls.length - 1][2];
    expect(written.e).toHaveLength(0);
    expect(written.c).toHaveLength(1);
    expect(written.c[0]).toMatchObject({ id: 1, score: 5, hours: 42 });

    // El estado local persistido NO revierte: el juego sigue completado.
    expect(local.data.c.map((g) => g.id)).toEqual([1]);
    expect(local.data.e).toHaveLength(0);
    expect(local.data.c[0]).toMatchObject({ score: 5, hours: 42 });

    unmount();
  });
});

describe('clearDirtyIfUnchanged / markDirty', () => {
  it('markDirty avanza dirtyAt en cada edición aunque ya estuviese dirty', () => {
    markDirty();
    const first = loadSyncDirtyState().dirtyAt;
    // Fuerza un instante posterior sin depender del reloj real.
    const spy = vi.spyOn(Date, 'now').mockReturnValue(first + 10);
    markDirty();
    const second = loadSyncDirtyState().dirtyAt;
    spy.mockRestore();
    expect(second).toBeGreaterThan(first);
  });

  it('conserva dirty si llegó una edición nueva durante la escritura', () => {
    markDirty();
    const dirtyAtBefore = loadSyncDirtyState().dirtyAt;
    // Edición concurrente: dirtyAt avanza mientras el ciclo escribía.
    const spy = vi.spyOn(Date, 'now').mockReturnValue(dirtyAtBefore + 10);
    markDirty();
    spy.mockRestore();
    clearDirtyIfUnchanged(dirtyAtBefore);
    expect(loadSyncDirtyState().isDirty).toBe(true);
  });

  it('limpia dirty si no hubo ediciones nuevas durante la escritura', () => {
    markDirty();
    const dirtyAtBefore = loadSyncDirtyState().dirtyAt;
    clearDirtyIfUnchanged(dirtyAtBefore);
    expect(loadSyncDirtyState().isDirty).toBe(false);
  });
});
