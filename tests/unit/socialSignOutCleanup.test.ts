/**
 * AL CERRAR SESIÓN, LO DE LOS DEMÁS SE VA DEL DISPOSITIVO (09-10-2026).
 *
 * El espacio social guarda en IndexedDB datos que no son tuyos —los listados de tus amistades en crudo, con lo que
 * esconden; tus amistades con sus ids de gist; el directorio—. Cerrar sesión en un navegador compartido tiene que
 * llevárselos. Lo propio (tus juegos, tu `meta`) se queda: la app lo necesita sin sesión.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { forgetSocialDataOnDevice } from '../../src/model/repository/socialSignOutCleanup';
import {
  getCachedMyFriendships,
  getCachedProfileGames,
  getLocalMeta,
  patchLocalMeta,
  putCachedMyFriendships,
  putCachedProfileGames,
  putCachedSocialDirectory,
  getCachedSocialDirectory,
} from '../../src/model/repository/indexedDbRepository';

const LISTAS = { c: [{ id: 7, name: 'Hollow Knight' }], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 1 } as never;

describe('cerrar sesión borra los datos sociales de terceros', () => {
  it('vacía listados de amistades, amistades y directorio, y conserva lo propio', async () => {
    await putCachedProfileGames('perfil-ana', 'bbbb2222', LISTAS);
    await putCachedMyFriendships('uid-yo', { friends: [{ otherUid: 'uid-ana', otherGamesGistId: 'bbbb2222' }] }, Date.now());
    await putCachedSocialDirectory('aaaa1111', [{ id: 'perfil-ana' }]);
    await patchLocalMeta({ photoHealedFor: 'https://foto' });

    expect(await getCachedProfileGames('perfil-ana', 'bbbb2222')).not.toBeNull();
    expect(await getCachedMyFriendships('uid-yo')).not.toBeNull();
    expect(await getCachedSocialDirectory('aaaa1111', undefined, { allowExpired: true })).not.toBeNull();

    await forgetSocialDataOnDevice();

    expect(await getCachedProfileGames('perfil-ana', 'bbbb2222', { allowExpired: true })).toBeNull();
    expect(await getCachedMyFriendships('uid-yo')).toBeNull();
    expect(await getCachedSocialDirectory('aaaa1111', undefined, { allowExpired: true })).toBeNull();
    // Lo tuyo sigue: `meta` vive en otro almacén.
    expect((await getLocalMeta())?.photoHealedFor).toBe('https://foto');
  });
});
