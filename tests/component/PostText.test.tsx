import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostBody, PostText } from '../../src/view/components/socialhub/PostText';

describe('PostText (linkify seguro)', () => {
  it('convierte URLs http/https en enlaces con rel y target seguros', () => {
    render(<PostText text="Mira esto https://example.com/news ahora" />);
    const link = screen.getByRole('link', { name: 'https://example.com/news' });
    expect(link).toHaveAttribute('href', 'https://example.com/news');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('NO crea enlaces para esquemas peligrosos (javascript:) — quedan como texto', () => {
    const { container } = render(<PostText text="peligro javascript:alert(1) fin" />);
    expect(container.querySelectorAll('a')).toHaveLength(0);
    expect(container.textContent).toContain('javascript:alert(1)');
  });

  it('saca la puntuación final del enlace', () => {
    render(<PostText text="fuente: https://example.com." />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link.textContent).toBe('https://example.com');
  });

  it('incrusta imagen para una URL de host de confianza (y queda clicable al original)', () => {
    const src = 'https://raw.githubusercontent.com/u/r/main/x.png';
    const { container } = render(<PostText text={`mira ${src} fin`} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', src);
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(container.querySelector('a')).toHaveAttribute('href', src);
  });

  it('incrusta vídeo para .mp4 de host de confianza', () => {
    const src = 'https://raw.githubusercontent.com/u/r/main/v.mp4';
    const { container } = render(<PostText text={src} />);
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', src);
    expect(video).toHaveAttribute('controls');
  });

  it('host NO permitido se queda como enlace, nunca como imagen', () => {
    const src = 'https://evil.example.com/x.png';
    const { container } = render(<PostText text={src} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toHaveAttribute('href', src);
  });

  it('página filedetails de Steam: enlace + aviso de URL directa', () => {
    const url = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3726276136';
    const { container } = render(<PostText text={`mira ${url}`} sharedFilePageHint="Pega la URL directa" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toHaveAttribute('href', url);
    expect(container.querySelector('.hub-post-hint')?.textContent).toContain('Pega la URL directa');
  });

  it('un enlace normal NO muestra el aviso de URL directa', () => {
    const { container } = render(<PostText text="https://example.com/noticia" sharedFilePageHint="Pega la URL directa" />);
    expect(container.querySelector('.hub-post-hint')).toBeNull();
  });
});

describe('PostBody (recorte de publicaciones largas)', () => {
  // El cupo de caracteres lo decide el RANGO del autor (plata 1.000, oro 10.000, mithril 100.000). Sin recorte,
  // una sola publicación de rango alto ocupaba el feed entero. El recorte no puede esconder contenido: el botón
  // tiene que aparecer siempre que de verdad sobre texto, y desplegarlo tiene que enseñarlo todo.
  function medirComo(scrollHeight: number, clientHeight: number) {
    const proto = window.HTMLElement.prototype;
    const original = {
      scroll: Object.getOwnPropertyDescriptor(proto, 'scrollHeight'),
      client: Object.getOwnPropertyDescriptor(proto, 'clientHeight'),
    };
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => scrollHeight });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => clientHeight });
    return () => {
      if (original.scroll) Object.defineProperty(proto, 'scrollHeight', original.scroll);
      if (original.client) Object.defineProperty(proto, 'clientHeight', original.client);
    };
  }

  it('sin desbordamiento no se ofrece "Ver más"', () => {
    const restaurar = medirComo(100, 100);
    try {
      render(<PostBody text="Un post corto" expandLabel="Ver más" collapseLabel="Ver menos" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      // La clase de recorte SÍ sigue puesta a propósito: sobre un texto que cabe no hace nada, y es lo que permite
      // volver a medir si la ventana se estrecha. Retirarla dejaría el elemento sin recorte y la medida diría
      // para siempre "no sobra nada", con lo que esas líneas se perderían sin botón que las recupere.
    } finally {
      restaurar();
    }
  });

  it('con desbordamiento recorta, ofrece "Ver más" y al desplegar muestra el texto entero', async () => {
    const restaurar = medirComo(900, 200);
    try {
      const largo = 'palabra '.repeat(2000);
      const { container } = render(<PostBody text={largo} expandLabel="Ver más" collapseLabel="Ver menos" />);

      const parrafo = container.querySelector('.hub-post-text');
      expect(parrafo).toHaveClass('is-clamped');
      // El texto COMPLETO está siempre en el DOM: el recorte es visual, nunca una pérdida de contenido.
      expect(parrafo?.textContent).toContain(largo.trim());

      const boton = screen.getByRole('button', { name: 'Ver más' });
      expect(boton).toHaveAttribute('aria-expanded', 'false');

      await userEvent.click(boton);
      expect(container.querySelector('.hub-post-text')).not.toHaveClass('is-clamped');
      expect(screen.getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true');
    } finally {
      restaurar();
    }
  });

  it('un texto corto CON MUCHOS SALTOS DE LÍNEA también se recorta (por eso se mide, no se cuentan caracteres)', () => {
    const restaurar = medirComo(900, 200);
    try {
      render(<PostBody text={'a\n'.repeat(40)} expandLabel="Ver más" collapseLabel="Ver menos" />);
      expect(screen.getByRole('button', { name: 'Ver más' })).toBeInTheDocument();
    } finally {
      restaurar();
    }
  });
});
