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
});
