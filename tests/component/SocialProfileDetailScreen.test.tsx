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
