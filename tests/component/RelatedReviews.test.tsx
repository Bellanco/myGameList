// Bloque de reseñas relacionadas al pie de una reseña abierta.
//
// Lo que se comprueba aquí:
//  1. Que sin resultados no pinta NADA: un «no hay relacionadas» al final de cada reseña sería ruido en la
//     mayoría de las bibliotecas, que es justo donde este bloque tiene menos que ofrecer.
//  2. Que cada tarjeta dice POR QUÉ está ahí. Es lo que separa una lista de sugerencias de una respuesta.
//  3. Que lo propio se firma en primera persona, para distinguirlo de un vistazo de lo que han escrito otros.
//  4. Que la tarjeta entera abre la reseña, y que lo hace con un rótulo que un lector de pantalla pueda seguir.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RelatedReviews } from '../../src/view/components/socialhub/RelatedReviews';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import type { RelatedReview } from '../../src/core/social/relatedReviews';

function related(extra: Partial<RelatedReview> & { key: string }): RelatedReview {
  return {
    gameId: 5,
    gameName: 'Elden Ring',
    authorId: 'ana',
    authorName: 'Ana',
    isOwn: false,
    rating: 5,
    grade: 92,
    snippet: 'Un mundo que respeta al jugador.',
    updatedAt: Date.UTC(2026, 0, 15, 10, 0),
    reason: 'same-game',
    score: 120,
    ...extra,
  };
}

describe('RelatedReviews', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('no pinta nada cuando no hay reseñas que ofrecer', () => {
    const { container } = render(
      <RelatedReviews SOCIAL_UI={SOCIAL_UI} items={[]} onOpen={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('no etiqueta por qué está cada tarjeta: el título y la firma ya lo dicen', () => {
    render(
      <RelatedReviews
        SOCIAL_UI={SOCIAL_UI}
        items={[
          related({ key: 'a', reason: 'same-game' }),
          related({ key: 'b', gameName: 'Hollow Knight', reason: 'same-author', score: 60 }),
          related({ key: 'c', gameName: 'Nioh 2', reason: 'genre', score: 20 }),
        ]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText(/Elden Ring/)).toBeInTheDocument();
    expect(screen.getByText(/Hollow Knight/)).toBeInTheDocument();
    expect(screen.queryByText('Mismo juego')).not.toBeInTheDocument();
    expect(screen.queryByText('Más de Ana')).not.toBeInTheDocument();
    expect(screen.queryByText('Otra tuya')).not.toBeInTheDocument();
  });

  it('firma las propias con tu nombre, y las marca por el estilo y no por el texto', () => {
    render(
      <RelatedReviews
        SOCIAL_UI={SOCIAL_UI}
        items={[
          related({ key: 'a', isOwn: true, authorName: 'Diego', gameName: 'Hollow Knight', reason: 'same-author' }),
          related({ key: 'b', authorName: 'Ana' }),
        ]}
        onOpen={vi.fn()}
      />,
    );

    // Tu nombre, como el de cualquiera: nada de «Tú».
    expect(screen.getByText('Diego')).toBeInTheDocument();
    expect(screen.queryByText('Tú')).not.toBeInTheDocument();
    // Lo que la distingue es la marca de la firma, que es lo que la hoja de estilos tiñe.
    expect(screen.getByText('Diego')).toHaveClass('is-own');
    expect(screen.getByText('Ana')).not.toHaveClass('is-own');
  });

  it('abre la reseña al pulsar la tarjeta, con un rótulo que dice de quién y sobre qué es', () => {
    const onOpen = vi.fn();
    const item = related({ key: 'a' });
    render(<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={[item]} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir la reseña de Ana sobre Elden Ring' }));

    expect(onOpen).toHaveBeenCalledWith(item);
  });

  /**
   * Finge una rejilla de `columns` columnas.
   *
   * jsdom no maqueta, así que `gridTemplateColumns` viene vacío y el componente cae a una columna. Para ejercitar
   * la regla de recorte en pantallas anchas hay que ponerle el resultado que el navegador le daría, más un
   * `ResizeObserver` (que jsdom tampoco trae) para que llegue a medir.
   */
  function conColumnas(columns: number) {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element, pseudo?: string | null) => {
      const real = original(element, pseudo ?? undefined);
      if (element instanceof HTMLElement && element.classList.contains('hub-related-list')) {
        return { ...real, gridTemplateColumns: Array(columns).fill('300px').join(' ') } as CSSStyleDeclaration;
      }
      return real;
    });
  }

  function candidatas(count: number) {
    return Array.from({ length: count }, (_, index) =>
      related({ key: `k-${index}`, gameName: `Juego ${index}`, authorName: `Autor ${index}` }));
  }

  it('en pantalla ancha llena filas ENTERAS y deja fuera la que sobraría suelta', () => {
    // Cinco candidatas en cuatro columnas: se pintan cuatro. La quinta iría sola en una segunda fila con tres
    // huecos al lado, que es justo lo que se lee como algo que falta.
    conColumnas(4);

    render(<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={candidatas(5)} onOpen={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('con candidatas de sobra pinta las dos filas completas que caben', () => {
    conColumnas(5);

    render(<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={candidatas(13)} onOpen={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
  });

  it('nunca pasa de tres filas, por muchas columnas y candidatas que haya', () => {
    conColumnas(3);

    render(<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={candidatas(15)} onOpen={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(9);
  });

  // Cuántas tarjetas se pintan no es un número fijo: sale de cuántas columnas quepan. Lo que se comprueba aquí es
  // la regla de recorte, con una columna (lo que mide jsdom, que no maqueta): tres filas de una.
  it('se queda en tres filas y no pinta todas las candidatas que recibe', () => {
    const muchas = Array.from({ length: 9 }, (_, index) =>
      related({ key: `k-${index}`, gameName: `Juego ${index}`, authorName: `Autor ${index}` }));

    render(<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={muchas} onOpen={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Juego 0')).toBeInTheDocument();
    expect(screen.queryByText('Juego 3')).not.toBeInTheDocument();
  });

  it('con menos candidatas que huecos las pinta todas: el hueco que queda no es un descuadre', () => {
    const dos = [related({ key: 'a', gameName: 'Uno' }), related({ key: 'b', gameName: 'Dos' })];

    render(<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={dos} onOpen={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('pinta el medallón sin nota cuando la reseña no la lleva', () => {
    render(
      <RelatedReviews SOCIAL_UI={SOCIAL_UI} items={[related({ key: 'a', rating: 0, grade: null })]} onOpen={vi.fn()} />,
    );

    expect(screen.getByText('¿?')).toBeInTheDocument();
  });
});
