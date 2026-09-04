import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

// Este hook se monta en la RAÍZ (App), así que su efecto corre en cada navegación de toda la app. Lo que aquí se
// fija es de dónde puede venir un disparo: el dato solo lo escribe el editor de perfil, que vive en `/social`.

const gatewayMocks = vi.hoisted(() => ({
  subscribeSocialAuth: vi.fn((callback: (user: { uid: string } | null) => void) => {
    callback({ uid: 'uid-1' });
    return () => {};
  }),
  getPrivateConfig: vi.fn(async () => null),
  resolveOwnProfile: vi.fn(async () => null),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);

const configMocks = vi.hoisted(() => ({
  getSocialSyncConfig: vi.fn(() => ({ gistId: 'social-gist' })),
}));
vi.mock('../../src/model/repository/gistConfigRepository', () => configMocks);

const idbMocks = vi.hoisted(() => ({
  peekCachedSocialProfileIdentity: vi.fn(async () => ({ name: 'Bellanco' })),
}));
vi.mock('../../src/model/repository/indexedDbRepository', () => idbMocks);

import { useSocialProfileSession } from '../../src/view/hooks/useSocialProfileSession';

/** Expone `navigate` para poder mover la ruta desde el test sin depender de ninguna pantalla. */
function harness(initialPath: string) {
  let navigate: ((to: string) => void) | null = null;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
  const useHarness = () => {
    navigate = useNavigate();
    return useSocialProfileSession(new Set([1]));
  };
  const view = renderHook(useHarness, { wrapper });
  return { view, goTo: (to: string) => navigate?.(to) };
}

describe('useSocialProfileSession — de dónde se relee la identidad cacheada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configMocks.getSocialSyncConfig.mockReturnValue({ gistId: 'social-gist' });
    idbMocks.peekCachedSocialProfileIdentity.mockResolvedValue({ name: 'Bellanco' });
  });

  it('navegar FUERA de lo social no vuelve a abrir IndexedDB', async () => {
    const { view, goTo } = harness('/completados');
    await waitFor(() => expect(idbMocks.peekCachedSocialProfileIdentity).toHaveBeenCalled());
    const lecturasIniciales = idbMocks.peekCachedSocialProfileIdentity.mock.calls.length;

    // Cambiar de pestaña de listados es la navegación más frecuente de la app; no toca el perfil social.
    view.rerender();
    goTo('/abandonados');
    view.rerender();
    goTo('/en-curso');
    view.rerender();
    goTo('/ajustes');
    view.rerender();

    expect(idbMocks.peekCachedSocialProfileIdentity).toHaveBeenCalledTimes(lecturasIniciales);
  });

  it('navegar DENTRO de lo social sí relee (es donde el editor reescribe el nick)', async () => {
    const { view, goTo } = harness('/social');
    await waitFor(() => expect(idbMocks.peekCachedSocialProfileIdentity).toHaveBeenCalled());
    const lecturasIniciales = idbMocks.peekCachedSocialProfileIdentity.mock.calls.length;

    // Guardar el perfil actualiza la caché y navega de `/social/profile` a `/social`: ese salto tiene que releer,
    // o el botón de Cuenta seguiría decidiendo con el nick anterior.
    goTo('/social/profile');
    view.rerender();
    await waitFor(() =>
      expect(idbMocks.peekCachedSocialProfileIdentity.mock.calls.length).toBeGreaterThan(lecturasIniciales),
    );
  });

  it('sin gist social no se lee nada (no hay perfil que comprobar)', async () => {
    configMocks.getSocialSyncConfig.mockReturnValue({ gistId: '' });
    gatewayMocks.getPrivateConfig.mockResolvedValue(null);

    harness('/social');

    await waitFor(() => expect(gatewayMocks.getPrivateConfig).toHaveBeenCalled());
    expect(idbMocks.peekCachedSocialProfileIdentity).not.toHaveBeenCalled();
  });
});
