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
  it('renders the year chips in descending order', () => {
    const { container } = renderTable([makeGame({ years: [2018, 2024, 2021] })]);
    const chips = container.querySelectorAll('.col-c-year .chip');
    expect(Array.from(chips).map((chip) => chip.textContent)).toEqual(['2024', '2021', '2018']);
  });

  it('keeps the most recent years when the row truncates the chips', () => {
    const { container } = renderTable([makeGame({ years: [2015, 2016, 2017, 2018, 2024] })]);
    const chips = container.querySelectorAll('.col-c-year .chip');
    expect(Array.from(chips).map((chip) => chip.textContent)).toEqual(['2024', '2018', '2017', '+2']);
  });

  // El año NO viaja al meta compacto de la tarjeta (móvil/tablet). Ahí solo cabía el más reciente con un
  // contador al lado —«2026 +2»—, que se lee como una operación aritmética en vez de como «ese año y otros
  // dos», y su ancho es justo el que necesita el género para verse entero. Los años siguen contándose donde
  // caben de verdad: su columna en escritorio y el detalle desplegado.
  it('no lleva el año al meta compacto (móvil), donde solo cabría el último con un contador', () => {
    const { container } = renderTable([makeGame({ years: [2019, 2023] })]);
    expect(container.querySelector('.row-meta .rm-year')).toBeNull();
    expect(container.querySelector('td.col-c-year')?.textContent).toContain('2023');
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
