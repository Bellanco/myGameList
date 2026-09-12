import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabData } from '../../src/model/types/game';

/**
 * UNA EDICIÓN SE SUBE SOLA, SIN ESPERAR AL SIGUIENTE CICLO.
 *
 * Guardar un juego marcaba `dirty` y ahí acababa todo: la subida al gist esperaba a que ALGO disparase un ciclo
 * —el sondeo del minuto, o volver a la pestaña—. Quien editaba y cerraba antes se quedaba con el cambio solo en
 * su dispositivo hasta la siguiente vez que abriera la app; y en un segundo aparato, hasta entonces, no existía.
 * El badge, mientras tanto, seguía diciendo «Sincronizado».
 *
 * Lo que se fija aquí es el empujón con espera: se agrupa una ráfaga de ediciones en UNA escritura, no se pisa
 * con un ciclo en vuelo, y no se intenta siquiera cuando no hay sincronización configurada.
 */

const { readGist, writeGist } = vi.hoisted(() => ({
  readGist: vi.fn(async () => ({ notModified: true }) as { notModified: boolean }),
  writeGist: vi.fn(async () => ({ etag: 'etag-written', updatedAt: 5_000 })),
}));

let syncConfig: { token: string; gistId: string; etag: string | null; lastRemoteUpdatedAt: number } | null = null;

vi.mock('../../src/model/repository/gistRepository', () => ({
  readGist,
  writeGist,
  getSyncConfig: () => syncConfig,
  saveSyncConfig: vi.fn(),
  clearSyncConfig: vi.fn(),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  createGist: vi.fn(),
  findGamesGistId: vi.fn(async () => ''),
  whoAmI: vi.fn(async () => {}),
  getRetryAfterMs: () => 0,
  isDeferredNetworkError: () => false,
}));

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
import { acquireSyncLock, resetSyncState, transitionTo } from '../../src/model/repository/syncMachineRepository';

/** Espera del empujón automático (`DIRTY_PUSH_DELAY_MS` en el view-model), con margen. */
const MAS_QUE_LA_ESPERA = 10_000;

function emptyTabData(): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1_000 };
}

function mountSync() {
  const local = { data: emptyTabData(), meta: { updatedAt: 0, etag: null as string | null, lastRemoteUpdatedAt: 0 } };
  const deps = {
    getData: () => local.data,
    getMeta: () => local.meta,
    setData: (next: TabData) => {
      local.data = next;
    },
    setMeta: (m: typeof local.meta) => {
      local.meta = m;
    },
    onNotice: vi.fn(),
    persist: (next: TabData) => {
      local.data = next;
    },
  };
  return { local, deps, ...renderHook(() => useSyncViewModel(deps)) };
}

/** Lo que hace `persistInternal` cuando el usuario guarda: marca la pendiente y lo anuncia en la máquina. */
function simularEdicion(): void {
  markDirty();
  transitionTo('dirty');
}

beforeEach(() => {
  localStorage.clear();
  clearDirty();
  resetSyncState();
  readGist.mockClear();
  writeGist.mockClear();
  syncConfig = { token: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaa', gistId: 'abcdef1234567890', etag: 'W/"e"', lastRemoteUpdatedAt: 0 };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  resetSyncState();
});

describe('empujón automático de los cambios pendientes', () => {
  it('sube la edición sin esperar al ciclo siguiente', async () => {
    vi.useFakeTimers();
    mountSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    writeGist.mockClear();

    await act(async () => {
      simularEdicion();
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });

    expect(writeGist).toHaveBeenCalledTimes(1);
  });

  it('agrupa una ráfaga de ediciones en una sola escritura', async () => {
    vi.useFakeTimers();
    mountSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    writeGist.mockClear();

    await act(async () => {
      simularEdicion();
      await vi.advanceTimersByTimeAsync(1_000);
      simularEdicion();
      await vi.advanceTimersByTimeAsync(1_000);
      simularEdicion();
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });

    expect(writeGist).toHaveBeenCalledTimes(1);
  });

  it('no intenta nada si no hay sincronización configurada', async () => {
    vi.useFakeTimers();
    syncConfig = null;
    mountSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      simularEdicion();
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });

    expect(writeGist).not.toHaveBeenCalled();
  });

  it('no escribe si lo pendiente ya se subió por otra vía', async () => {
    vi.useFakeTimers();
    mountSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    writeGist.mockClear();

    await act(async () => {
      simularEdicion();
      clearDirty(); // lo empujó el ciclo del sondeo mientras esperábamos
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });

    expect(writeGist).not.toHaveBeenCalled();
  });

  it('no se solapa con un ciclo en vuelo, y lo reintenta cuando el candado se libera', async () => {
    vi.useFakeTimers();
    mountSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    writeGist.mockClear();

    const lock = acquireSyncLock(); // otro ciclo tiene el candado
    expect(lock).not.toBeNull();

    await act(async () => {
      simularEdicion();
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });
    expect(writeGist).not.toHaveBeenCalled();

    lock?.release();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });

    expect(writeGist).toHaveBeenCalledTimes(1);
  });

  it('la escritura del propio empujón no arma otro', async () => {
    vi.useFakeTimers();
    mountSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    writeGist.mockClear();

    await act(async () => {
      simularEdicion();
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });
    expect(writeGist).toHaveBeenCalledTimes(1);

    // El persist que cierra el empujón NO es una edición del usuario, así que no vuelve a marcar pendientes.
    // Si lo hiciera, esto sería una escritura al gist cada cinco segundos, para siempre.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(writeGist).toHaveBeenCalledTimes(1);
  });

  it('no deja el empujón programado tras desmontar', async () => {
    vi.useFakeTimers();
    const { unmount } = mountSync();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    writeGist.mockClear();

    await act(async () => {
      simularEdicion();
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAS_QUE_LA_ESPERA);
    });

    expect(writeGist).not.toHaveBeenCalled();
  });
});

describe('aviso de cambios sin subir', () => {
  it('lo enciende al editar y lo apaga cuando la escritura termina', async () => {
    const { result } = mountSync();
    await waitFor(() => expect(result.current.connectedGistId).toBe('abcdef1234567890'));
    expect(result.current.pendingUpload).toBe(false);

    await act(async () => {
      simularEdicion();
    });
    expect(result.current.pendingUpload).toBe(true);

    await act(async () => {
      await result.current.syncNow();
    });

    await waitFor(() => expect(result.current.pendingUpload).toBe(false));
  });

  it('no avisa de nada a quien no tiene sincronización configurada', async () => {
    syncConfig = null;
    const { result } = mountSync();
    await act(async () => {
      simularEdicion();
    });

    // Sin gist al que subir, «cambios sin subir» no significa nada: el badge dice «No sincronizado».
    expect(result.current.pendingUpload).toBe(false);
  });
});
