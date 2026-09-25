import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SETTINGS_UI } from '../../src/core/constants/settingsLabels';

// Un borrado de cuenta A MEDIAS tiene que decirse: quedan datos remotos y el usuario tiene que saber que debe
// reclamarlos. El aviso se ponía y acto seguido se navegaba fuera, así que se desmontaba sin que nadie lo viera.

const D = SETTINGS_UI.danger;
const deleteOwnAccountMock = vi.fn();

vi.mock('../../src/model/repository/firebaseGateway', () => ({
  getCurrentSocialAuthUser: vi.fn(async () => ({ uid: 'uid-1' })),
}));
vi.mock('../../src/model/repository/accountDeletionRepository', () => ({
  deleteOwnAccount: (...args: unknown[]) => deleteOwnAccountMock(...args),
}));

const { DangerZone } = await import('../../src/view/components/DangerZone');

function renderZone() {
  return render(
    <MemoryRouter initialEntries={['/cuenta']}>
      <Routes>
        <Route path="/cuenta" element={<DangerZone />} />
        <Route path="/completados" element={<div>LISTAS</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function borrar() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: D.deleteBtn }));
  await user.type(screen.getByRole('textbox'), D.confirmWord);
  await user.click(screen.getByRole('button', { name: D.confirmLabel }));
}

beforeEach(() => {
  deleteOwnAccountMock.mockReset();
});

describe('DangerZone — resultado del borrado', () => {
  it('con el borrado a medias se queda en la pantalla y lo dice', async () => {
    deleteOwnAccountMock.mockResolvedValue({ remoteComplete: false, failures: ['profiles: unavailable'] });
    renderZone();

    await borrar();

    expect(await screen.findByText(D.deletedPartial)).toBeInTheDocument();
    expect(screen.queryByText('LISTAS')).toBeNull();
  });

  it('con el borrado completo sale de la cuenta', async () => {
    deleteOwnAccountMock.mockResolvedValue({ remoteComplete: true, failures: [] });
    renderZone();

    await borrar();

    expect(await screen.findByText('LISTAS')).toBeInTheDocument();
  });
});
