import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremios } from '../../src/view/components/premios/AdminPremios';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosCategory, PremiosWinnersMap } from '../../src/model/types/premios';

const L = PREMIOS_UI.admin.season;

/**
 * PUBLICAR SIN TODOS LOS GANADORES NO SE PUEDE, y es el único error de esta pantalla que no tiene arreglo: la
 * clasificación sale de cruzar cada voto con el ganador de su categoría, y al publicar se retiran las papeletas.
 */
const categorias: PremiosCategory[] = [
  {
    id: 'goty',
    title: { es: 'Juego del año' },
    weight: 3,
    options: [
      { id: 'goty_option_0', name: 'Elden Ring' },
      { id: 'goty_option_1', name: 'Hades II' },
    ],
  },
  {
    id: 'arte',
    title: { es: 'Mejor arte' },
    weight: 1,
    options: [{ id: 'arte_option_0', name: 'Hollow Knight' }],
  },
  // Sin nominados: no puede tener ganador, así que no cuenta para poder publicar.
  { id: 'sorpresa', title: { es: 'La sorpresa' }, weight: 1, options: [] },
];

const ganadores: { valor: PremiosWinnersMap } = { valor: {} };
const publishMock = vi.fn(async () => ({
  seasonId: 'reto-2026',
  name: 'El reto 2026',
  totalBallots: 7,
  deleted: 7,
  cleared: 3,
  awarded: 3,
}));

/** Cerrada y sin publicar: la fecha de cierre ya pasó, que es lo que pone la edición en PENDING. */
vi.mock('../../src/model/repository/premios/premiosSeasonRepository', () => ({
  fetchVotingConfig: async () => ({
    season: 2026,
    seasonName: 'El reto 2026',
    isOpen: true,
    opensAtMillis: null,
    closesAtMillis: Date.now() - 86_400_000,
    closesAt: '2026-01-01',
  }),
  openSeason: async () => ({ name: 'El reto 2026', leftovers: 0 }),
  closeSeasonNow: async () => {},
  updateLiveSeason: async () => {},
  setPremiosVisible: async () => {},
  publishAndArchiveSeason: (...args: unknown[]) => publishMock(...(args as [])),
}));

vi.mock('../../src/model/repository/premios/premiosCategoriesRepository', () => ({
  loadAndSortCategories: async () => categorias,
}));

vi.mock('../../src/model/repository/premios/premiosWinnersRepository', () => ({
  fetchWinners: async () => ganadores.valor,
  saveWinners: async () => ({ saved: 0, skipped: 0, migrated: 0 }),
}));

vi.mock('../../src/model/repository/premiosVisibilityRepository', () => ({
  loadPremiosSnapshot: async () => null,
  savePremiosSnapshot: async (foto: unknown) => foto,
  snapshotFromConfig: () => ({}),
}));

async function pintar() {
  render(<AdminPremios onBack={() => {}} />);
  return screen.findByRole('button', { name: L.publishAction });
}

describe('AdminPremios · publicar', () => {
  beforeEach(() => {
    ganadores.valor = {};
    publishMock.mockClear();
  });

  it('no deja publicar si queda una categoría con nominados sin ganador', async () => {
    ganadores.valor = { goty: 'goty_option_1' };
    const boton = await pintar();

    await waitFor(() => expect(boton).toBeDisabled());
    const motivo = screen.getByText(L.publishBlocked(1, 2));
    expect(boton).toHaveAttribute('aria-describedby', motivo.id);

    await userEvent.click(boton);
    expect(publishMock).not.toHaveBeenCalled();
  });

  // La que no tiene nominados no cuenta: no puede tener ganador, así que esperar el suyo dejaría la edición sin
  // publicar para siempre.
  it('deja publicar con todas las categorías con nominados marcadas', async () => {
    ganadores.valor = { goty: 'goty_option_1', arte: 'arte_option_0' };
    const boton = await pintar();

    await waitFor(() => expect(boton).toBeEnabled());
    expect(screen.queryByText(L.publishBlocked(1, 2))).not.toBeInTheDocument();
    expect(screen.getByText(L.publishWarn)).toBeInTheDocument();

    await userEvent.click(boton);
    await waitFor(() => expect(publishMock).toHaveBeenCalledTimes(1));
  });

  it('sin ningún ganador dice cuántos faltan y no publica', async () => {
    const boton = await pintar();

    await waitFor(() => expect(screen.getByText(L.publishBlocked(2, 2))).toBeInTheDocument());
    expect(boton).toBeDisabled();
    // Lo irreversible no se cuenta encima de un botón apagado: taparía el motivo por el que lo está.
    expect(screen.queryByText(L.publishWarn)).not.toBeInTheDocument();
  });
});
