import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock de los repos que consume useSocialViewModel: aísla la UI de red/Firebase/IndexedDB.
// Valida que tras M3 (extracción del viewmodel) SocialHub sigue renderizando ambas ramas sin romper.

const firebaseMocks = vi.hoisted(() => ({
  getCurrentSocialAuthUser: vi.fn(),
  ensureProfileByEmail: vi.fn(async () => {}),
  findSocialProfileByEmail: vi.fn(async () => null),
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
      profile: { name: '', private: false, favoriteGames: [], recommendations: [], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false }, sharedLists: {} },
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

vi.mock('../../src/model/repository/gistRepository', () => gistMocks);

const localMocks = vi.hoisted(() => ({
  loadLocalState: vi.fn((): any => ({ c: [], v: [], e: [], p: [], deleted: [], updatedAt: 0 })),
}));

vi.mock('../../src/model/repository/localRepository', () => localMocks);

import { SocialHub } from '../../src/view/components/SocialHub';

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

  it('feed solo-amigos: muestra la actividad del amigo y NO lee el gist del no-amigo', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    // Perfil propio completo (nombre + 1 favorito presente en local) → no redirige al editor.
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, favoriteGames: [{ id: 1, name: 'Halo' }], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
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
          profile: { name: 'Ada', favoriteGames: [{ id: 9, name: 'Celeste' }], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true } },
          activity: [{ id: 'a1', key: 'k1', type: 'review', actorProfileId: 'friendUid', actorName: 'Ada', gameId: 9, gameName: 'CelesteGame', rating: 5, recommendationText: '', snippet: 'genial', createdAt: 1000, updatedAt: 2000 }],
          posts: [],
        };
      }
      return {
        profile: { name: 'Bob', favoriteGames: [], visibility: {} },
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

  it('directorio: muestra a los NO-amigos (favoritos vacíos) para poder enviarles petición', async () => {
    firebaseMocks.getCurrentSocialAuthUser.mockResolvedValue({ uid: 'me', email: 'me@x.com', displayName: 'Me', photoURL: null });
    gistMocks.getSocialSyncConfig.mockReturnValue({ token: 'ghp_x', gistId: 'my-social', etag: null, lastRemoteUpdatedAt: 0 });
    localMocks.loadLocalState.mockReturnValue({
      c: [{ id: 1, name: 'Halo', _ts: 1, platforms: [], genres: [], steamDeck: false, review: '', score: 5, years: [], strengths: [], weaknesses: [], reasons: [], replayable: false, retry: false, hours: 0 }],
      v: [], e: [], p: [], deleted: [], updatedAt: 0,
    });
    gistMocks.readSocialGist.mockResolvedValue({
      data: {
        profile: { name: 'Me', private: false, favoriteGames: [{ id: 1, name: 'Halo' }], visibility: { hiddenTabs: [], hideReplayable: false, hideRetry: false, hideGameTime: false, showPhoto: true }, sharedLists: {} },
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

    // El no-amigo aparece en el directorio (aunque no tenga favoritos y no se lea su gist).
    expect(await screen.findByText('Bob')).toBeInTheDocument();
    const readGistIds = gistMocks.readPublicSocialGistById.mock.calls.map((call) => call[0]);
    expect(readGistIds).not.toContain('bob-social');
  });
});
