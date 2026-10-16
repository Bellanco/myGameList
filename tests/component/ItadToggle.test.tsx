// EL INTERRUPTOR DE ISTHEREANYDEAL en Ajustes › Integración (P2 del plan de la ficha y los precios): solo existe con
// espacio social (P0.2), viene apagado (P0.1) y, con la lista de deseos oculta, avisa de que no se piden precios.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

import { SettingsHub } from '../../src/view/components/SettingsHub';
import { SETTINGS_UI } from '../../src/core/constants/settingsLabels';
import { ITAD_KEY, WISHLIST_KEY } from '../../src/core/constants/storageKeys';
import { itadPreference, wishlistPreference } from '../../src/view/hooks/preferences';

const T = SETTINGS_UI.itad;
const noop = () => {};

function renderHub(hasSocialProfile: boolean) {
  return render(
    <MemoryRouter>
      <SettingsHub onExport={noop} onImport={noop} onImportLibrary={noop} inboxCount={0} onOpenInbox={noop} hasSocialProfile={hasSocialProfile} />
    </MemoryRouter>,
  );
}

describe('interruptor de IsThereAnyDeal', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('sin espacio social no aparece', () => {
    renderHub(false);
    expect(screen.queryByRole('group', { name: T.aria })).toBeNull();
  });

  it('con espacio social aparece apagado, y encenderlo lo guarda', async () => {
    renderHub(true);
    expect(screen.getByRole('button', { name: T.off })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: T.on })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: T.on }));
    expect(itadPreference.get()).toBe(true);
    expect(localStorage.getItem(ITAD_KEY)).toBe('on');
    expect(screen.getByRole('button', { name: T.on })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: T.off }));
    expect(itadPreference.get()).toBe(false);
  });

  it('encendido con la lista de deseos oculta, dice que no se piden precios', () => {
    localStorage.setItem(ITAD_KEY, 'on');
    localStorage.setItem(WISHLIST_KEY, 'off');
    expect(wishlistPreference.get()).toBe(false);
    renderHub(true);
    expect(screen.getByText(T.wishlistHidden)).toBeInTheDocument();
  });

  it('con la lista de deseos a la vista no lo dice', () => {
    localStorage.setItem(ITAD_KEY, 'on');
    renderHub(true);
    expect(screen.queryByText(T.wishlistHidden)).toBeNull();
  });
});
