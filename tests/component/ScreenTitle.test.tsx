import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScreenTitle } from '../../src/view/components/socialhub/ScreenTitle';

// El título de pantalla con letras recortadas (Persona): el lector de pantalla tiene que oír el título entero, no
// letra a letra, y el reparto de tintas no puede cambiar entre pintados.
describe('ScreenTitle', () => {
  it('el nombre accesible es el título de corrido; las letras recortadas van ocultas al lector', () => {
    const { container } = render(<h2><ScreenTitle text="Perfil de Marta" /></h2>);

    expect(screen.getByRole('heading', { name: 'Perfil de Marta' })).toBeInTheDocument();
    expect(container.querySelector('.rc-letters')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.rc-word')).toHaveLength(3);
    expect(container.querySelectorAll('.rc')).toHaveLength('PerfildeMarta'.length);
  });

  it('el mismo título sale igual cada vez: el reparto sale de la posición, no del azar', () => {
    const a = render(<ScreenTitle text="Logros de Marta" />).container.innerHTML;
    const b = render(<ScreenTitle text="Logros de Marta" />).container.innerHTML;
    expect(a).toBe(b);
  });
});
