import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremios } from '../../src/view/components/premios/AdminPremios';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosCategory } from '../../src/model/types/premios';

const L = PREMIOS_UI.admin.season;

/**
 * UNA CATEGORÍA A MEDIAS AVISA, NO IMPIDE. Las categorías se quedan de un año para otro y no todas se reparten
 * siempre, así que una sin nominados suele ser una decisión: se dice cuál es y se pregunta antes de abrir. Lo
 * que sí se impide es abrir SIN NINGUNA categoría lista: sería una votación sin nada que votar.
 */
const completa: PremiosCategory = {
  id: 'goty',
  title: { es: 'Juego del año' },
  weight: 3,
  options: [
    { id: 'goty_option_0', name: 'Elden Ring' },
    { id: 'goty_option_1', name: 'Hades II' },
  ],
};
const sinNominados: PremiosCategory = { id: 'arte', title: { es: 'Mejor arte' }, weight: 1, options: [] };
/** El documento vacío que queda al borrar la última: no es una categoría a medias, así que no cuenta. */
const placeholder: PremiosCategory = { id: 'hueco', title: { es: '' }, options: [], isPlaceholder: true };

const categorias: { valor: PremiosCategory[] } = { valor: [] };
const openMock = vi.fn(async () => ({ seasonId: 'test', name: 'Test', closesAt: '', leftovers: 0 }));

/** Sin edición en marcha: no hay fecha de cierre, que es lo que pone el ciclo en «Sin edición». */
vi.mock('../../src/model/repository/premios/premiosSeasonRepository', () => ({
  fetchVotingConfig: async () => ({ season: 2026, isOpen: false, closesAtMillis: null, closesAt: null }),
  openSeason: (...args: unknown[]) => openMock(...(args as [])),
  closeSeasonNow: async () => {},
  updateLiveSeason: async () => {},
  setPremiosVisible: async () => {},
  publishAndArchiveSeason: async () => ({}),
}));

vi.mock('../../src/model/repository/premios/premiosCategoriesRepository', () => ({
  loadAndSortCategories: async () => categorias.valor,
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

/** Una semana por delante: abrir exige un día de cierre que no esté en el pasado. */
const DIA_DE_CIERRE = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

async function pintar() {
  render(<AdminPremios onBack={() => {}} />);
  const boton = await screen.findByRole('button', { name: L.openAction });
  fireEvent.change(screen.getByLabelText(L.closesLabel), { target: { value: DIA_DE_CIERRE } });
  return boton;
}

describe('AdminPremios · abrir la votación', () => {
  beforeEach(() => {
    categorias.valor = [];
    openMock.mockClear();
  });

  it('avisa de la categoría sin completar por su nombre y pregunta antes de abrir', async () => {
    categorias.valor = [completa, sinNominados];
    const boton = await pintar();

    await waitFor(() => expect(screen.getByText(L.openIncomplete(['Mejor arte']))).toBeInTheDocument());
    await waitFor(() => expect(boton).toBeEnabled());

    // Se puede arrepentir, y entonces no se abre nada.
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(boton);
    expect(confirmar).toHaveBeenCalledWith(L.openConfirm(['Mejor arte']));
    expect(openMock).not.toHaveBeenCalled();

    // O abrir de todos modos: esa categoría puede que no se reparta esta edición.
    confirmar.mockReturnValue(true);
    await userEvent.click(boton);
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    confirmar.mockRestore();
  });

  it('con todas completas abre sin preguntar', async () => {
    categorias.valor = [completa, placeholder];
    const boton = await pintar();

    await waitFor(() => expect(boton).toBeEnabled());
    expect(screen.queryByText(L.openNoCategories)).not.toBeInTheDocument();

    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(boton);
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    expect(confirmar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it('sin ninguna categoría con nominados tampoco se abre', async () => {
    categorias.valor = [placeholder];
    const boton = await pintar();

    await waitFor(() => expect(screen.getByText(L.openNoCategories)).toBeInTheDocument());
    expect(boton).toBeDisabled();
  });
});
