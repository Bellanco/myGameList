import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremiosGanadores } from '../../src/view/components/premios/AdminPremiosGanadores';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosCategory } from '../../src/model/types/premios';

const L = PREMIOS_UI.admin.winners;

const saveWinnersMock = vi.fn(async () => ({ saved: 1, skipped: 1, migrated: 0 }));

vi.mock('../../src/model/repository/premios/premiosWinnersRepository', () => ({
  fetchWinners: async () => ({ goty: 'goty_option_1' }),
  saveWinners: (...args: unknown[]) => saveWinnersMock(...(args as [])),
}));

const categories: PremiosCategory[] = [
  {
    id: 'goty',
    title: { es: 'Juego del año' },
    weight: 3,
    options: [
      { id: 'goty_option_0', name: 'Elden Ring' },
      { id: 'goty_option_1', name: 'Hades II' },
    ],
  },
  // Sin nominados: no puede tener ganador, así que ni se ofrece.
  { id: 'arte', title: { es: 'Mejor arte' }, weight: 1, options: [] },
];

const ejecutar = async (accion: () => Promise<string>) => {
  await accion().catch(() => '');
};

describe('AdminPremiosGanadores', () => {
  it('solo ofrece las categorías que tienen nominados', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);
    expect(await screen.findByRole('group', { name: 'Juego del año' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Mejor arte' })).not.toBeInTheDocument();
  });

  // LOS NOMINADOS ESTÁN TODOS A LA VISTA, que es la razón de haber cambiado el desplegable por botones: con
  // veintiséis categorías, abrir uno a uno para leer cinco nombres era el trabajo entero.
  it('enseña todos los nominados como botones, con el marcado hundido', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);

    const elegido = await screen.findByRole('button', { name: 'Hades II' });
    await waitFor(() => expect(elegido).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Elden Ring' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(L.count(1, 1))).toBeInTheDocument();
  });

  it('guarda por optionId, que es lo que hace el recuento independiente del idioma', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);
    saveWinnersMock.mockClear();

    await userEvent.click(await screen.findByRole('button', { name: 'Elden Ring' }));
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    expect(saveWinnersMock).toHaveBeenCalledWith(categories, { goty: 'goty_option_0' });
  });

  it('se puede dejar una categoría sin ganador', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);
    saveWinnersMock.mockClear();

    await userEvent.click(await screen.findByRole('button', { name: L.pick }));
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    expect(saveWinnersMock).toHaveBeenCalledWith(categories, {});
  });

  // Volver a pulsar el que ya estaba marcado lo quita: es el gesto que se espera de un botón que se queda
  // hundido, y la única forma de corregir sin ir a buscar «Sin ganador».
  it('volver a pulsar el ganador lo desmarca', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);
    saveWinnersMock.mockClear();

    const elegido = await screen.findByRole('button', { name: 'Hades II' });
    await waitFor(() => expect(elegido).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.click(elegido);
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    expect(saveWinnersMock).toHaveBeenCalledWith(categories, {});
  });
});
