// LA CARÁTULA DE FONDO DE UNA RESEÑA SOLO EXISTE SI SE HA PEDIDO, y eso son DOS llaves que tienen que estar
// puestas a la vez:
//
//   1. la PREFERENCIA de quien mira, que viene apagada de fábrica y es la que autoriza a que el servidor
//      pregunte por títulos a IGDB (ver `coversPreference`);
//   2. la POLÍTICA del sitio donde se pinta (`coversAllowed`), que en lo ajeno es `'solo-cache'`: lo ya
//      resuelto y nada más, para que mirar perfiles ajenos no gaste escrituras de KV.
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
import { claveDeJuego, guardarHechos, leerHechos, reiniciarIndiceDeCaratulas } from '../../src/core/utils/coverDone';
import { coverUrl } from '../../src/core/utils/coverUrl';
import type { CoverAccess } from '../../src/view/components/socialhub/useReviewCover';
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
    pinta: (coversAllowed: CoverAccess) => (
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
    pinta: (coversAllowed: CoverAccess) => (
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
    pinta: (coversAllowed: CoverAccess) => (
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
  reiniciarIndiceDeCaratulas();
});

/** La URL que lleva la ficha `--row-cover` de la pieza, o `null` si no hay franja. */
function urlDeLaFranja(container: HTMLElement, selector: string): string | null {
  const estilo = container.querySelector(selector)?.getAttribute('style') ?? '';
  return /--row-cover:\s*url\("?([^")]+)"?\)/.exec(estilo)?.[1] ?? null;
}

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

    it(`en ${nombre}, lo ajeno se pide con la marca de «solo caché»`, () => {
      localStorage.setItem('mis-listas-covers', 'on');
      const { container } = render(pinta('solo-cache'));
      expect(conCaratula(container, selector)).toBe(true);
      expect(urlDeLaFranja(container, selector)).toContain('c=1');
    });

    it(`en ${nombre}, un título que tu biblioteca ya resolvió va sin la marca`, () => {
      localStorage.setItem('mis-listas-covers', 'on');
      const titulo = selector === '.hub-related-entry' ? RELACIONADA.gameName : RESENA.gameName;
      const hechos = leerHechos();
      hechos.add(claveDeJuego(titulo, ['Steam'], false));
      guardarHechos(hechos);
      const { container } = render(pinta('solo-cache'));
      expect(urlDeLaFranja(container, selector)).toBe(coverUrl(titulo, ['Steam'], false, 'ancho'));
    });
  }

  // Las sugerencias de TUS reseñas no llevan plataformas. Pedidas solo por nombre eran otra URL que la del
  // listado —otra descarga— y otra clave en el servidor, que resolvía de nuevo contra IGDB un juego ya emparejado.
  describe('en lo propio, sin plataformas', () => {
    it('las relacionadas reaprovechan la URL con la que tu biblioteca ya resolvió el título', () => {
      localStorage.setItem('mis-listas-covers', 'on');
      const hechos = leerHechos();
      hechos.add(claveDeJuego(RELACIONADA.gameName, ['Steam'], false));
      guardarHechos(hechos);
      const { container } = render(PIEZAS[2].pinta(true));
      expect(urlDeLaFranja(container, PIEZAS[2].selector)).toBe(coverUrl(RELACIONADA.gameName, ['Steam'], false, 'ancho'));
    });

    it('y reconocen el «no tiene» que se apuntó con esas plataformas', () => {
      localStorage.setItem('mis-listas-covers', 'on');
      const hechos = leerHechos();
      hechos.add(claveDeJuego(RELACIONADA.gameName, ['Steam'], false));
      guardarHechos(hechos);
      localStorage.setItem('mis-listas-covers-none', JSON.stringify({ [coverUrl(RELACIONADA.gameName, ['Steam'])]: Date.now() }));
      const { container } = render(PIEZAS[2].pinta(true));
      expect(conCaratula(container, PIEZAS[2].selector)).toBe(false);
    });

    it('con plataformas propias no se toca: ya son las del listado', () => {
      localStorage.setItem('mis-listas-covers', 'on');
      const hechos = leerHechos();
      hechos.add(claveDeJuego(RESENA.gameName, ['Switch'], false));
      guardarHechos(hechos);
      const { container } = render(PIEZAS[0].pinta(true));
      expect(urlDeLaFranja(container, PIEZAS[0].selector)).toBe(coverUrl(RESENA.gameName, ['PC'], false, 'ancho'));
    });
  });
});
