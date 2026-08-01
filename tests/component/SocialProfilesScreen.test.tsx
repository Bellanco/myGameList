import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SocialProfilesScreen } from '../../src/view/components/socialhub/SocialProfilesScreen';
import { SOCIAL_UI } from '../../src/core/constants/labels';
import { PROFILE_TIER_LABELS } from '../../src/core/constants/tiers';
import type { RelationshipState } from '../../src/model/types/social';

function entry(uid: string, displayName: string) {
  return { id: uid, uid, displayName, photoURL: '' };
}

const baseProps = {
  SOCIAL_UI,
  profileSearch: '',
  setProfileSearch: vi.fn(),
  loadingDirectory: false,
  openProfileDetail: vi.fn(),
  handleProfileCardKeyDown: vi.fn(),
  isFeedDragging: false,
  feedRowRef: { current: null },
  handleFeedRowMouseDown: vi.fn(),
  handleFeedRowKeyDown: vi.fn(),
  friendshipBusyUid: '',
  onAddOrAcceptFriend: vi.fn(),
  onCancelFriendRequest: vi.fn(),
  onBack: vi.fn(),
  status: '',
  statusKind: 'ok',
};

describe('SocialProfilesScreen — división amigos / no-amigos', () => {
  const relationshipWith = (uid: string): RelationshipState => (uid === 'ada' ? 'friends' : 'none');

  it('coloca a los amigos en "Amigos" y al resto en "Descubrir"', () => {
    render(
      <SocialProfilesScreen
        {...baseProps}
        relationshipWith={relationshipWith}
        filteredSocialDirectory={[entry('ada', 'Ada'), entry('bob', 'Bob')]}
      />,
    );

    // Sección Amigos → contiene a Ada, no a Bob.
    const friends = screen.getByRole('group', { name: SOCIAL_UI.profiles.friendsTitle });
    expect(within(friends).getByText('Ada')).toBeInTheDocument();
    expect(within(friends).queryByText('Bob')).not.toBeInTheDocument();

    // Sección Descubrir → contiene a Bob, no a Ada.
    const others = screen.getByRole('group', { name: SOCIAL_UI.profiles.othersTitle });
    expect(within(others).getByText('Bob')).toBeInTheDocument();
    expect(within(others).queryByText('Ada')).not.toBeInTheDocument();
  });

  // El punto de rango es la única señal visible del tier en el directorio. Como el color por sí solo no informa
  // a quien no lo distingue, el nombre del rango tiene que estar en el texto accesible.
  describe('punto de rango', () => {
    function renderWithTiers() {
      return render(
        <SocialProfilesScreen
          {...baseProps}
          relationshipWith={() => 'none'}
          filteredSocialDirectory={[
            { ...entry('ada', 'Ada'), tier: 'gold' },
            { ...entry('bob', 'Bob'), tier: 'mithril' },
            entry('cid', 'Cid'), // sin tier → bronce
          ]}
        />,
      );
    }

    it('pinta un punto por perfil con la clase de color de su rango', () => {
      const { container } = renderWithTiers();

      expect(container.querySelectorAll('.hub-tier-dot')).toHaveLength(3);
      expect(container.querySelector('.hub-tier-dot.tier-gold')).toBeInTheDocument();
      expect(container.querySelector('.hub-tier-dot.tier-mithril')).toBeInTheDocument();
      // Quien no tiene rango asignado sale como bronce, no sin punto.
      expect(container.querySelector('.hub-tier-dot.tier-bronze')).toBeInTheDocument();
    });

    it('nombra el rango en texto, no solo con el color', () => {
      renderWithTiers();

      expect(screen.getByText(PROFILE_TIER_LABELS.gold)).toBeInTheDocument();
      expect(screen.getByText(PROFILE_TIER_LABELS.mithril)).toBeInTheDocument();
      expect(screen.getByText(PROFILE_TIER_LABELS.bronze)).toBeInTheDocument();
    });

    it('un rango desconocido en el documento se pinta como bronce', () => {
      const { container } = render(
        <SocialProfilesScreen
          {...baseProps}
          relationshipWith={() => 'none'}
          filteredSocialDirectory={[{ ...entry('ada', 'Ada'), tier: 'adamantium' }]}
        />,
      );

      expect(container.querySelector('.hub-tier-dot.tier-bronze')).toBeInTheDocument();
    });
  });

  it('muestra estado vacío de amigos cuando no hay ninguno', () => {
    render(
      <SocialProfilesScreen
        {...baseProps}
        relationshipWith={() => 'none'}
        filteredSocialDirectory={[entry('bob', 'Bob')]}
      />,
    );
    expect(screen.getByText(SOCIAL_UI.profiles.friendsEmpty)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
