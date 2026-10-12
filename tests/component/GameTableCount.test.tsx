import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem } from '../../src/model/types/game';

// EL RECUENTO DE LA LISTA, al lado de «Ordenar». La ficha de un perfil pinta los juegos de 15 en 15 y la tabla
// contaba los que le llegaban: con doscientos juegos en la lista, decía «15 juegos». Ahora cuenta los de verdad.

function makeGame(id: number): GameItem {
  return { id, _ts: 1, name: `Juego ${id}`, platforms: ['PC'], genres: ['Acción'], steamDeck: false, review: '', grade: 50, score: 3, years: [2024] };
}

function renderTable(games: GameItem[], totalCount?: number) {
  return render(
    <GameTable
      games={games}
      totalCount={totalCount}
      currentTab="c"
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
      onSort={vi.fn()}
      readOnly
    />,
  );
}

describe('GameTable — recuento', () => {
  it('con un lote, cuenta el total real, también en el nombre de la tabla', () => {
    const lote = Array.from({ length: 15 }, (_, i) => makeGame(i + 1));
    const { container } = renderTable(lote, 200);
    expect(container.querySelector('.list-head-count')?.textContent).toBe('200 juegos');
    expect(container.querySelector('table')?.getAttribute('aria-label')).toContain('200');
  });

  it('sin total, cuenta los que llegan (tus listas, que no van por lotes)', () => {
    const { container } = renderTable([makeGame(1), makeGame(2)]);
    expect(container.querySelector('.list-head-count')?.textContent).toBe('2 juegos');
  });
});
