import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock de los repos que consume useSocialViewModel: aísla la UI de red/Firebase/IndexedDB.
// Valida que tras M3 (extracción del viewmodel) SocialHub sigue renderizando ambas ramas sin romper.

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(),
  ensureProfileByEmail: vi.fn(async () => {}),
  resolveOwnProfile: vi.fn(async () => null),
  // L4 — puerta de aceptación. El valor por defecto (consentimiento vigente) se fija en `beforeEach`, donde ya
  // se puede importar `LEGAL_VERSION`; los tests de la puerta lo sobrescriben con `null`.
  getPublicConfig: vi.fn(async (): Promise<any> => null),
  setPublicConfig: vi.fn(async () => {}),
  // Fase 0: el gist social propio se recupera de `privateConfig` (owner-only) antes que del perfil público.
  getPrivateConfig: vi.fn(async (): Promise<any> => null),
  setPrivateConfig: vi.fn(async () => {}),
  listSocialDirectory: vi.fn(async (): Promise<any[]> => []),
  signInWithGoogle: vi.fn(async () => null),
  signOutSocialUser: vi.fn(async () => {}),
  resolveStableProfileId: vi.fn(async (uid: string) => uid), // P1: detección de propiedad por identidad
  updateProfilePhoto: vi.fn(async () => {}),
  // Amistad
  getMyFriendships: vi.fn(async (): Promise<any> => ({ friends: [], incoming: [], outgoing: [], byOtherUid: {} })),
  acceptFriendRequest: vi.fn(async () => {}),
  deleteFriendship: vi.fn(async () => {}),
  sendFriendRequest: vi.fn(async () => {}),
  readFriendship: vi.fn(async (): Promise<any> => null),
  healOwnFriendshipIdentity: vi.fn(async () => {}),
  healOwnDirectoryGist: vi.fn(async () => ({ healed: false, adoptGistId: '' })),
  invalidateMyFriendshipsCache: vi.fn(),
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
  writeSocialGist: vi.fn(async () => ({ etag: null })),
  saveSocialSyncConfig: vi.fn(),
  updateGistPrivacy: vi.fn(async () => ({ gistId: 'g', etag: null })),
  buildReviewSnippet: (review: string) => (review || '').slice(0, 160),
}));

// Se parte del módulo REAL y solo se sustituye lo que toca red/config: así las funciones puras del gist
// (remapSocialActorIds, upsertReviewActivity, removeReviewActivity…) se ejercitan de verdad y un flujo que
// escribiera el gist indebidamente llegaría hasta `writeSocialGist` (mockeado) y sería detectable.
vi.mock('../../src/model/repository/gistRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/model/repository/gistRepository')>()),
  ...gistMocks,
}));

const localMocks = vi.hoisted(() => ({
  loadLocalState: vi.fn((): any => ({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 })),
}));

vi.mock('../../src/model/repository/localRepository', () => localMocks);

import { SocialHub } from '../../src/view/components/SocialHub';
import { SOCIAL_UI } from '../../src/core/constants/labels';
import { LEGAL_CONSENT_UI, LEGAL_VERSION } from '../../src/core/constants/legal';

function renderHub(initialPath = '/social') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SocialHub />
    </MemoryRouter>,
  );
}

describe('SocialHub (componente, post-M3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gistMocks.getSocialSyncConfig.mockReturnValue(null);
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

  it('auto-heal directorio: al abrir social sincroniza mi profiles.social.gistId con el gist actual de mi sesión', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'uid-1', email: 'jaime@example.com', displayName: 'Jaime', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'social-gist', etag: null, lastRemoteUpdatedAt: 0 });

    renderHub();

    // El heal se dispara una vez con mi uid y el gist ACTUAL (no hay que re-publicar el perfil a mano).
    await waitFor(() => expect(firebaseMocks.healOwnDirectoryGist).toHaveBeenCalled());
    expect(firebaseMocks.healOwnDirectoryGist.mock.calls[0].slice(0, 2)).toEqual(['uid-1', 'social-gist']);
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

  it('sin ningún juego completado: fuerza el editor, avisa y deja "Guardar perfil" deshabilitado', async () => {
    localMocks.loadLocalState.mockReturnValue({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 });

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
