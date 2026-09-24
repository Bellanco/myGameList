import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremios } from '../../src/view/components/premios/AdminPremios';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import { DIALOG_MESSAGES } from '../../src/core/constants/labels';
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

const resolverMock = vi.fn(async (_nombres: readonly string[]) => ({ conCaratula: 2, sinCaratula: 0, fallidas: 0 }));

vi.mock('../../src/model/repository/premios/premiosCoversRepository', () => ({
  resolverCaratulasDeNominados: (nombres: readonly string[]) => resolverMock(nombres),
}));

vi.mock('../../src/model/repository/premiosVisibilityRepository', () => ({
  loadPremiosSnapshot: async () => null,
  savePremiosSnapshot: async (foto: unknown) => foto,
  snapshotFromConfig: () => ({}),
}));

/** Una semana por delante: abrir exige un día de cierre que no esté en el pasado. */
const DIA_DE_CIERRE = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

/** La edición no se abre sin nombre ni sin día de cierre, así que el formulario va relleno salvo que se diga. */
async function pintar({ nombre = 'El reto del jugador 2026', dia = DIA_DE_CIERRE } = {}) {
  render(<AdminPremios onBack={() => {}} />);
  const boton = await screen.findByRole('button', { name: L.openAction });
  if (nombre) fireEvent.change(screen.getByLabelText(L.nameLabel), { target: { value: nombre } });
  if (dia) fireEvent.change(screen.getByLabelText(L.closesLabel), { target: { value: dia } });
  return boton;
}

describe('AdminPremios · abrir la votación', () => {
  beforeEach(() => {
    categorias.valor = [];
    openMock.mockClear();
    resolverMock.mockClear();
  });

  it('avisa de la categoría sin completar por su nombre y pregunta antes de abrir', async () => {
    categorias.valor = [completa, sinNominados];
    const boton = await pintar();

    await waitFor(() => expect(screen.getByText(L.openIncomplete(['Mejor arte']))).toBeInTheDocument());
    await waitFor(() => expect(boton).toBeEnabled());

    // LA PREGUNTA ES DE LA CASA, no el `confirm()` del navegador: un `<dialog>` con su foco y su Esc.
    await userEvent.click(boton);
    const dialogo = await screen.findByRole('dialog', { name: L.openConfirmTitle });
    expect(within(dialogo).getByText(L.openIncomplete(['Mejor arte']))).toBeInTheDocument();

    // Se puede arrepentir, y entonces no se abre nada.
    await userEvent.click(within(dialogo).getByRole('button', { name: DIALOG_MESSAGES.cancel }));
    expect(openMock).not.toHaveBeenCalled();

    // O abrir de todos modos: esa categoría puede que no se reparta esta edición.
    await userEvent.click(boton);
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: L.openAction }),
    );
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
  });

  it('con todas completas abre sin preguntar', async () => {
    categorias.valor = [completa, placeholder];
    const boton = await pintar();

    await waitFor(() => expect(boton).toBeEnabled());
    expect(screen.queryByText(L.openNoCategories)).not.toBeInTheDocument();

    await userEvent.click(boton);
    await waitFor(() => expect(openMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // LA VOTACIÓN SOLO ENSEÑA CARÁTULAS YA RESUELTAS (`c=1`), así que abrir resuelve las de todos los nominados
  // antes de que entre nadie, y el resumen va en el aviso.
  it('al abrir resuelve las carátulas de todos los nominados y lo cuenta', async () => {
    categorias.valor = [completa, placeholder];
    const boton = await pintar();
    await waitFor(() => expect(boton).toBeEnabled());

    await userEvent.click(boton);
    await waitFor(() => expect(resolverMock).toHaveBeenCalledWith(['Elden Ring', 'Hades II']));
    const resumen = PREMIOS_UI.admin.covers.summary(2, 0, 0);
    expect(await screen.findByText((texto) => texto.includes(resumen))).toBeInTheDocument();
  });

  /**
   * NI SIN NOMBRE NI SIN DÍA DE CIERRE. El nombre era opcional —sin él se usaba el año— y con eso el
   * identificador del archivo salía a suerte: dos ediciones del mismo año chocaban.
   */
  it('no se abre sin nombre', async () => {
    categorias.valor = [completa];
    const boton = await pintar({ nombre: '' });
    await waitFor(() => expect(boton).toBeDisabled());
  });

  it('no se abre sin día de cierre', async () => {
    categorias.valor = [completa];
    const boton = await pintar({ dia: '' });
    await waitFor(() => expect(boton).toBeDisabled());
  });

  it('sin ninguna categoría con nominados tampoco se abre', async () => {
    categorias.valor = [placeholder];
    const boton = await pintar();

    await waitFor(() => expect(screen.getByText(L.openNoCategories)).toBeInTheDocument());
    expect(boton).toBeDisabled();
  });
});
