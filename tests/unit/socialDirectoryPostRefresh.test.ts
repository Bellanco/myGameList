import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Publicar un post refresca el feed al momento para que salga, pero la consulta de perfiles del directorio no ha
// cambiado: forzarla costaba sus 50 lecturas de Firestore por cada post. El botón «Actualizar» sí la sigue forzando.

const listSocialDirectory = vi.hoisted(() => vi.fn(async (_limit: number, _options: { forceRefresh?: boolean }) => [] as unknown[]));

vi.mock('../../src/model/repository/firebaseRepository', () => ({ listSocialDirectory }));
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
  listSocialDirectory.mockClear();
});

describe('useSocialDirectory — refresco tras publicar', () => {
  it('tras un post fuerza el feed pero reutiliza la copia de la consulta de perfiles', async () => {
    const { result } = montar();
    await result.current.hydrateSocialDirectory(true, { keepDirectoryQuery: true });

    expect(listSocialDirectory).toHaveBeenCalledTimes(1);
    expect(listSocialDirectory.mock.calls[0][1]).toMatchObject({ forceRefresh: false });
  });

  it('el botón «Actualizar» sigue releyendo la consulta', async () => {
    const { result } = montar();
    await result.current.hydrateSocialDirectory(true);

    expect(listSocialDirectory.mock.calls[0][1]).toMatchObject({ forceRefresh: true });
  });
});
