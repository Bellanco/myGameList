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

  it('y sin carátula conocida el renglón se queda en su superficie plana', () => {
    recordarQueNoTiene(coverUrl('Jotum', ['Steam']));
    const { container } = pinta('list', [juego(1, 'Jotum')]);
    const fila = container.querySelector<HTMLElement>('tr.main-row');

    expect(fila?.className).not.toContain('has-cover');
    expect(fila?.style.getPropertyValue('--row-cover')).toBe('');
  });

  /* LA LISTA PUEDE NEGAR LAS CARÁTULAS AUNQUE EL CHECK ESTÉ ENCENDIDO, y es lo que sostiene que la biblioteca
     de otra persona no se resuelva hoy salvo para el rango que las tiene desbloqueadas: tu biblioteca la calienta
     el recorrido de fondo una vez, pero cada perfil que abres es un catálogo entero de juegos que no tienes. */
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
