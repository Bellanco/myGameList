import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScreenHeader } from '../../src/view/components/ScreenHeader';

/**
 * LA CABECERA DE PANTALLA ES DECORATIVA. La enciende un tema (Forja) y los demás la dejan en `display: none`, así
 * que lo que no puede cambiar entre temas es lo que oye un lector de pantalla: ni un segundo encabezado junto al
 * `<h1 class="sr-only">` de `main`, ni cifras que ya se anuncian en su sitio (la pestaña, el panel).
 */
describe('ScreenHeader', () => {
  it('no entra en el árbol de accesibilidad ni añade encabezados', () => {
    const { container } = render(
      <ScreenHeader kicker="Biblioteca" title="Lista del completista" figures={[{ value: '149', unit: 'juegos' }]} />,
    );

    expect(container.querySelector('.screen-header')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryAllByRole('heading', { hidden: true })).toHaveLength(0);
  });

  it('pinta rótulo, título y cada cifra con su unidad', () => {
    const { container } = render(
      <ScreenHeader
        variant="band"
        kicker="Biblioteca"
        title="Lista del completista"
        figures={[{ value: '149', unit: 'juegos' }, { value: '3740', unit: 'h' }, { value: '3,5', unit: '/5' }]}
      />,
    );

    expect(container.querySelector('.screen-header')).toHaveClass('is-band');
    expect(container.querySelector('.screen-header-kicker')).toHaveTextContent('Biblioteca');
    expect(container.querySelector('.screen-header-title')).toHaveTextContent('Lista del completista');
    const cifras = [...container.querySelectorAll('.screen-header-figure')].map((el) => el.textContent);
    expect(cifras).toEqual(['149 juegos', '3740 h', '3,5 /5']);
  });

  it('sin cifras no deja el hueco', () => {
    const { container } = render(<ScreenHeader kicker="Ajustes" title="Datos" />);
    expect(container.querySelector('.screen-header-figures')).toBeNull();
  });
});
