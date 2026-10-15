import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SocialProfilesScreen } from '../../src/view/components/socialhub/SocialProfilesScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { PROFILE_TIER_LABELS } from '../../src/core/constants/tiers';
import type { RelationshipState } from '../../src/model/types/social';
import type { SocialMoveFeedItem } from '../../src/viewmodel/social/socialFeed';
import type { TabId } from '../../src/model/types/game';
import { coversPreference } from '../../src/view/hooks/preferences';
import { INVITE_UI } from '../../src/core/constants/inviteLabels';
import { INVITE_UNTIL_FRIENDS } from '../../src/core/social/invite';

// `lastActiveAt` (último uso de la app) va explícito: el modelo lo declara OBLIGATORIO para que olvidarlo sea un
// error de compilación y no una lista de amigos en orden arbitrario.
function entry(uid: string, displayName: string, lastActiveAt = 0, moves: SocialMoveFeedItem[] = []) {
  return { id: uid, uid, displayName, photoURL: '', lastActiveAt, moves };
}

/** Un mensaje de lista tal y como llega hidratado al directorio (solo lo que lee el renglón importa aquí). */
function move(gameId: number, gameName: string, tab: TabId, at: number) {
  return { id: `${gameId}:${tab}`, gameId, gameName, tab, at, updatedAt: at } as SocialMoveFeedItem;
}

const DAY = 86_400_000;

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
    const others = screen.getByRole('group', { name: SOCIAL_UI.profiles.othersTitle });
    expect(within(others).getByText('Bob')).toBeInTheDocument();
    expect(within(others).queryByText('Ada')).not.toBeInTheDocument();
  });

  // En la sección de amigos no se repite «Amigos» en cada tarjeta: ya lo dice su título (09-10-2026).
  it('las tarjetas de amigos no llevan la etiqueta «Amigos»; las de descubrir, su acción', () => {
    render(
      <SocialProfilesScreen
        {...baseProps}
        relationshipWith={relationshipWith}
        filteredSocialDirectory={[entry('ada', 'Ada'), entry('bob', 'Bob')]}
      />,
    );

    const friends = screen.getByRole('group', { name: SOCIAL_UI.profiles.sectionGroupAria(SOCIAL_UI.profiles.friendsTitle, 1) });
    expect(within(friends).queryByText(SOCIAL_UI.friendship.friends)).not.toBeInTheDocument();
    const others = screen.getByRole('group', { name: SOCIAL_UI.profiles.othersTitle });
    expect(within(others).getByLabelText(SOCIAL_UI.friendship.addAria('Bob'))).toBeInTheDocument();
  });

  // EL RANGO YA NO SALE EN ESTA PANTALLA (14-10-2026), ni siquiera para la administración: la muesca se quitó con
  // el paso a renglones.
  it('no pinta el rango de nadie, tampoco a la administración', () => {
    const { container } = render(
      <SocialProfilesScreen
        {...baseProps}
        showLastSeen
        relationshipWith={() => 'friends'}
        filteredSocialDirectory={[entry('ada', 'Ada'), entry('bob', 'Bob')]}
      />,
    );

    expect(container.querySelector('.hub-tier-notch')).toBeNull();
    for (const label of Object.values(PROFILE_TIER_LABELS)) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  // La última conexión es solo para la administración, y de TODOS: amigos y el resto.
  describe('última conexión', () => {
    const now = Date.now();
    const directorio = [entry('ada', 'Ada', now), entry('bob', 'Bob', now - 2 * DAY), entry('cid', 'Cid', 0)];
    const relationshipWith = (uid: string): RelationshipState => (uid === 'ada' ? 'friends' : 'none');

    it('sin showLastSeen no se dice', () => {
      render(<SocialProfilesScreen {...baseProps} relationshipWith={relationshipWith} filteredSocialDirectory={directorio} />);
      expect(screen.queryByText(/Última conexión/)).not.toBeInTheDocument();
    });

    it('con showLastSeen, la de cada uno, sin hora; sin dato, nada', () => {
      render(<SocialProfilesScreen {...baseProps} showLastSeen relationshipWith={relationshipWith} filteredSocialDirectory={directorio} />);
      expect(screen.getByText(SOCIAL_UI.profiles.lastSeen(0))).toBeInTheDocument();
      expect(screen.getByText(SOCIAL_UI.profiles.lastSeen(2))).toBeInTheDocument();
      expect(screen.getAllByText(/Última conexión/)).toHaveLength(2);
    });
  });

  // A QUÉ JUEGA, de sus mensajes de lista: solo de tus amigos (de los demás no se lee el canal, y aunque llegara algo,
  // no se enseña).
  describe('a qué juega', () => {
    const now = Date.now();
    const directorio = [
      entry('ada', 'Ada', now, [move(1, 'Hades', 'e', now - DAY), move(2, 'Celeste', 'c', now - 3 * DAY)]),
      entry('bob', 'Bob', now, [move(3, 'Tunic', 'e', now - DAY)]),
    ];
    const relationshipWith = (uid: string): RelationshipState => (uid === 'ada' ? 'friends' : 'none');

    afterEach(() => coversPreference.set(false));

    it('dice lo último que empezó o terminó un amigo, y nada de quien no lo es', () => {
      render(<SocialProfilesScreen {...baseProps} relationshipWith={relationshipWith} filteredSocialDirectory={directorio} />);
      expect(screen.getByText('Hades')).toBeInTheDocument();
      expect(screen.getByText('Hades').parentElement).toHaveTextContent(`${SOCIAL_UI.profiles.activity.e} Hades`);
      expect(screen.queryByText('Celeste')).not.toBeInTheDocument();
      expect(screen.queryByText('Tunic')).not.toBeInTheDocument();
    });

    // El cuarto respaldo (solo llega relleno para la administración): el último completado, si el canal no cuenta nada.
    it('sin nada en su canal, el último completado que llegue; con algo, no se usa', () => {
      render(
        <SocialProfilesScreen
          {...baseProps}
          relationshipWith={() => 'friends'}
          filteredSocialDirectory={[...directorio, entry('cid', 'Cid', now)]}
          lastCompletedByProfile={{ ada: 'Outer Wilds', cid: 'Disco Elysium' }}
        />,
      );
      expect(screen.getByText('Disco Elysium').parentElement).toHaveTextContent(`${SOCIAL_UI.profiles.activity.c} Disco Elysium`);
      expect(screen.queryByText('Outer Wilds')).not.toBeInTheDocument();
    });

    it('la carátula, solo con la preferencia encendida y solo de los amigos', () => {
      const { container, unmount } = render(
        <SocialProfilesScreen {...baseProps} relationshipWith={relationshipWith} filteredSocialDirectory={directorio} />,
      );
      expect(container.querySelector('.hub-person-row-cover')).toBeNull();
      unmount();

      coversPreference.set(true);
      const { container: withCovers } = render(
        <SocialProfilesScreen {...baseProps} relationshipWith={relationshipWith} filteredSocialDirectory={directorio} />,
      );
      const covers = withCovers.querySelectorAll<HTMLElement>('.hub-person-row-cover');
      expect(covers).toHaveLength(1);
      // De lo ajeno, la marca de «solo lo ya resuelto o lo que quepa en el cupo de lo ajeno», y el tamaño del renglón.
      expect(covers[0].style.getPropertyValue('--person-cover')).toMatch(/\/cover\?n=Hades.*s=medio.*c=2/);
    });
  });

  describe('descubrir', () => {
    const relationshipWith = (uid: string): RelationshipState =>
      ({ ana: 'outgoing', ben: 'none', cris: 'incoming', dani: 'none' } as Record<string, RelationshipState>)[uid] || 'none';
    const directorio = [entry('ana', 'Ana'), entry('ben', 'Ben'), entry('cris', 'Cris')];

    it('primero las solicitudes recibidas, luego el resto y al final las enviadas', () => {
      render(<SocialProfilesScreen {...baseProps} relationshipWith={relationshipWith} filteredSocialDirectory={directorio} />);
      const nombres = [...document.querySelectorAll('.hub-user-card-name')].map((el) => el.textContent);
      expect(nombres).toEqual(['Cris', 'Ben', 'Ana']);
    });

    it('dice en qué punto está cada solicitud, y el botón de añadir va corto', () => {
      render(<SocialProfilesScreen {...baseProps} relationshipWith={relationshipWith} filteredSocialDirectory={directorio} />);
      expect(screen.getByText(SOCIAL_UI.profiles.incomingNote)).toBeInTheDocument();
      expect(screen.getByText(SOCIAL_UI.profiles.outgoingNote)).toBeInTheDocument();
      // El estado de la enviada ya va escrito: no se repite el rótulo «Pendiente».
      expect(screen.queryByText(SOCIAL_UI.friendship.pending)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: SOCIAL_UI.friendship.addAria('Ben') })).toHaveTextContent(SOCIAL_UI.friendship.addShort);
    });
  });

  // Renglones en rejilla (14-10-2026): una columna en el teléfono y varias en escritorio, nunca un carrusel.
  it('pinta a cada persona en un renglón dentro de una rejilla, no en un carrusel horizontal', () => {
    const { container } = render(
      <SocialProfilesScreen
        {...baseProps}
        relationshipWith={() => 'none'}
        filteredSocialDirectory={[entry('ada', 'Ada'), entry('bob', 'Bob')]}
      />,
    );
    expect(container.querySelectorAll('.hub-person-rows .hub-person-row')).toHaveLength(2);
    expect(container.querySelector('.hub-feed-row')).not.toBeInTheDocument();
  });

  // PAGINACIÓN POR FILAS (6). En jsdom no hay layout, así que `gridTemplateColumns` no resuelve pistas y el
  // número de columnas se queda en 1 → página de 6 filas × 1 columna = 6 renglones, que es justo lo que se ve en un
  // teléfono, donde los renglones van en una sola columna.
  describe('paginación por filas', () => {
    const muchos = Array.from({ length: 11 }, (_, i) => entry(`u${i}`, `Perfil ${i}`));

    it('muestra la primera página y ofrece el resto, diciendo cuántos quedan', () => {
      render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );

      expect(screen.getByText('Perfil 0')).toBeInTheDocument();
      expect(screen.getByText('Perfil 5')).toBeInTheDocument();
      expect(screen.queryByText('Perfil 6')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(5) })).toBeInTheDocument();
    });

    // El recuento de AMIGOS es el de todos, no el de los renglones pintados (15-10-2026).
    it('el número de amigos es el total aunque no se vean todos', () => {
      render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'friends'} filteredSocialDirectory={muchos} />,
      );

      expect(screen.queryByText('Perfil 6')).not.toBeInTheDocument();
      expect(screen.getByText('· 11')).toBeInTheDocument();
      expect(
        screen.getByRole('group', { name: SOCIAL_UI.profiles.sectionGroupAria(SOCIAL_UI.profiles.friendsTitle, 11) }),
      ).toBeInTheDocument();
    });

    // «Descubrir» sale de una consulta con tope: su número diría cuántos cupieron, no cuántos hay (15-10-2026).
    it('«Descubrir» no lleva número', () => {
      const { container } = render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );

      expect(screen.getByRole('group', { name: SOCIAL_UI.profiles.othersTitle })).toBeInTheDocument();
      // La sección de amigos, vacía, sí dice su cero; la de descubrir, ninguno.
      expect([...container.querySelectorAll('.hub-section-count')].map((el) => el.textContent)).toEqual(['· 0']);
    });

    // SCROLL INFINITO (15-10-2026): al acercarse el final, la página siguiente llega sola, sin pulsar.
    it('al llegar el centinela a la vista añade otra página sin pulsar nada', () => {
      const callbacks: IntersectionObserverCallback[] = [];
      const Original = globalThis.IntersectionObserver;
      globalThis.IntersectionObserver = class {
        constructor(cb: IntersectionObserverCallback) {
          callbacks.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      } as unknown as typeof IntersectionObserver;
      try {
        render(
          <SocialProfilesScreen {...baseProps} relationshipWith={() => 'friends'} filteredSocialDirectory={muchos} />,
        );
        expect(screen.queryByText('Perfil 10')).not.toBeInTheDocument();

        act(() => {
          callbacks.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });
        expect(screen.getByText('Perfil 10')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Mostrar más/ })).not.toBeInTheDocument();
      } finally {
        globalThis.IntersectionObserver = Original;
      }
    });

    it('"mostrar más" añade otra página y desaparece al llegar al final', async () => {
      const user = userEvent.setup();
      render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );

      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(5) }));
      expect(screen.getByText('Perfil 10')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Mostrar más/ })).not.toBeInTheDocument();
    });

    // Si al buscar se conservara la expansión, el filtro parecería no haber hecho nada.
    it('al cambiar la búsqueda se vuelve a la primera página', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={muchos} />,
      );
      await user.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.showMore(5) }));
      expect(screen.getByText('Perfil 8')).toBeInTheDocument();

      rerender(
        <SocialProfilesScreen
          {...baseProps}
          profileSearch="perfil"
          relationshipWith={() => 'none'}
          filteredSocialDirectory={muchos}
        />,
      );
      expect(screen.queryByText('Perfil 8')).not.toBeInTheDocument();
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
        filteredSocialDirectory={[
          entry('vieja', 'Vieja', 1_000),
          entry('reciente', 'Reciente', 9_000),
          entry('sin-dato', 'Sin dato', 0),
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

describe('SocialProfilesScreen — invitar a un amigo', () => {
  const invite = () => screen.queryByRole('region', { name: SOCIAL_UI.profiles.inviteAria });
  const directorio = [entry('ada', 'Ada'), entry('bob', 'Bob'), entry('cid', 'Cid'), entry('dan', 'Dan')];

  it('se ofrece a quien tiene pocos amigos, con la dirección completa y su vista previa', () => {
    render(<SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={directorio} />);
    const region = invite();
    expect(region).not.toBeNull();
    expect(within(region!).getByText(INVITE_UI.url)).toBeInTheDocument();
    expect(within(region!).getByRole('img', { name: INVITE_UI.previewAlt })).toBeInTheDocument();
  });

  it(`con ${INVITE_UNTIL_FRIENDS} amigos o más ya no se ofrece`, () => {
    const amigos = new Set(['ada', 'bob', 'cid']);
    render(
      <SocialProfilesScreen
        {...baseProps}
        relationshipWith={(uid) => (amigos.has(uid) ? 'friends' : 'none')}
        filteredSocialDirectory={directorio}
      />,
    );
    expect(invite()).toBeNull();
  });

  it('«Compartir», dentro del bloque; sin hoja de compartir del sistema copia el enlace', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={directorio} />);
    const region = invite()!;
    const compartir = within(region).getByRole('button', { name: INVITE_UI.share });
    expect(region.querySelector('figure')!.contains(compartir)).toBe(true);
    expect(within(region).queryByText(/Echas a alguien en falta/)).toBeNull();

    await userEvent.click(compartir);
    expect(writeText).toHaveBeenCalledWith(INVITE_UI.url);
    expect(await within(region).findByText(INVITE_UI.copied)).toBeInTheDocument();
  });

  it('pulsar la dirección también la copia', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SocialProfilesScreen {...baseProps} relationshipWith={() => 'none'} filteredSocialDirectory={directorio} />);
    const region = invite()!;

    await userEvent.click(within(region).getByRole('button', { name: INVITE_UI.copyUrlAria(INVITE_UI.url) }));
    expect(writeText).toHaveBeenCalledWith(INVITE_UI.url);
    expect(await within(region).findByText(INVITE_UI.copied)).toBeInTheDocument();
  });

  it('ni con una búsqueda puesta ni mientras carga el directorio', () => {
    const { unmount } = render(
      <SocialProfilesScreen {...baseProps} profileSearch="ad" relationshipWith={() => 'none'} filteredSocialDirectory={[entry('ada', 'Ada')]} />,
    );
    expect(invite()).toBeNull();
    unmount();
    render(<SocialProfilesScreen {...baseProps} loadingDirectory relationshipWith={() => 'none'} filteredSocialDirectory={[]} />);
    expect(invite()).toBeNull();
  });
});
