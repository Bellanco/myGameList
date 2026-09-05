// La pantalla que ve quien abre un enlace compartido (`/r/:token`).
//
// Lo que se comprueba aquí, por orden de importancia:
//  1. Que lleva el MISMO encabezado que el detalle de un análisis dentro de la aplicación. Iba sin él, y por eso
//     la pantalla no se parecía a `/perfil/resenas/:id` aunque pintara lo mismo debajo.
//  2. Que los análisis sugeridos del pie llegan en su PROPIA petición y no retrasan la reseña.
//  3. Que cada sugerencia es un ENLACE a `/r/{token}`: en modo artículo no hay enrutador al que pedirle una
//     navegación, y además cada una es otra página del sitio (tiene que poder abrirse en otra pestaña).
//  4. Que el bloque no se pinta cuando no hay nada que sugerir, que es el caso normal.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PublicReviewScreen } from '../../src/view/components/PublicReviewScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import type { SharedReview, SharedReviewSuggestion } from '../../src/model/types/share';

const TOKEN = 'TOKENDEPRUEBA0001';

const ARTICLE: SharedReview = {
  v: 1,
  gameId: 7,
  gameName: 'Elden Ring',
  grade: 98,
  rating: 5,
  review: 'Un mundo abierto que por fin confía en el jugador.',
  platforms: ['PC'],
  genres: ['RPG'],
  strengths: ['Combate'],
  weaknesses: [],
  authorNick: 'Bellanco',
  reviewedAt: 1_756_000_000_000,
  createdAt: 1_756_000_000_000,
  expiresAt: 4_102_444_800_000,
};

const SUGGESTION: SharedReviewSuggestion = {
  token: 'TOKENSUGERIDO00001',
  gameName: 'Dark Souls III',
  grade: 93,
  rating: 5,
  snippet: 'El cierre de la trilogía mira mucho hacia atrás.',
  reviewedAt: 1_755_000_000_000,
};

/** Sirve las DOS rutas que pide la pantalla; cada prueba dice qué devuelve la de sugerencias. */
function stubApi(items: SharedReviewSuggestion[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes('/api/share/related/') ? { items } : ARTICLE;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
    }),
  );
}

beforeEach(() => {
  stubApi([SUGGESTION]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PublicReviewScreen', () => {
  it('lleva el mismo encabezado que el detalle de un análisis de la aplicación', async () => {
    render(<PublicReviewScreen token={TOKEN} standalone />);

    expect(await screen.findByRole('heading', { name: SOCIAL_UI.feed.reviewDetailTitle })).toBeInTheDocument();
    expect(screen.getByText(SOCIAL_UI.feed.reviewDetailSubtitle)).toBeInTheDocument();
  });

  // La regla «con firma, titular la persona» de `ReviewDetailHead`: aquí hay un nick que dar, así que él es
  // el título y el juego baja al chip. Antes esta pantalla lo hacía al revés que el detalle del feed.
  it('pone al autor de titular y el juego de chip', async () => {
    render(<PublicReviewScreen token={TOKEN} standalone />);

    expect(await screen.findByRole('heading', { name: 'Bellanco' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Elden Ring' })).not.toBeInTheDocument();
    expect(screen.getByText('Elden Ring')).toBeInTheDocument();
  });

  // El nick es TEXTO, no un enlace, y no hay avatar: el perfil del autor no es público y desde aquí no se
  // llega a él. Además la silueta del avatar sale del sprite de iconos, que en modo artículo no se monta.
  it('no convierte la firma en un enlace al perfil ni pinta avatar', async () => {
    const { container } = render(<PublicReviewScreen token={TOKEN} standalone />);

    await screen.findByRole('heading', { name: 'Bellanco' });
    expect(screen.queryByRole('button', { name: /Bellanco/ })).not.toBeInTheDocument();
    expect(container.querySelector('.hub-avatar')).toBeNull();
  });

  // No hay pantalla anterior a la que volver desde un enlace público: la única salida es la barra de abajo.
  it('no ofrece un botón de volver', async () => {
    render(<PublicReviewScreen token={TOKEN} standalone />);

    await screen.findByRole('heading', { name: 'Bellanco' });
    expect(screen.queryByRole('button', { name: SOCIAL_UI.feed.reviewsBackToList })).not.toBeInTheDocument();
  });

  it('sugiere otros análisis como enlaces a su propia página', async () => {
    render(<PublicReviewScreen token={TOKEN} standalone />);

    expect(await screen.findByText(SOCIAL_UI.feed.suggestedTitle)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: SOCIAL_UI.feed.suggestedOpenAria('Dark Souls III') });
    expect(link).toHaveAttribute('href', `/r/${SUGGESTION.token}`);
  });

  // Todas las sugerencias son de quien firma la reseña abierta, así que su nombre ya está arriba: repetirlo en
  // cada tarjeta sería decirlo seis veces.
  it('no firma las tarjetas sugeridas', async () => {
    render(<PublicReviewScreen token={TOKEN} standalone />);

    await screen.findByText(SOCIAL_UI.feed.suggestedTitle);
    expect(screen.getAllByText('Bellanco')).toHaveLength(1);
  });

  it('sin nada que sugerir no pinta el bloque', async () => {
    stubApi([]);
    render(<PublicReviewScreen token={TOKEN} standalone />);

    await screen.findByRole('heading', { name: 'Bellanco' });
    await waitFor(() => expect(screen.queryByText(SOCIAL_UI.feed.suggestedTitle)).not.toBeInTheDocument());
  });
});
