import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { HubAvatar } from '../../src/view/components/socialhub/HubAvatar';
import { getKnownPhotoVerdict, resetPhotoVerdicts } from '../../src/core/social/googlePhoto';

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

  // EL AVATAR GENÉRICO DE GOOGLE también cae a la silueta. Se filtra AQUÍ, al pintar, porque esas URLs ya están
  // publicadas en los canales de mucha gente: retirarlas en el render las quita de golpe de todas las pantallas, sin
  // esperar a que cada usuario reabra la app. Y es coherente con lo que esta silueta decidió ser: la inicial sobre un
  // círculo de color —que es exactamente lo que Google genera— es lo que aquí NO se pinta.
  describe('avatar genérico de Google', () => {
    const MONOGRAMA = 'https://lh3.googleusercontent.com/a/ACg8ocMonograma=s96-c';

    afterEach(() => {
      resetPhotoVerdicts();
      vi.unstubAllGlobals();
    });

    it('retira la foto al confirmarse que es el monograma', async () => {
      // PNG pequeño = monograma (jsdom no trae canvas, así que decide la primera criba: formato y peso).
      vi.stubGlobal('fetch', () => Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        blob: () => Promise.resolve({ size: 478 } as Blob),
      } as unknown as Response));

      const { container } = render(<HubAvatar photoURL={MONOGRAMA} />);
      await waitFor(() => expect(container.querySelector('img.hub-avatar-img')).toBeNull());
      expect(iconHref(container)).toBe('#icon-person');
    });

    it('una foto de verdad se queda', async () => {
      vi.stubGlobal('fetch', () => Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'image/jpeg' }),
        blob: () => Promise.resolve({ size: 3985 } as Blob),
      } as unknown as Response));

      const foto = 'https://lh3.googleusercontent.com/a/ACg8ocFoto=s96-c';
      const { container } = render(<HubAvatar photoURL={foto} />);
      // Se espera al VEREDICTO, no a la imagen: la imagen ya está en el primer render, así que sin esto la
      // comprobación pasaría sin haber llegado a mirar nada.
      await waitFor(() => expect(getKnownPhotoVerdict(foto)).toBe(false));
      expect(container.querySelector('img.hub-avatar-img')).not.toBeNull();
    });

    // Los defaults ANTIGUOS se reconocen por la URL, así que ni siquiera hay parpadeo: silueta desde el primer render.
    it('la silueta gris de Google no llega a pintarse', () => {
      const { container } = render(<HubAvatar photoURL="https://lh3.googleusercontent.com/a/default-user=s96-c" />);
      expect(container.querySelector('img.hub-avatar-img')).toBeNull();
      expect(iconHref(container)).toBe('#icon-person');
    });
  });
});
