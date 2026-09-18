import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { FloatingControls } from '../../src/view/components/FloatingControls';

/**
 * LOS CONTROLES FLOTANTES SE ESCONDEN AL BAJAR, y ese es su diseño: la esquina superior derecha no puede estorbar
 * la lectura. Lo que no puede pasar es que el escondite sobreviva al cambio de pantalla.
 *
 * Se ocultan con `pointer-events: none`, así que mientras dure ese estado el clic se lo come lo que haya debajo
 * —el `main`— y no hay manera de llegar a lo que quede aquí arriba. El CI lo cazó de la forma más cara posible:
 * veinticinco segundos de reintentos de Playwright contra un botón que estaba «visible» y no recibía el clic.
 *
 * Ajustes ya no está en este grupo —tiene pestaña propia—, así que lo que el escondite se llevaba por delante
 * es menos grave que antes; el fallo que cazó el CI, en cambio, sigue estando a una regresión de distancia.
 */
describe('los controles flotantes al cambiar de sección', () => {
  const pintar = (section: 'lists' | 'stats' | 'social' | 'settings' = 'lists') =>
    render(<FloatingControls activeSection={section} />);

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

  // Se busca por la CLASE y no por el rótulo de un botón: lo que hay dentro del grupo cambia con el rediseño
  // (Ajustes ya se fue, Cuenta se irá), y el test es sobre el grupo, no sobre quién lo habita.
  const grupo = () => document.querySelector('.floating-controls') as HTMLElement;

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
      rerender(<FloatingControls activeSection="stats" />);
      await unLatido();
    });

    expect(grupo().className).not.toContain('is-hidden');
  });

  it('y siguen escondidos si la sección nueva conserva el desplazamiento', async () => {
    const { rerender } = pintar('lists');
    await desplazarA(200);

    await act(async () => {
      rerender(<FloatingControls activeSection="social" />);
      await unLatido();
    });

    expect(grupo().className).toContain('is-hidden');
  });
});
