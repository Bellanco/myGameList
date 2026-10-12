// LAS ESCENAS DE EMPEZAR Y CERRAR UN JUEGO SON DE PLATA PARA ARRIBA (12-10-2026).
//
// La casilla vive en Diseño junto a las demás, pero solo se pinta cuando se sabe el rango de quien mira y ese rango
// la tiene (`PROFILE_TIER_GAME_SCENES`). Y a quien la encendió y ya no la tiene se le apaga al entrar: sin la
// casilla no podría hacerlo él.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AppearanceToggles } from '../../src/view/components/appearance/AppearanceToggles';
import { gameScenesPreference } from '../../src/view/hooks/preferences';
import { GAME_SCENES_KEY } from '../../src/core/constants/storageKeys';

const gatewayMocks = vi.hoisted(() => ({
  subscribeSocialAuth: vi.fn(),
  resolveOwnProfile: vi.fn(),
  setPublicConfig: vi.fn(() => Promise.resolve()),
  getPublicConfig: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);

const ROTULO = 'Animaciones al cambiar de lista';

/** Monta la casilla con una sesión cuyo perfil tiene este rango. */
const conRango = async (tier: string) => {
  gatewayMocks.subscribeSocialAuth.mockImplementation((cb: (u: { uid: string } | null) => void) => {
    cb({ uid: 'uid-1' });
    return () => {};
  });
  gatewayMocks.resolveOwnProfile.mockResolvedValue({ tier });
  render(<AppearanceToggles />);
  // Que la lectura del rango termine antes de mirar.
  await act(async () => {});
};

describe('la casilla de las escenas de empezar y cerrar un juego', () => {
  beforeEach(() => localStorage.removeItem(GAME_SCENES_KEY));
  afterEach(() => vi.clearAllMocks());

  it('bronce no la ve', async () => {
    await conRango('bronze');
    expect(screen.queryByText(ROTULO)).toBeNull();
  });

  it('plata, oro y mithril sí, y viene apagada', async () => {
    await conRango('silver');
    expect(screen.getByText(ROTULO)).toBeTruthy();
    expect(gameScenesPreference.get()).toBe(false);
  });

  it('sin sesión no se pinta: el rango no se sabe', async () => {
    gatewayMocks.subscribeSocialAuth.mockImplementation((cb: (u: null) => void) => {
      cb(null);
      return () => {};
    });
    render(<AppearanceToggles />);
    await act(async () => {});
    expect(screen.queryByText(ROTULO)).toBeNull();
  });

  it('a quien ya no tiene el rango se le apagan al entrar', async () => {
    localStorage.setItem(GAME_SCENES_KEY, 'on');
    expect(gameScenesPreference.get()).toBe(true);
    await conRango('bronze');
    await waitFor(() => expect(gameScenesPreference.get()).toBe(false));
  });
});
