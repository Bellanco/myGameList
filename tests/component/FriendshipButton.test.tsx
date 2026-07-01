import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FriendshipButton } from '../../src/view/components/socialhub/FriendshipButton';
import { SOCIAL_UI } from '../../src/core/constants/labels';

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

  it('estado outgoing: "Pendiente" cancela al pulsar', () => {
    const onCancel = vi.fn();
    render(<FriendshipButton {...base} state="outgoing" onCancel={onCancel} />);
    fireEvent.click(screen.getByLabelText(SOCIAL_UI.friendship.cancelAria('Ada')));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('estado friends: chip "Amigos" + eliminar solo si se pasa onRemove', () => {
    const onRemove = vi.fn();
    const { rerender } = render(<FriendshipButton {...base} state="friends" />);
    expect(screen.getByText(SOCIAL_UI.friendship.friends)).toBeInTheDocument();
    expect(screen.queryByLabelText(SOCIAL_UI.friendship.removeAria('Ada'))).toBeNull();

    rerender(<FriendshipButton {...base} state="friends" onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText(SOCIAL_UI.friendship.removeAria('Ada')));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el botón cuando busy', () => {
    render(<FriendshipButton {...base} state="none" busy />);
    expect(screen.getByLabelText(SOCIAL_UI.friendship.addAria('Ada'))).toBeDisabled();
  });
});
