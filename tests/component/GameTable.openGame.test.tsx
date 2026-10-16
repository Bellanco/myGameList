import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GameTable } from '../../src/view/components/GameTable';
import type { GameItem } from '../../src/model/types/game';

// CON `onOpenGame`, TOCAR ABRE LA FICHA Y EL DOBLE CLIC SIGUE EDITANDO (F2 del plan de la ficha). Sin la prop (el
// perfil de una amistad, hasta la F5), se sigue desplegando el detalle.

const juego: GameItem = { id: 7, _ts: 1, name: 'Celeste', platforms: ['PC'], genres: ['Plataformas'], steamDeck: false, review: '' };

function pintar(onOpenGame?: (game: GameItem) => void) {
  const props = { onExpandedChange: vi.fn(), onEdit: vi.fn() };
  render(
    <GameTable
      games={[juego]}
      currentTab="c"
      expandedId={null}
      onExpandedChange={props.onExpandedChange}
      onOpenGame={onOpenGame}
      onEdit={props.onEdit}
      onDelete={vi.fn()}
      onMigrate={vi.fn()}
      tabActions={[]}
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

  it('con el dedo o el teclado, tocar el renglón abre la ficha al momento y no despliega nada', () => {
    const onOpenGame = vi.fn();
    const { onExpandedChange } = pintar(onOpenGame);
    const boton = screen.getByRole('button', { name: /Celeste/ });
    expect(boton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(boton).not.toHaveAttribute('aria-expanded');
    fireEvent.click(boton);
    expect(onOpenGame).toHaveBeenCalledWith(juego);
    expect(onExpandedChange).not.toHaveBeenCalled();
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

  it('sin `onOpenGame` sigue desplegando el detalle', () => {
    const { onExpandedChange } = pintar();
    const boton = screen.getByRole('button', { name: /Celeste/ });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(boton);
    expect(onExpandedChange).toHaveBeenCalledWith(7);
  });
});
