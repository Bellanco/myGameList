import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { PremiosVoteScreen } from '../../src/view/components/premios/PremiosVoteScreen';
import { PREMIOS_UI } from '../../src/core/constants/premiosLabels';
import { buildLibraryIndex } from '../../src/core/premios/library';
import type { PremiosCategory } from '../../src/model/types/premios';
import type { GameItem, TabData } from '../../src/model/types/game';

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

const juego = (name: string, extra: Partial<GameItem> = {}): GameItem =>
  ({ id: 1, _ts: 0, name, platforms: [], genres: [], steamDeck: false, review: '', ...extra }) as GameItem;

const libraryIndex = buildLibraryIndex({
  c: [juego('Elden Ring', { grade: 92 })],
  v: [],
  e: [juego('Balatro')],
  p: [],
  deleted: [],
  updatedAt: 0,
} as unknown as TabData);

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
      <PremiosVoteScreen
        categories={categories}
        paso={paso}
        votes={{}}
        libraryIndex={libraryIndex}
        formatGrade={(grade) => (grade === null ? '' : String(grade))}
        onChoose={onChoose}
      />
      <Donde />
    </MemoryRouter>,
  );
  return onChoose;
}

describe('PremiosVoteScreen', () => {
  it('enseña la categoría del paso pedido y sus nominados', () => {
    renderPantalla(1);
    expect(screen.getByRole('heading', { name: 'Juego del año' })).toBeInTheDocument();
    expect(screen.getByText(PREMIOS_UI.votar.categoryOf(1, 2))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeAria('Hades II') })).toBeInTheDocument();
  });

  // EL CRUCE CON LA BIBLIOTECA: es lo que hace que la sección sea parte de la app y no un inquilino.
  it('marca los nominados que ya están en tu biblioteca, con su nota', () => {
    renderPantalla(1);
    expect(screen.getByText(PREMIOS_UI.votar.inYourLibrary.c)).toBeInTheDocument();
    expect(screen.getByText(PREMIOS_UI.votar.yourGrade('92'))).toBeInTheDocument();
    // Un juego en curso sin puntuar sale marcado, pero sin nota inventada.
    expect(screen.getByText(PREMIOS_UI.votar.inYourLibrary.e)).toBeInTheDocument();
  });

  it('no marca nada de lo que no tienes', () => {
    renderPantalla(2);
    expect(screen.queryByText(PREMIOS_UI.votar.inYourLibrary.c)).not.toBeInTheDocument();
  });

  it('elegir avisa con el id del nominado y avanza al paso siguiente', async () => {
    const onChoose = renderPantalla(1);
    await userEvent.click(screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeAria('Balatro') }));

    expect(onChoose).toHaveBeenCalledWith('goty', { id: 'goty_option_2', name: 'Balatro' });
    expect(await screen.findByTestId('ruta')).toHaveTextContent('/premios/votar/2');
  });

  it('en la última categoría, elegir lleva a la revisión', async () => {
    renderPantalla(2);
    await userEvent.click(screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeAria('Hollow Knight') }));
    expect(await screen.findByTestId('ruta')).toHaveTextContent('/premios/revisar');
  });

  // El reparto lo decide `gridDensity` midiendo el contenedor: con 5 nominados y 1280 px de hueco toca 3+2, que
  // es lo que evita dejar una tarjeta sola en la última fila.
  it('reparte las columnas según el hueco medido, no con auto-fit', () => {
    renderPantalla(1);
    const grid = document.querySelector('.premios-vote__grid') as HTMLElement;
    expect(grid.style.getPropertyValue('--premios-cols')).toBe('3');
  });

  it('el estado de cada tarjeta se puede oír, no solo ver', () => {
    render(
      <MemoryRouter initialEntries={['/premios/votar/1']}>
        <PremiosVoteScreen
          categories={categories}
          paso={1}
          votes={{ goty: { id: 'goty_option_0', name: 'Elden Ring' } }}
          libraryIndex={libraryIndex}
          formatGrade={() => ''}
          onChoose={vi.fn()}
        />
      </MemoryRouter>,
    );
    const elegido = screen.getByRole('button', { name: PREMIOS_UI.votar.nomineeChosenAria('Elden Ring') });
    expect(elegido).toHaveAttribute('aria-pressed', 'true');
  });
});
