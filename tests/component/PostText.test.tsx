import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostText } from '../../src/view/components/socialhub/PostText';

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
