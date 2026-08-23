import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocialProfilesScreen } from '../../src/view/components/socialhub/SocialProfilesScreen';
import type { ProfileTier } from '../../src/core/constants/tiers';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { PROFILE_TIER_LABELS } from '../../src/core/constants/tiers';
import type { RelationshipState } from '../../src/model/types/social';

// `tier` va explícito: el modelo lo declara OBLIGATORIO justamente para que olvidarlo sea un error de
// compilación y no un directorio entero pintado de bronce por descuido.
function entry(uid: string, displayName: string, tier: ProfileTier = 'bronze') {
  return { id: uid, uid, displayName, photoURL: '', tier };
}

const baseProps = {
  SOCIAL_UI,
  profileSearch: '',
  setProfileSearch: vi.fn(),
  loadingDirectory: false,
  openProfileDetail: vi.fn(),
  handleProfileCardKeyDown: vi.fn(),
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
    const friends = screen.getByRole('group', { name: SOCIAL_UI.profiles.sectionGroupAria(SOCIAL_UI.profiles.friendsTitle, 1) });
    expect(within(friends).getByText('Ada')).toBeInTheDocument();
    expect(within(friends).queryByText('Bob')).not.toBeInTheDocument();

    // Sección Descubrir → contiene a Bob, no a Ada.
    const others = screen.getByRole('group', { name: SOCIAL_UI.profiles.sectionGroupAria(SOCIAL_UI.profiles.othersTitle, 1) });
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
          // Rango inventado: el `as` es la prueba. Simula un documento con un valor que el tipo no admite
          // (dato viejo o manipulado) para comprobar que `normalizeTier` lo degrada a bronce en vez de romper.
          filteredSocialDirectory={[{ ...entry('ada', 'Ada'), tier: 'adamantium' as ProfileTier }]}
        />,
      );

      expect(container.querySelector('.hub-tier-dot.tier-bronze')).toBeInTheDocument();
    });
  });

  // La rejilla sustituyó al carrusel horizontal: las tarjetas envuelven en filas en vez de irse a la derecha.
  it('pinta las tarjetas en una rejilla, no en un carrusel horizontal', () => {
    const { container } = render(
      <SocialProfilesScreen
        {...baseProps}
        relationshipWith={() => 'none'}
        filteredSocialDirectory={[entry('ada', 'Ada'), entry('bob', 'Bob')]}
      />,
    );
    expect(container.querySelectorAll('.hub-profile-grid').length).toBeGreaterThan(0);
    expect(container.querySelector('.hub-feed-row')).not.toBeInTheDocument();
  });

  // PAGINACIÓN POR FILAS (4). En jsdom no hay layout, así que `gridTemplateColumns` no resuelve pistas y el
  // número de columnas se queda en 1 → página de 4 filas × 1 columna = 4 tarjetas. Es justo el caso del móvil,
  // que es el que más importa comprobar.
  describe('paginación por filas', () => {
    const muchos = Array.from({ length: 11 }, (_, i) => entry(`u${i}`, `Perfil ${i}`));

    it('muestra la primera página y ofrece el resto, diciendo cuántos quedan', () => {
      render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );

      expect(screen.getByText('Perfil 0')).toBeInTheDocument();
      expect(screen.getByText('Perfil 3')).toBeInTheDocument();
      expect(screen.queryByText('Perfil 4')).not.toBeInTheDocument();
      // El recuento de la sección refleja el TOTAL, no lo visible.
      expect(screen.getByText('· 11')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(7) })).toBeInTheDocument();
    });

    it('"mostrar más" añade otra página y desaparece al llegar al final', async () => {
      const user = userEvent.setup();
      render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );

      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(7) }));
      expect(screen.getByText('Perfil 7')).toBeInTheDocument();
      expect(screen.queryByText('Perfil 8')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(3) }));
      expect(screen.getByText('Perfil 10')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Mostrar más/ })).not.toBeInTheDocument();
    });

    // Si al buscar se conservara la expansión, el filtro parecería no haber hecho nada.
    it('al cambiar la búsqueda se vuelve a la primera página', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );
      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(7) }));
      expect(screen.getByText('Perfil 7')).toBeInTheDocument();

      rerender(
        <SocialProfilesScreen
          {...baseProps}
          profileSearch="perfil"
          relationshipWith={() => 'none'}
          filteredSocialDirectory={muchos}
        />,
      );
      expect(screen.queryByText('Perfil 7')).not.toBeInTheDocument();
      expect(screen.getByText('Perfil 0')).toBeInTheDocument();
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
