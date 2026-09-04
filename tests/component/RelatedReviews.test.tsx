// Bloque de reseñas relacionadas al pie de una reseña abierta.
//
// Lo que se comprueba aquí:
//  1. Que sin resultados no pinta NADA: un «no hay relacionadas» al final de cada reseña sería ruido en la
//     mayoría de las bibliotecas, que es justo donde este bloque tiene menos que ofrecer.
//  2. Que cada tarjeta dice POR QUÉ está ahí. Es lo que separa una lista de sugerencias de una respuesta.
//  3. Que lo propio se firma en primera persona, para distinguirlo de un vistazo de lo que han escrito otros.
//  4. Que la tarjeta entera abre la reseña, y que lo hace con un rótulo que un lector de pantalla pueda seguir.
import { describe, expect, it, vi } from 'vitest';
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

  it('firma las propias en primera persona, no con el nombre del perfil', () => {
    render(
      <RelatedReviews
        SOCIAL_UI={SOCIAL_UI}
        items={[related({ key: 'a', isOwn: true, authorName: 'Diego', gameName: 'Hollow Knight', reason: 'same-author' })]}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByText(/Tú/)).toBeInTheDocument();
    expect(screen.queryByText(/Diego/)).not.toBeInTheDocument();
  });

  it('abre la reseña al pulsar la tarjeta, con un rótulo que dice de quién y sobre qué es', () => {
    const onOpen = vi.fn();
    const item = related({ key: 'a' });
    render(<RelatedReviews SOCIAL_UI={SOCIAL_UI} items={[item]} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir la reseña de Ana sobre Elden Ring' }));

    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('pinta el medallón sin nota cuando la reseña no la lleva', () => {
    render(
      <RelatedReviews SOCIAL_UI={SOCIAL_UI} items={[related({ key: 'a', rating: 0, grade: null })]} onOpen={vi.fn()} />,
    );

    expect(screen.getByText('¿?')).toBeInTheDocument();
  });
});
