import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierSeal } from '../../src/view/components/TierSeal';
import { SocialProfileDetailScreen } from '../../src/view/components/socialhub/SocialProfileDetailScreen';
import { SocialProfileScreen } from '../../src/view/components/socialhub/SocialProfileScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { PROFILE_TIER_LABELS } from '../../src/core/constants/tiers';

/**
 * EL SELLO DE RANGO DICE EL RANGO CON LA PALABRA, no solo con el color.
 *
 * El rango ya se veía en dos sitios y en los dos solo como color —la muesca de la tarjeta del directorio y el
 * borde del selector del panel de administración—, que es lo que sirve para recorrer una rejilla. En una página
 * de perfil no hay con qué comparar: ahí el color solo no dice «oro». Por eso lo que se prueba es el TEXTO.
 */

describe('TierSeal', () => {
  it('escribe el nombre del rango', () => {
    render(<TierSeal tier="gold" />);

    expect(screen.getByText(PROFILE_TIER_LABELS.gold)).toBeInTheDocument();
  });

  it('lleva la clase del metal, que es lo único que aporta color (contrato de `_tiers.scss`)', () => {
    const { container } = render(<TierSeal tier="mithril" />);

    expect(container.querySelector('.tier-seal')).toHaveClass('tier-mithril');
  });

  it('un valor corrupto degrada a bronce en vez de romper la pantalla', () => {
    // Misma regla que `normalizeTier`: degradar es más seguro que promocionar.
    render(<TierSeal tier="platino-inventado" />);

    expect(screen.getByText(PROFILE_TIER_LABELS.bronze)).toBeInTheDocument();
  });

  it('sin rango no pinta nada', () => {
    const { container } = render(<TierSeal tier={null} />);

    expect(container.querySelector('.tier-seal')).toBeNull();
  });
});

describe('TierSeal — donde el rango no se veía', () => {
  it('el perfil de alguien NO lo enseña: ahí el rango no se cuenta por ahora', () => {
    render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        isOwnProfile={false}
        friendshipState="friends"
        activeProfileDetail={{
          displayName: 'Marta',
          tier: 'silver',
          visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false },
          sharedLists: { c: [], v: [], e: [], p: [] },
        }}
        onBack={vi.fn()}
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    // Candado de la decisión: el rango de OTRA persona no se dice con la palabra en su ficha. Lo que queda es
    // la muesca de color de la tarjeta del directorio, que sirve para recorrer una rejilla, no para informar.
    expect(screen.queryByText(PROFILE_TIER_LABELS.silver)).toBeNull();
  });

  it('y el editor de perfil enseña el PROPIO, que era el que no salía en ninguna pantalla', () => {
    render(
      <SocialProfileScreen
        SOCIAL_UI={SOCIAL_UI}
        tier="gold"
        profileName="Yo"
        setProfileName={vi.fn()}
        completedGames={[{ id: 1, name: 'Hollow Knight' }]}
        hydratingProfile={false}
        savingProfile={false}
        hasCreatedProfile
        onSaveProfile={vi.fn()}
        onSignOut={vi.fn()}
        onBack={vi.fn()}
        status=""
        statusKind=""
        hiddenTabs={[]}
        onHiddenTabsChange={vi.fn()}
        hideReplayable={false}
        setHideReplayable={vi.fn()}
        hideRetry={false}
        setHideRetry={vi.fn()}
      />,
    );

    expect(screen.getByText(PROFILE_TIER_LABELS.gold)).toBeInTheDocument();
  });
});
