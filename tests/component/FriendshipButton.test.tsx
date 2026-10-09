import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FriendshipButton } from '../../src/view/components/socialhub/FriendshipButton';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';

const base = {
  SOCIAL_UI,
  name: 'Ada',
  onAddOrAccept: vi.fn(),
  onCancel: vi.fn(),
};

describe('FriendshipButton', () => {
  it('estado none: muestra "Añadir amigo" y llama a onAddOrAccept', () => {
    const onAddOrAccept = vi.fn();
    render(<FriendshipButton {...base} state="none" onAddOrAccept={onAddOrAccept} />);
    const btn = screen.getByLabelText(SOCIAL_UI.friendship.addAria('Ada'));
    fireEvent.click(btn);
    expect(onAddOrAccept).toHaveBeenCalledTimes(1);
  });

  it('estado incoming: muestra "Aceptar"', () => {
    render(<FriendshipButton {...base} state="incoming" />);
    expect(screen.getByLabelText(SOCIAL_UI.friendship.acceptAria('Ada'))).toBeInTheDocument();
  });

  // El estado y la acción por separado (09-10-2026): «Pendiente» es un rótulo, no un botón, y retirar la petición
  // es una acción con su propio nombre.
  it('estado outgoing: «Pendiente» es un rótulo y «Retirar» la acción que la retira', () => {
    const onCancel = vi.fn();
    render(<FriendshipButton {...base} state="outgoing" onCancel={onCancel} />);
    expect(screen.queryByRole('button', { name: SOCIAL_UI.friendship.pending })).toBeNull();
    expect(screen.getByText(SOCIAL_UI.friendship.pending).tagName).toBe('SPAN');

    const retirar = screen.getByRole('button', { name: SOCIAL_UI.friendship.cancelAria('Ada') });
    expect(retirar).toHaveTextContent(SOCIAL_UI.friendship.withdraw);
    fireEvent.click(retirar);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // En la ficha, la amistad es un botón rosa que dice el ESTADO («♥ Amigos») y lleva a dejar de serlo con
  // confirmación (la pone quien llama). Su nombre accesible empieza por lo que se ve (WCAG 2.5.3).
  it('estado friends: chip "Amigos" sin onRemove; con onRemove, el botón rosa "♥ Amigos"', () => {
    const onRemove = vi.fn();
    const { rerender } = render(<FriendshipButton {...base} state="friends" />);
    expect(screen.getByText(SOCIAL_UI.friendship.friends).tagName).toBe('SPAN');
    expect(screen.queryByLabelText(SOCIAL_UI.friendship.removeAria('Ada'))).toBeNull();

    rerender(<FriendshipButton {...base} state="friends" onRemove={onRemove} />);
    const boton = screen.getByRole('button', { name: SOCIAL_UI.friendship.removeAria('Ada') });
    expect(boton).toHaveTextContent(SOCIAL_UI.friendship.friends);
    expect(boton).toHaveClass('btn-friend');
    expect(boton.querySelector('use')?.getAttribute('href')).toBe('#icon-heart');
    expect(SOCIAL_UI.friendship.removeAria('Ada').startsWith(SOCIAL_UI.friendship.friends)).toBe(true);
    fireEvent.click(boton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el botón cuando busy', () => {
    render(<FriendshipButton {...base} state="none" busy />);
    expect(screen.getByLabelText(SOCIAL_UI.friendship.addAria('Ada'))).toBeDisabled();
  });
});
