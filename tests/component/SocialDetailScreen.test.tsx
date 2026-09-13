import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialDetailScreen } from '../../src/view/components/socialhub/SocialDetailScreen';
import type { GameItem } from '../../src/model/types/game';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';

const baseEvent = {
  profileId: 'p1',
  gameId: 5,
  type: 'review' as const,
  profileDisplayName: 'Ada',
  gameName: 'The Witcher 3',
  rating: 5,
  updatedAt: Date.UTC(2026, 0, 15, 10, 0),
  snippet: 'Snippet corto truncado…',
  grade: 100,
  photoURL: '',
};

const fullGame = {
  id: 5,
  _ts: Date.UTC(2026, 0, 15, 10, 0),
  name: 'The Witcher 3',
  review: 'Reseña COMPLETA con muchos detalles que superan los 160 caracteres del snippet social, incluyendo análisis del combate, la historia y el mundo abierto, mucho más allá del resumen.',
  platforms: ['PC', 'PS5'],
  genres: ['RPG', 'Acción'],
  strengths: ['Historia', 'Mundo'],
  weaknesses: ['Inventario'],
  reasons: [],
  years: [2024],
  hours: 120,
  steamDeck: true,
  replayable: false,
  retry: false,
  score: 5,
};

function renderDetail(
  getGameItemById: (profileId: string, id: number) => GameItem | null,
  reviewLoading = false,
) {
  render(
    <SocialDetailScreen
      SOCIAL_UI={SOCIAL_UI}
      activeDetailEvent={baseEvent}
      getGameItemById={getGameItemById}
      onOpenProfileDetail={vi.fn()}
      onBack={vi.fn()}
      status=""
      statusKind=""
      reviewLoading={reviewLoading}
    />,
  );
}

describe('SocialDetailScreen — game/:id/review', () => {
  it('shows the FULL review + genres/platforms/strengths/weaknesses for an own game', () => {
    renderDetail(() => fullGame);

    expect(screen.getByText(/Reseña COMPLETA con muchos detalles/)).toBeInTheDocument();
    // No usa el snippet truncado cuando hay reseña completa.
    expect(screen.queryByText('Snippet corto truncado…')).not.toBeInTheDocument();

    // Campos pedidos: género, plataforma, puntos fuertes y débiles.
    expect(screen.getByText('PS5')).toBeInTheDocument();
    expect(screen.getByText('RPG')).toBeInTheDocument();
    expect(screen.getByText('Historia')).toBeInTheDocument();
    expect(screen.getByText('Inventario')).toBeInTheDocument();
  });

  it('falls back to the snippet and shows NO private metadata for another user\'s event', () => {
    renderDetail(() => null); // ajeno: getGameItemById devuelve null (frontera de privacidad)

    expect(screen.getByText('Snippet corto truncado…')).toBeInTheDocument();
    // No se filtran fuertes/débiles/plataformas de ningún juego local.
    expect(screen.queryByText('Historia')).not.toBeInTheDocument();
    expect(screen.queryByText(SOCIAL_UI.feed.metadataPlatforms)).not.toBeInTheDocument();
  });

  /**
   * Y LO DICE. El adelanto del canal social son ≤160 caracteres, así que se corta a mitad de palabra: sin
   * avisar, se lee como una reseña que su autor dejó a medias. Pasó de verdad —una sincronización de listas
   * rota durante un mes— y lo que pareció roto fue esta pantalla, no el canal que no llegaba.
   */
  it('avisa de que es un adelanto cuando no ha llegado la reseña completa', () => {
    renderDetail(() => null);
    expect(screen.getByText(SOCIAL_UI.feed.detailPreviewOnly)).toBeInTheDocument();
  });

  it('con la reseña completa delante no hay aviso que dar', () => {
    renderDetail(() => fullGame);
    expect(screen.queryByText(SOCIAL_UI.feed.detailPreviewOnly)).not.toBeInTheDocument();
  });

  it('el avatar es clicable y abre el perfil del autor', () => {
    const onOpenProfileDetail = vi.fn();
    render(
      <SocialDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        activeDetailEvent={baseEvent}
        getGameItemById={() => null}
        onOpenProfileDetail={onOpenProfileDetail}
        onBack={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    const links = screen.getAllByRole('button', { name: SOCIAL_UI.feed.openProfileAria('Ada') });
    fireEvent.click(links[0]);
    expect(onOpenProfileDetail).toHaveBeenCalledWith('p1');
  });

  // El bloque de relacionadas llega montado desde el hub (es quien tiene el directorio con el que relacionar), y
  // la pantalla solo decide DÓNDE va: al pie del análisis, fuera de su tarjeta. Que esté fuera importa —es
  // material de al lado, no parte de la reseña— y es lo que hace que no herede el «sin recorte» del detalle.
  it('pinta el bloque de relacionadas al pie, fuera de la tarjeta del análisis', () => {
    render(
      <SocialDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        activeDetailEvent={baseEvent}
        getGameItemById={() => fullGame}
        onOpenProfileDetail={vi.fn()}
        onBack={vi.fn()}
        status=""
        statusKind=""
        related={<div data-testid="relacionadas">bloque</div>}
      />,
    );

    const bloque = screen.getByTestId('relacionadas');
    expect(bloque).toBeInTheDocument();
    expect(bloque.closest('.hub-feed-card-detail')).toBeNull();
  });

  it('sin bloque de relacionadas la pantalla se pinta igual', () => {
    // El hub lo pasa siempre, pero el panel de estadísticas reutiliza estas pantallas y no lo pasa: la prop es
    // opcional de verdad, no opcional de mentira.
    renderDetail(() => fullGame);

    expect(screen.getByText(/Reseña COMPLETA con muchos detalles/)).toBeInTheDocument();
  });
});

/**
 * EL ANÁLISIS COMPLETO NO LLEGA A LA VEZ QUE EL RESTO, y lo que se enseñaba mientras tanto era el adelanto de 160
 * caracteres con el aviso de «esto es solo el adelanto» y los cuatro bloques de chips vacíos: contenido real pero a
 * medias, y un aviso que en ese momento decía algo falso (no era un adelanto, es que aún no había llegado).
 */
describe('SocialDetailScreen — mientras el análisis completo viene de camino', () => {
  it('espera con un esqueleto en vez de enseñar el adelanto con un aviso que todavía no es verdad', () => {
    renderDetail(() => null, true);

    // Ni el texto recortado ni la acotación que lo explica.
    expect(screen.queryByText('Snippet corto truncado…')).not.toBeInTheDocument();
    expect(screen.queryByText(SOCIAL_UI.feed.detailPreviewOnly)).not.toBeInTheDocument();
    // Lo que sí hay: el hueco del cuerpo y lo que se anuncia a un lector de pantalla.
    expect(document.querySelector('.hub-detail-body-skeleton')).not.toBeNull();
    expect(screen.getByText(SOCIAL_UI.feed.detailLoadingReview)).toBeInTheDocument();
  });

  it('la cabecera NO espera: juego, autor y nota salen del propio evento y ya están', () => {
    renderDetail(() => null, true);

    expect(screen.getByText('The Witcher 3')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('en cuanto llega la reseña completa, el esqueleto se va y el aviso no aparece', () => {
    renderDetail(() => fullGame, true);

    expect(document.querySelector('.hub-detail-body-skeleton')).toBeNull();
    expect(screen.getByText(/Reseña COMPLETA con muchos detalles/)).toBeInTheDocument();
    expect(screen.queryByText(SOCIAL_UI.feed.detailPreviewOnly)).not.toBeInTheDocument();
  });

  it('cuando ya no viene nada, el adelanto vuelve con su aviso: ahí sí es la verdad', () => {
    renderDetail(() => null, false);

    expect(screen.getByText('Snippet corto truncado…')).toBeInTheDocument();
    expect(screen.getByText(SOCIAL_UI.feed.detailPreviewOnly)).toBeInTheDocument();
    expect(document.querySelector('.hub-detail-body-skeleton')).toBeNull();
  });
});

/**
 * SIN EVENTO HAY DOS SITUACIONES DISTINTAS. El detalle se resuelve buscando en el directorio social, así que
 * llegar por un enlace, una recarga o un aviso lo deja vacío hasta que ese directorio se hidrata: la pantalla
 * decía «no se ha encontrado» —definitivo— y a los pocos segundos aparecía la reseña.
 */
describe('SocialDetailScreen — sin evento todavía', () => {
  function renderSinEvento(eventLoading: boolean) {
    render(
      <SocialDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        activeDetailEvent={null}
        getGameItemById={() => null}
        onOpenProfileDetail={vi.fn()}
        onBack={vi.fn()}
        status=""
        statusKind=""
        eventLoading={eventLoading}
      />,
    );
  }

  it('mientras el directorio se hidrata espera, en vez de afirmar que no se ha encontrado', () => {
    renderSinEvento(true);

    expect(screen.queryByText(SOCIAL_UI.feed.detailMissing)).not.toBeInTheDocument();
    expect(document.querySelector('.hub-detail-body-skeleton')).not.toBeNull();
    // La firma reserva su sitio para que no salte al llegar (mismo armazón que `ReviewDetailHead`).
    expect(document.querySelector('.hub-feed-card-head .hub-avatar')).not.toBeNull();
    expect(screen.getByText(SOCIAL_UI.feed.detailLoadingReview)).toBeInTheDocument();
  });

  it('cuando la hidratación termina y sigue sin haber nada, entonces sí lo dice', () => {
    renderSinEvento(false);

    expect(screen.getByText(SOCIAL_UI.feed.detailMissing)).toBeInTheDocument();
    expect(document.querySelector('.hub-detail-body-skeleton')).toBeNull();
  });

  it('se puede volver en los dos casos: el botón es navegación y no depende de ningún dato', () => {
    renderSinEvento(true);
    expect(screen.getByText(SOCIAL_UI.feed.backToFeed)).toBeInTheDocument();
  });
});
