import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem, TabId } from '../../src/model/types/game';

// EL LISTADO TIENE UNA SOLA COLUMNA, y este fichero existe para que siga siendo así.
//
// Sigue siendo un `<table>` a propósito: es lo que permite que el virtualizador mida FILAS de verdad (cada
// renglón, cada fila de tarjetas y cada detalle desplegado son un `<tr>` que se mide) mientras el CSS pinta
// piezas sueltas. Lo que se fue son las COLUMNAS: la tabla de escritorio con sus 6-8 celdas por fila llevaba
// tiempo sin poder verse —el `<table>` lleva siempre `is-cards` o `is-grid`, y las dos escondían la cabecera—,
// así que era DOM muerto: 7 de cada 8 celdas eran `display:none`.
//
// Con una columna desaparece de golpe la clase de fallo que tenía aquella: con `table-layout: fixed` la rejilla
// la construía la PRIMERA fila, que en una biblioteca grande es un espaciador del virtualizador con `colSpan`
// de todas las columnas; el navegador repartía el ancho entre 6-8 columnas (46 px cada una en un móvil de 412)
// e ignoraba el `width: 100%` de la única celda visible, y el nombre salía a un carácter por línea. Hacía falta
// un `<colgroup>` para arreglarlo; ahora no hay nada que repartir.
//
// jsdom no maqueta, así que no se mide el ancho: se mide el invariante del que todo aquello dependía.

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

describe('GameTable — una sola columna', () => {
  it.each<TabId>(['c', 'v', 'e', 'p'])('cada renglón es UNA celda, sin cabecera ni colgroup (pestaña %s)', (tab) => {
    const { container } = renderTable(tab, 3);

    expect(container.querySelector('thead')).toBeNull();
    expect(container.querySelector('colgroup')).toBeNull();
    for (const fila of Array.from(container.querySelectorAll('tbody tr.main-row'))) {
      expect(fila.querySelectorAll('td').length).toBe(1);
    }
  });

  it('la tabla conserva su nombre accesible: con cuatro listas es lo único que las distingue', () => {
    // Se fue la cabecera, no la semántica. `<caption>` es lo que hace que un lector de pantalla no anuncie
    // «tabla» a secas al recorrer la página.
    const { container } = renderTable('c', 3);
    expect(container.querySelector('caption')?.textContent).toContain('3');
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

  it('las ranuras de categoría van en el DOM en el mismo orden en el que se ven', () => {
    // La rejilla de columnas invisibles coloca cada categoría en su sitio, pero el orden del documento es el
    // que oye un lector de pantalla: si discrepan, se lee la fila en un orden distinto del que se ve.
    const { container } = renderGames('c', [makeGame(1)]);
    const clases = Array.from(container.querySelectorAll('.row-cats .row-cat')).map(
      (item) => item.className.replace('row-cat ', ''),
    );
    expect(clases).toEqual(['row-cat-year', 'row-cat-plat', 'row-cat-genre']);

  });

  it('el año del renglón enseña el más reciente y cuenta los demás', () => {
    // jsdom declara 1024 px de ancho, o sea por debajo del umbral compacto: aquí se mide el renglón de
    // TELÉFONO, donde la ranura del año mide 6,6 rem y solo cabe uno. El contador es lo que dice que hay más;
    // en escritorio caben tres y el «+N» aparece a partir del cuarto.
    const { container } = renderGames('c', [makeGame(1, { years: [2019, 2024, 2021] })]);
    const chips = Array.from(container.querySelectorAll('.row-cat-year .chip')).map((chip) => chip.textContent);

    expect(chips).toEqual(['2024', '+2']);
  });

  it('la ranura de la nota se pinta aunque el juego no tenga puntuación, para que las filas no se descuadren', () => {
    // Si la ranura se encogiera, la insignia de al lado cambiaría de sitio en unas filas sí y en otras no:
    // es justo la desalineación que el renglón viene a quitar.
    const { container } = renderGames('v', [makeGame(1, { grade: 0, score: 0 }), makeGame(2, { grade: 80, score: 4 })]);
    const rangos = container.querySelectorAll('.row-actions .row-score');

    expect(rangos.length).toBe(2);
    expect(rangos[0].textContent).toBe('');
    expect(rangos[1].textContent).not.toBe('');
  });

  // LAS FILAS A LO ANCHO —el detalle desplegado, las filas de tarjetas y los espaciadores del virtualizador—
  // ya no necesitan `colSpan`: con una sola columna, una celda ocupa la tabla entera por definición. Lo que se
  // comprueba es que nadie haya vuelto a meter columnas por la puerta de atrás, porque ahí volvería el reparto
  // a partes iguales que dejaba el nombre en un carácter por línea.
  // Se comprueba sobre el detalle porque el espaciador no llega a pintarse en jsdom: sin maquetación el
  // virtualizador no devuelve filas y entra su red de seguridad, que pinta la tabla entera.
  it.each<TabId>(['c', 'v', 'e', 'p'])('el detalle desplegado es una celda más, como todas (pestaña %s)', (tab) => {
    const { container } = renderTable(tab, 3, 1);
    const detalle = container.querySelector<HTMLTableCellElement>('tr.detail-row td');

    expect(detalle).not.toBeNull();
    expect(container.querySelectorAll('tr.detail-row td').length).toBe(1);
    expect(detalle?.colSpan).toBe(1);
  });
});
