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
    expect(await screen.findByLabelText('Juego del año')).toBeInTheDocument();
    expect(screen.queryByLabelText('Mejor arte')).not.toBeInTheDocument();
  });

  it('parte de los ganadores ya marcados', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);
    await waitFor(() => expect(screen.getByLabelText('Juego del año')).toHaveValue('goty_option_1'));
    expect(screen.getByText(L.count(1, 1))).toBeInTheDocument();
  });

  it('guarda por optionId, que es lo que hace el recuento independiente del idioma', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);
    saveWinnersMock.mockClear();

    await waitFor(() => expect(screen.getByLabelText('Juego del año')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Juego del año'), 'goty_option_0');
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    expect(saveWinnersMock).toHaveBeenCalledWith(categories, { goty: 'goty_option_0' });
  });

  it('se puede dejar una categoría sin ganador', async () => {
    render(<AdminPremiosGanadores categories={categories} busy={false} ejecutar={ejecutar} />);
    saveWinnersMock.mockClear();

    await waitFor(() => expect(screen.getByLabelText('Juego del año')).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText('Juego del año'), '');
    await userEvent.click(screen.getByRole('button', { name: L.save }));

    expect(saveWinnersMock).toHaveBeenCalledWith(categories, {});
  });
});
