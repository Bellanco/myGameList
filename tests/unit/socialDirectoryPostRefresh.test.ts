import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Publicar un post refresca el feed al momento para que salga, pero los perfiles de tus amigos no han cambiado:
// forzarlos costaba una lectura de Firestore por amigo en cada post. El botón «Actualizar» sí los sigue forzando.

const getSocialProfilesByUid = vi.hoisted(() => vi.fn(async (_uids: string[], _options: { forceRefresh?: boolean }) => [] as unknown[]));

vi.mock('../../src/model/repository/firebaseRepository', () => ({ getSocialProfilesByUid }));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getCachedSocialDirectory: vi.fn(async () => null),
  putCachedSocialDirectory: vi.fn(async () => {}),
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/socialGistRepository', () => ({
  getSocialSyncConfig: () => ({ token: 't', gistId: 'gist-yo' }),
  mergeSocialGistData: vi.fn(),
  readPublicSocialGistById: vi.fn(async () => ({})),
}));

const { useSocialDirectory } = await import('../../src/viewmodel/social/useSocialDirectory');

function montar() {
  return renderHook(() =>
    useSocialDirectory({
      enabled: true,
      inputsReady: true,
      authUser: { uid: 'uid-yo', email: 'yo@x.com', displayName: 'Yo', photoURL: null } as never,
      ownProfileId: 'uid-yo',
      ownTier: 'bronze',
      ownPublishablePhoto: '',
      socialGistId: 'gist-yo',
      friends: [],
      defaultSocialVisibility: {} as never,
      setFeedback: vi.fn(),
      reportFailure: vi.fn(),
      setNetworkFailure: vi.fn(),
    }),
  );
}

beforeEach(() => {
  getSocialProfilesByUid.mockClear();
});

describe('useSocialDirectory — refresco tras publicar', () => {
  it('tras un post fuerza el feed pero reutiliza la copia de los perfiles', async () => {
    const { result } = montar();
    await result.current.hydrateSocialDirectory(true, { keepDirectoryQuery: true });

    expect(getSocialProfilesByUid).toHaveBeenCalledTimes(1);
    expect(getSocialProfilesByUid.mock.calls[0][1]).toMatchObject({ forceRefresh: false });
  });

  it('el botón «Actualizar» sigue releyendo los perfiles', async () => {
    const { result } = montar();
    await result.current.hydrateSocialDirectory(true);

    expect(getSocialProfilesByUid.mock.calls[0][1]).toMatchObject({ forceRefresh: true });
  });
});
