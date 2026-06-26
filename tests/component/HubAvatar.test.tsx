import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HubAvatar } from '../../src/view/components/socialhub/HubAvatar';

describe('HubAvatar', () => {
  it('muestra la foto cuando hay photoURL válida', () => {
    const { container } = render(<HubAvatar name="Ada" photoURL="https://example.com/a.jpg" />);
    const img = container.querySelector('img.hub-avatar-img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/a.jpg');
  });

  it('cae al avatar de inicial si la imagen falla al cargar', () => {
    const { container } = render(<HubAvatar name="Ada" photoURL="https://example.com/roto.jpg" />);
    const img = container.querySelector('img.hub-avatar-img') as HTMLImageElement;
    fireEvent.error(img);
    expect(container.querySelector('img.hub-avatar-img')).toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('muestra la inicial cuando no hay photoURL', () => {
    render(<HubAvatar name="Bruno" />);
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('aplica el sizeClass al avatar de inicial', () => {
    const { container } = render(<HubAvatar name="Ada" sizeClass="hub-avatar-lg" />);
    expect(container.querySelector('.hub-avatar.hub-avatar-lg')).not.toBeNull();
  });
});
