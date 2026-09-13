import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SocialHubSkeleton } from '../../src/view/components/SocialHubSkeleton';
import { SOCIAL_SHELL } from '../../src/core/constants/socialShell';
import { SOCIAL_CAN_POST_KEY } from '../../src/core/constants/storageKeys';

/**
 * ENTRAR EN SOCIAL PASABA POR DOS ESCENAS DE CARGA Y NO POR UNA.
 *
 * El esqueleto del `Suspense` pintaba una tarjeta con el título y cuatro renglones grises; al llegar el chunk
 * aparecían de golpe la cabecera con avatar, la fila de botones y el compositor —unos 300 px de interfaz—, las
 * tarjetas grises bajaban de sitio y volvían a empezar su pulso. Lo que fija este fichero es que el esqueleto
 * promete EXACTAMENTE lo que va a llegar, porque lo dibuja el mismo componente (`FeedShell`).
 */
describe('armazón de la actividad social — el esqueleto promete lo que llega', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('pinta la cabecera, los tres botones y el rótulo de actividad, igual que la pantalla real', () => {
    render(<SocialHubSkeleton />);

    expect(screen.getByRole('heading', { name: SOCIAL_SHELL.feed.title })).toBeInTheDocument();
    expect(screen.getByText(SOCIAL_SHELL.feed.subtitle)).toBeInTheDocument();
    expect(screen.getByText(SOCIAL_SHELL.feed.openProfiles)).toBeInTheDocument();
    expect(screen.getByText(SOCIAL_SHELL.feed.signOut)).toBeInTheDocument();
    expect(screen.getByText(SOCIAL_SHELL.feed.activityTitle)).toBeInTheDocument();
  });

  it('sus botones no hacen nada todavía: deshabilitados, atenuados y fuera del árbol de accesibilidad', () => {
    const { container } = render(<SocialHubSkeleton />);

    const fila = container.querySelector('.hub-screen-actions');
    expect(fila).toHaveClass('is-placeholder');
    expect(fila).toHaveAttribute('aria-hidden', 'true');
    for (const boton of container.querySelectorAll('.hub-screen-actions button')) {
      expect(boton).toBeDisabled();
    }
  });

  it('anuncia la espera aunque el esqueleto en sí sea decorativo', () => {
    render(<SocialHubSkeleton />);
    expect(screen.getByRole('status')).toHaveTextContent(SOCIAL_SHELL.loading);
  });

  // El compositor solo existe a partir del rango plata, y el rango no se sabe hasta que carga el hub: se reserva
  // su hueco según lo que pasó la última vez (ver `socialShellHint`). Sin la pista no se promete nada, que es lo
  // correcto para quien nunca ha entrado —empieza en bronce, que no publica—.
  it('no reserva el hueco del compositor sin una pista previa', () => {
    const { container } = render(<SocialHubSkeleton />);
    expect(container.querySelector('.hub-post-composer')).toBeNull();
  });

  it('lo reserva cuando la última vez sí se podía publicar', () => {
    localStorage.setItem(SOCIAL_CAN_POST_KEY, '1');
    const { container } = render(<SocialHubSkeleton />);

    const hueco = container.querySelector('.hub-post-composer');
    expect(hueco).not.toBeNull();
    // Es un hueco, no un compositor: ni se escribe en él ni se publica desde él.
    expect(hueco?.querySelector('textarea')).toBeDisabled();
    expect(hueco?.querySelector('button')).toBeDisabled();
  });
});
