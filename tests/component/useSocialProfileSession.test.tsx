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

import { useSocialProfileSession, useSocialProfileStatus } from '../../src/view/hooks/useSocialProfileSession';

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

/**
 * EL TERCER VALOR, que es el que nació con el piloto de la pestaña social.
 *
 * El booleano de siempre no distingue «no hay perfil» de «todavía no lo sé», y para cerrar una puerta da igual.
 * Para encender un aviso ROJO no: la resolución pasa por la sesión de Google y por una lectura de IndexedDB, así
 * que en cada arranque hay un tramo sin respuesta. Si ese tramo contara como «no hay perfil», la barra acusaría
 * de apagado lo que está encendido una vez por visita, y un aviso que miente se deja de mirar.
 */
describe('useSocialProfileStatus — pendiente no es lo mismo que apagado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `clearAllMocks` borra las LLAMADAS, no las implementaciones: sin devolver aquí la sesión de siempre, el
    // caso que la silencia se la deja silenciada a los que vienen detrás.
    gatewayMocks.subscribeSocialAuth.mockImplementation((cb: (user: { uid: string } | null) => void) => {
      cb({ uid: 'uid-1' });
      return () => {};
    });
    configMocks.getSocialSyncConfig.mockReturnValue({ gistId: 'social-gist' });
    idbMocks.peekCachedSocialProfileIdentity.mockResolvedValue({ name: 'Bellanco' });
  });

  /** El mismo arnés, pero leyendo el estado en tres valores. */
  function estado(initialPath = '/completados') {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
    );
    return renderHook(() => useSocialProfileStatus(new Set([1])), { wrapper });
  }

  it('mientras la sesión no contesta, el estado es `pending`', async () => {
    // Una suscripción que no llama a su callback es exactamente lo que pasa en el primer fotograma de cada visita.
    gatewayMocks.subscribeSocialAuth.mockImplementation(() => () => {});
    const view = estado();
    expect(view.result.current).toBe('pending');
    // Y el booleano de siempre sigue diciendo que no: ante la duda, la puerta cerrada.
    const gate = renderHook(() => useSocialProfileSession(new Set([1])), {
      wrapper: ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>,
    });
    expect(gate.result.current).toBe(false);
  });

  it('sin canal social, `inactive`: la sesión contestó que no hay nada', async () => {
    gatewayMocks.subscribeSocialAuth.mockImplementation((cb: (user: { uid: string } | null) => void) => {
      cb(null);
      return () => {};
    });
    const view = estado();
    await waitFor(() => expect(view.result.current).toBe('inactive'));
  });

  it('con perfil completo, `active`', async () => {
    const view = estado();
    await waitFor(() => expect(view.result.current).toBe('active'));
  });

  it('con gist y nombre pero sin un solo juego completado, `inactive`', async () => {
    // Es la misma regla que ya gatea el perfil: sin completados la ficha pública no se sostiene.
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
    const view = renderHook(() => useSocialProfileStatus(new Set<number>()), { wrapper });
    await waitFor(() => expect(view.result.current).toBe('inactive'));
  });
});
