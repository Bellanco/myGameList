import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialDetailScreen } from '../../src/view/components/socialhub/SocialDetailScreen';
import { SOCIAL_UI } from '../../src/core/constants/labels';

const baseEvent = {
  profileId: 'p1',
  gameId: 5,
  type: 'review' as const,
  profileDisplayName: 'Ada',
  gameName: 'The Witcher 3',
  rating: 5,
  updatedAt: Date.UTC(2026, 0, 15, 10, 0),
  snippet: 'Snippet corto truncado…',
};

const fullGame = {
  id: 5,
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

function renderDetail(getGameItemById: (profileId: string, id: number) => unknown) {
  render(
    <SocialDetailScreen
      SOCIAL_UI={SOCIAL_UI}
      activeDetailEvent={baseEvent}
      getGameItemById={getGameItemById}
      onOpenProfileDetail={vi.fn()}
      onBack={vi.fn()}
      status=""
      statusKind=""
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
});
