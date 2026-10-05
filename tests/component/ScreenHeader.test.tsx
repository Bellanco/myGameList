import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScreenHeader } from '../../src/view/components/ScreenHeader';

/**
 * LA CABECERA DE PANTALLA ES DECORATIVA. La enciende un tema (Forja) y los demás la dejan en `display: none`, así
 * que lo que no puede cambiar entre temas es lo que oye un lector de pantalla: ni un segundo encabezado junto al
 * `<h1 class="sr-only">` de `main`.
 */
describe('ScreenHeader', () => {
  it('no entra en el árbol de accesibilidad ni añade encabezados', () => {
    const { container } = render(<ScreenHeader kicker="Ajustes" title="Diseño" />);

    expect(container.querySelector('.screen-header')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryAllByRole('heading', { hidden: true })).toHaveLength(0);
  });

  it('pinta rótulo y título, y nada más', () => {
    const { container } = render(<ScreenHeader kicker="Ajustes" title="Diseño" />);

    expect(container.querySelector('.screen-header-kicker')).toHaveTextContent('Ajustes');
    expect(container.querySelector('.screen-header-title')).toHaveTextContent('Diseño');
    expect(container.querySelector('.screen-header')).toHaveTextContent(/^AjustesDiseño$/);
  });
});
