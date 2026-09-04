import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem, TabId } from '../../src/model/types/game';

// Regresión del listado PLEGADO en móvil. En la vista de tarjeta la tabla es `table-layout: fixed`, y con ese
// algoritmo la rejilla de columnas la construye la PRIMERA fila. En una biblioteca de más de 120 juegos entra la
// virtualización y esa primera fila es un espaciador que declara `colSpan` con TODAS las columnas de escritorio:
// el navegador repartía el ancho a partes iguales entre esas 6–8 columnas —46 px cada una en un móvil de 412— y
// el `width: 100%` de la única celda visible no ganaba. El nombre salía a un carácter por línea (Firefox y
// Chrome por igual). Lo arregla el `<colgroup>`, que en `fixed` tiene prioridad sobre la primera fila.
//
// Aquí no se puede medir el ancho (jsdom no maqueta), pero sí el invariante que se rompió y que el CSS necesita:
// que haya un `<col>` por columna real, que el primero sea el del nombre, y que el `colSpan` del espaciador
// cuadre con esa cuenta.

function makeGame(id: number, over: Partial<GameItem> = {}): GameItem {
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
    strengths: ['Ritmo'],
    ...over,
  };
}

function renderGames(tab: TabId, games: GameItem[]) {
  return render(
    <GameTable
      games={games}
      currentTab={tab}
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
    />,
  );
}

function renderTable(tab: TabId, total: number, expandedId: number | null = null) {
  return render(
    <GameTable
      games={Array.from({ length: total }, (_unused, index) => makeGame(index + 1))}
      currentTab={tab}
      expandedId={expandedId}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
    />,
  );
}

describe('GameTable — rejilla de columnas de la vista plegada', () => {
  it.each<TabId>(['c', 'v', 'e', 'p'])('declara un <col> por columna y el del nombre va primero (pestaña %s)', (tab) => {
    const { container } = renderTable(tab, 3);
    const cols = container.querySelectorAll('colgroup col');
    const cabeceras = container.querySelectorAll('thead th');

    expect(cols.length).toBe(cabeceras.length);
    expect(cols[0].className).toBe('col-row-main');
    for (const col of Array.from(cols).slice(1)) {
      expect(col.className).toBe('col-row-rest');
    }
  });

  // El meta compacto se pinta como una REJILLA de columnas fijas, y quién decide si existe la columna de la
  // puntuación es el JSX (clase `meta-score`), con el mismo criterio que la cabecera de escritorio. De esa
  // clase cuelgan dos cosas del CSS: que se reserve la columna de la nota para toda la lista, y que cuando no
  // la hay su sitio lo ocupen los puntos fuertes.
  it.each<[TabId, boolean]>([['c', true], ['p', true], ['e', false]])(
    'la pestaña %s declara columna de nota: %s',
    (tab, esperado) => {
      const { container } = renderGames(tab, [makeGame(1)]);
      expect(container.querySelector('table')?.classList.contains('meta-score')).toBe(esperado);
    },
  );

  it('en abandonados la columna de nota depende de que haya alguna nota, como en escritorio', () => {
    // La puntuación de esa lista es OPT-IN: los no puntuados se guardan con nota 0.
    const conNota = renderGames('v', [makeGame(1, { grade: 0, score: 0 }), makeGame(2, { grade: 80, score: 4 })]);
    expect(conNota.container.querySelector('table')?.classList.contains('meta-score')).toBe(true);
    conNota.unmount();

    const sinNota = renderGames('v', [makeGame(1, { grade: 0, score: 0 }), makeGame(2, { grade: 0, score: 0 })]);
    expect(sinNota.container.querySelector('table')?.classList.contains('meta-score')).toBe(false);
  });

  it('las píldoras del meta van en el DOM en el mismo orden en el que se ven, y sin el año', () => {
    // La rejilla coloca cada categoría en su columna, pero el orden del documento es el que oye un lector de
    // pantalla: si discrepan, se lee la fila en un orden distinto del que se ve.
    // El año NO entra en la tarjeta: «2026 +2» se lee como una operación aritmética en vez de como «ese año y
    // otros dos», y su ancho es el que le hace falta al género para verse entero. Sigue en la columna de
    // escritorio y en el detalle desplegado, donde salen todos los años y no solo el último.
    const { container } = renderGames('c', [makeGame(1)]);
    const clases = Array.from(container.querySelectorAll('.row-meta .row-meta-item')).map(
      (item) => item.className.replace('row-meta-item ', ''),
    );
    expect(clases).toEqual(['rm-score', 'rm-plat', 'rm-genre', 'rm-strong']);

    // Pero la columna de escritorio y el detalle sí siguen contando el año.
    expect(container.querySelector('td.col-c-year')).not.toBeNull();
  });

  // El `colSpan` de las filas a lo ancho —el detalle desplegado y los espaciadores del virtualizador, que
  // salen del MISMO `getColSpan`— tiene que cuadrar con el número de columnas declaradas. Si se descuadra, la
  // fila ancha inventa columnas que el `<colgroup>` no dimensiona y vuelve el reparto a partes iguales.
  // Se comprueba sobre el detalle porque el espaciador no llega a pintarse en jsdom: sin maquetación el
  // virtualizador no devuelve filas y entra su red de seguridad, que pinta la tabla entera.
  it.each<TabId>(['c', 'v', 'e', 'p'])('la fila a lo ancho abarca todas las columnas (pestaña %s)', (tab) => {
    const { container } = renderTable(tab, 3, 1);
    const columnas = container.querySelectorAll('colgroup col').length;
    const detalle = container.querySelector<HTMLTableCellElement>('tr.detail-row td');

    expect(detalle).not.toBeNull();
    expect(detalle?.colSpan).toBe(columnas);
  });
});
