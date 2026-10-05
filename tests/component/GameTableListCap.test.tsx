import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem } from '../../src/model/types/game';

// EL RECUENTO DE LA LISTA DE DESEOS se dice contra su tope, y el tope cuenta la lista ENTERA: con filtros, lo que
// se está viendo va delante y el «de 100» sigue hablando del total.

function makeGame(id: number): GameItem {
  return { id, _ts: 1, name: `Deseo ${id}`, platforms: ['PC'], genres: ['Acción'], steamDeck: false, review: '', score: 0 };
}

function countOf(games: GameItem[], listCap?: { total: number; max: number }) {
  const { container } = render(
    <GameTable
      games={games}
      currentTab="d"
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
      onSort={vi.fn()}
      listCap={listCap}
    />,
  );
  return container.querySelector('.list-head-count') as HTMLElement;
}

describe('GameTable — recuento de la lista de deseos', () => {
  it('sin filtros, el total frente al tope', () => {
    const count = countOf([makeGame(1), makeGame(2)], { total: 2, max: 100 });
    expect(count.textContent).toBe('2 de 100 deseos');
    expect(count.classList.contains('is-full')).toBe(false);
  });

  it('con filtros, lo que se ve delante y el total frente al tope', () => {
    expect(countOf([makeGame(1)], { total: 37, max: 100 }).textContent).toBe('1 juego · 37 de 100 deseos');
  });

  it('llena, en tono de aviso', () => {
    expect(countOf([makeGame(1)], { total: 100, max: 100 }).classList.contains('is-full')).toBe(true);
  });

  it('sin tope, el recuento de siempre', () => {
    expect(countOf([makeGame(1), makeGame(2)]).textContent).toBe('2 juegos');
  });
});
