import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { FeedLikeBar } from '../../src/view/components/socialhub/FeedLikeBar';

// FASE 4 de docs/plan-reacciones.md — el botón «Me gusta» y su frase.

const { phrase, fullList } = SOCIAL_UI.feed.likes;

describe('la frase de «me gusta»', () => {
  it('sin ti: un nombre, dos, y con tres o más UNO solo y la cuenta', () => {
    expect(phrase([])).toBe('');
    expect(phrase(['Marta'])).toBe('A Marta le gusta');
    expect(phrase(['Marta', 'Nacho'])).toBe('A Marta y a Nacho les gusta');
    expect(phrase(['Nacho', 'Marta', 'Lucía', 'Iván', 'Paula', 'Bea'])).toBe('A Nacho y a 5 más les gusta');
  });

  it('contigo, en cuanto pulsas', () => {
    expect(phrase([], true)).toBe('Te gusta');
    expect(phrase(['Nacho'], true)).toBe('A ti y a Nacho os gusta');
    expect(phrase(['Nacho', 'Marta', 'Lucía', 'Iván', 'Paula'], true)).toBe('A ti y a 5 más os gusta');
  });

  it('de cada nombre, solo la primera palabra, y sin recortes', () => {
    expect(phrase(['Maximiliano Fernández-Villaverde', 'Paula G.'])).toBe('A Maximiliano y a Paula les gusta');
    expect(phrase(['Lucía R.'], true)).toBe('A ti y a Lucía os gusta');
    expect(phrase(['  Bea  '])).toBe('A Bea le gusta');
  });

  it('la lista entera, para el title y el detalle: con los nombres enteros y una «a» delante de cada uno', () => {
    expect(fullList(['Nacho', 'Marta', 'Lucía'])).toBe('A Nacho, a Marta y a Lucía les gusta');
    expect(fullList(['Nacho', 'Marta López'], true)).toBe('A ti, a Nacho y a Marta López os gusta');
    expect(fullList(['Marta López'])).toBe('A Marta López le gusta');
    expect(fullList([], true)).toBe('Te gusta');
  });
});

describe('FeedLikeBar', () => {
  it('en lo de otra persona: botón apagado y frase', () => {
    render(<FeedLikeBar SOCIAL_UI={SOCIAL_UI} likes={{ names: ['Paula G.'], mine: false }} own={false} author="Nacho" onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Me gusta lo de Nacho' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('A Paula le gusta')).toBeInTheDocument();
  });

  it('pulsar avisa, no abre la tarjeta y hace saltar el pulgar; la frase te cuenta al momento', () => {
    const onToggle = vi.fn();
    const onCardClick = vi.fn();
    const { rerender } = render(
      <div role="button" tabIndex={0} onClick={onCardClick} onKeyDown={vi.fn()}>
        <FeedLikeBar SOCIAL_UI={SOCIAL_UI} likes={{ names: ['Paula G.'], mine: false }} own={false} author="Nacho" onToggle={onToggle} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Me gusta lo de Nacho' });
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(button).toHaveAttribute('data-pop', 'like');

    // El view-model marca el «me gusta» al instante (antes de subirlo): la barra lo pinta ya.
    rerender(
      <div role="button" tabIndex={0} onClick={onCardClick} onKeyDown={vi.fn()}>
        <FeedLikeBar SOCIAL_UI={SOCIAL_UI} likes={{ names: ['Paula G.'], mine: true }} own={false} author="Nacho" onToggle={onToggle} />
      </div>,
    );
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('A ti y a Paula os gusta')).toBeInTheDocument();

    // Quitarlo tiene su propia animación, más callada.
    fireEvent.click(button);
    expect(button).toHaveAttribute('data-pop', 'unlike');
  });

  it('en el detalle (`everyone`) nombra a todos, con el nombre entero y sin title', () => {
    const names = ['Marta López', 'Nacho', 'Lucía R.', 'Paula G.'];
    render(<FeedLikeBar SOCIAL_UI={SOCIAL_UI} likes={{ names, mine: true }} own={false} author="Iván" onToggle={vi.fn()} everyone />);
    const who = screen.getByText('A ti, a Marta López, a Nacho, a Lucía R. y a Paula G. os gusta');
    expect(who).not.toHaveAttribute('title');
  });

  it('las teclas del botón no llegan a la tarjeta (Intro abriría el detalle)', () => {
    const onCardKey = vi.fn();
    render(
      <div role="button" tabIndex={0} onKeyDown={onCardKey}>
        <FeedLikeBar SOCIAL_UI={SOCIAL_UI} likes={{ names: [], mine: false }} own={false} author="Nacho" onToggle={vi.fn()} />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Me gusta lo de Nacho' }), { key: 'Enter' });
    expect(onCardKey).not.toHaveBeenCalled();
  });

  it('en lo tuyo: sin botón; solo la frase, y nada si a nadie le gusta', () => {
    const { container, rerender } = render(
      <FeedLikeBar SOCIAL_UI={SOCIAL_UI} likes={{ names: [], mine: false }} own author="Yo" onToggle={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<FeedLikeBar SOCIAL_UI={SOCIAL_UI} likes={{ names: ['Marta', 'Nacho'], mine: true }} own author="Yo" onToggle={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    // `mine` no cuenta en lo propio aunque viniera puesto.
    expect(screen.getByText('A Marta y a Nacho les gusta')).toBeInTheDocument();
  });
});
