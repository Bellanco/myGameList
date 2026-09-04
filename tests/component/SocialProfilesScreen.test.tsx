import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocialProfilesScreen } from '../../src/view/components/socialhub/SocialProfilesScreen';
import type { ProfileTier } from '../../src/core/constants/tiers';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { PROFILE_TIER_LABELS } from '../../src/core/constants/tiers';
import type { RelationshipState } from '../../src/model/types/social';

// `tier` va explícito: el modelo lo declara OBLIGATORIO justamente para que olvidarlo sea un error de
// compilación y no un directorio entero pintado de bronce por descuido. `lastActiveAt` (último uso de la app)
// es obligatorio por lo mismo: sin él, la lista de amigos saldría en orden arbitrario.
function entry(uid: string, displayName: string, tier: ProfileTier = 'bronze', lastActiveAt = 0) {
  return { id: uid, uid, displayName, photoURL: '', tier, lastActiveAt };
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

      expect(container.querySelectorAll('.hub-tier-notch')).toHaveLength(3);
      expect(container.querySelector('.hub-tier-notch.tier-gold')).toBeInTheDocument();
      expect(container.querySelector('.hub-tier-notch.tier-mithril')).toBeInTheDocument();
      // Quien no tiene rango asignado sale como bronce, no sin punto.
      expect(container.querySelector('.hub-tier-notch.tier-bronze')).toBeInTheDocument();
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

      expect(container.querySelector('.hub-tier-notch.tier-bronze')).toBeInTheDocument();
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
    expect(container.querySelectorAll('.hub-user-grid').length).toBeGreaterThan(0);
    expect(container.querySelector('.hub-feed-row')).not.toBeInTheDocument();
  });

  // PAGINACIÓN POR FILAS (3). En jsdom no hay layout, así que `gridTemplateColumns` no resuelve pistas y el
  // número de columnas se queda en 1 → página de 3 filas × 1 columna = 3 tarjetas. Es el peor caso posible; en
  // un móvil de verdad la rejilla garantiza dos columnas.
  describe('paginación por filas', () => {
    const muchos = Array.from({ length: 11 }, (_, i) => entry(`u${i}`, `Perfil ${i}`));

    it('muestra la primera página y ofrece el resto, diciendo cuántos quedan', () => {
      render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );

      expect(screen.getByText('Perfil 0')).toBeInTheDocument();
      expect(screen.getByText('Perfil 2')).toBeInTheDocument();
      expect(screen.queryByText('Perfil 3')).not.toBeInTheDocument();
      // El recuento de la sección refleja el TOTAL, no lo visible.
      expect(screen.getByText('· 11')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(8) })).toBeInTheDocument();
    });

    it('"mostrar más" añade otra página y desaparece al llegar al final', async () => {
      const user = userEvent.setup();
      render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );

      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(8) }));
      expect(screen.getByText('Perfil 5')).toBeInTheDocument();
      expect(screen.queryByText('Perfil 6')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(5) }));
      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(2) }));
      expect(screen.getByText('Perfil 10')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Mostrar más/ })).not.toBeInTheDocument();
    });

    // Si al buscar se conservara la expansión, el filtro parecería no haber hecho nada.
    it('al cambiar la búsqueda se vuelve a la primera página', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );
      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(8) }));
      expect(screen.getByText('Perfil 5')).toBeInTheDocument();

      rerender(
        <SocialProfilesScreen
          {...baseProps}
          profileSearch="perfil"
          relationshipWith={() => 'none'}
          filteredSocialDirectory={muchos}
        />,
      );
      expect(screen.queryByText('Perfil 5')).not.toBeInTheDocument();
      expect(screen.getByText('Perfil 0')).toBeInTheDocument();
    });
  });

  // Los amigos se listan por último uso de la aplicación. El directorio ya llega ordenado así desde Firestore,
  // pero no siempre (sin el índice compuesto la consulta degrada a sin orden, y un amigo fuera del tope entra por
  // el documento de amistad), así que la pantalla lo garantiza.
  it('ordena a los amigos por su último uso de la aplicación, no por el orden de llegada', () => {
    render(
      <SocialProfilesScreen
        {...baseProps}
        relationshipWith={() => 'friends'}
        // Tres y no más: en jsdom la rejilla no resuelve pistas, así que la primera página son 3 tarjetas.
        filteredSocialDirectory={[
          entry('vieja', 'Vieja', 'bronze', 1_000),
          entry('reciente', 'Reciente', 'bronze', 9_000),
          entry('sin-dato', 'Sin dato', 'bronze', 0),
        ]}
      />,
    );

    const nombres = [...document.querySelectorAll('.hub-user-card-name')].map((el) => el.textContent);
    // Quien no tiene marca de recencia cae al final: sin dato no se adelanta a nadie.
    expect(nombres).toEqual(['Reciente', 'Vieja', 'Sin dato']);
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
