// EL INTERRUPTOR DE ISTHEREANYDEAL (P0.1 del plan de la ficha y los precios): una caja más de Preferencias, junto a
// las carátulas, que viene apagada y la ve cualquier rango (Preferencias solo se abre con espacio social, P0.2).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const gatewayMocks = vi.hoisted(() => ({
  subscribeSocialAuth: vi.fn((cb: (u: { uid: string } | null) => void) => {
    cb({ uid: 'uid-1' });
    return () => {};
  }),
  resolveOwnProfile: vi.fn(() => Promise.resolve({ tier: 'bronze' })),
  setPublicConfig: vi.fn(() => Promise.resolve()),
  getPublicConfig: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('../../src/model/repository/firebaseGateway', () => gatewayMocks);
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

import { AppearanceToggles } from '../../src/view/components/appearance/AppearanceToggles';
import { SETTINGS_UI } from '../../src/core/constants/settingsLabels';
import { ITAD_KEY } from '../../src/core/constants/storageKeys';
import { itadPreference } from '../../src/view/hooks/preferences';

const T = SETTINGS_UI.itad;

describe('interruptor de IsThereAnyDeal en Preferencias', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('sale con cualquier rango, apagado, y encenderlo lo guarda', async () => {
    render(<AppearanceToggles />);
    await act(async () => {});
    const grupo = screen.getByRole('group', { name: T.aria });
    expect(screen.getByText(T.title)).toBeInTheDocument();
    const [encender, apagar] = [...grupo.querySelectorAll('button')];
    expect(apagar).toHaveAttribute('aria-pressed', 'true');
    expect(encender).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(encender);
    expect(itadPreference.get()).toBe(true);
    expect(localStorage.getItem(ITAD_KEY)).toBe('on');
    expect(encender).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(apagar);
    expect(itadPreference.get()).toBe(false);
  });
});
