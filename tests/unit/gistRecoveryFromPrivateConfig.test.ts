import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabData } from '../../src/model/types/game';

/**
 * L1 — Recuperar la sincronización en un dispositivo nuevo ("Recuperar desde Google") leía el id del gist de
 * juegos del PERFIL PÚBLICO, que es legible por cualquier usuario autenticado: por eso ese campo estaba ahí.
 * Ahora se lee de `privateConfig` (solo el dueño) y el perfil queda como fallback legacy; cuando se usa el
 * fallback, el valor se re-siembra en privateConfig para que ese usuario no vuelva a depender del doc público.
 *
 * Esto es lo que hace que retirar el campo NO rompa a los usuarios actuales.
 */

const getPrivateConfigMock = vi.fn(async (): Promise<unknown> => null);
const setPrivateConfigMock = vi.fn(async () => {});
const resolveOwnProfileMock = vi.fn(async (): Promise<unknown> => null);
const recoverGithubTokenMock = vi.fn(async (): Promise<string | null> => 'ghp_recovered');

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getCurrentSocialAuthUser: vi.fn(async () => ({ uid: 'uid-1', email: 'yo@example.com', displayName: 'Yo', photoURL: '' })),
  signInWithGoogle: vi.fn(),
  resolveStableProfileId: vi.fn(async () => 'pid-1'),
  setAnalyticsUser: vi.fn(async () => {}),
  trackAnalyticsEvent: vi.fn(async () => {}),
  getPrivateConfig: (...args: unknown[]) => getPrivateConfigMock(...(args as [])),
  setPrivateConfig: (...args: unknown[]) => setPrivateConfigMock(...(args as [])),
  resolveOwnProfile: (...args: unknown[]) => resolveOwnProfileMock(...(args as [])),
  recoverGithubToken: (...args: unknown[]) => recoverGithubTokenMock(...(args as [])),
}));

vi.mock('../../src/model/repository/gistRepository', () => ({
  readGist: vi.fn(async () => ({ notModified: true, etag: 'etag' })),
  writeGist: vi.fn(async () => ({ etag: 'etag', updatedAt: 1 })),
  getSyncConfig: () => null,
  saveSyncConfig: vi.fn(),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  clearSyncConfig: vi.fn(),
  createGist: vi.fn(),
  findGamesGistId: vi.fn(async () => ''),
  whoAmI: vi.fn(async () => {}),
  getRetryAfterMs: () => 0,
  isDeferredNetworkError: () => false,
}));

import { useSyncViewModel } from '../../src/viewmodel/useSyncViewModel';

function emptyTabData(): TabData {
  return { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 };
}

function renderSync() {
  const meta = { updatedAt: 0, etag: null as string | null, lastRemoteUpdatedAt: 0 };
  return renderHook(() =>
    useSyncViewModel({
      getData: () => emptyTabData(),
      setData: () => {},
      getMeta: () => meta,
      setMeta: () => {},
      onNotice: () => {},
      persist: () => {},
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPrivateConfigMock.mockResolvedValue(null);
  resolveOwnProfileMock.mockResolvedValue(null);
  recoverGithubTokenMock.mockResolvedValue('ghp_recovered');
});

describe('recuperación del gist de juegos tras iniciar sesión con Google', () => {
  it('prefiere privateConfig (owner-only) y no necesita leer el perfil público', async () => {
    getPrivateConfigMock.mockResolvedValue({ gamesGistId: 'games-privado' });

    const { result } = renderSync();
    await act(async () => {
      await result.current.recoverGistIdFromGoogle();
    });

    await waitFor(() => expect(result.current.gistId).toBe('games-privado'));
    expect(resolveOwnProfileMock).not.toHaveBeenCalled();
    expect(setPrivateConfigMock).not.toHaveBeenCalled(); // ya estaba: no hay nada que re-sembrar
  });

  it('sin privateConfig cae al perfil legacy y RE-SIEMBRA el id para no volver a depender del doc público', async () => {
    getPrivateConfigMock.mockResolvedValue(null);
    resolveOwnProfileMock.mockResolvedValue({ gamesGistId: 'games-legacy', githubToken: '' });

    const { result } = renderSync();
    await act(async () => {
      await result.current.recoverGistIdFromGoogle();
    });

    await waitFor(() => expect(result.current.gistId).toBe('games-legacy'));
    expect(setPrivateConfigMock).toHaveBeenCalledWith('uid-1', { gamesGistId: 'games-legacy' });
  });

  it('sin ninguna de las dos fuentes, avisa en vez de dejar el estado a medias', async () => {
    const { result } = renderSync();
    await act(async () => {
      await result.current.recoverGistIdFromGoogle();
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.gistId).toBe('');
  });
});
