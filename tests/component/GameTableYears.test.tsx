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

function renderTable(games: GameItem[]) {
  return render(
    <GameTable
      games={games}
      currentTab="c"
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
    />,
  );
}

// Los años se guardan ascendentes, pero al pintarlos manda el más reciente: es el dato útil de la fila
// y, cuando hay más de tres, es el que debe sobrevivir al truncado por `MAX_ROW_CHIPS`.
describe('GameTable — años de más reciente a más antiguo', () => {
  // En el RENGLÓN los años van del más reciente al más antiguo y con su contador, igual que llevaban en su
  // columna. Cuántos caben lo decide el ancho: tres en escritorio, uno en el teléfono —que es el que mide
  // jsdom, con sus 1024 px por debajo del umbral compacto—. Todos, en el detalle desplegado.
  it('el renglón lleva el año más reciente y cuenta los demás', () => {
    const { container } = renderTable([makeGame({ years: [2019, 2023] })]);
    const chips = Array.from(container.querySelectorAll('.row-cat-year .chip')).map((chip) => chip.textContent);

    expect(chips).toEqual(['2023', '+1']);
  });

  it('renders the expanded detail years in descending order', () => {
    render(
      <GameTable
        games={[makeGame({ years: [2019, 2023, 2020] })]}
        currentTab="c"
        expandedId={1}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
      />,
    );
    const detail = screen.getByText('Años en los que se completó').parentElement as HTMLElement;
    expect(Array.from(detail.querySelectorAll('.chip')).map((chip) => chip.textContent)).toEqual([
      '2023',
      '2020',
      '2019',
    ]);
  });
});
