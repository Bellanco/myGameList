import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SocialProfilesScreen } from '../../src/view/components/socialhub/SocialProfilesScreen';
import { SOCIAL_UI } from '../../src/core/constants/labels';
import type { RelationshipState } from '../../src/model/types/social';

function entry(uid: string, displayName: string, favorites: string[] = []) {
  return { id: uid, uid, displayName, photoURL: '', favorites };
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
        filteredSocialDirectory={[entry('ada', 'Ada', ['Celeste']), entry('bob', 'Bob')]}
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
