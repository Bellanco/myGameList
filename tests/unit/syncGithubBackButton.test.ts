import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabData } from '../../src/model/types/game';

/**
 * «CONECTAR CON GITHUB» Y EL BOTÓN DE ATRÁS. Conectar navega fuera de la app con el botón en «Conectando con
 * GitHub...». Si en GitHub se pulsa «atrás», Chrome y Safari devuelven la página desde su caché de ida y vuelta
 * (bfcache) con el estado de React intacto, y el botón se quedaba deshabilitado para siempre (reproducido el
 * 30-09-2026 con Chromium con ventana). Al restaurar llega `pageshow` con `persisted: true`: ahí se devuelve.
 */
const beginGithubOAuthMock = vi.fn();

vi.mock('../../src/model/repository/githubOAuthRepository', () => ({
  beginGithubOAuth: () => beginGithubOAuthMock(),
  completeGithubOAuth: vi.fn(),
  hasGithubOAuthRedirect: () => false,
}));
vi.mock('../../src/model/repository/githubOAuthChecks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/githubOAuthChecks')>()),
  hasGithubOAuthRedirect: () => false,
}));
vi.mock('../../src/model/repository/gistConfigRepository', () => ({
  getSyncConfig: () => null,
  saveSyncConfig: vi.fn(),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  subscribeSyncConfig: () => () => {},
  clearSyncConfig: vi.fn(),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => ({
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

import { useSyncViewModel } from '../../src/viewmodel/useSyncViewModel';

function montar() {
  const data: TabData = { c: [], v: [], e: [], p: [], deleted: [], updatedAt: 1 };
  const meta = { updatedAt: 1, etag: null, lastRemoteUpdatedAt: 0 };
  return renderHook(() =>
    useSyncViewModel({
      getData: () => data,
      getMeta: () => meta,
      setData: vi.fn(),
      setMeta: vi.fn(),
      onNotice: vi.fn(),
      persist: vi.fn(),
    }),
  );
}

/** Lo que dispara el navegador al devolver la página: desde bfcache (`persisted`) o recién cargada. */
function pageshow(persisted: boolean) {
  const event = new Event('pageshow') as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
}

beforeEach(() => {
  beginGithubOAuthMock.mockReset();
});

describe('conectar con GitHub y volver atrás', () => {
  it('al volver desde la caché de ida y vuelta, el botón deja de estar en «Conectando»', async () => {
    const { result } = montar();

    await act(async () => {
      await result.current.beginGithubLogin();
    });
    expect(beginGithubOAuthMock).toHaveBeenCalledTimes(1);
    expect(result.current.githubLoggingIn).toBe(true);

    act(() => pageshow(true));
    await waitFor(() => expect(result.current.githubLoggingIn).toBe(false));
  });

  // Solo lo toca la vuelta de ESTE botón: un `pageshow` normal (carga nueva) o uno sin haber salido no dicen nada.
  it('un `pageshow` que no es una restauración no toca nada', async () => {
    const { result } = montar();
    await act(async () => {
      await result.current.beginGithubLogin();
    });

    act(() => pageshow(false));
    expect(result.current.githubLoggingIn).toBe(true);
  });
});
