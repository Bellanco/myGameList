import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GameSheetPanel, type GameSheetPanelProps } from '../../src/view/components/gameSheet/GameSheetPanel';
import { TAB_ACTIONS } from '../../src/core/constants/labels';
import { statsReviewPath } from '../../src/core/utils/reviewPath';
import type { GameItem, TabData } from '../../src/model/types/game';

// LA FICHA DE UN JUEGO (F2 del plan de la ficha): el panel que sustituye al detalle de la fila. jsdom no maqueta,
// así que aquí se prueba lo que no depende del layout —qué enseña, qué hace cada botón, Esc y el gesto de cerrar— y
// el ancho medido y el scroll quedan para el e2e.

function juego(id: number, name: string, over: Partial<GameItem> = {}): GameItem {
  return { id, _ts: 1, name, platforms: ['Steam'], genres: ['Metroidvania'], steamDeck: false, review: '', ...over };
}

function biblioteca(parcial: Partial<TabData> = {}): TabData {
  return { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0, ...parcial };
}

const hollow = juego(1, 'Hollow Knight', {
  grade: 92,
  score: 5,
  hours: 46,
  years: [2024, 2018],
  replayable: true,
  steamDeck: true,
  strengths: ['Exploración'],
  weaknesses: ['Mapa de pago'],
  review: 'Un mapa que se descubre a mano.',
  enteredAt: { c: new Date(2024, 0, 20).getTime() },
});
const silksong = juego(2, 'Hollow Knight: Silksong', { grade: 80, score: 4 });

function pintar(over: Partial<GameSheetPanelProps> = {}) {
  const props: GameSheetPanelProps = {
    open: true,
    data: biblioteca({ c: [hollow], d: [silksong] }),
    slug: 'hollow-knight',
    onClose: vi.fn(),
    onOpenGame: vi.fn(),
    tabActions: TAB_ACTIONS,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMigrate: vi.fn(),
    reviewTarget: (_tab, game) => ({ to: statsReviewPath(game.id, game.name) }),
    ...over,
  };
  render(
    <MemoryRouter>
      <GameSheetPanel {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe('GameSheetPanel', () => {
  it('se abre con el nombre, tu lista, desde cuándo y el resumen de una línea', () => {
    pintar();
    const dialog = screen.getByRole('dialog', { name: 'Ficha de Hollow Knight' }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(screen.getByRole('heading', { name: 'Hollow Knight' })).toBeInTheDocument();
    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.getByText('desde enero de 2024')).toBeInTheDocument();
    expect(screen.getByText('Steam · Metroidvania · 2024')).toBeInTheDocument();
  });

  it('enseña todo lo que enseñaba el detalle, con sus reglas de completados', () => {
    pintar();
    expect(screen.getByText('Steam Deck')).toBeInTheDocument();
    expect(screen.getByText('Años en los que se completó')).toBeInTheDocument();
    expect(screen.getByText('46 horas')).toBeInTheDocument();
    expect(screen.getByText('Exploración')).toBeInTheDocument();
    expect(screen.getByText('Mapa de pago')).toBeInTheDocument();
    expect(screen.getByText('Rejugabilidad')).toBeInTheDocument();
    expect(screen.getByText('Tu nota')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver análisis de Hollow Knight' })).toHaveAttribute('href', statsReviewPath(1, 'Hollow Knight'));
  });

  it('en curso no enseña nota (ahí vale 0), pero sí el análisis, como el detalle', () => {
    pintar({ data: biblioteca({ e: [juego(3, 'Persona 5 Strikers', { score: 0, review: 'x' })] }), slug: 'persona-5-strikers' });
    expect(screen.queryByText('Tu nota')).toBeNull();
    expect(screen.queryByText('Tu interés')).toBeNull();
    expect(screen.getByText('Ver análisis')).toBeInTheDocument();
  });

  it('en próximos y deseos no hay análisis', () => {
    pintar({ data: biblioteca({ p: [juego(4, 'Hades', { grade: 70, review: 'x' })] }), slug: 'hades' });
    expect(screen.queryByText('Ver análisis')).toBeNull();
  });

  it('en deseos, el rótulo de la nota es «Tu interés»', () => {
    pintar({ slug: 'hollow-knight-silksong' });
    expect(screen.getByText('Tu interés')).toBeInTheDocument();
  });

  it('no se abre si no tienes el juego de esa clave', () => {
    pintar({ slug: 'celeste' });
    expect((document.querySelector('dialog') as HTMLDialogElement).open).toBe(false);
  });

  it('Esc y la X cierran', () => {
    const props = pintar();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('los botones mueven, editan y borran el juego de su lista', () => {
    const props = pintar();
    fireEvent.click(screen.getByRole('button', { name: /Pasar a en curso/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar - Hollow Knight' }));
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Hollow Knight' }));
    expect(props.onMigrate).toHaveBeenCalledWith('c', 1, 'e');
    expect(props.onEdit).toHaveBeenCalledWith('c', 1);
    expect(props.onDelete).toHaveBeenCalledWith('c', 1);
  });

  it('la saga abre la ficha de la otra entrega y marca la actual', () => {
    const props = pintar();
    const otras = screen.getAllByRole('button', { name: 'Abrir la ficha de Hollow Knight: Silksong' });
    fireEvent.click(otras[0]);
    expect(props.onOpenGame).toHaveBeenCalledWith('Hollow Knight: Silksong');
    expect(document.querySelector('.gs-saga-item[aria-current="true"]')).not.toBeNull();
  });
});

describe('GameSheetPanel · deslizar a la derecha para cerrar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 400 });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
  });

  function arrastrar(dx: number, dy: number, pointerType: string, msTotal: number) {
    const panel = document.querySelector('.gs-panel') as HTMLElement;
    const pasos = 6;
    act(() => {
      fireEvent.pointerDown(panel, { pointerId: 1, pointerType, clientX: 100, clientY: 300 });
    });
    for (let i = 1; i <= pasos; i++) {
      act(() => {
        vi.advanceTimersByTime(msTotal / pasos);
        fireEvent.pointerMove(panel, { pointerId: 1, pointerType, clientX: 100 + (dx * i) / pasos, clientY: 300 + (dy * i) / pasos });
      });
    }
    const durante = panel.style.transform;
    act(() => {
      fireEvent.pointerUp(panel, { pointerId: 1, pointerType, clientX: 100 + dx, clientY: 300 + dy });
      vi.advanceTimersByTime(300);
    });
    return { durante, despues: panel.style.transform };
  }

  it('un arrastre largo hacia la derecha cierra', () => {
    const props = pintar();
    const { durante } = arrastrar(200, 0, 'touch', 600);
    expect(durante).toBe('translateX(200px)');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('uno corto y lento vuelve a su sitio', () => {
    const props = pintar();
    const { durante, despues } = arrastrar(60, 0, 'touch', 600);
    expect(durante).toBe('translateX(60px)');
    expect(despues).toBe('');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('un gesto vertical es del scroll y no mueve el panel', () => {
    const props = pintar();
    const { durante } = arrastrar(10, -200, 'touch', 300);
    expect(durante).toBe('');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('con el ratón no hace nada', () => {
    const props = pintar();
    const { durante } = arrastrar(250, 0, 'mouse', 100);
    expect(durante).toBe('');
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
