import 'fake-indexeddb/auto';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FriendshipView } from '../../src/model/types/social';

// LA COPIA DEL DIRECTORIO SABE CON QUÉ AMISTADES SE HIZO (docs/plan-historial-amigo-nuevo.md, Fase 1). Antes se
// guardaba solo por el gist propio: con un amigo nuevo, o con sus ids recién llegados, se seguía sirviendo la copia
// de antes durante todo su TTL (30 min en bronce) y su historial no aparecía en el feed.

const getSocialProfilesByUid = vi.hoisted(() => vi.fn(async (_uids: string[], _options: unknown) => [] as unknown[]));
vi.mock('../../src/model/repository/firebaseRepository', () => ({ getSocialProfilesByUid }));
vi.mock('../../src/model/repository/socialGistRepository', () => ({
  getSocialSyncConfig: () => ({ token: 't', gistId: 'gist-yo' }),
  mergeSocialGistData: vi.fn(),
  readPublicSocialGistById: vi.fn(async () => ({ profile: { name: 'X' }, activity: [], posts: [], moves: [], updatedAt: 1 })),
}));

const { getCachedSocialDirectory, putCachedSocialDirectory, invalidateCachedSocialDirectory } = await import(
  '../../src/model/repository/indexedDbRepository'
);
const { socialDirectoryFriendsKey, useSocialDirectory } = await import('../../src/viewmodel/social/useSocialDirectory');
const { act } = await import('@testing-library/react');

const GIST = 'gist-yo';

const amigo = (otherUid: string, otherSocialGistId = '', otherGamesGistId = ''): FriendshipView => ({
  docId: `uid-yo__${otherUid}`,
  otherUid,
  otherName: otherUid,
  otherPhoto: '',
  otherSocialGistId,
  otherGamesGistId,
  state: 'friends',
  createdAt: 1,
  updatedAt: 1,
});

beforeEach(async () => {
  await invalidateCachedSocialDirectory(GIST);
  getSocialProfilesByUid.mockClear();
});

describe('socialDirectoryFriendsKey', () => {
  it('no depende del orden en que llegan las amistades', () => {
    expect(socialDirectoryFriendsKey([amigo('a', 'g1'), amigo('b', 'g2')], 'yo'))
      .toBe(socialDirectoryFriendsKey([amigo('b', 'g2'), amigo('a', 'g1')], 'yo'));
  });

  it('cambia con un amigo nuevo, con un id que llega y con el profileId propio', () => {
    const base = socialDirectoryFriendsKey([amigo('a', 'g1')], 'yo');
    expect(socialDirectoryFriendsKey([amigo('a', 'g1'), amigo('b')], 'yo')).not.toBe(base);
    expect(socialDirectoryFriendsKey([amigo('a', 'g1', 'j1')], 'yo')).not.toBe(base);
    expect(socialDirectoryFriendsKey([amigo('a', 'g1')], 'otro')).not.toBe(base);
  });

  // docs/plan-feed-sin-vacio.md, Fase 4: el sello de regreso de un amigo dormido tiene que tirar también la copia del
  // feed, o su actividad seguiría fuera hasta que caducara (30 min en bronce).
  it('cambia cuando la amistad trae un sello nuevo (un amigo que vuelve)', () => {
    const base = socialDirectoryFriendsKey([amigo('a', 'g1')], 'yo');
    expect(socialDirectoryFriendsKey([{ ...amigo('a', 'g1'), updatedAt: 2 }], 'yo')).not.toBe(base);
  });
});

describe('caché del directorio con huella de amistades', () => {
  it('se sirve con la misma huella y no con otra', async () => {
    await putCachedSocialDirectory(GIST, [{ id: 'ada' }], 'k1');

    await expect(getCachedSocialDirectory(GIST, 60_000, { friendsKey: 'k1' })).resolves.toEqual([{ id: 'ada' }]);
    await expect(getCachedSocialDirectory(GIST, 60_000, { friendsKey: 'k2' })).resolves.toBeNull();
  });

  it('una copia sin huella (de antes de existir) no vale para quien la pide: así es retroactivo', async () => {
    await putCachedSocialDirectory(GIST, [{ id: 'ada' }]);

    await expect(getCachedSocialDirectory(GIST, 60_000, { friendsKey: '' })).resolves.toBeNull();
    // Quien no pregunta por huella (diagnóstico) la sigue viendo.
    await expect(getCachedSocialDirectory(GIST, 60_000)).resolves.toEqual([{ id: 'ada' }]);
  });

  it('el rescate (`allowExpired`) la ignora: mejor el directorio de antes que ninguno', async () => {
    await putCachedSocialDirectory(GIST, [{ id: 'ada' }], 'k1');

    await expect(getCachedSocialDirectory(GIST, 0, { allowExpired: true, friendsKey: 'k2' })).resolves.toEqual([{ id: 'ada' }]);
  });
});

describe('useSocialDirectory — amistad nueva con la copia fresca', () => {
  const montar = (friends: FriendshipView[]) =>
    renderHook(
      ({ amigos }) =>
        useSocialDirectory({
          enabled: true,
          inputsReady: true,
          authUser: { uid: 'uid-yo', email: 'yo@x.com', displayName: 'Yo', photoURL: null } as never,
          ownProfileId: 'uid-yo',
          ownTier: 'bronze',
          ownPublishablePhoto: '',
          socialGistId: GIST,
          friends: amigos,
          defaultSocialVisibility: {} as never,
          setFeedback: vi.fn(),
          reportFailure: vi.fn(),
          setNetworkFailure: vi.fn(),
        }),
      { initialProps: { amigos: friends } },
    );

  it('con las mismas amistades sirve la copia; con un amigo nuevo va a red', async () => {
    const { result, rerender } = montar([]);
    await act(async () => { await result.current.hydrateSocialDirectory(); });
    expect(getSocialProfilesByUid).toHaveBeenCalledTimes(1);

    // Misma lista: la copia recién guardada vale, ni una lectura más.
    await act(async () => { await result.current.hydrateSocialDirectory(); });
    expect(getSocialProfilesByUid).toHaveBeenCalledTimes(1);

    // Amigo nuevo, con la copia aún fresca: antes se servía la de antes (sin él) durante 30 min.
    rerender({ amigos: [amigo('uid-a', 'gist-a')] });
    await act(async () => { await result.current.hydrateSocialDirectory(); });
    expect(getSocialProfilesByUid).toHaveBeenCalledTimes(2);
    expect(getSocialProfilesByUid.mock.calls[1][0]).toEqual(['uid-yo', 'uid-a']);
  });

  it('también cuando a un amigo le llegan los ids (los recogió quien aceptó, o entró quien pidió)', async () => {
    const { result, rerender } = montar([amigo('uid-a')]);
    await act(async () => { await result.current.hydrateSocialDirectory(); });
    expect(getSocialProfilesByUid).toHaveBeenCalledTimes(1);

    rerender({ amigos: [amigo('uid-a', 'gist-a', 'juegos-a')] });
    await act(async () => { await result.current.hydrateSocialDirectory(); });
    expect(getSocialProfilesByUid).toHaveBeenCalledTimes(2);
  });
});
