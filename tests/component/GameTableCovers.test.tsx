// Qué carátulas PIDE el listado, que no es lo mismo que cómo se pintan (de eso va `GameCover.test.tsx`).
//
// Aquí se protegen tres decisiones que cuestan dinero y bytes: que el mosaico ofrezca las dos resoluciones para
// que elija el navegador, que el renglón pida la suya, y que un juego del que ya se sabe que no tiene carátula
// no vuelva a pedir NINGUNA de las dos.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import { coverUrl } from '../../src/core/utils/coverUrl';
import { recordarQueNoTiene, reiniciarMemoriaDeCaratulas } from '../../src/core/utils/coverMemory';
import { claveDeJuego, guardarHechos, leerHechos, reiniciarIndiceDeCaratulas } from '../../src/core/utils/coverDone';
import type { GameItem, TabId } from '../../src/model/types/game';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

/* La cuenta de administración pide sus carátulas en modo ampliado; aquí se finge serlo o no sin pasar por Auth.
   Como el de verdad, con la pregunta apagada (`enabled = false`) contesta que no. */
const admin = vi.hoisted(() => ({ es: false }));
vi.mock('../../src/view/hooks/useIsAdmin', () => ({ useIsAdmin: (enabled = true) => enabled && admin.es }));

function juego(id: number, name: string): GameItem {
  return {
    id, _ts: 1, name, platforms: ['Steam'], genres: ['Acción'], steamDeck: false, review: '', grade: 50, score: 3,
  } as GameItem;
}

function pinta(forma: 'grid' | 'list', juegos: GameItem[], tab: TabId = 'c', allowCovers = true) {
  localStorage.setItem('mis-listas-covers', 'on');
  localStorage.setItem('mis-listas-list-shape', forma);
  return render(
    <GameTable
      games={juegos}
      currentTab={tab}
      expandedId={null}
      onExpandedChange={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
      coverPolicy={{ allowed: allowCovers }}
    />,
  );
}

beforeEach(() => {
  admin.es = false;
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
  reiniciarIndiceDeCaratulas();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
  reiniciarIndiceDeCaratulas();
});

describe('qué carátulas pide el listado', () => {
  it('el mosaico ofrece las dos resoluciones y deja elegir al navegador', () => {
    const { container } = pinta('grid', [juego(1, 'Celeste')]);
    const img = container.querySelector('.game-cover-img');

    expect(img?.getAttribute('src')).toBe(coverUrl('Celeste', ['Steam']));
    // 1x la de la ranura, 2x la del doble de densidad: en una pantalla normal la segunda ni se pide.
    expect(img?.getAttribute('srcset')).toBe(`${coverUrl('Celeste', ['Steam'])} 1x, ${coverUrl('Celeste', ['Steam'], false, 'medio')} 2x`);
  });

  it('del juego que ya se sabe que no tiene no se pide ninguna de las dos', () => {
    // La memoria se guarda por la URL NORMAL, y vale para todos los tamaños: si esa dio 404, las otras también.
    recordarQueNoTiene(coverUrl('Jotum', ['Steam']));
    const { container } = pinta('grid', [juego(1, 'Jotum')]);

    expect(container.querySelector('.game-cover-img')).toBeNull();
    // Y la caja no se queda en un hueco: enseña su portada de casa con el título.
    expect(container.querySelector('.game-cover-title')?.textContent).toBe('Jotum');
  });

  it('el renglón pide la franja en la resolución de en medio', () => {
    const { container } = pinta('list', [juego(1, 'Celeste')]);
    const fila = container.querySelector<HTMLElement>('tr.main-row');

    expect(fila?.className).toContain('has-cover');
    expect(fila?.style.getPropertyValue('--row-cover')).toBe(`url("${coverUrl('Celeste', ['Steam'], false, 'medio')}")`);
  });

  /* La `ancho` (762×1080) era de la cuenta de administración, y costaba casi el doble de descodificación al bajar
     sin que el detalle de más llegara a verse bajo el velo (ver `coverDeRenglon`). */
  it('la cuenta de administración también pide la de en medio', () => {
    admin.es = true;
    const { container } = pinta('list', [juego(1, 'Celeste')]);
    const fila = container.querySelector<HTMLElement>('tr.main-row');

    expect(fila?.style.getPropertyValue('--row-cover')).toBe(`url("${coverUrl('Celeste', ['Steam'], true, 'medio')}")`);
  });

  /* EL PRIMER RENDER YA SALE RECORTADO. Si el virtualizador nace sin viewport, la red de seguridad monta la lista
     entera y la recorta en la misma tarea: no se ve, pero cada renglón llega a pedir su carátula de fondo y esas
     descargas no se cancelan (149 carátulas por visita en producción). Las filas que se quitan sin haberse
     pintado son la huella de ese render intermedio. */
  it('una lista larga en renglones no monta todas sus filas para recortarlas después', async () => {
    const juegos = Array.from({ length: 150 }, (_unused, i) => juego(i + 1, `Juego ${i + 1}`));
    // jsdom no tiene layout: con filas de 0 px, el virtualizador ya medido mete la lista entera en la ventana y no
    // habría nada que distinguir. Con una altura de renglón de verdad recorta como en el navegador.
    const original = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return this.matches('tr.main-row') ? DOMRect.fromRect({ width: 1000, height: 150 }) : original.call(this);
    });
    const contenedor = document.body.appendChild(document.createElement('div'));
    let quitadas = 0;
    const observador = new MutationObserver((registros) => {
      for (const registro of registros) {
        registro.removedNodes.forEach((nodo) => {
          if (!(nodo instanceof Element)) return;
          quitadas += (nodo.matches('tr.main-row') ? 1 : 0) + nodo.querySelectorAll('tr.main-row').length;
        });
      }
    });
    observador.observe(contenedor, { childList: true, subtree: true });
    localStorage.setItem('mis-listas-covers', 'on');
    localStorage.setItem('mis-listas-list-shape', 'list');

    const { container } = render(
      <GameTable
        games={juegos}
        currentTab="c"
        expandedId={null}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
        coverPolicy={{ allowed: true }}
      />,
      { container: contenedor },
    );
    await Promise.resolve();
    observador.disconnect();
    vi.restoreAllMocks();

    const montadas = container.querySelectorAll('tr.main-row').length;
    expect(montadas).toBeGreaterThan(0);
    expect(montadas).toBeLessThan(juegos.length);
    expect(quitadas).toBeLessThan(juegos.length / 2);
  });

  it('y sin carátula conocida el renglón se queda en su superficie plana', () => {
    recordarQueNoTiene(coverUrl('Jotum', ['Steam']));
    const { container } = pinta('list', [juego(1, 'Jotum')]);
    const fila = container.querySelector<HTMLElement>('tr.main-row');

    expect(fila?.className).not.toContain('has-cover');
    expect(fila?.style.getPropertyValue('--row-cover')).toBe('');
  });

  /* LA LISTA PUEDE NEGAR LAS CARÁTULAS AUNQUE EL CHECK ESTÉ ENCENDIDO: la política del sitio va por encima de
     la preferencia, y con `false` la lista vuelve a la vista de siempre. */
  it('la lista puede negar las carátulas aunque la preferencia esté encendida', () => {
    const { container } = pinta('grid', [juego(1, 'Celeste')], 'c', false);

    expect(container.querySelector('.game-cover-img')).toBeNull();
    // Y no queda un hueco donde iba la imagen: la caja se pinta en su forma PLANA, que es la misma vista que ya
    // existe con la preferencia apagada. Por eso esto no añade un segundo diseño que mantener.
    expect(container.querySelector('.game-grid.is-flat')).not.toBeNull();
    expect(container.querySelector('.game-card.is-flat')).not.toBeNull();
  });

  it('y el renglón tampoco se trae su franja', () => {
    const { container } = pinta('list', [juego(1, 'Celeste')], 'c', false);
    const fila = container.querySelector<HTMLElement>('tr.main-row');

    expect(fila?.className).not.toContain('has-cover');
    expect(fila?.style.getPropertyValue('--row-cover')).toBe('');
  });

  /* REAPROVECHAR LO YA DESCARGADO (`preferKnown`). La URL de la carátula lleva las plataformas dentro, así que
     el mismo juego en la estantería de otra persona era otra URL: otra descarga, otro sitio en la caché y —si
     las plataformas no normalizan igual— otro emparejamiento contra IGDB. Con el título ya resuelto, la lista
     ajena pide la URL que este navegador ya tiene. */
  it('un juego ya resuelto se pide con las plataformas de siempre, no con las de la otra estantería', () => {
    const hechos = leerHechos();
    hechos.add(claveDeJuego('Celeste', ['Steam'], false));
    guardarHechos(hechos);

    localStorage.setItem('mis-listas-covers', 'on');
    localStorage.setItem('mis-listas-list-shape', 'grid');
    const ajeno = { ...juego(1, 'Celeste'), platforms: ['Nintendo Switch'] } as GameItem;
    const { container } = render(
      <GameTable
        games={[ajeno]}
        currentTab="c"
        expandedId={null}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
        coverPolicy={{ allowed: true, preferKnown: true }}
      />,
    );

    // La de Steam, que es la que ya está descargada — no la de Switch, que habría que traerse entera.
    expect(container.querySelector('.game-cover-img')?.getAttribute('src')).toBe(coverUrl('Celeste', ['Steam']));
  });

  it('y sin esa política se piden las plataformas del juego que se tiene delante', () => {
    const hechos = leerHechos();
    hechos.add(claveDeJuego('Celeste', ['Steam'], false));
    guardarHechos(hechos);

    const ajeno = { ...juego(1, 'Celeste'), platforms: ['Nintendo Switch'] } as GameItem;
    const { container } = pinta('grid', [ajeno]);

    // Tu propia biblioteca no reaprovecha nada: si le cambias la plataforma a un juego, su carátula se vuelve a
    // resolver con la nueva, que es lo que hay que hacer cuando el dato lo has cambiado tú.
    expect(container.querySelector('.game-cover-img')?.getAttribute('src')).toBe(
      coverUrl('Celeste', ['Nintendo Switch']),
    );
  });

  /* LO AJENO (`cachedOnly`), que es como se pinta la biblioteca de otra persona: la marca `c=2` hace que el
     servidor solo resuelva lo que falte dentro de la parte del cupo del día reservada a lo ajeno, y así mirar
     perfiles no les quita escrituras de KV a las bibliotecas propias. */
  function pintaAjena(forma: 'grid' | 'list', juegos: GameItem[]) {
    localStorage.setItem('mis-listas-covers', 'on');
    localStorage.setItem('mis-listas-list-shape', forma);
    return render(
      <GameTable
        games={juegos}
        currentTab="c"
        expandedId={null}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
        coverPolicy={{ cachedOnly: true, preferKnown: true }}
      />,
    );
  }

  it('lo ajeno se pide con la marca de lo ajeno, en todos los tamaños', () => {
    const ajeno = { ...juego(1, 'Celeste'), platforms: ['Nintendo Switch'] } as GameItem;
    const { container } = pintaAjena('grid', [ajeno]);
    const img = container.querySelector('.game-cover-img');

    const normal = coverUrl('Celeste', ['Nintendo Switch'], false, 'normal', 'ajeno');
    const medio = coverUrl('Celeste', ['Nintendo Switch'], false, 'medio', 'ajeno');
    expect(normal).toContain('c=2');
    expect(img?.getAttribute('src')).toBe(normal);
    expect(img?.getAttribute('srcset')).toBe(`${normal} 1x, ${medio} 2x`);
  });

  it('y la franja del renglón, también', () => {
    const { container } = pintaAjena('list', [juego(1, 'Celeste')]);
    const fila = container.querySelector<HTMLElement>('tr.main-row');

    expect(fila?.style.getPropertyValue('--row-cover')).toBe(
      `url("${coverUrl('Celeste', ['Steam'], false, 'medio', 'ajeno')}")`,
    );
  });

  it('pero un título que tu biblioteca ya resolvió se pide con su URL de siempre, sin la marca', () => {
    // Está resuelto seguro, y con la marca la URL sería otra: otra descarga de la misma imagen.
    const hechos = leerHechos();
    hechos.add(claveDeJuego('Celeste', ['Steam'], false));
    guardarHechos(hechos);
    const ajeno = { ...juego(1, 'Celeste'), platforms: ['Nintendo Switch'] } as GameItem;
    const { container } = pintaAjena('grid', [ajeno]);

    expect(container.querySelector('.game-cover-img')?.getAttribute('src')).toBe(coverUrl('Celeste', ['Steam']));
  });

  /* LA LENTE DE LA ADMINISTRACIÓN SE QUEDA EN CASA. Su espacio de claves solo lo llena su propia biblioteca, y
     lo ajeno no resuelve con el cupo entero: pedido con `x=1`, salía sin carátula salvo los juegos que la
     administración también tiene, aunque su dueño los viera todos. */
  it('la cuenta de administración pide lo ajeno sin el modo ampliado', () => {
    admin.es = true;
    const ajeno = { ...juego(1, 'Celeste'), platforms: ['Nintendo Switch'] } as GameItem;
    const caja = pintaAjena('grid', [ajeno]).container.querySelector('.game-cover-img');
    expect(caja?.getAttribute('src')).toBe(coverUrl('Celeste', ['Nintendo Switch'], false, 'normal', 'ajeno'));
    cleanup();

    const fila = pintaAjena('list', [ajeno]).container.querySelector<HTMLElement>('tr.main-row');
    expect(fila?.style.getPropertyValue('--row-cover')).toBe(
      `url("${coverUrl('Celeste', ['Nintendo Switch'], false, 'medio', 'ajeno')}")`,
    );
  });

  it('y del que ya se sabe que no tiene no se pide nada, con marca o sin ella', () => {
    recordarQueNoTiene(coverUrl('Jotum', ['Steam']));
    const { container } = pintaAjena('grid', [juego(1, 'Jotum')]);

    expect(container.querySelector('.game-cover-img')).toBeNull();
  });

  /* EL INTERRUPTOR ES UN INTERRUPTOR, NO UN BORRADO. Apagarlo deja de pedir imágenes; volver a encenderlo pide
     EXACTAMENTE las mismas URL que antes, que es lo que hace que las sirva la caché del navegador y la del
     service worker en vez de descargarse otra vez. */
  it('apagar y volver a encender pide las mismas URL, no unas nuevas', () => {
    const antes = pinta('grid', [juego(1, 'Celeste')]);
    const url = antes.container.querySelector('.game-cover-img')?.getAttribute('src');
    expect(url).toBe(coverUrl('Celeste', ['Steam']));
    cleanup();

    localStorage.setItem('mis-listas-covers', 'off');
    const apagado = render(
      <GameTable
        games={[juego(1, 'Celeste')]}
        currentTab="c"
        expandedId={null}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
      />,
    );
    expect(apagado.container.querySelector('.game-cover-img')).toBeNull();
    cleanup();

    const despues = pinta('grid', [juego(1, 'Celeste')]);
    expect(despues.container.querySelector('.game-cover-img')?.getAttribute('src')).toBe(url);
  });

  it('con la preferencia apagada no se pide nada, en ninguna de las dos formas', () => {
    // Es la garantía que sostiene la promesa de privacidad: sin encenderla, el servidor no pregunta por tus
    // títulos en IGDB. Por eso viene apagada.
    localStorage.setItem('mis-listas-list-shape', 'grid');
    const { container } = render(
      <GameTable
        games={[juego(1, 'Celeste')]}
        currentTab="c"
        expandedId={null}
        onExpandedChange={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onMigrate={vi.fn()}
        tabActions={[]}
      />,
    );

    expect(container.querySelector('.game-cover-img')).toBeNull();
    expect(container.querySelector('tr.main-row.has-cover')).toBeNull();
  });
});
