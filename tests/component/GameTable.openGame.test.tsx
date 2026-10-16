import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem } from '../../src/model/types/game';

// TOCAR ABRE LA FICHA Y EL DOBLE CLIC SIGUE EDITANDO (F2 y F5 del plan de la ficha): la ficha sustituyó al detalle
// que se desplegaba bajo la fila, también en el perfil de una amistad.

const juego: GameItem = { id: 7, _ts: 1, name: 'Celeste', platforms: ['PC'], genres: ['Plataformas'], steamDeck: false, review: '' };

function pintar(onOpenGame: (game: GameItem) => void) {
  const props = { onEdit: vi.fn() };
  render(
    <GameTable
      games={[juego]}
      currentTab="c"
      onOpenGame={onOpenGame}
      onEdit={props.onEdit}
    />,
  );
  return props;
}

function clicConRaton(el: Element) {
  const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
  Object.defineProperty(evento, 'pointerType', { value: 'mouse' });
  fireEvent(el, evento);
}

describe('GameTable · abrir la ficha', () => {
  afterEach(() => vi.useRealTimers());

  it('con el dedo o el teclado, tocar el renglón abre la ficha al momento', () => {
    const onOpenGame = vi.fn();
    pintar(onOpenGame);
    const boton = screen.getByRole('button', { name: /Celeste/ });
    expect(boton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(boton).not.toHaveAttribute('aria-expanded');
    fireEvent.click(boton);
    expect(onOpenGame).toHaveBeenCalledWith(juego);
  });

  it('con el ratón espera al doble clic: si llega, edita y no abre la ficha', () => {
    vi.useFakeTimers();
    const onOpenGame = vi.fn();
    const { onEdit } = pintar(onOpenGame);
    const fila = document.querySelector('tr.main-row') as HTMLElement;
    act(() => {
      clicConRaton(fila);
      clicConRaton(fila);
      fireEvent.doubleClick(fila);
      vi.advanceTimersByTime(400);
    });
    expect(onEdit).toHaveBeenCalledWith('c', 7);
    expect(onOpenGame).not.toHaveBeenCalled();
  });

  it('con el ratón, un clic suelto abre la ficha pasado el tiempo del doble clic', () => {
    vi.useFakeTimers();
    const onOpenGame = vi.fn();
    pintar(onOpenGame);
    const fila = document.querySelector('tr.main-row') as HTMLElement;
    act(() => clicConRaton(fila));
    expect(onOpenGame).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(onOpenGame).toHaveBeenCalledWith(juego);
  });
});
