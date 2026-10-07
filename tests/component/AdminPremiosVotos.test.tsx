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
        userId: 'uid-2',
        userDisplayName: 'Bea',
        profileId: 'p-2',
        // Vota DESPUÉS que Ana y falla el GOTY: con la votación abierta va segunda; cerrada, también (0 puntos).
        selections: { goty: 'goty_option_0', arte: 'arte_option_0' },
        submittedAt: '2026-10-02T10:00:00.000Z',
        editCount: 1,
      },
      {
        userId: 'uid-1',
        userDisplayName: 'Ana',
        profileId: 'p-1',
        // Acierta el GOTY y deja «Mejor arte» en blanco.
        selections: { goty: 'goty_option_1' },
        submittedAt: '2026-10-01T10:00:00.000Z',
        editCount: 0,
      },
    ],
    categories: categorias,
    ballotDocs: [],
    categoryDocs: [],
  }),
}));

vi.mock('../../src/model/repository/premios/premiosWinnersRepository', () => ({
  // Solo el GOTY tiene ganador marcado: «Mejor arte» sigue sin decidir.
  fetchWinners: async () => ({ goty: 'goty_option_1' }),
}));

const deleteBallot = vi.fn<(uid: string) => Promise<void>>(async () => {});
vi.mock('../../src/model/repository/premios/premiosBallotRepository', () => ({
  deleteBallot: (uid: string) => deleteBallot(uid),
}));

const R = PREMIOS_UI.resultados;

/** Los nombres de las filas, en su orden. */
async function nombres(): Promise<string[]> {
  const tablero = await screen.findByRole('region', { name: /Clasificación provisional|Por orden de voto/ });
  return within(tablero).getAllByRole('button', { name: /^Ver los votos de|^Ocultar los votos de/ })
    .map((boton) => boton.getAttribute('aria-label') || '');
}

describe('AdminPremiosVotos', () => {
  it('cerrada sin publicar: la clasificación provisional, con lo votado, lo que acierta y lo que aún no tiene ganador', async () => {
    render(<AdminPremiosVotos categories={categorias} stage="pending" />);

    expect(await screen.findByRole('heading', { name: L.preview })).toBeInTheDocument();
    // Ana acierta el GOTY (×3): primera.
    expect(await nombres()).toEqual([R.showVotes('Ana'), R.showVotes('Bea')]);

    await userEvent.click(screen.getByRole('button', { name: R.showVotes('Ana') }));
    const votos = screen.getByRole('list', { name: R.votesOf('Ana') });
    const fichas = within(votos).getAllByRole('listitem');
    expect(fichas).toHaveLength(2);
    expect(fichas[0]).toHaveClass('is-hit');
    expect(within(fichas[0]).getByText('Hades II')).toBeInTheDocument();
    // La que no tiene ganador: sin acierto ni fallo, y lo que dejó en blanco a la vista.
    expect(fichas[1]).toHaveClass('is-undecided');
    expect(within(fichas[1]).getByText(R.noVote)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(L.voted(1, 2)))).toBeInTheDocument();
  });

  it('votación abierta: por orden de voto, sin puestos ni puntos ni aciertos', async () => {
    render(<AdminPremiosVotos categories={categorias} stage="open" />);

    expect(await screen.findByRole('heading', { name: L.byVoteOrder })).toBeInTheDocument();
    expect(await nombres()).toEqual([R.showVotes('Ana'), R.showVotes('Bea')]);
    expect(screen.queryByText(R.positionAria(1))).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: R.showVotes('Bea') }));
    const fichas = within(screen.getByRole('list', { name: R.votesOf('Bea') })).getAllByRole('listitem');
    // Aunque el GOTY ya tenga ganador marcado, abierta no se cuenta nada.
    expect(fichas.every((ficha) => ficha.classList.contains('is-undecided'))).toBe(true);
    expect(within(fichas[0]).getByText('Elden Ring')).toBeInTheDocument();
  });

  it('retirar una papeleta pregunta por el nombre y no despliega la fila', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AdminPremiosVotos categories={categorias} stage="pending" />);

    await userEvent.click(await screen.findByRole('button', { name: L.remove('Bea') }));

    expect(window.confirm).toHaveBeenCalledWith(L.removeConfirm('Bea'));
    expect(deleteBallot).toHaveBeenCalledWith('uid-2');
    expect(screen.getByRole('button', { name: R.showVotes('Bea') })).toHaveAttribute('aria-expanded', 'false');
  });
});
