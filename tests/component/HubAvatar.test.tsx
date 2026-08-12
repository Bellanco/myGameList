import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { HubAvatar } from '../../src/view/components/socialhub/HubAvatar';

/** El `<use>` del sprite: es lo que identifica qué icono se está pintando. */
function iconHref(container: HTMLElement): string | null {
  return container.querySelector('.hub-avatar-icon use')?.getAttribute('href') ?? null;
}

describe('HubAvatar', () => {
  it('muestra la foto cuando hay photoURL válida', () => {
    const { container } = render(<HubAvatar photoURL="https://example.com/a.jpg" />);
    const img = container.querySelector('img.hub-avatar-img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://example.com/a.jpg');
  });

  it('cae a la silueta si la imagen falla al cargar', () => {
    // Caso real: una URL de Google caducada o rotada. Sin este respaldo quedaría un hueco roto en el feed.
    const { container } = render(<HubAvatar photoURL="https://example.com/roto.jpg" />);
    fireEvent.error(container.querySelector('img.hub-avatar-img') as HTMLImageElement);

    expect(container.querySelector('img.hub-avatar-img')).toBeNull();
    expect(iconHref(container)).toBe('#icon-person');
  });

  it('muestra la silueta cuando no hay photoURL', () => {
    const { container } = render(<HubAvatar />);
    expect(iconHref(container)).toBe('#icon-person');
    expect(container.querySelector('.hub-avatar-blank')).not.toBeNull();
  });

  it('la silueta es la MISMA para todo el mundo: no depende de ningún nombre', () => {
    // Regresión de la decisión de diseño: antes era la inicial del nick sobre uno de seis tonos, así que el color
    // de alguien cambiaba al cambiarse el nombre. Si alguien vuelve a introducir una clase por persona, esto falla.
    const primera = render(<HubAvatar />);
    const segunda = render(<HubAvatar />);
    const clases = (el: Element | null) => el?.className ?? '';

    expect(clases(primera.container.querySelector('.hub-avatar'))).toBe(clases(segunda.container.querySelector('.hub-avatar')));
    expect(clases(primera.container.querySelector('.hub-avatar'))).not.toMatch(/hub-avatar--\d/);
  });

  it('aplica el sizeClass a la silueta', () => {
    const { container } = render(<HubAvatar sizeClass="hub-avatar-lg" />);
    expect(container.querySelector('.hub-avatar.hub-avatar-lg')).not.toBeNull();
  });

  it('la silueta es decorativa: no anuncia nada al lector de pantalla (el nombre va al lado)', () => {
    const { container } = render(<HubAvatar />);
    expect(container.querySelector('.hub-avatar')?.getAttribute('aria-hidden')).toBe('true');
  });
});
