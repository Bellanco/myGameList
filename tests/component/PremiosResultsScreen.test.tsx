import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PremiosResultsScreen } from '../../src/view/components/premios/PremiosResultsScreen';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosSeasonResult } from '../../src/model/types/premios';

const L = PREMIOS_UI.resultados;

const archivo: PremiosSeasonResult = {
  season: 2026,
  seasonId: 'reto-2026',
  name: 'El reto del jugador 2026',
  totalBallots: 3,
  winners: { goty: 'goty_option_0' },
  categoriesSnapshot: [
    {
      id: 'goty',
      title: { es: 'Juego del año' },
      winner: 'goty_option_0',
      weight: 3,
      options: [
        { id: 'goty_option_0', name: 'Elden Ring' },
        { id: 'goty_option_1', name: 'Hades II' },
      ],
    },
    { id: 'arte', title: { es: 'Mejor arte' }, winner: null, weight: 1, options: [] },
  ],
  leaderboard: [
    { rank: 1, profileId: 'p-ana', nickname: 'Ana', points: 6 },
    { rank: 2, profileId: 'p-beto', nickname: 'Beto', points: 3 },
  ],
};

describe('PremiosResultsScreen', () => {
  it('enseña el ganador de cada categoría por su nombre, no por su id', () => {
    render(<PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />);
    expect(screen.getByText('Juego del año')).toBeInTheDocument();
    expect(screen.getByText('Elden Ring')).toBeInTheDocument();
  });

  it('no lista las categorías que se quedaron sin ganador', () => {
    render(<PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />);
    expect(screen.queryByText('Mejor arte')).not.toBeInTheDocument();
  });

  it('pinta la clasificación con su puesto y sus puntos', () => {
    render(<PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(L.points(6))).toBeInTheDocument();
    expect(screen.getByText(L.rank(1))).toBeInTheDocument();
  });

  // EL ARCHIVO NO LLEVA IDENTIFICADORES REALES: la fila propia se reconoce por el pseudónimo, que es público y
  // no dice quién eres fuera de esta app.
  it('reconoce tu fila por el pseudónimo', () => {
    const { container } = render(
      <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="p-beto" />,
    );
    const propia = container.querySelector('.premios-results__row.is-own');
    expect(propia?.textContent).toContain('Beto');
  });

  it('sin pseudónimo no marca ninguna fila como propia', () => {
    const { container } = render(
      <PremiosResultsScreen result={archivo} leaderboard={archivo.leaderboard} ownProfileId="" />,
    );
    expect(container.querySelector('.is-own')).toBeNull();
  });

  it('lo dice claro cuando no hay edición publicada', () => {
    render(<PremiosResultsScreen result={null} leaderboard={[]} ownProfileId="" />);
    expect(screen.getByText(L.empty)).toBeInTheDocument();
  });
});
