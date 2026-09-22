import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem } from '../../src/model/types/game';

function makeGame(over: Partial<GameItem> = {}): GameItem {
  return {
    id: 1,
    _ts: 1,
    name: 'Juego',
    platforms: [],
    genres: [],
    steamDeck: false,
    review: '',
    ...over,
  };
}

function renderDetail(game: GameItem) {
  return render(
    <GameTable
      games={[game]}
      currentTab="c"
      expandedId={1}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
    />,
  );
}

// Un 0 en las horas no es «cero horas jugadas», es la casilla sin rellenar: el detalle lo trata como el hueco.
describe('GameTable — tiempo jugado', () => {
  it('pinta las horas anotadas', () => {
    renderDetail(makeGame({ hours: 12.5 }));

    expect(screen.getByText('Tiempo jugado')).toBeTruthy();
    expect(screen.getByText('12,5 horas')).toBeTruthy();
  });

  it('esconde la categoría cuando las horas son 0', () => {
    renderDetail(makeGame({ hours: 0 }));

    expect(screen.queryByText('Tiempo jugado')).toBeNull();
  });

  it('esconde la categoría cuando no hay horas', () => {
    renderDetail(makeGame());

    expect(screen.queryByText('Tiempo jugado')).toBeNull();
  });
});
