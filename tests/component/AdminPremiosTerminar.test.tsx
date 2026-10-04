import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremios } from '../../src/view/components/premios/AdminPremios';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';

const L = PREMIOS_UI.admin.season;

/**
 * TERMINAR UNA EDICIÓN CON LOS VOTOS A LA VISTA (docs/plan-premios-votos-a-la-vista.md). Es el paso que retira las
 * papeletas, así que va con confirmación: un clic suelto no puede llevarse los votos de todos.
 */
const finishMock = vi.fn(async () => ({ seasonId: 'reto-2026', deleted: 7, cleared: 3 }));

/** Publicada y sin terminar: tiene fecha de cierre y la marca de votos a la vista. */
vi.mock('../../src/model/repository/premios/premiosSeasonRepository', () => ({
  fetchVotingConfig: async () => ({
    season: 2026,
    seasonId: 'reto-2026',
    seasonName: 'El reto 2026',
    isOpen: false,
    closesAtMillis: Date.now() - 86_400_000,
    closesAt: '2026-01-01',
    revealVotes: true,
    votesRevealedAt: '2026-01-02T10:00:00.000Z',
    lastPublishedId: 'reto-2026',
  }),
  openSeason: async () => ({ name: 'El reto 2026', leftovers: 0 }),
  closeSeasonNow: async () => {},
  updateLiveSeason: async () => {},
  setPremiosVisible: async () => {},
  publishAndArchiveSeason: async () => ({}),
  finishSeason: (...args: unknown[]) => finishMock(...(args as [])),
}));

vi.mock('../../src/model/repository/premios/premiosCategoriesRepository', () => ({
  loadAndSortCategories: async () => [],
}));

vi.mock('../../src/model/repository/premios/premiosWinnersRepository', () => ({
  fetchWinners: async () => ({}),
  saveWinners: async () => ({ saved: 0, skipped: 0, migrated: 0 }),
}));

vi.mock('../../src/model/repository/premiosVisibilityRepository', () => ({
  loadPremiosSnapshot: async () => null,
  savePremiosSnapshot: async (foto: unknown) => foto,
  snapshotFromConfig: () => ({}),
}));

describe('AdminPremios · terminar', () => {
  beforeEach(() => {
    finishMock.mockClear();
  });

  it('marca el estado de los votos a la vista y no ofrece publicar otra vez', async () => {
    render(<AdminPremios onBack={() => {}} />);
    await screen.findByRole('button', { name: L.finishAction });

    const actual = document.querySelector('.premios-admin__stage-step.is-current');
    expect(actual?.textContent).toContain(L.stages.find((s) => s.id === 'revealed')?.label);
    expect(screen.queryByRole('button', { name: L.publishAction })).toBeNull();
  });

  it('pide confirmación antes de terminar y solo entonces retira', async () => {
    const user = userEvent.setup();
    render(<AdminPremios onBack={() => {}} />);

    await user.click(await screen.findByRole('button', { name: L.finishAction }));
    expect(finishMock).not.toHaveBeenCalled();

    const dialogo = await screen.findByRole('dialog', { name: L.finishConfirmTitle });
    await user.click(within(dialogo).getByRole('button', { name: L.finishAction }));

    await waitFor(() => expect(finishMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(L.finished('El reto 2026', 7))).toBeTruthy();
  });
});
