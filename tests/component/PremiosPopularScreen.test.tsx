import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PremiosPopularScreen } from '../../src/view/components/premios/PremiosPopularScreen';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosSeasonResult } from '../../src/model/types/premios';

const L = PREMIOS_UI.votos;

const archivo: PremiosSeasonResult = {
  season: 2026,
  seasonId: '2026',
  name: 'Game Awards 2026',
  totalBallots: 3,
  winners: { goty: 'goty_a', arte: 'arte_b' },
  categoriesSnapshot: [
    {
      id: 'goty',
      title: { es: 'Juego del año' },
      winner: 'goty_a',
      weight: 3,
      options: [
        { id: 'goty_a', name: 'Elden Ring' },
        { id: 'goty_b', name: 'Hades II' },
      ],
    },
    {
      id: 'arte',
      title: { es: 'Mejor arte' },
      winner: 'arte_b',
      weight: 1,
      options: [
        { id: 'arte_a', name: 'Balatro' },
        { id: 'arte_b', name: 'Astro Bot' },
        { id: 'arte_c', name: 'Silksong' },
      ],
    },
  ],
  leaderboard: [],
  votes: { goty: { goty_a: 2, goty_b: 1 }, arte: { arte_a: 1, arte_c: 1, arte_b: 1 } },
};

const pintar = (result: PremiosSeasonResult | null) =>
  render(
    <MemoryRouter>
      <PremiosPopularScreen result={result} />
    </MemoryRouter>,
  );

describe('PremiosPopularScreen', () => {
  it('enseña el más votado de cada categoría con sus votos', () => {
    const { container } = pintar(archivo);
    const [goty] = [...container.querySelectorAll('.premios-popular__card')];
    expect(goty.textContent).toContain('Juego del año');
    expect(goty.textContent).toContain('Elden Ring');
    expect(goty.textContent).toContain(L.votes(2, 3));
    // Y si la gente eligió lo mismo que el jurado, se dice.
    expect(goty.textContent).toContain(L.matchesJury);
  });

  // Con los votos iguales no hay uno más votado que otro: salen todos los empatados.
  it('con empate enseña a todos los empatados y lo dice', () => {
    const { container } = pintar(archivo);
    const arte = [...container.querySelectorAll('.premios-popular__card')][1];
    expect(arte.textContent).toContain('Balatro');
    expect(arte.textContent).toContain('Astro Bot');
    expect(arte.textContent).toContain('Silksong');
    expect(arte.textContent).toContain(L.tie);
  });

  it('una edición sin recuento lo dice en vez de enseñar una rejilla vacía', () => {
    pintar({ ...archivo, votes: undefined });
    expect(screen.getByText(L.empty)).toBeInTheDocument();
  });
});
