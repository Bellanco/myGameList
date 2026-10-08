import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EL HUB SOCIAL SIGUE LA SESIÓN, NO SOLO LA LEE AL ABRIRSE (08-10-2026).
 *
 * La apertura lee el usuario una vez. Si el hub se montaba justo durante un parpadeo de la sesión —otra pestaña
 * arrancando—, se quedaba con «nadie» y la pasarela pedía identificarse hasta volver a montar el hub, aunque la sesión
 * hubiera vuelto un segundo después.
 */
const { auth, lectura } = vi.hoisted(() => ({
  auth: { cb: null as null | ((user: unknown) => void) },
  lectura: { user: null as unknown },
}));

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  subscribeSocialAuth: (cb: (user: unknown) => void) => {
    auth.cb = cb;
    return () => {};
  },
}));
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getCurrentSocialAuthUser: async () => lectura.user,
  getPrivateConfig: async () => null,
  resolveOwnProfile: async () => null,
  setPrivateConfig: async () => {},
}));
vi.mock('../../src/model/repository/gistRepository', () => ({
  ensureSyncConfigLoaded: async () => {},
  getSyncConfig: () => ({ token: 't', gistId: 'main', etag: null, lastRemoteUpdatedAt: 0 }),
}));
vi.mock('../../src/model/repository/socialGistRepository', () => ({
  getSocialSyncConfig: () => ({ token: 't', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 }),
  readSocialGist: async () => ({}),
  saveSocialSyncConfig: () => {},
}));

import { useSocialSession } from '../../src/viewmodel/social/useSocialSession';

const USUARIO = { uid: 'u1', displayName: 'Ana', email: '', photoURL: '' };
const montar = () => renderHook(() => useSocialSession({ lockProfileEditor: () => {}, navigate: () => {} }));

beforeEach(() => {
  auth.cb = null;
  lectura.user = null;
});

describe('useSocialSession sigue la sesión', () => {
  it('abierto durante un parpadeo, entra al espacio en cuanto la sesión vuelve', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.showSocialSpace).toBe(false);

    act(() => auth.cb?.(USUARIO));

    expect(result.current.authUser).toEqual(USUARIO);
    expect(result.current.showSocialSpace).toBe(true);
  });

  it('una sesión que se cierra de verdad cierra el espacio', async () => {
    lectura.user = USUARIO;
    const { result } = montar();
    await waitFor(() => expect(result.current.showSocialSpace).toBe(true));

    act(() => auth.cb?.(null));

    expect(result.current.authUser).toBeNull();
    expect(result.current.showSocialSpace).toBe(false);
  });

  it('un «nadie» dicho ANTES de la lectura no pisa al usuario que la lectura encuentra', async () => {
    lectura.user = USUARIO;
    const { result } = montar();
    act(() => auth.cb?.(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authUser).toEqual(USUARIO);
    expect(result.current.showSocialSpace).toBe(true);
  });
});
