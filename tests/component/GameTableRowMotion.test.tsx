import { describe, it, expect, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem, TabId } from '../../src/model/types/game';

function makeGame(id: number, name = `Juego ${id}`): GameItem {
  return { id, _ts: id, name, platforms: [], genres: [], steamDeck: false, review: '' };
}

function renderTable(games: GameItem[], currentTab: TabId = 'c', removingId: number | null = null) {
  return render(
    <GameTable
      games={games}
      currentTab={currentTab}
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
      removingId={removingId}
    />,
  );
}

/** Nombres de los juegos cuya fila lleva la marca pedida, en el orden en que están pintados. */
function filasCon(container: HTMLElement, clase: string): string[] {
  return [...container.querySelectorAll(`tbody tr.main-row.${clase}`)]
    .map((fila) => fila.querySelector('.row-name')?.textContent || '');
}

// La marca la pone el componente y la animación la pinta el CSS (`_motion.scss`), así que lo que se puede
// comprobar aquí —y lo que de verdad tiene reglas— es CUÁNDO se pone: qué cuenta como una llegada y qué no.
describe('GameTable — la fila que llega y la que se va', () => {
  it('marca como recién llegada la fila de un juego que antes no estaba', () => {
    const { container, rerender } = renderTable([makeGame(1), makeGame(2)]);
    expect(filasCon(container, 'is-entering')).toEqual([]);

    act(() => {
      rerender(
        <GameTable
          games={[makeGame(1), makeGame(2), makeGame(3, 'El nuevo')]}
          currentTab="c"
          expandedId={null}
          onExpandedChange={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMigrate={vi.fn()}
          tabActions={[]}
        />,
      );
    });

    expect(filasCon(container, 'is-entering')).toEqual(['El nuevo']);
  });

  // Al cambiar de pestaña TODOS los ids son nuevos, pero no ha llegado nada: es otra lista. Animar ahí pondría
  // la lista entera a deslizarse encima de la entrada de pantalla, que es la que cuenta ese cambio.
  it('no marca nada al cambiar de pestaña, aunque la lista entera sea distinta', () => {
    const { container, rerender } = renderTable([makeGame(1), makeGame(2)]);

    act(() => {
      rerender(
        <GameTable
          games={[makeGame(7, 'De otra lista')]}
          currentTab="e"
          expandedId={null}
          onExpandedChange={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMigrate={vi.fn()}
          tabActions={[]}
        />,
      );
    });

    expect(filasCon(container, 'is-entering')).toEqual([]);
  });

  // Una importación mete decenas de juegos de golpe. Treinta filas deslizándose a la vez no confirman nada.
  it('no marca una llegada masiva (más de las que caben en un vistazo)', () => {
    const iniciales = [makeGame(1)];
    const { container, rerender } = renderTable(iniciales);

    act(() => {
      rerender(
        <GameTable
          games={[...iniciales, ...Array.from({ length: 12 }, (_unused, i) => makeGame(100 + i))]}
          currentTab="c"
          expandedId={null}
          onExpandedChange={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
          onMigrate={vi.fn()}
          tabActions={[]}
        />,
      );
    });

    expect(filasCon(container, 'is-entering')).toEqual([]);
  });

  // La fila que se va sigue en la tabla mientras se desvanece: `App` retrasa el borrado justo para eso. Durante
  // ese rato no puede ser pulsable (abriría el detalle de un juego que está a punto de no existir); de eso se
  // encarga el `pointer-events: none` de la hoja, y de marcarla, esto.
  it('marca la fila cuyo borrado ya se ha confirmado pero todavía no se ha aplicado', () => {
    const { container } = renderTable([makeGame(1, 'Se queda'), makeGame(2, 'Se va')], 'c', 2);
    expect(filasCon(container, 'is-leaving')).toEqual(['Se va']);
  });
});
