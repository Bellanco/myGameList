import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PremiosVoteScreen } from '../../src/view/components/premios/PremiosVoteScreen';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import type { PremiosCategory } from '../../src/model/types/premios';

/**
 * LA PANTALLA DE VOTAR, que es por donde pasa todo el mundo.
 *
 * jsdom no trae `ResizeObserver` ni mide nada (todo ancho es 0), así que se simulan las dos cosas: sin eso la
 * rejilla se quedaría siempre en su reparto de respaldo y este test no comprobaría el que de verdad se usa.
 */
beforeAll(() => {
  class RO {
    constructor(private readonly cb: () => void) {}
    observe() {
      this.cb();
    }
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 1280 } as DOMRect);
});

const categoria = (id: string, titulo: string, nominados: string[]): PremiosCategory => ({
  id,
  title: { es: titulo },
  options: nominados.map((name, i) => ({ id: `${id}_option_${i}`, name })),
  weight: 1,
});

const categories = [
  categoria('goty', 'Juego del año', ['Elden Ring', 'Hades II', 'Balatro', 'Astro Bot', 'Metaphor']),
  categoria('arte', 'Mejor dirección de arte', ['Sea of Stars', 'Hollow Knight']),
];

/**
 * Espía de la dirección actual.
 *
 * Se comprueba A DÓNDE SE NAVEGA y no qué pantalla aparece: declarar rutas de destino en el test hacía que la
 * literal (`/premios/votar/2`) tapara a la paramétrica (`/premios/votar/:paso`) y el caso de la última categoría
 * fallaba por el andamiaje, no por el código.
 */
function Donde() {
  return <output data-testid="ruta">{useLocation().pathname}</output>;
}

function renderPantalla(paso = 1, onChoose = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[`/premios/votar/${paso}`]}>
      <PremiosVoteScreen categories={categories} paso={paso} votes={{}} onChoose={onChoose} />
      <Donde />
    </MemoryRouter>,
  );
  return onChoose;
}

describe('PremiosVoteScreen', () => {
  it('enseña la categoría del paso pedido y sus nominados', () => {
    renderPantalla(1);
    expect(screen.getByRole('heading', { name: 'Juego del año' })).toBeInTheDocument();
    // El recorrido se dice con el contador y el porcentaje de la cabecera, como en la porra de origen.
    expect(screen.getByText(PREMIOS_UI.votar.progressCount(1, 2))).toBeInTheDocument();
    expect(screen.getByText(PREMIOS_UI.votar.progressPercent(50))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeAria('Hades II') })).toBeInTheDocument();
  });

  it('elegir avisa con el id del nominado y avanza al paso siguiente', async () => {
    const onChoose = renderPantalla(1);
    await userEvent.click(screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeAria('Balatro') }));

    expect(onChoose).toHaveBeenCalledWith('goty', { id: 'goty_option_2', name: 'Balatro' });
    // El salto no es inmediato: hay una pausa corta para que la marca de seleccionado llegue a verse.
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/premios/votar/2'));
  });

  it('en la última categoría, elegir lleva a la revisión', async () => {
    renderPantalla(2);
    await userEvent.click(screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeAria('Hollow Knight') }));
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/premios/revisar'));
  });

  // El reparto lo decide `gridDensity` midiendo el contenedor: con 5 nominados y 1280 px de hueco toca 3+2, que
  // es lo que evita dejar una tarjeta sola en la última fila.
  it('reparte las columnas según el hueco medido, no con auto-fit', () => {
    renderPantalla(1);
    const grid = document.querySelector('.premios-vote__grid') as HTMLElement;
    expect(grid.style.getPropertyValue('--premios-cols')).toBe('3');
  });

  // EL PIE DE LA VOTACIÓN: anterior, siguiente y finalizar, siempre a la vista. «Finalizar» no espera a la
  // última categoría — se puede enviar con categorías sin votar.
  it('lleva la navegación completa, con finalizar disponible desde el primer paso', async () => {
    renderPantalla(1);
    expect(screen.getByRole('button', { name: PREMIOS_UI.votar.previous })).toBeDisabled();
    expect(screen.getByRole('button', { name: PREMIOS_UI.votar.next })).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: PREMIOS_UI.votar.finish }));
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/premios/revisar'));
  });

  it('el estado de cada tarjeta se puede oír, no solo ver', () => {
    render(
      <MemoryRouter initialEntries={['/premios/votar/1']}>
        <PremiosVoteScreen
          categories={categories}
          paso={1}
          votes={{ goty: { id: 'goty_option_0', name: 'Elden Ring' } }}
          onChoose={vi.fn()}
        />
      </MemoryRouter>,
    );
    const elegido = screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeChosenAria('Elden Ring') });
    expect(elegido).toHaveAttribute('aria-pressed', 'true');
  });
});
