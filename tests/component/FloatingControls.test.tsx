import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { FloatingControls } from '../../src/view/components/FloatingControls';

/**
 * LOS CONTROLES FLOTANTES SE ESCONDEN AL BAJAR, y ese es su diseño: la esquina superior derecha no puede estorbar
 * la lectura. Lo que no puede pasar es que el escondite sobreviva al cambio de pantalla.
 *
 * Se ocultan con `pointer-events: none`, así que mientras dure ese estado el clic se lo come lo que haya debajo
 * —el `main`— y no hay manera de llegar a Ajustes ni al cambio de tema. El CI lo cazó de la forma más cara
 * posible: veinticinco segundos de reintentos de Playwright contra un botón que estaba «visible» y no recibía el
 * clic.
 */
describe('los controles flotantes al cambiar de sección', () => {
  const pintar = (section: 'lists' | 'stats' | 'social' | 'settings' = 'lists') =>
    render(<FloatingControls activeSection={section} onSectionChange={vi.fn()} showAccount={false} />);

  /** El scroll no se puede mover de verdad en jsdom: se finge la posición y se avisa como haría el navegador. */
  /** El componente decide dentro de un `requestAnimationFrame`: se le deja pasar un latido de reloj. */
  const unLatido = () => new Promise((listo) => setTimeout(listo, 40));

  const desplazarA = async (top: number) => {
    Object.defineProperty(window, 'scrollY', { value: top, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
      await unLatido();
    });
  };

  const grupo = () => screen.getByLabelText('Ajustes').closest('.floating-controls') as HTMLElement;

  it('se esconden al bajar', async () => {
    pintar();
    expect(grupo().className).not.toContain('is-hidden');
    await desplazarA(200);
    expect(grupo().className).toContain('is-hidden');
  });

  it('vuelven al cambiar de sección si la pantalla nueva está arriba', async () => {
    const { rerender } = pintar('lists');
    await desplazarA(200);
    expect(grupo().className).toContain('is-hidden');

    // La pantalla nueva se pinta arriba del todo: el navegador ajusta la posición sin disparar `scroll`, así que
    // el componente tiene que volver a mirarla por su cuenta.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    await act(async () => {
      rerender(<FloatingControls activeSection="stats" onSectionChange={vi.fn()} showAccount={false} />);
      await unLatido();
    });

    expect(grupo().className).not.toContain('is-hidden');
  });

  it('y siguen escondidos si la sección nueva conserva el desplazamiento', async () => {
    const { rerender } = pintar('lists');
    await desplazarA(200);

    await act(async () => {
      rerender(<FloatingControls activeSection="social" onSectionChange={vi.fn()} showAccount={false} />);
      await unLatido();
    });

    expect(grupo().className).toContain('is-hidden');
  });
});
