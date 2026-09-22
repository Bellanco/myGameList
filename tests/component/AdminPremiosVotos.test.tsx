import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminPremiosVotos } from '../../src/view/components/premios/AdminPremiosVotos';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosCategory } from '../../src/model/types/premios';

const L = PREMIOS_UI.admin.ballots;

/**
 * QUÉ VOTÓ CADA UNO, que es para lo que se entra aquí antes de publicar: el censo decía cuántas categorías marcó
 * cada persona, pero no a quién, así que no había forma de comprobar una papeleta sin abrir Firestore.
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
];

vi.mock('../../src/model/repository/premios/premiosSeasonRepository', () => ({
  readLiveEdition: async () => ({
    ballots: [
      {
        userId: 'uid-1',
        userDisplayName: 'Ana',
        profileId: 'p-1',
        // Acierta el GOTY y deja «Mejor arte» en blanco.
        selections: { goty: 'goty_option_1' },
        editCount: 0,
      },
    ],
    categories: categorias,
    ballotDocs: [],
    categoryDocs: [],
  }),
}));

vi.mock('../../src/model/repository/premios/premiosWinnersRepository', () => ({
  fetchWinners: async () => ({ goty: 'goty_option_1' }),
}));

vi.mock('../../src/model/repository/premios/premiosBallotRepository', () => ({
  deleteBallot: async () => {},
}));

describe('AdminPremiosVotos', () => {
  it('enseña la papeleta entera: lo votado, lo que quedó en blanco y lo que acierta', async () => {
    render(<AdminPremiosVotos categories={categorias} />);

    await userEvent.click(await screen.findByText(L.open));

    const papeleta = screen.getByText('Hades II').closest('ul') as HTMLElement;
    const filas = within(papeleta).getAllByRole('listitem');
    expect(filas).toHaveLength(2);

    // La que votó, con su marca de acierto contra el ganador marcado hasta ahora.
    expect(within(filas[0]).getByText('Juego del año')).toBeInTheDocument();
    expect(within(filas[0]).getByText('Hades II')).toBeInTheDocument();
    expect(within(filas[0]).getByLabelText(L.hit)).toBeInTheDocument();

    // Y la que dejó en blanco, que es lo que explica el «1/2» de la cabecera.
    expect(within(filas[1]).getByText(L.notVoted)).toBeInTheDocument();
    expect(within(filas[1]).queryByLabelText(L.hit)).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(L.voted(1, 2)))).toBeInTheDocument();
  });
});
