import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SocialProfileDetailScreen } from '../../src/view/components/socialhub/SocialProfileDetailScreen';
import { SOCIAL_UI } from '../../src/core/constants/labels';

function game(id: number, name: string) {
  return {
    id, _ts: 0, name, platforms: ['PC'], genres: ['RPG'], steamDeck: false,
    review: 'r', score: 5, years: [2024], strengths: [], weaknesses: [], reasons: [],
    replayable: false, retry: false, hours: 10,
  };
}

describe('SocialProfileDetailScreen — listados', () => {
  it('muestra los juegos de la pestaña visible cuando sharedLists está poblado (perfil propio)', () => {
    render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        isOwnProfile
        activeProfileDetail={{
          displayName: 'Yo',
          visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false },
          sharedLists: { c: [game(1, 'Halo'), game(2, 'Zelda')], v: [], e: [], p: [] },
          favorites: [],
        }}
        onBack={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    // Pestaña 'c' (completados) activa por defecto → se ven sus juegos.
    expect(screen.getByText('Halo')).toBeInTheDocument();
    expect(screen.getByText('Zelda')).toBeInTheDocument();
  });

  it('no ofrece la pestaña oculta por visibilidad', () => {
    render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        isOwnProfile
        activeProfileDetail={{
          displayName: 'Yo',
          visibility: { hiddenTabs: ['p'], hideReplayable: false, hideRetry: false, hideGameTime: false },
          sharedLists: { c: [game(1, 'Halo')], v: [], e: [], p: [game(9, 'Oculto')] },
          favorites: [],
        }}
        onBack={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    // La pestaña 'próximos' (p) está oculta → su chip no aparece.
    expect(screen.queryByRole('button', { name: SOCIAL_UI.feed.profileListTabPlanned })).not.toBeInTheDocument();
    // Pero las visibles sí.
    expect(screen.getByRole('button', { name: SOCIAL_UI.feed.profileListTabCompleted })).toBeInTheDocument();
  });
});

describe('SocialProfileDetailScreen — gating por amistad', () => {
  const foreignProfile = {
    displayName: 'Ada',
    visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false },
    sharedLists: { c: [game(1, 'Halo')], v: [], e: [], p: [] },
    favorites: ['Halo'],
  };

  it('no-amigo: oculta reseñas/ruleta/listados, muestra aviso y botón Añadir amigo', () => {
    render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        activeProfileDetail={foreignProfile}
        friendshipState="none"
        onAddOrAcceptFriend={vi.fn()}
        onCancelFriendRequest={vi.fn()}
        onBack={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    expect(screen.getByText(SOCIAL_UI.feed.profileFriendsOnly)).toBeInTheDocument();
    expect(screen.getByLabelText(SOCIAL_UI.friendship.addAria('Ada'))).toBeInTheDocument();
    // Reseñas y ruleta ocultas; los juegos del listado no se muestran.
    expect(screen.queryByRole('button', { name: SOCIAL_UI.feed.reviewsButton })).not.toBeInTheDocument();
    expect(screen.queryByText('Elige tu próximo juego')).not.toBeInTheDocument();
    expect(screen.queryByText('Halo')).not.toBeInTheDocument();
  });

  it('amigo: muestra reseñas/ruleta/listados', () => {
    render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        activeProfileDetail={foreignProfile}
        friendshipState="friends"
        onAddOrAcceptFriend={vi.fn()}
        onCancelFriendRequest={vi.fn()}
        onRemoveFriend={vi.fn()}
        onBack={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    expect(screen.getByRole('button', { name: SOCIAL_UI.feed.reviewsButton })).toBeInTheDocument();
    expect(screen.getByText('Elige tu próximo juego')).toBeInTheDocument();
    // "Halo" aparece como chip de favorito y como fila del listado → basta con que exista al menos una vez.
    expect(screen.getAllByText('Halo').length).toBeGreaterThan(0);
    // Y ofrece eliminar amistad.
    expect(screen.getByLabelText(SOCIAL_UI.friendship.removeAria('Ada'))).toBeInTheDocument();
  });
});
