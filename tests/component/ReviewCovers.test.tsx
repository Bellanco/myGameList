// LA CARÁTULA DE FONDO DE UNA RESEÑA SOLO EXISTE SI SE HA PEDIDO, y eso son DOS llaves que tienen que estar
// puestas a la vez:
//
//   1. la PREFERENCIA de quien mira, que viene apagada de fábrica y es la que autoriza a que el servidor
//      pregunte por títulos a IGDB (ver `coversPreference`);
//   2. la POLÍTICA del sitio donde se pinta (`coversAllowed`), que en lo ajeno hoy es mithril.
//
// Se comprueba en las TRES piezas que pintan una reseña —el listado, el detalle y el bloque de relacionadas—
// porque son tres componentes distintos con la misma regla, que es exactamente la clase de cosa que se
// desincroniza: la franja se añadió primero al detalle del perfil y el del feed se quedó sin ella.
//
// Lo que se mira es la clase `has-cover` y la ficha `--row-cover`, que es lo ÚNICO que enciende las capas de la
// hoja: sin ellas no hay imagen que pintar ni URL que pedir.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ProfileReviewsList, type ReviewEntry } from '../../src/view/components/socialhub/ProfileReviewsList';
import { RelatedReviews } from '../../src/view/components/socialhub/RelatedReviews';
import { ReviewScreen } from '../../src/view/components/socialhub/ReviewScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { reiniciarMemoriaDeCaratulas } from '../../src/core/utils/coverMemory';
import type { RelatedReview } from '../../src/core/social/relatedReviews';

const RESENA: ReviewEntry = {
  id: 7,
  gameName: 'Hollow Knight',
  rating: 5,
  grade: 96,
  reviewText: 'Un metroidvania que no te lleva de la mano.',
  ts: Date.UTC(2026, 0, 15, 10, 0),
  platforms: ['PC'],
};

const RELACIONADA: RelatedReview = {
  key: 'ana-5',
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
};

/** Las tres pantallas, montadas con la misma reseña y la misma política. */
const PIEZAS = [
  {
    nombre: 'el listado de reseñas',
    selector: '.hub-review-entry',
    pinta: (coversAllowed: boolean) => (
      <ProfileReviewsList
        SOCIAL_UI={SOCIAL_UI}
        reviews={[RESENA]}
        onOpenReview={vi.fn()}
        coversAllowed={coversAllowed}
      />
    ),
  },
  {
    nombre: 'el detalle',
    selector: '.hub-feed-card-detail',
    pinta: (coversAllowed: boolean) => (
      <ReviewScreen
        SOCIAL_UI={SOCIAL_UI}
        title="Reseña"
        subtitle="."
        content={{
          gameName: RESENA.gameName,
          reviewText: RESENA.reviewText,
          score: RESENA.rating,
          grade: RESENA.grade,
          platforms: ['PC'],
        }}
        onBack={vi.fn()}
        backLabel="Volver"
        status=""
        statusKind=""
        missingLabel="No está"
        coversAllowed={coversAllowed}
      />
    ),
  },
  {
    nombre: 'las relacionadas',
    selector: '.hub-related-entry',
    pinta: (coversAllowed: boolean) => (
      <RelatedReviews
        SOCIAL_UI={SOCIAL_UI}
        items={[RELACIONADA]}
        onOpen={vi.fn()}
        coversAllowed={coversAllowed}
      />
    ),
  },
] as const;

function conCaratula(container: HTMLElement, selector: string): boolean {
  const pieza = container.querySelector(selector);
  if (!pieza) throw new Error(`no se ha pintado ${selector}`);
  return pieza.classList.contains('has-cover') && pieza.getAttribute('style')?.includes('--row-cover') === true;
}

beforeEach(() => {
  localStorage.clear();
  reiniciarMemoriaDeCaratulas();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('la carátula de fondo de una reseña', () => {
  for (const { nombre, selector, pinta } of PIEZAS) {
    it(`no sale en ${nombre} con la preferencia apagada, aunque el sitio la permita`, () => {
      // Sin escribir nada: apagada es el estado de fábrica, y es el que ve la mayoría.
      const { container } = render(pinta(true));
      expect(conCaratula(container, selector)).toBe(false);
    });

    it(`no sale en ${nombre} cuando el sitio no la permite, aunque la preferencia esté encendida`, () => {
      localStorage.setItem('mis-listas-covers', 'on');
      const { container } = render(pinta(false));
      expect(conCaratula(container, selector)).toBe(false);
    });

    it(`sale en ${nombre} solo con las dos llaves puestas`, () => {
      localStorage.setItem('mis-listas-covers', 'on');
      const { container } = render(pinta(true));
      expect(conCaratula(container, selector)).toBe(true);
    });
  }
});
