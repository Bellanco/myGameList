import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem, TabId } from '../../src/model/types/game';

// CADA CHIP DE ORDENAR PIDE SU CLAVE, y no la que diga su rótulo.
//
// La clave de orden salía de la PALABRA de la cabecera (`SORT_COLUMN['Juego'] = 'name'`…), así que retocar un
// rótulo —o traducirlo— dejaba esa columna sin chip o con el orden de otra sin que fallara nada. Ahora va por el
// ID de la columna; esto fija qué clave manda cada chip en las dos listas que tienen columnas propias.

function makeGame(id: number): GameItem {
  return {
    id,
    _ts: 1,
    name: `Juego ${id}`,
    platforms: ['PC'],
    genres: ['Acción'],
    steamDeck: false,
    review: '',
    grade: 50,
    score: 3,
    years: [2024],
  };
}

function renderSortable(tab: TabId, onSort: (tab: TabId, column: string) => void) {
  return render(
    <GameTable
      games={[makeGame(1), makeGame(2)]}
      currentTab={tab}
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
      onSort={onSort}
    />,
  );
}

describe('GameTable — chips de ordenar', () => {
  it.each<[TabId, Array<[string, string]>]>([
    ['c', [['Juego', 'name'], ['Año', 'years'], ['Plataformas', 'platforms'], ['Géneros', 'genres'], ['Puntuación', 'score']]],
    ['p', [['Juego', 'name'], ['Plataformas', 'platforms'], ['Géneros', 'genres'], ['Interés', 'score']]],
  ])('en la pestaña %s, cada chip manda la clave de su columna', async (tab, expected) => {
    const onSort = vi.fn();
    const { container } = renderSortable(tab, onSort);
    const chips = container.querySelector('.list-sort-chips') as HTMLElement;
    expect(chips).not.toBeNull();

    // Los mismos chips, en el mismo orden, y ninguno de las columnas que no se ordenan (puntos fuertes…).
    const rotulos = within(chips).getAllByRole('button').map((chip) => chip.textContent);
    expect(rotulos).toEqual(expected.map(([rotulo]) => rotulo));

    for (const [rotulo, clave] of expected) {
      onSort.mockClear();
      await userEvent.click(within(chips).getByText(rotulo));
      expect(onSort).toHaveBeenCalledWith(tab, clave);
    }
    expect(screen.queryByText('Puntos fuertes', { selector: '.list-sort-chip span' })).toBeNull();
  });
});
