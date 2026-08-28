import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StatsReviews } from '../../src/view/components/stats/StatsReviews';
import { STATS_UI } from '../../src/core/constants/statsLabels';
import type { GameItem, TabData } from '../../src/model/types/game';

// En modo NOTA el medallón enseña la cifra 0–100, que es donde se veía el fallo: dos reseñas con un 100 y una
// de ellas al final de la lista. La escala vive en un store hidratado desde Firestore, así que se fija a mano.
vi.mock('../../src/model/repository/scorePreferenceRepository', () => ({
  getScoreScale: () => 'grade',
  subscribeScoreScale: () => () => {},
}));

const L = STATS_UI.reviews;

function game(overrides: Partial<GameItem> & { name: string }): GameItem {
  return { id: 1, _ts: 0, platforms: [], genres: [], steamDeck: false, review: 'Reseña de prueba.', ...overrides };
}

// `Z legacy` solo tiene `score` 0–5 (puntuó antes de la escala fina), así que su `grade` viene a null pese a
// valer 100; el nombre empieza por Z para que un orden alfabético no lo coloque arriba por casualidad.
const GAMES: TabData = {
  c: [
    game({ id: 1, name: 'A nota fina cien', grade: 100, score: 5 }),
    game({ id: 2, name: 'Z legacy cinco estrellas', score: 5 }),
    game({ id: 3, name: 'M nota fina ochenta', grade: 80, score: 4 }),
    game({ id: 4, name: 'Sin reseña', grade: 95, score: 5, review: '' }),
  ],
  v: [game({ id: 5, name: 'Abandonado con nota noventa', grade: 90, score: 5 })],
  e: [],
  p: [],
  deleted: [],
  updatedAt: 0,
};

function renderList() {
  return render(
    <StatsReviews games={GAMES} gameId={0} onBack={() => {}} onOpenReview={() => {}} onBackToList={() => {}} />,
    { wrapper: MemoryRouter },
  );
}

describe('StatsReviews', () => {
  it('ordena por la nota EFECTIVA, así que un 100 heredado del score 0–5 no cae al final', () => {
    renderList();

    const titles = screen.getAllByRole('heading', { level: 4 }).map((node) => node.textContent);
    expect(titles).toEqual([
      'A nota fina cien',
      'Z legacy cinco estrellas',
      'Abandonado con nota noventa',
      'M nota fina ochenta',
    ]);
  });

  it('avisa solo en los juegos que no te has pasado y no enseña fechas del canal social', () => {
    renderList();

    const items = screen.getAllByRole('listitem');
    expect(within(items[1]).queryByText(L.unfinished)).not.toBeInTheDocument();
    expect(within(items[2]).getByText(L.unfinished)).toBeInTheDocument();
    expect(screen.getAllByText(L.unfinished)).toHaveLength(1);
  });
});
