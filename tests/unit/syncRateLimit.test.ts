import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cargarMotorDeSync } from '../../src/model/repository/syncEngine';
import type { TabData } from '../../src/model/types/game';

/**
 * GITHUB LIMITANDO LAS PETICIONES (docs/plan-degradacion-servicios.md, fase 5).
 *
 * Antes: el texto crudo de GitHub, en inglés y en rojo, la insignia en «Error de sincronización» (que tapaba
 * «Cambios sin subir») y un aviso por cada ciclo. Ahora: un mensaje propio en tono de aviso, la insignia en «en
 * pausa», un solo aviso por espera, y todo se retira al volver a sincronizar bien.
 */

const { readGist, writeGist } = vi.hoisted(() => ({
  readGist: vi.fn(async () => ({ notModified: true }) as { notModified: boolean }),
  writeGist: vi.fn(async () => ({ etag: 'etag-written', updatedAt: 5_000 })),
}));

let syncConfig: { token: string; gistId: string; etag: string | null; lastRemoteUpdatedAt: number } | null = null;

/* LA CONFIGURACIÓN SE MOCKEA EN SU MÓDULO, no en la fachada: desde que el motor de sync es perezoso
   (`syncEngine`), el view-model lee `getSyncConfig` de `gistConfigRepository` directamente — es lo único
   que necesita de forma síncrona en cada render. */
vi.mock('../../src/model/repository/gistConfigRepository', () => ({
  getSyncConfig: () => syncConfig,
  saveSyncConfig: vi.fn(),
  clearSyncConfig: vi.fn(),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  subscribeSyncConfig: () => () => {},
}));

vi.mock('../../src/model/repository/githubHttp', () => ({
  getRetryAfterMs: (error: { retryAfterMs?: number }) => error?.retryAfterMs || 0,
  isDeferredNetworkError: () => false,
  isGithubRateLimited: (error: { rateLimited?: boolean }) => error?.rateLimited === true,
}));

vi.mock('../../src/model/repository/gistRepository', () => ({
  readGist,
  writeGist,
  getSyncConfig: () => syncConfig,
  saveSyncConfig: vi.fn(),
  clearSyncConfig: vi.fn(),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  // Aviso de cambios en la configuración: el view-model se suscribe para no leer localStorage en cada render.
  subscribeSyncConfig: () => () => {},
  createGist: vi.fn(),
  findGamesGistId: vi.fn(async () => ''),
  whoAmI: vi.fn(async () => {}),
  getRetryAfterMs: () => 0,
  isDeferredNetworkError: () => false,
}));

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  // El cromo pregunta si hay sesión guardada para decidir si refresca la entrada de premios
  // (`usePremiosVisible`). Sin esto, montar la aplicación en un test revienta con «No export is defined».
  hasStoredAuthSession: () => false,
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
import { clearDirty } from '../../src/model/repository/syncStateRepository';
import { resetSyncState } from '../../src/model/repository/syncMachineRepository';


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


beforeEach(async () => {
  await cargarMotorDeSync();
  localStorage.clear();
  clearDirty();
  resetSyncState();
  readGist.mockReset();
  writeGist.mockClear();
  syncConfig = { token: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaa', gistId: 'abcdef1234567890', etag: 'W/"e"', lastRemoteUpdatedAt: 0 };
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  resetSyncState();
});

const LIMITADO = Object.assign(new Error('Read failed: 403 - API rate limit exceeded for user ID 1.'), {
  status: 403,
  rateLimited: true,
  retryAfterMs: 10 * 60_000,
});

describe('sincronización con GitHub limitando', () => {
  it('mensaje propio en aviso, insignia en pausa y un solo aviso por espera', async () => {
    readGist.mockRejectedValue(LIMITADO);
    const { result, deps } = mountSync();

    await act(async () => { await result.current.syncNow(); });
    await act(async () => { await result.current.syncNow(); });

    expect(result.current.statusMessage).toMatch(/GitHub está limitando/);
    expect(result.current.statusMessage).not.toMatch(/rate limit/i);
    expect(result.current.syncPaused).toBe(true);
    const avisos = deps.onNotice.mock.calls.filter(([, text]) => /GitHub está limitando/.test(String(text)));
    expect(avisos).toHaveLength(1);
    expect(avisos[0][0]).toBe('warn');
    expect(deps.onNotice.mock.calls.some(([kind]) => kind === 'err')).toBe(false);
  });

  it('al volver a sincronizar bien se retiran el mensaje y la pausa', async () => {
    readGist.mockRejectedValueOnce(LIMITADO);
    const { result } = mountSync();
    await act(async () => { await result.current.syncNow(); });
    expect(result.current.syncPaused).toBe(true);

    readGist.mockResolvedValue({ notModified: true });
    await act(async () => { await result.current.syncNow(); });

    await waitFor(() => expect(result.current.syncPaused).toBe(false));
    expect(result.current.statusMessage).toBe('');
  });
});
