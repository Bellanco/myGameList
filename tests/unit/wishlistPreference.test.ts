// La pestaña de la lista de deseos se puede esconder en Ajustes. Lo que estas pruebas fijan es el DEFECTO —se ve
// si nadie ha dicho lo contrario, al revés que el botón de Steam— y que la elección viaja con la cuenta.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayMocks = vi.hoisted(() => ({
  getPublicConfig: vi.fn(async (): Promise<unknown> => null),
  setPublicConfig: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);

import { setPreferenceUid } from '../../src/model/repository/preferenceStore';
import { hydrateAppearance, wishlistPreference } from '../../src/view/hooks/preferences';
import { WISHLIST_KEY } from '../../src/core/constants/storageKeys';

beforeEach(() => {
  localStorage.clear();
  setPreferenceUid(null);
  gatewayMocks.getPublicConfig.mockResolvedValue(null);
});

afterEach(() => {
  setPreferenceUid(null);
  vi.clearAllMocks();
});

describe('pestaña de la lista de deseos', () => {
  it('se ve por defecto: esconderla es lo que se elige', () => {
    expect(wishlistPreference.get()).toBe(true);

    // Un valor que no sea el «off» explícito tampoco la esconde.
    localStorage.setItem(WISHLIST_KEY, 'basura');
    expect(wishlistPreference.get()).toBe(true);
  });

  it('se esconde y se vuelve a enseñar', () => {
    wishlistPreference.set(false);
    expect(localStorage.getItem(WISHLIST_KEY)).toBe('off');
    expect(wishlistPreference.get()).toBe(false);

    wishlistPreference.set(true);
    expect(wishlistPreference.get()).toBe(true);
  });

  it('con sesión se replica a `publicConfig`, y al entrar se hidrata desde allí', async () => {
    setPreferenceUid('uid-1');
    wishlistPreference.set(false);
    expect(gatewayMocks.setPublicConfig).toHaveBeenCalledWith('uid-1', { showWishlist: false });

    localStorage.clear();
    gatewayMocks.setPublicConfig.mockClear();
    gatewayMocks.getPublicConfig.mockResolvedValue({ showWishlist: false });

    await hydrateAppearance('uid-1');

    expect(wishlistPreference.get()).toBe(false);
    expect(gatewayMocks.setPublicConfig).not.toHaveBeenCalled();
  });
});
