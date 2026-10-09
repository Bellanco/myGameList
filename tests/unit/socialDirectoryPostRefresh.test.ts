import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Publicar un post refresca el feed al momento para que salga, pero los perfiles de tus amigos no han cambiado:
// forzarlos costaba una lectura de Firestore por amigo en cada post. El botón «Actualizar» sí los sigue forzando.

const getSocialProfilesByUid = vi.hoisted(() => vi.fn(async (_uids: string[], _options: { forceRefresh?: boolean }) => [] as unknown[]));

vi.mock('../../src/model/repository/firebaseRepository', () => ({ getSocialProfilesByUid }));
const putCachedSocialDirectory = vi.hoisted(() => vi.fn(async (_gist: string, _entries: unknown[]) => {}));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getCachedSocialDirectory: vi.fn(async () => null),
  putCachedSocialDirectory,
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
}));
vi.mock('../../src/model/repository/socialGistRepository', () => ({
  getSocialSyncConfig: () => ({ token: 't', gistId: 'gist-yo' }),
  mergeSocialGistData: vi.fn(),
  readPublicSocialGistById: vi.fn(async () => ({})),
}));

const { useSocialDirectory } = await import('../../src/viewmodel/social/useSocialDirectory');
const { act, waitFor } = await import('@testing-library/react');

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
  getSocialProfilesByUid.mockReset();
  getSocialProfilesByUid.mockImplementation(async () => []);
  putCachedSocialDirectory.mockClear();
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

// UNA PASADA VIEJA NO PISA A LA NUEVA (09-10-2026). La forzada de después de publicar no espera a la que estuviera
// en vuelo; si la vieja terminaba DESPUÉS, escribía su directorio —sin el post— encima del nuevo y en la caché.
describe('useSocialDirectory — pasada superada', () => {
  const perfil = (displayName: string) => ({ id: 'uid-yo', uid: 'uid-yo', displayName, photoURL: '', socialGistId: '' });

  it('la pasada vieja que termina después no escribe ni en pantalla ni en caché', async () => {
    let soltarVieja: (value: unknown[]) => void = () => {};
    getSocialProfilesByUid
      .mockImplementationOnce(() => new Promise((resolve) => { soltarVieja = resolve; }))
      .mockImplementationOnce(async () => [perfil('Nuevo')]);
    const { result } = montar();

    let vieja: Promise<void> = Promise.resolve();
    act(() => { vieja = result.current.hydrateSocialDirectory(false); });
    await waitFor(() => expect(getSocialProfilesByUid).toHaveBeenCalledTimes(1));
    await act(async () => { await result.current.hydrateSocialDirectory(true, { keepDirectoryQuery: true }); });
    await act(async () => { soltarVieja([perfil('Viejo')]); await vieja; });

    expect(result.current.rawSocialDirectory.map((entry) => entry.displayName)).toEqual(['Nuevo']);
    expect(putCachedSocialDirectory).toHaveBeenCalledTimes(1);
    expect((putCachedSocialDirectory.mock.calls[0][1] as Array<{ displayName: string }>)[0].displayName).toBe('Nuevo');
  });
});
