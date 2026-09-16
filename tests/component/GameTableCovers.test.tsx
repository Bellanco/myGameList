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

function pinta(forma: 'grid' | 'list', juegos: GameItem[], tab: TabId = 'c') {
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
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
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
