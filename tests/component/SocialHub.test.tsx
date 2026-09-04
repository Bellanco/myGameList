import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { SecretSocialGistResult } from '../../src/model/repository/socialGistRepository';
import type { SocialAuthUser, SocialProfileReference } from '../../src/model/repository/firebaseClient';

// Mock de los repos que consume useSocialViewModel: aísla la UI de red/Firebase/IndexedDB.
// Valida que tras M3 (extracción del viewmodel) SocialHub sigue renderizando ambas ramas sin romper.

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(),
  ensureProfileByEmail: vi.fn(async () => {}),
  resolveOwnProfile: vi.fn(async (): Promise<SocialProfileReference | null> => null),
  // L4 — puerta de aceptación. El valor por defecto (consentimiento vigente) se fija en `beforeEach`, donde ya
  // se puede importar `LEGAL_VERSION`; los tests de la puerta lo sobrescriben con `null`.
  getPublicConfig: vi.fn(async (): Promise<any> => null),
  setPublicConfig: vi.fn(async () => {}),
  // Fase 0: el gist social propio se recupera de `privateConfig` (owner-only) antes que del perfil público.
  getPrivateConfig: vi.fn(async (): Promise<any> => null),
  setPrivateConfig: vi.fn(async () => {}),
  listSocialDirectory: vi.fn(async (): Promise<any[]> => []),
  signInWithGoogle: vi.fn(async (): Promise<SocialAuthUser | null> => null),
  signOutSocialUser: vi.fn(async () => {}),
  resolveStableProfileId: vi.fn(async (uid: string) => uid), // P1: detección de propiedad por identidad
  updateProfilePhoto: vi.fn(async () => {}),
  // Amistad
  getMyFriendships: vi.fn(async (): Promise<any> => ({ friends: [], incoming: [], outgoing: [], byOtherUid: {} })),
  acceptFriendRequest: vi.fn(async () => {}),
  deleteFriendship: vi.fn(async () => {}),
  sendFriendRequest: vi.fn(async () => {}),
  readFriendship: vi.fn(async (): Promise<any> => null),
  healOwnFriendshipIdentity: vi.fn(async (..._args: unknown[]) => {}),
  healOwnDirectoryGist: vi.fn(async () => ({ healed: false, adoptGistId: '' })),
  invalidateMyFriendshipsCache: vi.fn(),
  // Latido de recencia (`profiles.updatedAt`): sin exportarlo aquí, el hub llamaría a `undefined` al montarse.
  touchOwnProfileActivityThrottled: vi.fn(async () => {}),
  // Retirada del id que el perfil público aún anuncie: por defecto no hay nada que retirar.
  purgeOwnPublicGistIds: vi.fn(async () => false),
  // Reparación de la réplica del nick en `profiles`: por defecto no hace falta (las dos copias coinciden). Sin
  // exportarla aquí, el hub llamaría a `undefined` al abrirse y caería en su error boundary.
  repairProfileDisplayName: vi.fn(async () => false),
}));

vi.mock('../../src/model/repository/firebaseRepository', () => firebaseMocks);

const gistMocks = vi.hoisted(() => ({
  getSocialSyncConfig: vi.fn(() => null as null | { token: string; gistId: string; etag: string | null; lastRemoteUpdatedAt: number }),
  getSyncConfig: vi.fn(() => null),
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  createSocialGist: vi.fn(async () => ({ gistId: 'g', etag: null })),
  readSocialGist: vi.fn(async (): Promise<any> => ({
    data: {
      profile: { name: '', private: false, recommendations: [], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false }, sharedLists: {} },
      recommendations: [],
      activity: [],
      updatedAt: 0,
    },
    etag: null,
  })),
  readPublicSocialGistById: vi.fn(async (_gistId?: string): Promise<any> => ({})),
  // Fase 2: migración del canal a gist secreto. Por defecto, nada que migrar.
  // Tipado con el contrato REAL a propósito: con `Promise<any>` un mock que se quedara atrás (le faltaba
  // `supersededGistIds`) pasaba el typecheck y reventaba en ejecución como rechazo no capturado.
  ensureSecretSocialGist: vi.fn(async (_t?: string, gistId?: string): Promise<SecretSocialGistResult> => ({ gistId: gistId || '', etag: null, migrated: false, supersededGistIds: [], keptPublicGistIds: [], copiedEntries: 0 })),
  socialGistHasContent: vi.fn(async (): Promise<boolean> => true),
  deleteGist: vi.fn(async (): Promise<boolean> => true),
  writeSocialGist: vi.fn(async () => ({ etag: null })),
  saveSocialSyncConfig: vi.fn(),
  updateGistPrivacy: vi.fn(async () => ({ gistId: 'g', etag: null })),
  buildReviewSnippet: (review: string) => (review || '').slice(0, 160),
}));

// Se parte del módulo REAL y solo se sustituye lo que toca red/config: así las funciones puras del gist
// (remapSocialActorIds, upsertReviewActivity, removeReviewActivity…) se ejercitan de verdad y un flujo que
// escribiera el gist indebidamente llegaría hasta `writeSocialGist` (mockeado) y sería detectable.
//
// Se mockean los DOS módulos con el mismo objeto desde que el canal social se separó del de juegos: el hub usa
// `socialGistRepository` y la config de sync sigue en `gistRepository`. Cada factoría se queda solo con las
// claves que su módulo exporta de verdad; las sobrantes del spread no las importa nadie.
vi.mock('../../src/model/repository/gistRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/gistRepository')>()),
  ...gistMocks,
}));

vi.mock('../../src/model/repository/socialGistRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/socialGistRepository')>()),
  ...gistMocks,
}));

const localMocks = vi.hoisted(() => ({
  loadLocalState: vi.fn((): any => ({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 })),
}));

vi.mock('../../src/model/repository/localRepository', () => localMocks);

// El botón de compartir trae su propio view-model, que habla con `/api/share` y con Firebase. Aquí interesa DÓNDE
// se ofrece el botón, no su estado interno: se le da una sesión válida y ningún enlace previo.
const shareMocks = vi.hoisted(() => ({
  useShareViewModel: vi.fn(() => ({
    shares: [],
    quota: { maxActive: 5, ttlDays: 7 },
    ban: null,
    available: true,
    hasSocialSpace: true,
    nick: 'Me',
    nickIsAccountName: false,
    loading: false,
    busyToken: null,
    error: '',
    errorDetails: {},
    refresh: vi.fn(async () => {}),
    share: vi.fn(async () => null),
    revoke: vi.fn(async () => false),
    shareOf: () => null,
    clearError: vi.fn(),
  })),
}));

vi.mock('../../src/viewmodel/useShareViewModel', () => shareMocks);

import { SocialHub } from '../../src/view/components/SocialHub';
import { SHARE_UI } from '../../src/core/constants/shareLabels';
import { SOCIAL_UI } from '../../src/core/constants/socialLabels';
import { LEGAL_CONSENT_UI, LEGAL_VERSION } from '../../src/core/constants/legal';

function renderHub(initialPath = '/social', games?: unknown) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SocialHub games={games as never} />
    </MemoryRouter>,
  );
}

describe('SocialHub (componente, post-M3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gistMocks.getSocialSyncConfig.mockReturnValue(null);
    // `clearAllMocks` borra las llamadas pero NO las implementaciones: sin restaurar esta, un test que simule la
    // migración del canal se la contagia a todos los siguientes (les cambiaría el gist a mitad de camino).
    gistMocks.ensureSecretSocialGist.mockImplementation(async (_t?: string, gistId?: string) => ({
      gistId: gistId || '',
      etag: null,
      migrated: false,
      supersededGistIds: [],
      keptPublicGistIds: [],
      copiedEntries: 0,
    }));
    gistMocks.socialGistHasContent.mockResolvedValue(true);
    // Ídem con la lectura del gist del perfil: el test que la deja colgando (para que el perfil llegue DESPUÉS del
    // directorio) se la contagiaría a los siguientes, que se quedarían sin hidratar el perfil.
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: '', private: false, recommendations: [], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false }, sharedLists: {} },
        recommendations: [], activity: [], updatedAt: 0,
      },
      etag: null,
    });
    gistMocks.deleteGist.mockResolvedValue(true);
    // Idem con `privateConfig`: si un test deja ahí un gist, el resto creería que otro dispositivo ya migró y
    // adoptarían ese canal en vez de seguir su propio camino.
    firebaseMocks.getPrivateConfig.mockResolvedValue(null);
    firebaseMocks.setPrivateConfig.mockResolvedValue(undefined);
    // Y con las amistades: el test que las deja COLGANDO (para observar la ventana de carga del feed) dejaría al
    // resto sin resolverlas nunca, y sin amistades resueltas el directorio no se hidrata en ningún test posterior.
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
    // Ídem con el perfil propio, del que sale el RANGO: los tests que lo dejan colgando (para observar qué pasa
    // antes de conocerlo) dejarían al resto sin rango resuelto, y sin rango tampoco se hidrata el directorio.
    firebaseMocks.resolveOwnProfile.mockResolvedValue(null);
    // Salvo en los tests de la puerta legal, se parte de un consentimiento vigente.
    firebaseMocks.getPublicConfig.mockResolvedValue({ consent: { version: LEGAL_VERSION, agreedAt: 1 } });
  });

  it('sin sesión muestra el gateway (barra de progreso de configuración)', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue(null);

    renderHub();

    // El gateway tiene un role="progressbar" que NO existe en el espacio social autenticado.
    const progress = await screen.findByRole('progressbar');
    expect(progress).toBeInTheDocument();
    expect(firebaseMocks.getCurrentSocialAuthUser).toHaveBeenCalled();
  });

  it('con sesión + gist social configurado entra al espacio social (deja el gateway)', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({
      uid: 'uid-1',
      email: 'jaime@example.com',
      displayName: 'Jaime',
      photoURL: null,
    });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    // Tras resolver los efectos, se abandona el gateway (ya no hay progressbar de configuración).
    await waitFor(() => {
      expect(firebaseMocks.getCurrentSocialAuthUser).toHaveBeenCalled();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });

  // Abrir una reseña tiene que empezar por su principio. El hub no rehacía el desplazamiento al cambiar de
  // pantalla, y con el bloque de reseñas relacionadas al pie la pantalla creció lo bastante como para que abrir
  // una desde el final de una lista larga te dejara a media altura, leyendo por el medio.
  it('al abrir el detalle de una reseña sube al principio de la pantalla', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({
      uid: 'uid-1',
      email: 'jaime@example.com',
      displayName: 'Jaime',
      photoURL: null,
    });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    renderHub('/social/user/pseudonimo-de-ana/game/7/review');

    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    });
  });

  it('volver del detalle NO reposiciona: el «atrás» conserva dónde estaba el lector', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({
      uid: 'uid-1',
      email: 'jaime@example.com',
      displayName: 'Jaime',
      photoURL: null,
    });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);

    renderHub('/social');

    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  // Saltar de un análisis a otro por el bloque de relacionados: el botón de volver tiene que nombrar y llevar al
  // sitio de DONDE SE VIENE. Un análisis propio se abre en la pantalla de reseñas del perfil, cuyo volver por
  // defecto es la lista de tus reseñas: a quien llegó desde el feed le ofrecía volver a una lista por la que no
  // había pasado.
  describe('volver desde un análisis abierto por el bloque de relacionados', () => {
    function renderConOrigen(pathname: string, backTo?: string) {
      firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({
        uid: 'uid-1',
        email: 'jaime@example.com',
        displayName: 'Jaime',
        photoURL: null,
      });
      gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });
      return render(
        <MemoryRouter initialEntries={[{ pathname, state: backTo ? { backTo } : null }]}>
          <SocialHub />
        </MemoryRouter>,
      );
    }

    it('desde otro análisis, vuelve a ese análisis', async () => {
      renderConOrigen('/social/profiles/me/game/7/review', '/social/user/ana/game/3/review');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: SOCIAL_UI.feed.backToReview })).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: SOCIAL_UI.feed.reviewsBackToList })).not.toBeInTheDocument();
    });

    it('desde el feed, vuelve a la actividad', async () => {
      renderConOrigen('/social/profiles/me/game/7/review', '/social');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: SOCIAL_UI.feed.backToFeed })).toBeInTheDocument();
      });
    });

    it('sin origen conserva el destino propio de la pantalla: la lista de reseñas del perfil', async () => {
      renderConOrigen('/social/profiles/me/game/7/review');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: SOCIAL_UI.feed.reviewsBackToList })).toBeInTheDocument();
      });
    });

    it('el detalle de un análisis ajeno también nombra de dónde se viene', async () => {
      renderConOrigen('/social/user/ana/game/3/review', '/social/profiles/me/game/7/review');

      await waitFor(() => {
        expect(screen.getByRole('button', { name: SOCIAL_UI.feed.backToReview })).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: SOCIAL_UI.feed.backToFeed })).not.toBeInTheDocument();
    });
  });

  // L4 — puerta de aceptación de condiciones. Bloquea SOLO el espacio social; nunca las listas propias.
  it('sin consentimiento vigente NO entra al espacio social y pide la aceptación', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    firebaseMocks.getPublicConfig.mockResolvedValue(null);
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    expect(await screen.findByText(LEGAL_CONSENT_UI.checkbox)).toBeInTheDocument();
    // Se queda en el gateway (la barra de progreso solo existe ahí).
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('una versión de condiciones antigua vuelve a pedir la aceptación', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    firebaseMocks.getPublicConfig.mockResolvedValue({ consent: { version: 'version-vieja', agreedAt: 1 } });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    expect(await screen.findByText(LEGAL_CONSENT_UI.checkbox)).toBeInTheDocument();
  });

  it('al aceptar se registra el consentimiento y se entra al espacio social', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    firebaseMocks.getPublicConfig.mockResolvedValue(null);
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    const checkbox = await screen.findByLabelText(LEGAL_CONSENT_UI.checkbox);
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(firebaseMocks.setPublicConfig).toHaveBeenCalledWith('uid-1', {
        consent: { version: LEGAL_VERSION, agreedAt: expect.any(Number) },
      });
    });
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  });

  it('con sesión válida NO parpadea el gateway mientras se comprueba el consentimiento', async () => {
    // Regresión: la comprobación del consentimiento es una lectura de Firestore (asíncrona). Entre que la
    // hidratación resolvía la sesión y llegaba esa respuesta, el hub caía al gateway: unas décimas de segundo
    // del paso de login/alta —con su botón de "Cerrar sesión"— en una sesión ya identificada.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });
    let resolveConsent: (value: unknown) => void = () => {};
    firebaseMocks.getPublicConfig.mockImplementation(() => new Promise((resolve) => { resolveConsent = resolve; }));

    renderHub();

    // La comprobación ya está en vuelo (la sesión está resuelta) y la pantalla sigue en "Cargando…":
    // ni gateway (progressbar) ni botón de cerrar sesión al alcance del dedo.
    await waitFor(() => expect(firebaseMocks.getPublicConfig).toHaveBeenCalledWith('uid-1'));
    expect(screen.getByText(SOCIAL_UI.loading)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: SOCIAL_UI.gateway.signOut })).not.toBeInTheDocument();

    // Al responder con el consentimiento vigente se entra al espacio social sin haber pasado por el gateway.
    resolveConsent({ consent: { version: LEGAL_VERSION, agreedAt: 1 } });
    await waitFor(() => expect(screen.queryByText(SOCIAL_UI.loading)).not.toBeInTheDocument());
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('feed: NO enseña el vacío "no tienes amigos" mientras las amistades siguen en vuelo', async () => {
    // Regresión del parpadeo carga → VACÍO → carga → contenido al abrir social.
    //
    // El feed es SOLO-AMIGOS: hasta que la query de amistades responde no se puede saber si está vacío. Pero
    // `loadingDirectory` solo cubría la hidratación en vuelo, que no arranca hasta DESPUÉS de esa query, así que
    // durante toda esa ventana el feed se pintaba con el directorio vacío y enseñaba su estado vacío —"Descubre
    // perfiles y añade amigos"— a alguien que sí tiene amigos y cuyo feed simplemente estaba cargando.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([]);
    let resolveFriendships: (value: unknown) => void = () => {};
    firebaseMocks.getMyFriendships.mockImplementation(() => new Promise((resolve) => { resolveFriendships = resolve; }));

    renderHub('/social');

    // El feed ya está montado (su título está a la vista) y la query de amistades sigue sin responder: es
    // exactamente el instante en el que se colaba el vacío.
    expect(await screen.findByText(SOCIAL_UI.feed.title)).toBeInTheDocument();
    await waitFor(() => expect(firebaseMocks.getMyFriendships).toHaveBeenCalled());
    expect(screen.queryByText(SOCIAL_UI.feed.activityEmptyNoFriends)).not.toBeInTheDocument();

    // Resuelta la amistad (sin amigos) y con el directorio vacío, el vacío YA es cierto y se muestra.
    resolveFriendships({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
    expect(await screen.findByText(SOCIAL_UI.feed.activityEmptyNoFriends)).toBeInTheDocument();
  });

  // P1 — el disparo de la hidratación dependía de la IDENTIDAD del callback, y ese callback se recreaba con
  // cualquiera de sus doce dependencias: `activePanel` (cambia en cada navegación del hub), `showPhoto` (lo fija
  // la hidratación del perfil, en cada apertura) y hasta `mainSyncConfig?.token`, que ni siquiera usaba. Cada
  // pasada relee IndexedDB y reemplaza el directorio por un array nuevo que invalida los `useMemo` del feed.
  it('directorio: se hidrata UNA vez por apertura aunque cambie la foto y se navegue por el hub', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: 'https://x/foto.png' });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    // El perfil se lee TARDE, a propósito: si `showPhoto` cambiara mientras el directorio aún se está hidratando,
    // la guarda de concurrencia absorbería el disparo espurio y el test pasaría sin que las dependencias del
    // efecto estuvieran bien. Resolviéndolo DESPUÉS, el único que puede evitar la segunda pasada es el disparo
    // por datos. `showPhoto: false` porque el estado arranca en `true`: con `true` React descartaría el setState.
    let resolveProfileGist: (value: unknown) => void = () => {};
    gistMocks.readSocialGist.mockImplementation(() => new Promise((resolve) => { resolveProfileGist = resolve; }));
    firebaseMocks.listSocialDirectory.mockResolvedValue([]);

    renderHub('/social');

    await waitFor(() => expect(firebaseMocks.listSocialDirectory).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(SOCIAL_UI.feed.activityEmptyNoFriends)).toBeInTheDocument());
    expect(firebaseMocks.listSocialDirectory).toHaveBeenCalledTimes(1);

    // Ya asentado el directorio, llega el perfil y cambia `showPhoto`. Eso NO cambia nada de lo que el directorio
    // contiene (solo la foto propia de respaldo), así que no puede costar otra relectura de ~50 gists.
    resolveProfileGist({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: false }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    // Se espera a que el perfil haya ATERRIZADO de verdad en el estado, no a que su lectura esté meramente
    // lanzada: el nick del perfil sale en el botón del avatar propio, así que verlo prueba que `setProfileName` y
    // `setShowPhoto` ya se han aplicado. Sin esta espera el test pasaba sin comprobar nada.
    expect(await screen.findByTitle('Me')).toBeInTheDocument();
    // Margen para que una segunda pasada llegara a contarse: entre el disparo y la llamada hay un `await` (la
    // lectura de la caché), así que comprobarlo en el mismo tick daría un falso verde.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(firebaseMocks.listSocialDirectory).toHaveBeenCalledTimes(1);

    // Ir a "Perfiles" y volver NO cambia nada de lo que el directorio contiene: no debe rehidratarlo.
    fireEvent.click(screen.getByRole('button', { name: SOCIAL_UI.feed.openProfiles }));
    await screen.findByText(SOCIAL_UI.profiles.title);
    fireEvent.click(screen.getByRole('button', { name: SOCIAL_UI.profiles.back }));
    await screen.findByText(SOCIAL_UI.feed.title);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(firebaseMocks.listSocialDirectory).toHaveBeenCalledTimes(1);
  });

  // El TTL de la caché del directorio sale del RANGO de quien mira (30 min bronce … 12 s mithril). Si se hidrata
  // antes de conocerlo, se evalúa la caché con el TTL de bronce y hay que repetir la hidratación entera al llegar
  // el rango de verdad: medido, bronce hidrataba 1 vez y plata/oro/mithril 2, la segunda releyendo hasta ~50 gists
  // de amigos y tapando con el esqueleto un feed ya pintado. El rango salía CARO en vez de privilegiado.
  it.each(['bronze', 'silver', 'gold', 'mithril'] as const)(
    'directorio: un %s hidrata UNA sola vez (el rango no provoca una segunda pasada)',
    async (tier) => {
      firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
      gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
      localMocks.loadLocalState.mockReturnValue({
        c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
        v: [], e: [], p: [], deleted: [], updatedAt: 0,
      });
      gistMocks.readSocialGist.mockResolvedValue({
        data: {
          profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
          recommendations: [], activity: [], posts: [], updatedAt: 0,
        },
        etag: null,
      });
      firebaseMocks.listSocialDirectory.mockResolvedValue([]);
      // El rango llega TARDE (es una lectura de Firestore), que es justo cuando se producía la segunda pasada.
      let resolveProfile: (value: SocialProfileReference | null) => void = () => {};
      const perfilPendiente = new Promise<SocialProfileReference | null>((resolve) => { resolveProfile = resolve; });
      firebaseMocks.resolveOwnProfile.mockImplementation(() => perfilPendiente);

      renderHub('/social');

      await screen.findByText(SOCIAL_UI.feed.title);
      // Sin rango todavía: no se ha hidratado nada (antes se hidrataba con el TTL de bronce).
      expect(firebaseMocks.listSocialDirectory).not.toHaveBeenCalled();

      resolveProfile({ tier, socialEnabled: true, socialGistId: 'my-social', displayName: 'Me' } as never);

      await waitFor(() => expect(firebaseMocks.listSocialDirectory).toHaveBeenCalled());
      // Margen para que una eventual segunda pasada llegara a contarse.
      await waitFor(() => expect(screen.queryByText(SOCIAL_UI.feed.activityEmptyNoFriends)).toBeInTheDocument());
      expect(firebaseMocks.listSocialDirectory).toHaveBeenCalledTimes(1);
    },
  );

  // FASE 0 — el gist social propio pasa a recuperarse de `privateConfig` (owner-only, un solo escritor) en vez
  // del perfil público, que es world-readable para cualquier usuario autenticado y va a dejar de publicarlo.
  describe('recuperación del gist social propio', () => {
    beforeEach(() => {
      firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
      // Sin config social local: hay que resolverlo desde la nube. Con token principal, que es la precondición.
      gistMocks.getSocialSyncConfig.mockReturnValue(null);
      gistMocks.getSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'games', etag: null, lastRemoteUpdatedAt: 0 } as never);
    });

    it('`privateConfig` MANDA sobre el perfil público cuando los dos traen id', async () => {
      firebaseMocks.getPrivateConfig.mockResolvedValue({ socialGistId: 'gs-privado' });
      // El perfil público anuncia otro id: si ganara, el canal quedaría atado a un campo que van a ver todos.
      firebaseMocks.resolveOwnProfile.mockResolvedValue({ socialEnabled: true, socialGistId: 'gs-publico' } as never);

      renderHub();

      await waitFor(() => expect(gistMocks.saveSocialSyncConfig).toHaveBeenCalled());
      expect(gistMocks.saveSocialSyncConfig.mock.calls[0][0]).toMatchObject({ gistId: 'gs-privado' });
    });

    it('sin `privateConfig` cae al perfil público y SIEMBRA el id en su sitio', async () => {
      firebaseMocks.getPrivateConfig.mockResolvedValue(null);
      firebaseMocks.resolveOwnProfile.mockResolvedValue({ socialEnabled: true, socialGistId: 'gs-publico' } as never);

      renderHub();

      await waitFor(() => expect(firebaseMocks.setPrivateConfig).toHaveBeenCalled());
      // Sin esta siembra, retirar el campo del perfil público dejaría a esa cuenta sin forma de recuperarlo.
      expect(firebaseMocks.setPrivateConfig).toHaveBeenCalledWith('uid-1', { socialGistId: 'gs-publico' });
    });

    it('con el id ya en `privateConfig` no lo reescribe', async () => {
      firebaseMocks.getPrivateConfig.mockResolvedValue({ socialGistId: 'gs-privado' });

      renderHub();

      await waitFor(() => expect(gistMocks.saveSocialSyncConfig).toHaveBeenCalled());
      expect(firebaseMocks.setPrivateConfig).not.toHaveBeenCalled();
    });
  });

  it('si la comprobación del consentimiento falla (offline), no bloquea el espacio social', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    firebaseMocks.getPublicConfig.mockRejectedValue(new Error('offline'));
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
  });

  // El auto-heal del DIRECTORIO se retiró: mantenía `profiles.social.gistId`, que ha dejado de publicarse.
  // Resucitarlo en cada apertura sería justo lo contrario de lo que se busca. Lo que queda es el saneado de
  // AMISTADES, que es donde las amistades leen ahora el canal.
  it('al abrir social propaga mi gist a mis documentos de amistad, y NO al perfil público', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    await waitFor(() => expect(firebaseMocks.healOwnFriendshipIdentity).toHaveBeenCalled());
    expect(firebaseMocks.healOwnFriendshipIdentity.mock.calls[0][0]).toBe('uid-1');
    expect(firebaseMocks.healOwnFriendshipIdentity.mock.calls[0][1]).toMatchObject({ socialGistId: 'social-gist' });
    // Y el directorio no se toca: el campo se está purgando, no manteniendo.
    expect(firebaseMocks.healOwnDirectoryGist).not.toHaveBeenCalled();
  });

  // FASE 2 — al abrir el hub, un canal público se migra a secreto y hay que repuntar las TRES referencias que
  // quedan: config local, `privateConfig` y los documentos de amistad. Si alguna se queda atrás, el usuario acaba
  // partido en dos canales, que es justo la deriva que veníamos de arreglar.
  it('migra el canal público a secreto y repunta config local, privateConfig y amistades', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'gs-publico', etag: 'W/"v"', lastRemoteUpdatedAt: 5 });
    gistMocks.ensureSecretSocialGist.mockResolvedValue({ gistId: 'gs-secreto', etag: 'W/"n"', migrated: true, supersededGistIds: ['gs-publico'], keptPublicGistIds: [], copiedEntries: 1 });

    renderHub();

    await waitFor(() => expect(gistMocks.ensureSecretSocialGist).toHaveBeenCalled());
    // 1) Config local con el id nuevo y SIN el etag/sello del gist anterior.
    await waitFor(() => expect(gistMocks.saveSocialSyncConfig).toHaveBeenCalledWith(
      expect.objectContaining({ gistId: 'gs-secreto', etag: 'W/"n"', lastRemoteUpdatedAt: 0 }),
    ));
    // 2) `privateConfig`, que es la fuente de verdad para el resto de sus dispositivos.
    await waitFor(() => expect(firebaseMocks.setPrivateConfig).toHaveBeenCalledWith('uid-1', { socialGistId: 'gs-secreto' }));
    // 3) Sus amistades, que es de donde lo leen los demás.
    await waitFor(() => {
      const conNuevo = firebaseMocks.healOwnFriendshipIdentity.mock.calls.some(
        (call: unknown[]) => (call[1] as { socialGistId?: string })?.socialGistId === 'gs-secreto',
      );
      expect(conNuevo).toBe(true);
    });
  });

  // La retirada del canal antiguo es IRREVERSIBLE: solo puede ocurrir después de verificar que el clon tiene el
  // contenido. Si se invirtiera el orden, un fallo dejaría al usuario sin canal y sin copia.
  it('retira el canal antiguo SOLO tras verificar que el clon conserva el contenido', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'gs-publico', etag: null, lastRemoteUpdatedAt: 0 });
    gistMocks.ensureSecretSocialGist.mockResolvedValue({ gistId: 'gs-secreto', etag: null, migrated: true, supersededGistIds: ['gs-publico'], keptPublicGistIds: [], copiedEntries: 3 });

    renderHub();

    await waitFor(() => expect(gistMocks.deleteGist).toHaveBeenCalledWith('ghp_x', 'gs-publico'));
    // Se verificó el CLON (no el original) contra el número de entradas copiadas.
    expect(gistMocks.socialGistHasContent).toHaveBeenCalledWith('ghp_x', 'gs-secreto', 3);
  });

  it('retira TODOS los públicos superados, no solo el de la sesión', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'gs-vacio', etag: null, lastRemoteUpdatedAt: 0 });
    gistMocks.ensureSecretSocialGist.mockResolvedValue({
      gistId: 'gs-secreto', etag: null, migrated: true,
      supersededGistIds: ['gs-vacio', 'gs-con-resenas'], keptPublicGistIds: [], copiedEntries: 5,
    });

    renderHub();

    // Con deriva hay dos públicos; dejar uno sería no haber quitado la exposición.
    await waitFor(() => expect(gistMocks.deleteGist).toHaveBeenCalledTimes(2));
    const borrados = gistMocks.deleteGist.mock.calls.map((call: unknown[]) => call[1]);
    expect(borrados.sort()).toEqual(['gs-con-resenas', 'gs-vacio']);
  });

  it('si el clon no supera la verificación NO borra nada: mejor dos gists que ninguno', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'gs-publico', etag: null, lastRemoteUpdatedAt: 0 });
    gistMocks.ensureSecretSocialGist.mockResolvedValue({ gistId: 'gs-secreto', etag: null, migrated: true, supersededGistIds: ['gs-publico'], keptPublicGistIds: [], copiedEntries: 3 });
    gistMocks.socialGistHasContent.mockResolvedValue(false);

    renderHub();

    await waitFor(() => expect(gistMocks.socialGistHasContent).toHaveBeenCalled());
    expect(gistMocks.deleteGist).not.toHaveBeenCalled();
  });

  // REGRESIÓN: la propia entrada del directorio se reconocía comparando su gist con el de la sesión. Al dejar de
  // publicarse ese id, la comparación pasó a ser siempre falsa y uno dejaba de reconocerse a sí mismo: su entrada
  // se trataba como la de un desconocido y su actividad desaparecía de su propio feed.
  it('reconoce mi propia entrada por identidad aunque el directorio ya no publique el gist', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 1,
    } as never);
    // Perfil propio COMPLETO (nombre en el gist + un juego completado), o el editor se bloquea y no se hidrata.
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 1,
      },
      etag: null,
    } as never);
    // El directorio ya NO trae `socialGistId` (es lo que hace la fase 1).
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'me', uid: 'me', displayName: 'Me', photoURL: '', socialGistId: '', gamesGistId: '', updatedAt: 10, tier: 'bronze' },
    ]);
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Me', private: false, visibility: {}, sharedLists: {} },
      activity: [
        {
          id: 'me:1:review', key: 'me:1:review', type: 'review', actorProfileId: 'me', actorName: 'Me',
          gameId: 1, gameName: 'Halo', rating: 5, grade: 100, recommendationText: '', snippet: 'Mío',
          createdAt: 10, updatedAt: 10,
        },
      ],
      posts: [], updatedAt: 10,
    });

    renderHub();

    // Si no se reconociera como propia, se quedaría index-only y su reseña no se leería nunca.
    await waitFor(() => expect(gistMocks.readPublicSocialGistById).toHaveBeenCalled());
    expect(gistMocks.readPublicSocialGistById.mock.calls.some((call: unknown[]) => call[0] === 'my-social')).toBe(true);
  });

  // DOS DISPOSITIVOS A LA VEZ. Sin esta comprobación, cada uno clonaría por su lado y recrearían la deriva que la
  // migración viene a eliminar. `privateConfig` es la fuente de verdad de la cuenta: si ya hay otro canal ahí, se
  // adopta en vez de clonar.
  it('si otro dispositivo ya migró, adopta su canal en vez de clonar otra vez', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'gs-viejo', etag: 'W/"v"', lastRemoteUpdatedAt: 9 });
    firebaseMocks.getPrivateConfig.mockResolvedValue({ socialGistId: 'gs-ya-migrado' });

    renderHub();

    await waitFor(() => expect(gistMocks.saveSocialSyncConfig).toHaveBeenCalledWith(
      expect.objectContaining({ gistId: 'gs-ya-migrado', etag: null }),
    ));
    // Y NO se clona: sería un gist huérfano más.
    expect(gistMocks.ensureSecretSocialGist).not.toHaveBeenCalled();
  });

  // Al iniciar sesión SIN configuración local (dispositivo nuevo, almacenamiento limpiado u otro origen), el canal
  // se buscaba en `profiles.social.gistId` — el campo que la migración de privacidad purga—. Devolvía vacío siempre,
  // y el auto-crear fabricaba un canal NUEVO Y VACÍO: historial real huérfano, editor de perfil pidiendo el alta y,
  // al abrir el hub, el saneado de amistades repuntando a los amigos a ese gist vacío. El efecto de recuperación del
  // montaje no cubre esto: corrió antes, sin sesión.
  it('al iniciar sesión sin config local, recupera el canal de privateConfig y NO crea uno vacío', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue(null); // al montar aún no hay sesión
    gistMocks.getSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'games', etag: null, lastRemoteUpdatedAt: 0 } as never);
    gistMocks.getSocialSyncConfig.mockReturnValue(null); // ningún canal en local
    firebaseMocks.signInWithGoogle.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: '' });
    firebaseMocks.getPrivateConfig.mockResolvedValue({ socialGistId: 'gs-mio-de-siempre' });
    // El perfil público ya está purgado: no publica ningún id.
    firebaseMocks.resolveOwnProfile.mockResolvedValue({
      id: 'uid-1', profileId: 'uid-1', email: '', displayName: 'Jaime', photoURL: '',
      socialGistId: '', gamesGistId: '', githubToken: '', socialEnabled: true, tier: 'bronze',
    });

    renderHub();

    const botonGoogle = await screen.findByText(SOCIAL_UI.gateway.signIn);
    fireEvent.click(botonGoogle);

    // Se adopta el canal que ya era suyo…
    await waitFor(() => expect(gistMocks.saveSocialSyncConfig).toHaveBeenCalledWith(
      expect.objectContaining({ gistId: 'gs-mio-de-siempre' }),
    ));
    // …y NO se crea ninguno: crear aquí deja su historial huérfano y a sus amigos sin su actividad.
    expect(gistMocks.createSocialGist).not.toHaveBeenCalled();
  });

  // Caso reportado: "sincronizado pero se va a la edición de perfil, y ahí mismo me dice que está sincronizado".
  // Sin juegos completados EN ESTE DISPOSITIVO (biblioteca no sincronizada aún, otro origen) el perfil se tomaba por
  // inexistente y se mandaba al usuario al editor, que acto seguido le confirmaba "Sincronizado". Con nombre en el
  // gist el perfil EXISTE: no se le mueve de social. Y no debe haber rebote social → editor → social.
  it('con perfil ya dado de alta pero sin biblioteca local, NO manda al editor', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    const conJuegos = {
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    };
    // Este dispositivo no tiene la biblioteca: ningún juego completado en local.
    void conJuegos;
    localMocks.loadLocalState.mockReturnValue({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });

    renderHub();

    // Nunca aparece el editor: ni al principio ni como rebote.
    await waitFor(() => expect(gistMocks.readSocialGist).toHaveBeenCalled());
    expect(screen.queryByText(SOCIAL_UI.profile.title)).not.toBeInTheDocument();
  });

  // Caso reportado: al entrar en social salta al editor de perfil estando bien configurado. La app tiene la
  // biblioteca VIVA en memoria (`games`), pero `loadLocalState()` es una foto del montaje y puede estar vacía o
  // atrasada (arranque con la sincronización en curso, hidratación desde el gist). La completitud del perfil se
  // calculaba con la foto, así que se veía sin completados y redirigía. `App` la calculaba con la lista viva para el
  // botón de Cuenta: las dos mitades de la misma regla discrepaban.
  it('con la biblioteca VIVA pero localStorage atrasado, NO manda al editor', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    // La foto de localStorage está ATRASADA: tiene biblioteca (un pendiente) pero aún no el juego completado.
    const pendienteViejo = { id: 7, name: 'Pendiente', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 0, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 };
    localMocks.loadLocalState.mockReturnValue({ c: [], v: [], e: [], p: [pendienteViejo], deleted: [], updatedAt: 0 });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });

    // …pero la app SÍ tiene el juego completado en memoria, que es lo que el usuario ve en su pantalla.
    const juegoVivo = { id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 };
    renderHub('/social', { c: [juegoVivo], v: [], e: [], p: [], deleted: [], updatedAt: 0 });

    await waitFor(() => expect(gistMocks.readSocialGist).toHaveBeenCalled());
    expect(screen.queryByText(SOCIAL_UI.profile.title)).not.toBeInTheDocument();
  });

  it('si el canal ya es secreto no toca ninguna referencia', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'gs-secreto', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    await waitFor(() => expect(gistMocks.ensureSecretSocialGist).toHaveBeenCalled());
    expect(firebaseMocks.setPrivateConfig).not.toHaveBeenCalled();
  });

  it('feed solo-amigos: muestra la actividad del amigo y NO lee el gist del no-amigo', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    // Perfil propio completo (nombre + 1 juego completado en local) → no redirige al editor.
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'friendUid', uid: 'friendUid', email: 'ada@x.com', displayName: 'Ada', photoURL: '', socialGistId: 'ada-social', gamesGistId: 'ada-games' },
      { id: 'strangerUid', uid: 'strangerUid', email: 'bob@x.com', displayName: 'Bob', photoURL: '', socialGistId: 'bob-social', gamesGistId: 'bob-games' },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({
      friends: [{ docId: 'friendUid__me', otherUid: 'friendUid', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 }],
      incoming: [], outgoing: [], byOtherUid: {},
    });
    gistMocks.readPublicSocialGistById.mockImplementation(async (gistId?: string) => {
      if (gistId === 'ada-social') {
        return {
          profile: { name: 'Ada', visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
          activity: [{ id: 'a1', key: 'k1', type: 'review', actorProfileId: 'friendUid', actorName: 'Ada', gameId: 9, gameName: 'CelesteGame', rating: 5, recommendationText: '', snippet: 'genial', createdAt: 1000, updatedAt: 2000 }],
          posts: [],
        };
      }
      return {
        profile: { name: 'Bob', visibility: {} },
        activity: [{ id: 'b1', key: 'k2', type: 'review', actorProfileId: 'strangerUid', actorName: 'Bob', gameId: 3, gameName: 'BobGame', rating: 3, recommendationText: '', snippet: 'meh', createdAt: 1, updatedAt: 5 }],
        posts: [],
      };
    });

    renderHub();

    // La actividad del AMIGO aparece en el feed.
    expect(await screen.findByText('CelesteGame')).toBeInTheDocument();
    // La del no-amigo NO aparece, y su gist NUNCA se leyó (ahorro de llamadas).
    expect(screen.queryByText('BobGame')).not.toBeInTheDocument();
    const readGistIds = gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0]);
    expect(readGistIds).toContain('ada-social');
    expect(readGistIds).not.toContain('bob-social');
  });

  it('feed: incluye a un amigo AUSENTE del directorio (>30 amigos / social desactivado) vía datos denormalizados', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    // Directorio VACÍO (el amigo no está en el top-30 / desactivó social), pero es amigo con datos denormalizados.
    firebaseMocks.listSocialDirectory.mockResolvedValue([]);
    firebaseMocks.getMyFriendships.mockResolvedValue({
      friends: [{ docId: 'ada__me', otherUid: 'ada', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 }],
      incoming: [], outgoing: [], byOtherUid: {},
    });
    gistMocks.readPublicSocialGistById.mockImplementation(async () => ({
      profile: { name: 'Ada', visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
      activity: [{ id: 'a1', key: 'k1', type: 'review', actorProfileId: 'ada', actorName: 'Ada', gameId: 9, gameName: 'CelesteGame', rating: 5, recommendationText: '', snippet: 'genial', createdAt: 1000, updatedAt: 2000 }],
      posts: [],
    }));

    renderHub('/social');

    // Aunque no está en el directorio, su actividad aparece y su gist (denormalizado) SÍ se lee.
    expect(await screen.findByText('CelesteGame')).toBeInTheDocument();
    const readGistIds = gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0]);
    expect(readGistIds).toContain('ada-social');
  });

  it('feed: amigo PRESENTE en el directorio con gistId obsoleto → usa el gist saneado de la amistad', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    // El directorio Firestore trae el gist OBSOLETO de Ada (no re-publicó su perfil); el doc de amistad trae el saneado.
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'ada', uid: 'ada', email: 'ada@x.com', displayName: 'Ada', photoURL: '', socialGistId: 'ada-social-OLD', gamesGistId: 'ada-games' },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({
      friends: [{ docId: 'ada__me', otherUid: 'ada', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social-NEW', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 }],
      incoming: [], outgoing: [], byOtherUid: {},
    });
    gistMocks.readPublicSocialGistById.mockImplementation(async (gistId?: string) => {
      if (gistId === 'ada-social-NEW') {
        return {
          profile: { name: 'Ada', visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
          activity: [{ id: 'a1', key: 'k1', type: 'review', actorProfileId: 'ada', actorName: 'Ada', gameId: 9, gameName: 'CelesteGame', rating: 5, recommendationText: '', snippet: 'genial', createdAt: 1000, updatedAt: 2000 }],
          posts: [],
        };
      }
      // El gist obsoleto está vacío (como el 64d4d0f… real).
      return { profile: { name: 'Ada', visibility: {} }, activity: [], posts: [] };
    });

    renderHub('/social');

    // Sus reseñas aparecen: el gist saneado de la amistad se lee siempre. El obsoleto del directorio también se
    // consulta ahora (fusión) porque la deriva puede ir en la dirección contraria; ver el test de deriva.
    expect(await screen.findByText('CelesteGame')).toBeInTheDocument();
    const readGistIds = gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0]);
    expect(readGistIds).toContain('ada-social-NEW');
  });

  it('feed: no cachea vacío si la amistad resuelve TARDE (carrera de arranque)', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'ada', uid: 'ada', email: 'ada@x.com', displayName: 'Ada', photoURL: '', socialGistId: 'ada-social', gamesGistId: 'ada-games' },
    ]);
    // La amistad resuelve DESPUÉS de un tick: reproduce el arranque donde el hydrate podría correr antes.
    const ada = { docId: 'ada__me', otherUid: 'ada', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 };
    firebaseMocks.getMyFriendships.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ friends: [ada], incoming: [], outgoing: [], byOtherUid: { ada } }), 30)),
    );
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Ada', visibility: {} },
      activity: [{ id: 'a1', key: 'k1', type: 'review', actorProfileId: 'ada', actorName: 'Ada', gameId: 9, gameName: 'CelesteGame', rating: 5, recommendationText: '', snippet: 'ok', createdAt: 1000, updatedAt: 2000 }],
      posts: [],
    });

    renderHub('/social');

    // El hydrate espera a que la amistad resuelva → la actividad del amigo aparece (no queda cacheado en blanco).
    expect(await screen.findByText('CelesteGame')).toBeInTheDocument();
  });

  it('feed robusto: un amigo con timestamp fuera de rango no rompe ni vacía el feed', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([]);
    const ada = { docId: 'ada__me', otherUid: 'ada', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 };
    const bob = { docId: 'bob__me', otherUid: 'bob', otherName: 'Bob', otherPhoto: '', otherSocialGistId: 'bob-social', otherGamesGistId: 'bob-games', state: 'friends', createdAt: 0, updatedAt: 2 };
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [ada, bob], incoming: [], outgoing: [], byOtherUid: { ada, bob } });
    gistMocks.readPublicSocialGistById.mockImplementation(async (gistId?: string) => {
      if (gistId === 'ada-social') {
        return { profile: { name: 'Ada', visibility: {} }, activity: [{ id: 'a1', key: 'k1', type: 'review', actorProfileId: 'ada', actorName: 'Ada', gameId: 9, gameName: 'CelesteGame', rating: 5, recommendationText: '', snippet: 'ok', createdAt: 1000, updatedAt: 2000 }], posts: [] };
      }
      // Bob: timestamp corrupto fuera del rango válido de Date (p. ej. nanosegundos).
      return { profile: { name: 'Bob', visibility: {} }, activity: [{ id: 'b1', key: 'k2', type: 'review', actorProfileId: 'bob', actorName: 'Bob', gameId: 3, gameName: 'BobGame', rating: 3, recommendationText: '', snippet: 'x', createdAt: 1e18, updatedAt: 1e18 }], posts: [] };
    });

    renderHub('/social');

    // El amigo con fecha válida se ve; el de fecha corrupta se descarta (sin dejar el feed en blanco).
    expect(await screen.findByText('CelesteGame')).toBeInTheDocument();
    expect(screen.queryByText('BobGame')).not.toBeInTheDocument();
  });

  it('dejar de ser amigos: pide confirmación y no borra hasta confirmar', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    gistMocks.readPublicSocialGistById.mockResolvedValue({ profile: { name: 'Ada', visibility: {} }, activity: [], posts: [] });
    firebaseMocks.listSocialDirectory.mockResolvedValue([]);
    const adaView = { docId: 'ada__me', otherUid: 'ada', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 };
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [adaView], incoming: [], outgoing: [], byOtherUid: { ada: adaView } });

    renderHub('/social/requests');

    // El amigo aparece en la lista de gestión.
    fireEvent.click(await screen.findByLabelText(SOCIAL_UI.friendship.removeAria('Ada')));

    // Se abre la confirmación y NO se borra todavía.
    expect(await screen.findByText(SOCIAL_UI.friendship.removeConfirmTitle('Ada'))).toBeInTheDocument();
    expect(firebaseMocks.deleteFriendship).not.toHaveBeenCalled();

    // Al confirmar, se borra con el docId canónico.
    fireEvent.click(screen.getByRole('button', { name: SOCIAL_UI.friendship.removeConfirmAction }));
    await waitFor(() => expect(firebaseMocks.deleteFriendship).toHaveBeenCalledWith({ myUid: 'me', docId: 'ada__me' }));
  });

  it('directorio: muestra a los NO-amigos (sin leer su gist) para poder enviarles petición', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    // Solo un extraño en el directorio; sin amigos.
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'strangerUid', uid: 'strangerUid', email: 'bob@x.com', displayName: 'Bob', photoURL: '', socialGistId: 'bob-social', gamesGistId: 'bob-games' },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });

    renderHub('/social/profiles');

    // El no-amigo aparece en el directorio (aunque no se lea su gist).
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    const readGistIds = gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0]);
    expect(readGistIds).not.toContain('bob-social');
  });

  it('la pestaña Reseñas fecha con la PUBLICACIÓN, no con el `_ts` del juego', async () => {
    // Unificación: el feed muestra la fecha de publicación y esta pantalla mostraba el `_ts` del juego, que una
    // importación de datos reescribe en bloque. Resultado: dos fechas distintas para la misma reseña.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    firebaseMocks.resolveStableProfileId.mockResolvedValue('me');
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    const TS_IMPORT = Date.parse('2026-07-26T09:00:00.000Z'); // `_ts` reescrito por una importación
    const PUBLICADA = Date.parse('2026-05-12T11:59:00.000Z'); // fecha real en el feed
    localMocks.loadLocalState.mockReturnValue({
      c: [{
        id: 9, name: 'Celeste', _ts: TS_IMPORT, platforms: [], genres: [], steamDeck: false,
        review: 'Una maravilla', score: 5, years: [], strengths: [], weaknesses: [], reasons: [],
        replayable: false, retry: false, hours: 0,
      }],
      v: [], e: [], p: [], deleted: [], updatedAt: TS_IMPORT,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'me', uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: '', socialGistId: 'my-social', gamesGistId: 'my-games', updatedAt: Date.now() },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Me', visibility: { showPhoto: true } },
      activity: [{
        id: 'me:9:review', key: 'me:9:review', type: 'review', actorProfileId: 'me', actorName: 'Me',
        gameId: 9, gameName: 'Celeste', rating: 5, recommendationText: '', snippet: 'Una maravilla',
        createdAt: PUBLICADA, updatedAt: PUBLICADA,
      }],
      posts: [],
      updatedAt: PUBLICADA,
    });

    renderHub('/social/profiles/me/reviews');

    // La tarjeta de la reseña se fecha con la publicación (12 de mayo), no con el `_ts` del import (26 de julio).
    expect(await screen.findByText(/12 de mayo de 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/26 de julio de 2026/)).not.toBeInTheDocument();
  });

  it('la pestaña Reseñas fecha con la publicación también más allá de las 40 actividades', async () => {
    // Regresión: la hidratación del directorio recortaba la actividad a 40 por perfil (bastaba para el feed).
    // Las reseñas por debajo de ese corte se quedaban sin fecha publicada y caían al `_ts` del juego, así que el
    // listado mostraba fechas distintas del feed justo en el histórico.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    firebaseMocks.resolveStableProfileId.mockResolvedValue('me');
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    const TS_IMPORT = Date.parse('2026-07-26T09:00:00.000Z');
    const TOTAL = 45;
    // 45 juegos con reseña, todos con el `_ts` reescrito por la importación…
    const games = Array.from({ length: TOTAL }, (_, i) => ({
      id: i + 1, name: `Juego ${i + 1}`, _ts: TS_IMPORT, platforms: [], genres: [], steamDeck: false,
      review: `Reseña ${i + 1}`, score: 4, years: [], strengths: [], weaknesses: [], reasons: [],
      replayable: false, retry: false, hours: 0,
    }));
    localMocks.loadLocalState.mockReturnValue({ c: games, v: [], e: [], p: [], deleted: [], updatedAt: TS_IMPORT });
    // …y publicadas en mayo, escalonadas: las últimas quedaban fuera del corte de 40.
    const activity = games.map((game, i) => ({
      id: `me:${game.id}:review`, key: `me:${game.id}:review`, type: 'review', actorProfileId: 'me', actorName: 'Me',
      gameId: game.id, gameName: game.name, rating: 4, recommendationText: '', snippet: `Reseña ${i + 1}`,
      createdAt: Date.parse('2026-05-12T11:59:00.000Z') - i * 1000,
      updatedAt: Date.parse('2026-05-12T11:59:00.000Z') - i * 1000,
    }));
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'me', uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: '', socialGistId: 'my-social', gamesGistId: 'my-games', updatedAt: Date.now() },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Me', favoriteGames: [], visibility: { showPhoto: true } },
      activity,
      posts: [],
      updatedAt: Date.parse('2026-05-12T11:59:00.000Z'),
    });

    renderHub('/social/profiles/me/reviews');

    // Todas las tarjetas visibles llevan su fecha publicada (mayo)…
    expect((await screen.findAllByText(/12 de mayo de 2026/)).length).toBeGreaterThan(1);
    // …y NINGUNA cae al `_ts` del import, ni siquiera las que quedaban por debajo del corte de 40.
    expect(screen.queryByText(/26 de julio de 2026/)).not.toBeInTheDocument();
  });

  it('corte por inactividad: la actividad de un amigo inactivo no entra al feed y no se lee su gist', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    const DIA = 24 * 60 * 60 * 1000;
    // Ada usó la app ayer; Zoe hace 200 días. Ambas son amigas.
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'ada', uid: 'ada', email: 'ada@x.com', displayName: 'Ada', photoURL: '', socialGistId: 'ada-social', gamesGistId: 'ada-games', updatedAt: Date.now() - DIA },
      { id: 'zoe', uid: 'zoe', email: 'zoe@x.com', displayName: 'Zoe', photoURL: '', socialGistId: 'zoe-social', gamesGistId: 'zoe-games', updatedAt: Date.now() - 200 * DIA },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({
      friends: [
        { docId: 'ada__me', otherUid: 'ada', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 },
        { docId: 'me__zoe', otherUid: 'zoe', otherName: 'Zoe', otherPhoto: '', otherSocialGistId: 'zoe-social', otherGamesGistId: 'zoe-games', state: 'friends', createdAt: 0, updatedAt: 1 },
      ],
      incoming: [], outgoing: [], byOtherUid: {},
    });
    gistMocks.readPublicSocialGistById.mockImplementation(async (gistId?: string) => {
      const owner = gistId === 'ada-social' ? { name: 'Ada', game: 'CelesteGame', actor: 'ada' } : { name: 'Zoe', game: 'ZoeGame', actor: 'zoe' };
      return {
        profile: { name: owner.name, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
        activity: [{ id: `${owner.actor}1`, key: `k-${owner.actor}`, type: 'review', actorProfileId: owner.actor, actorName: owner.name, gameId: 9, gameName: owner.game, rating: 5, recommendationText: '', snippet: 'genial', createdAt: 1000, updatedAt: 2000 }],
        posts: [],
        updatedAt: 2000,
      };
    });

    renderHub();

    // La amiga activa sí aparece; la inactiva no, y su gist nunca se leyó (ahorro de llamadas).
    expect(await screen.findByText('CelesteGame')).toBeInTheDocument();
    expect(screen.queryByText('ZoeGame')).not.toBeInTheDocument();
    const readGistIds = gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0]);
    expect(readGistIds).toContain('ada-social');
    expect(readGistIds).not.toContain('zoe-social');
  });

  it('corte por inactividad: al abrir el perfil del amigo inactivo sí se lee su gist social', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'zoe', uid: 'zoe', email: 'zoe@x.com', displayName: 'Zoe', photoURL: '', socialGistId: 'zoe-social', gamesGistId: 'zoe-games', updatedAt: Date.now() - 200 * 24 * 60 * 60 * 1000 },
    ]);
    const zoeView = { docId: 'me__zoe', otherUid: 'zoe', otherName: 'Zoe', otherPhoto: '', otherSocialGistId: 'zoe-social', otherGamesGistId: 'zoe-games', state: 'friends', createdAt: 0, updatedAt: 1 };
    firebaseMocks.getMyFriendships.mockResolvedValue({
      // `byOtherUid` es lo que mira la pantalla de perfil para saber que es amiga (y mostrar su hero completo).
      friends: [zoeView], incoming: [], outgoing: [], byOtherUid: { zoe: zoeView },
    });
    // El nick del gist difiere del del directorio: así se distingue el hero YA hidratado del index-only.
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Zoe (nick del gist)', visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
      activity: [], posts: [], updatedAt: 10,
    });

    renderHub('/social/profiles/zoe');

    // Su hero no se queda a medias: nombre/visibilidad/foto salen de su gist social, leído bajo demanda al abrir el perfil.
    expect(await screen.findByText('Zoe (nick del gist)')).toBeInTheDocument();
    expect(gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0])).toContain('zoe-social');
  });

  it('deriva de gist: la actividad del amigo aparece aunque esté en el gist del directorio y no en el de la amistad', async () => {
    // El lector prefiere el gist denormalizado en el doc de amistad, pero la deriva va en las dos direcciones
    // (publicar una reseña sanea el directorio y no la amistad). Si el preferido es el que quedó obsoleto, antes
    // el amigo salía sin actividad; ahora se leen los dos candidatos y se fusionan.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    // Directorio: gist ACTUAL de Ada (con su reseña). Amistad: el gist VIEJO y vacío (el preferido).
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'friendUid', uid: 'friendUid', email: 'ada@x.com', displayName: 'Ada', photoURL: '', socialGistId: 'ada-social-actual', gamesGistId: 'ada-games' },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({
      friends: [{ docId: 'friendUid__me', otherUid: 'friendUid', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social-viejo', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 }],
      incoming: [], outgoing: [], byOtherUid: {},
    });
    gistMocks.readPublicSocialGistById.mockImplementation(async (gistId?: string) => {
      if (gistId === 'ada-social-actual') {
        return {
          profile: { name: 'Ada', visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
          activity: [{ id: 'a1', key: 'k1', type: 'review', actorProfileId: 'friendUid', actorName: 'Ada', gameId: 9, gameName: 'CelesteGame', rating: 5, recommendationText: '', snippet: 'genial', createdAt: 1000, updatedAt: 2000 }],
          posts: [],
          updatedAt: 2000,
        };
      }
      return { profile: { name: 'Ada', visibility: {} }, activity: [], posts: [], updatedAt: 1 };
    });

    renderHub();

    expect(await screen.findByText('CelesteGame')).toBeInTheDocument();
    // Se consultaron AMBOS candidatos (la lectura extra solo ocurre porque divergen).
    const readGistIds = gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0]);
    expect(readGistIds).toContain('ada-social-viejo');
    expect(readGistIds).toContain('ada-social-actual');
  });

  it('abrir el detalle de una reseña PROPIA cuyo juego no está en los listados NO la despublica', async () => {
    // Regresión: el hub despublicaba la reseña por "huérfana" comparándola con una foto de localStorage tomada
    // al montar. Con listados desfasados (reseña escrita en otro dispositivo, sync de juegos aún en camino)
    // borraba actividad válida del feed de todos, de forma permanente.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    // Listados NO vacíos (pasaban la salvaguarda antigua) pero sin el juego 99 de la reseña.
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    const ownReview = {
      id: 'me:99:review', key: 'me:99:review', type: 'review', actorProfileId: 'me', actorName: 'Me',
      gameId: 99, gameName: 'Elden Ring', rating: 5, grade: 100, recommendationText: '', snippet: 'Enorme',
      createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_000,
    };
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [ownReview], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    // El directorio incluye MI entrada, y mi gist social publica esa reseña.
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'me', uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: '', socialGistId: 'my-social', gamesGistId: 'my-games' },
    ]);
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Me', visibility: { showPhoto: true } },
      activity: [ownReview],
      posts: [],
    });
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });

    renderHub('/social/user/me/game/99/review');

    // Se pinta el detalle de la reseña…
    expect(await screen.findByText('Elden Ring')).toBeInTheDocument();
    // …y no se reescribe el gist social para retirarla.
    await waitFor(() => expect(gistMocks.readPublicSocialGistById).toHaveBeenCalled());
    expect(gistMocks.writeSocialGist).not.toHaveBeenCalled();
  });

  it('mi perfil → reseñas → abrir una: se ofrece compartirla', async () => {
    // Regresión de producto: el botón de compartir solo estaba en el detalle del feed y en el panel de
    // estadísticas. Este es el camino natural para quien quiere publicar SU reseña, y aquí no había nada, así que
    // parecía que la funcionalidad no existía para su cuenta.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    // La reseña vive en los listados locales: de ahí saca el hub las listas del perfil PROPIO.
    localMocks.loadLocalState.mockReturnValue({
      c: [{
        id: 99, name: 'Elden Ring', _ts: 1, platforms: [], genres: [], steamDeck: false,
        review: 'Enorme de principio a fin', score: 5, years: [], strengths: [], weaknesses: [], reasons: [],
        replayable: false, retry: false, hours: 0,
      }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'me', uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: '', socialGistId: 'my-social', gamesGistId: 'my-games' },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });

    renderHub('/social/profiles/me/game/99/review');

    expect(await screen.findByText('Enorme de principio a fin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SHARE_UI.actionAria })).toBeInTheDocument();
  });

  it('la reseña de otra persona no ofrece compartir', async () => {
    // Solo lo propio se puede publicar. El gating es la identidad del perfil abierto, no el rango ni la amistad.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{
        id: 99, name: 'Elden Ring', _ts: 1, platforms: [], genres: [], steamDeck: false,
        review: 'Enorme de principio a fin', score: 5, years: [], strengths: [], weaknesses: [], reasons: [],
        replayable: false, retry: false, hours: 0,
      }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
    const ada = { id: 'ada', uid: 'ada', email: 'ada@x.com', displayName: 'Ada', photoURL: '', socialGistId: 'ada-social', gamesGistId: 'ada-games' };
    firebaseMocks.listSocialDirectory.mockResolvedValue([ada]);
    const adaView = { docId: 'ada__me', otherUid: 'ada', otherName: 'Ada', otherPhoto: '', otherSocialGistId: 'ada-social', otherGamesGistId: 'ada-games', state: 'friends', createdAt: 0, updatedAt: 1 };
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [adaView], incoming: [], outgoing: [], byOtherUid: { ada: adaView } });
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Ada', visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
      activity: [{ id: 'ada1', key: 'k-ada', type: 'review', actorProfileId: 'ada', actorName: 'Ada', gameId: 99, gameName: 'Elden Ring', rating: 5, recommendationText: '', snippet: 'genial', createdAt: 1000, updatedAt: 2000 }],
      posts: [],
      updatedAt: 2000,
    });

    renderHub('/social/profiles/ada/game/99/review');

    // La pantalla se pinta (aunque sea index-only: sin su lista de juegos no hay texto completo)…
    expect(await screen.findByText(SOCIAL_UI.feed.reviewDetailTitle)).toBeInTheDocument();
    // …y no se ofrece publicar lo que no es suyo.
    expect(screen.queryByRole('button', { name: SHARE_UI.actionAria })).not.toBeInTheDocument();
  });
});

describe('SocialHub — alta de perfil: exige juegos completados', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    firebaseMocks.listSocialDirectory.mockResolvedValue([]);
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
        activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
  });

  const completed = (id: number, name: string) => ({
    id, name, _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5,
    years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0,
  });

  // La biblioteca SÍ está en este dispositivo (hay un pendiente), pero ningún completado: ahí la regla de alta se
  // aplica como siempre. El caso de biblioteca ausente es distinto y se cubre aparte: entonces no se puede afirmar
  // que no haya completados, y mandar al editor a alguien ya dado de alta era el rebote que se reportó.
  it('sin ningún juego completado: fuerza el editor, avisa y deja "Guardar perfil" deshabilitado', async () => {
    localMocks.loadLocalState.mockReturnValue({
      c: [], v: [], e: [], p: [completed(9, 'Pendiente')], deleted: [], updatedAt: 0,
    });

    renderHub('/social');

    // Aunque el gist ya trae nombre, el perfil NO está completo → se redirige al editor con el motivo a la vista.
    expect(await screen.findByText(SOCIAL_UI.profile.needsCompletedGames)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SOCIAL_UI.profile.save })).toBeDisabled();
  });

  it('con un juego completado: deja guardar y el gist publicado no lleva favoritos', async () => {
    localMocks.loadLocalState.mockReturnValue({
      c: [completed(1, 'Halo')], v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });

    renderHub('/social/profile');

    const save = await screen.findByRole('button', { name: SOCIAL_UI.profile.save });
    await waitFor(() => expect(save).toBeEnabled());
    expect(screen.queryByText(SOCIAL_UI.profile.needsCompletedGames)).not.toBeInTheDocument();

    fireEvent.click(save);

    await waitFor(() => expect(gistMocks.writeSocialGist).toHaveBeenCalled());
    const [, , payload] = gistMocks.writeSocialGist.mock.calls[0] as unknown as
      [string, string, { profile: Record<string, unknown> }];
    expect(payload.profile.name).toBe('Me');
    expect(payload.profile).not.toHaveProperty('favoriteGames');
  });
});

// P3 — el mensaje de estado se borraba con un temporizador por aviso y sin cancelar el anterior, así que dos
// avisos seguidos se pisaban: el plazo del PRIMERO borraba el texto del SEGUNDO. Con un temporizador único
// reutilizado, cada aviso dura lo suyo.
describe('SocialHub — el aviso de estado no lo borra el temporizador del aviso anterior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.getPublicConfig.mockResolvedValue({ consent: { version: LEGAL_VERSION, agreedAt: 1 } });
    firebaseMocks.getPrivateConfig.mockResolvedValue(null);
    firebaseMocks.getMyFriendships.mockResolvedValue({ friends: [], incoming: [], outgoing: [], byOtherUid: {} });
    firebaseMocks.resolveOwnProfile.mockResolvedValue(null);
    gistMocks.ensureSecretSocialGist.mockImplementation(async (_t?: string, gistId?: string) => ({
      gistId: gistId || '', etag: null, migrated: false, supersededGistIds: [], keptPublicGistIds: [], copiedEntries: 0,
    }));
  });

  it('un segundo aviso sobrevive al plazo del primero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
      gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
      localMocks.loadLocalState.mockReturnValue({
        c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
        v: [], e: [], p: [], deleted: [], updatedAt: 0,
      });
      gistMocks.readSocialGist.mockResolvedValue({
        data: {
          profile: { name: 'Me', private: false, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
          recommendations: [], activity: [], posts: [], updatedAt: 0,
        },
        etag: null,
      });
      // Dos desconocidos a los que enviar petición: cada envío produce su propio aviso "ok".
      firebaseMocks.listSocialDirectory.mockResolvedValue([
        { id: 'ada', uid: 'ada', displayName: 'Ada', photoURL: '', socialGistId: '', gamesGistId: '' },
        { id: 'bob', uid: 'bob', displayName: 'Bob', photoURL: '', socialGistId: '', gamesGistId: '' },
      ]);
      firebaseMocks.sendFriendRequest.mockResolvedValue(undefined);

      renderHub('/social/profiles');

      const primero = await screen.findByRole('button', { name: SOCIAL_UI.friendship.addAria('Ada') });
      fireEvent.click(primero);
      expect(await screen.findByText(SOCIAL_UI.status.friendRequestSent)).toBeInTheDocument();

      // A 2,5 s el primer aviso sigue vivo; su plazo (3 s) vence dentro de poco.
      await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });

      const segundo = await screen.findByRole('button', { name: SOCIAL_UI.friendship.addAria('Bob') });
      fireEvent.click(segundo);
      await screen.findByText(SOCIAL_UI.status.friendRequestSent);

      // Se cruza el instante en que vencía el plazo del PRIMER aviso (2,5 s + 1 s = 3,5 s desde el primero).
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(screen.queryByText(SOCIAL_UI.status.friendRequestSent)).toBeInTheDocument();

      // Y el segundo sí se borra cuando vence EL SUYO.
      await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
      await waitFor(() => expect(screen.queryByText(SOCIAL_UI.status.friendRequestSent)).not.toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });
});

// RECIPROCIDAD DE LA FOTO (core/social/photoVisibility): quien esconde la suya no ve la de nadie, y la de los demás
// solo se ve con amistad aceptada. Mithril queda exento. Estos tests comprueban que la política llega hasta el DOM;
// la política en sí se prueba a fondo en tests/unit/photoVisibility.test.ts.
describe('SocialHub — reciprocidad de la foto', () => {
  const ADA_FOTO = 'https://f/ada.png';
  const BOB_FOTO = 'https://f/bob.png';

  beforeEach(() => {
    vi.clearAllMocks();
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    gistMocks.socialGistHasContent.mockResolvedValue(true);
    gistMocks.deleteGist.mockResolvedValue(true);
    gistMocks.ensureSecretSocialGist.mockImplementation(async (_t?: string, gistId?: string) => ({
      gistId: gistId || '', etag: null, migrated: false, supersededGistIds: [], keptPublicGistIds: [], copiedEntries: 0,
    }));
    // Con foto en la cuenta: el caso de quien de verdad muestra la suya. Sin ella, la reciprocidad se aplicaría
    // igual que a quien la esconde (hay un test para eso), y todos los escenarios de este bloque cambiarían.
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: 'https://f/me.png' });
    firebaseMocks.getPrivateConfig.mockResolvedValue(null);
    firebaseMocks.setPrivateConfig.mockResolvedValue(undefined);
    firebaseMocks.getPublicConfig.mockResolvedValue({ consent: { version: LEGAL_VERSION, agreedAt: 1 } });
    firebaseMocks.resolveOwnProfile.mockResolvedValue(null);
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    // Ada es amiga y publica su foto; Bob está en el directorio pero no es amigo.
    firebaseMocks.listSocialDirectory.mockResolvedValue([
      { id: 'friendUid', uid: 'friendUid', email: 'ada@x.com', displayName: 'Ada', photoURL: ADA_FOTO, socialGistId: 'ada-social', gamesGistId: '' },
      { id: 'strangerUid', uid: 'strangerUid', email: 'bob@x.com', displayName: 'Bob', photoURL: BOB_FOTO, socialGistId: 'bob-social', gamesGistId: '' },
    ]);
    firebaseMocks.getMyFriendships.mockResolvedValue({
      friends: [{ docId: 'friendUid__me', otherUid: 'friendUid', otherName: 'Ada', otherPhoto: ADA_FOTO, otherSocialGistId: 'ada-social', otherGamesGistId: '', state: 'friends', createdAt: 0, updatedAt: 1 }],
      incoming: [], outgoing: [], byOtherUid: {},
    });
    gistMocks.readPublicSocialGistById.mockResolvedValue({
      profile: { name: 'Ada', photoURL: ADA_FOTO, visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
      activity: [], posts: [],
    });
  });

  /** Perfil propio: `showPhoto` es lo que decide si ve las fotos ajenas. */
  function ownProfile(showPhoto: boolean) {
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: {
          name: 'Me', private: false,
          visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto },
          sharedLists: {},
        },
        recommendations: [], activity: [], posts: [], updatedAt: 0,
      },
      etag: null,
    });
  }

  /** URLs de las fotos que de verdad se están pintando. */
  function fotosPintadas(): string[] {
    return [...document.querySelectorAll('img.hub-avatar-img')].map((img) => img.getAttribute('src') || '');
  }

  it('mostrando la propia: se ve la foto de la amiga y NO la del desconocido', async () => {
    ownProfile(true);
    renderHub('/social/profiles');

    await screen.findByText('Ada');
    await screen.findByText('Bob');

    await waitFor(() => expect(fotosPintadas()).toContain(ADA_FOTO));
    // Bob sale en el directorio (se puede buscar y agregar), pero con su inicial en vez de su cara.
    expect(fotosPintadas()).not.toContain(BOB_FOTO);
  });

  it('escondiendo la propia: no se ve ninguna, ni la de la amiga', async () => {
    ownProfile(false);
    renderHub('/social/profiles');

    await screen.findByText('Ada');
    await screen.findByText('Bob');

    // Se espera a que el directorio esté hidratado del todo antes de afirmar la ausencia.
    await waitFor(() => expect(gistMocks.readPublicSocialGistById).toHaveBeenCalled());
    await waitFor(() => {
      expect(fotosPintadas()).not.toContain(ADA_FOTO);
      expect(fotosPintadas()).not.toContain(BOB_FOTO);
    });
  });

  // El interruptor dice que sí, pero la cuenta de Google no tiene foto: no publica ninguna, así que la reciprocidad
  // le aplica igual que a quien la esconde a propósito. `photoURL: null` es lo que devuelve Google en ese caso.
  it('con el interruptor activado pero SIN foto en Google no ve las de los demás', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    ownProfile(true);
    renderHub('/social/profiles');

    await screen.findByText('Ada');
    await waitFor(() => expect(gistMocks.readPublicSocialGistById).toHaveBeenCalled());
    await waitFor(() => {
      expect(fotosPintadas()).not.toContain(ADA_FOTO);
      expect(fotosPintadas()).not.toContain(BOB_FOTO);
    });
  });

  // El ajuste guardado tiene que describir la realidad: un perfil que dice "muestro mi foto" y no tiene ninguna
  // miente. Se apaga el estado en cuanto se sabe, así que el siguiente guardado del perfil lo deja coherente en el
  // gist —sin forzar ninguna escritura extra al abrir— y, si más adelante añade una foto, activarlo vuelve a ser
  // decisión suya.
  it('sin foto en la cuenta, el ajuste guardado pasa a false al guardar el perfil', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    ownProfile(true); // el perfil que ya existe llega con `showPhoto: true`
    renderHub('/social/profile');

    // Se espera a que la hidratación acabe (es la que trae el `showPhoto: true` del gist): antes de eso el editor
    // no ha leído nada todavía, el botón sigue deshabilitado y el clic no guardaría nada.
    const save = await screen.findByRole('button', { name: SOCIAL_UI.profile.save });
    await waitFor(() => expect(save).toBeEnabled());

    // El interruptor del ajuste, apagado y bloqueado.
    const toggle = screen.getByLabelText(SOCIAL_UI.profile.showPhotoField) as HTMLInputElement;
    await waitFor(() => expect(toggle.checked).toBe(false));
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText(SOCIAL_UI.profile.photoMissingInGoogle)).toBeInTheDocument();

    // Y lo que se escribe en el gist al guardar ya va apagado.
    fireEvent.click(save);
    await waitFor(() => expect(gistMocks.writeSocialGist).toHaveBeenCalled());
    const ultimaEscritura = gistMocks.writeSocialGist.mock.calls.at(-1) as unknown as [unknown, unknown, { profile: { visibility: { showPhoto: boolean }; photoURL?: string } }];
    const payload = ultimaEscritura[2];
    expect(payload.profile.visibility.showPhoto).toBe(false);
    // Y no se publica ninguna foto, claro.
    expect(payload.profile.photoURL).toBeUndefined();
  });

  it('mithril está exento: ve las dos aunque esconda la suya', async () => {
    ownProfile(false);
    firebaseMocks.resolveOwnProfile.mockResolvedValue({
      id: 'me', profileId: 'p-me', displayName: 'Me', email: '', photoURL: '',
      socialGistId: 'my-social', gamesGistId: '', tier: 'mithril', socialEnabled: true, schemaVersion: 1, githubToken: '',
    });
    renderHub('/social/profiles');

    await screen.findByText('Ada');
    await screen.findByText('Bob');

    await waitFor(() => expect(fotosPintadas()).toContain(ADA_FOTO));
    await waitFor(() => expect(fotosPintadas()).toContain(BOB_FOTO));
  });

  /**
   * SIN CONEXIÓN. Antes, un fallo de red al hidratar el directorio salía tal cual en el pie de la pantalla
   * (`network offline`, «Failed to fetch»), en inglés y sin decir nada útil. Ahora se cuenta como falta de
   * conexión: aviso persistente con el titular del tema, mensaje de estado propio y —esto importa— nivel `warn`,
   * que NO enciende el bloqueo del espacio social (`err` lo hacía, así que quedarse sin red además lo cerraba).
   *
   * `navigator.onLine` se deja en `true` a propósito: es el caso del wifi conectado sin salida a internet, donde
   * el navegador dice que hay red. Si el aviso dependiera solo de esa señal, aquí no aparecería.
   */
  it('un fallo de red al hidratar el directorio se cuenta como falta de conexión, no en crudo', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    ownProfile(false);
    const fallo = Object.assign(new Error('network offline'), { deferred: true });
    firebaseMocks.listSocialDirectory.mockRejectedValue(fallo);

    renderHub('/social');

    // El aviso persistente, con el titular del tema por defecto.
    const aviso = await screen.findByLabelText(SOCIAL_UI.offline.sectionAria);
    expect(aviso.textContent).toContain(SOCIAL_UI.offline.leadByPalette.steam);
    // Y el mensaje de estado es el de la aplicación, no el del error.
    expect(await screen.findByText(SOCIAL_UI.status.offline)).toBeInTheDocument();
    expect(screen.queryByText('network offline')).not.toBeInTheDocument();
  });
});
