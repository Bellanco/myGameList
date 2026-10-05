import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { SocialProfileDetailScreen } from '../../src/view/components/socialhub/SocialProfileDetailScreen';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { ADMIN_ONLY_TIER } from '../../src/core/constants/tiers';
import { YEAR_SUMMARY_UI } from '../../src/core/constants/yearSummaryLabels';

/* La preferencia de carátulas se replica a la nube cuando hay sesión; aquí no hay ninguna, y lo que se mira es
   qué pide la pantalla, no dónde se guarda el ajuste. */
vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(),
  setPublicConfig: vi.fn(async () => {}),
}));

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
        }}
        onBack={vi.fn()}
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
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
        }}
        onBack={vi.fn()}
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    // La pestaña 'próximos' (p) está oculta → su chip no aparece.
    expect(screen.queryByRole('tab', { name: SOCIAL_UI.feed.profileListTabPlanned })).not.toBeInTheDocument();
    // Pero las visibles sí (se renderizan con role="tab").
    expect(screen.getByRole('tab', { name: SOCIAL_UI.feed.profileListTabCompleted })).toBeInTheDocument();
  });
});

/* SCROLL INFINITO en la tabla, el mismo que la lista de reseñas: el botón de «ver más» es el centinela, y al
   acercarse a la pantalla carga el siguiente lote sin pulsarlo. */
describe('SocialProfileDetailScreen — carga continua', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('al acercarse al «ver más», carga el siguiente lote sin pulsarlo', () => {
    const vistos: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          vistos.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
    const juegos = Array.from({ length: 20 }, (_, i) => game(i + 1, `Juego ${i + 1}`));
    render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        isOwnProfile
        activeProfileDetail={{
          displayName: 'Yo',
          visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false },
          sharedLists: { c: juegos, v: [], e: [], p: [] },
        }}
        onBack={vi.fn()}
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    // Primer lote de 15 de 20: queda más, así que el centinela está puesto.
    expect(screen.getByRole('button', { name: SOCIAL_UI.feed.feedLoadMore })).toBeInTheDocument();
    expect(vistos.length).toBeGreaterThan(0);

    act(() => {
      vistos.at(-1)?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    // El segundo lote ya cubre los 20: no queda nada que cargar y el botón se va.
    expect(screen.queryByRole('button', { name: SOCIAL_UI.feed.feedLoadMore })).not.toBeInTheDocument();
  });
});

/* LAS CARÁTULAS DE UNA BIBLIOTECA AJENA. Tu biblioteca la resuelve una vez el recorrido de fondo; la de otra
   persona es un catálogo entero de juegos que no tienes, y se multiplica por cada perfil que abras. Hasta que
   haya números para decidir, solo las pide quien tiene el rango que paga los privilegios; los demás ven la misma
   lista sin imágenes. Cuando se desbloquee, vuelve a mandar el check de cada uno. */
describe('SocialProfileDetailScreen — carátulas ajenas', () => {
  const foreignProfile = {
    displayName: 'Ada',
    visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false },
    sharedLists: { c: [game(1, 'Halo')], v: [], e: [], p: [] },
  };

  function pintaPerfil(viewerTier?: typeof ADMIN_ONLY_TIER, check = true) {
    if (check) localStorage.setItem('mis-listas-covers', 'on'); // apagado es el estado de fábrica
    localStorage.setItem('mis-listas-list-shape', 'grid');
    return render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        activeProfileDetail={foreignProfile}
        friendshipState="friends"
        viewerTier={viewerTier}
        onAddOrAcceptFriend={vi.fn()}
        onCancelFriendRequest={vi.fn()}
        onRemoveFriend={vi.fn()}
        onBack={vi.fn()}
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
        status=""
        statusKind=""
      />,
    );
  }

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  /* PARA TODOS, CON EL CUPO DE LO AJENO. La biblioteca de otra persona se pide con `c=2`: se ve lo que el servidor
     ya tiene y lo que falte solo se resuelve con la parte del cupo del día reservada a lo ajeno. */
  it('las pide con el rango de partida, con la marca de lo ajeno', () => {
    const { container } = pintaPerfil();

    expect(container.querySelector('.game-cover-img')?.getAttribute('src')).toContain('c=2');
  });

  it('y con mithril, igual: la regla no depende del rango', () => {
    const { container } = pintaPerfil(ADMIN_ONLY_TIER);

    expect(container.querySelector('.game-cover-img')?.getAttribute('src')).toContain('c=2');
  });

  it('con el check apagado no pide ninguna', () => {
    const { container } = pintaPerfil(undefined, false);

    expect(container.querySelector('.game-cover-img')).toBeNull();
    // Y la lista sigue estando: lo que cambia es que se pinta sin imágenes. (El nombre sale más de una vez en el
    // mosaico —el título de la caja y el rótulo para lectores de pantalla—, así que se cuentan todas.)
    expect(screen.getAllByText('Halo').length).toBeGreaterThan(0);
  });
});

describe('SocialProfileDetailScreen — gating por amistad', () => {
  const foreignProfile = {
    displayName: 'Ada',
    visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false },
    sharedLists: { c: [game(1, 'Halo')], v: [], e: [], p: [] },
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
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
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
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
        status=""
        statusKind=""
      />,
    );

    expect(screen.getByRole('button', { name: SOCIAL_UI.feed.reviewsButton })).toBeInTheDocument();
    expect(screen.getByText('Elige tu próximo juego')).toBeInTheDocument();
    // El listado del amigo se muestra: su juego aparece como fila.
    expect(screen.getByText('Halo')).toBeInTheDocument();
    // Y ofrece eliminar amistad.
    expect(screen.getByLabelText(SOCIAL_UI.friendship.removeAria('Ada'))).toBeInTheDocument();
  });
});

/* EL RESUMEN DEL AÑO. Cuarto botón de la ficha: del año anterior (en diciembre, del que acaba), solo de
   completados, con el MES de cada fin para una amistad y el DÍA en tu propio perfil o para la administración.
   Sus reglas de quién lo ve son las de las estadísticas de un amigo, salvo el rango. */
describe('SocialProfileDetailScreen — resumen del año', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const visibility = { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false };
  const of2025 = (id: number, name: string, extra: Record<string, unknown> = {}) => ({ ...game(id, name), years: [2025], grade: 90, ...extra });
  // Los juegos de prueba mezclan las dos formas (completa y pública) a propósito: el tipo no admite el cruce.
  const friend = (c: object[]) => ({ displayName: 'Ada', visibility, sharedLists: { c: c as never[], v: [], e: [], p: [] } });

  function pinta(props: Record<string, unknown>) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 1));
    return render(
      <SocialProfileDetailScreen
        SOCIAL_UI={SOCIAL_UI}
        friendshipState="friends"
        onBack={vi.fn()}
        showReviews={false}
        onToggleReviews={vi.fn()}
        onOpenReview={vi.fn()}
        status=""
        statusKind=""
        activeProfileDetail={friend([])}
        {...props}
      />,
    );
  }

  it('de una amistad: se abre con el botón, por meses y con lo que compartís', async () => {
    pinta({
      activeProfileDetail: friend([of2025(1, 'Halo', { finishedOn: '2025-05' }), of2025(2, 'Zelda', { finishedOn: '2025-05', grade: 70 })]),
      viewerCompleted: [of2025(10, 'zelda', { grade: 95 })],
    });
    screen.getByRole('button', { name: YEAR_SUMMARY_UI.button }).click();

    expect(await screen.findByText(YEAR_SUMMARY_UI.title(2025))).toBeInTheDocument();
    expect(await screen.findByText(YEAR_SUMMARY_UI.when.top({ own: false, name: 'Ada' }, [4], 2))).toBeInTheDocument();
    // Con precisión de mes no hay calendario día a día.
    expect(screen.queryByRole('img', { name: YEAR_SUMMARY_UI.when.calendarAria })).not.toBeInTheDocument();
    expect(screen.getByText(YEAR_SUMMARY_UI.common.title(1))).toBeInTheDocument();
  });

  it('sin completados ese año, no hay botón', () => {
    pinta({ activeProfileDetail: friend([game(1, 'Halo')]) });
    expect(screen.queryByRole('button', { name: YEAR_SUMMARY_UI.button })).not.toBeInTheDocument();
  });

  it('con solo la proyección pública (el gist de listados aún no ha llegado), tampoco', () => {
    pinta({ activeProfileDetail: friend([{ id: 1, name: 'Halo', platforms: [], genres: [], rating: 4, grade: 80, snippet: '', years: [2025] }]) });
    expect(screen.queryByRole('button', { name: YEAR_SUMMARY_UI.button })).not.toBeInTheDocument();
  });

  it('reciprocidad: quien esconde sus completados no lo ve, salvo la administración', () => {
    const lists = friend([of2025(1, 'Halo')]);
    pinta({ activeProfileDetail: lists, viewerHiddenTabs: ['c'] });
    expect(screen.queryByRole('button', { name: YEAR_SUMMARY_UI.button })).not.toBeInTheDocument();
    cleanup();
    pinta({ activeProfileDetail: lists, viewerHiddenTabs: ['c'], viewerTier: ADMIN_ONLY_TIER });
    expect(screen.getByRole('button', { name: YEAR_SUMMARY_UI.button })).toBeInTheDocument();
  });

  it('llega con el resumen ya desplegado desde la tarjeta del feed o el aviso', async () => {
    pinta({ activeProfileDetail: friend([of2025(1, 'Halo', { finishedOn: '2025-05' })]), openSummaryOnMount: true });
    expect(await screen.findByText(YEAR_SUMMARY_UI.title(2025))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: YEAR_SUMMARY_UI.buttonBack })).toHaveAttribute('aria-pressed', 'true');
  });

  it('abrir TU resumen avisa con su año; el de otra persona, no', async () => {
    const onOwnSummaryOpened = vi.fn();
    pinta({ activeProfileDetail: friend([of2025(1, 'Halo')]), onOwnSummaryOpened, openSummaryOnMount: true });
    await screen.findByText(YEAR_SUMMARY_UI.title(2025));
    expect(onOwnSummaryOpened).not.toHaveBeenCalled();
    cleanup();
    pinta({
      isOwnProfile: true,
      activeProfileDetail: { displayName: 'Yo', visibility, sharedLists: { c: [], v: [], e: [], p: [] } },
      viewerCompleted: [of2025(1, 'Halo')],
      onOwnSummaryOpened,
    });
    expect(onOwnSummaryOpened).not.toHaveBeenCalled();
    screen.getByRole('button', { name: YEAR_SUMMARY_UI.button }).click();
    await screen.findByText(YEAR_SUMMARY_UI.title(2025));
    expect(onOwnSummaryOpened).toHaveBeenCalledWith(2025);
  });

  it('en tu perfil, con el día de cada fin', async () => {
    const at = (iso: string) => new Date(`${iso}T18:00:00`).getTime();
    pinta({
      isOwnProfile: true,
      activeProfileDetail: { displayName: 'Yo', visibility, sharedLists: { c: [], v: [], e: [], p: [] } },
      viewerCompleted: [of2025(1, 'Halo', { enteredAt: { c: at('2025-03-08') } }), of2025(2, 'Zelda', { enteredAt: { c: at('2025-11-15') } })],
    });
    screen.getByRole('button', { name: YEAR_SUMMARY_UI.button }).click();
    expect(await screen.findByRole('img', { name: YEAR_SUMMARY_UI.when.calendarAria })).toBeInTheDocument();
    expect(screen.getByText(YEAR_SUMMARY_UI.cover.finished({ own: true, name: 'Yo' }, 2))).toBeInTheDocument();
  });
});
