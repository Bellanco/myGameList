// EL ANÁLISIS, DESDE LA CAJA DEL MOSAICO: un acceso a su pantalla, sin volcar el texto. El de la lista va en la ficha
// del juego (`GameSheetPanel`), que sustituyó al detalle que se desplegaba bajo la fila.
//
// Y ES UN ENLACE, no un botón, por tres cosas que un botón no da: abrir en otra pestaña, copiar la dirección y
// volver con el botón de atrás. El precio es que `GameTable` pasa a necesitar un Router, y ese precio se paga
// en silencio: sin él, React lanza «useHref() may be used only in the context of a <Router>» y la pantalla se
// queda en blanco. Este fichero es lo que separa ese fallo de producción.
import { statsReviewPath } from '../../src/core/utils/reviewPath';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem, TabId } from '../../src/model/types/game';

// El mosaico lee la preferencia de carátulas, que se sincroniza por cuenta: sin esto intentaría hablar con Firebase.
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

function makeGame(over: Partial<GameItem> = {}): GameItem {
  return {
    id: 7,
    _ts: 1,
    name: 'Rise of Nations',
    platforms: ['Steam'],
    genres: ['Estrategia'],
    steamDeck: false,
    review: 'Un análisis largo.\nCon dos párrafos.',
    grade: 96,
    score: 5,
    years: [2026],
    ...over,
  };
}

// EL ACCESO, EN LA CAJA DEL MOSAICO: un disco en la esquina de abajo a la derecha de la carátula, debajo de la
// nota. Sin desplegar nada: es lo que se ofrece a quien pasea por la colección en mosaico.
describe('GameTable — el análisis, en la caja del mosaico', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  function mosaico(
    over: Partial<GameItem> = {},
    { tab = 'c', covers = true, reviewLink }: { tab?: TabId; covers?: boolean; reviewLink?: (id: number) => { to: string } } = {},
  ) {
    localStorage.setItem('mis-listas-list-shape', 'grid');
    localStorage.setItem('mis-listas-covers', covers ? 'on' : 'off');
    return render(
      <MemoryRouter>
        <GameTable
          games={[makeGame(over)]}
          currentTab={tab}
          onOpenGame={vi.fn()}
          onEdit={vi.fn()}
          reviewLink={reviewLink}
        />
      </MemoryRouter>,
    );
  }

  it('con reseña, la carátula lleva el enlace a su pantalla', () => {
    const { container } = mosaico();
    const enlace = container.querySelector('.game-card-art .game-card-review');

    expect(enlace).not.toBeNull();
    expect(enlace).toHaveAttribute('href', statsReviewPath(7, 'Rise of Nations'));
    expect(enlace).toHaveAccessibleName('Ver análisis de Rise of Nations');
  });

  it('va a donde diga `reviewLink`: en un perfil ajeno, a SU reseña', () => {
    const { container } = mosaico({}, { reviewLink: (id) => ({ to: `/social/profiles/ana/game/${id}/review` }) });
    expect(container.querySelector('.game-card-review')).toHaveAttribute('href', '/social/profiles/ana/game/7/review');
  });

  it('sin reseña no hay disco', () => {
    const { container } = mosaico({ review: '' });
    expect(container.querySelector('.game-card-review')).toBeNull();
  });

  it('sin carátulas tampoco: la caja plana abre el análisis desde la ficha', () => {
    const { container } = mosaico({}, { covers: false });
    expect(container.querySelector('.game-card.is-flat')).not.toBeNull();
    expect(container.querySelector('.game-card-review')).toBeNull();
  });

  it('ni en próximos, donde no hay análisis que leer', () => {
    const { container } = mosaico({}, { tab: 'p' });
    expect(container.querySelector('.game-card-review')).toBeNull();
  });
});
