/**
 * EL SANEADO DE LA FOTO PROPIA (`useOwnPhotoHeal`) reescribe el canal social para poner o quitar la foto.
 *
 * Lo que se afirma aquí es lo que NO debe tocar: el resto del canal. Copiaba a mano la actividad y las
 * publicaciones, y los avisos de lista (`moves`, `hiddenMoves`) se caían —el saneado del gist rellena con `[]` lo
 * que falta—, así que tus amigos dejaban de verlos hasta la siguiente reconciliación (09-10-2026).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readSocialGist = vi.hoisted(() => vi.fn());
const writeSocialGist = vi.hoisted(() => vi.fn(async () => ({ etag: 'e2' })));
const updateProfilePhoto = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../../src/model/repository/socialGistRepository', () => ({
  getSocialSyncConfig: () => ({ token: 'ghp_0123456789abcdefghij', gistId: 'aaaa1111' }),
  readSocialGist,
  writeSocialGist,
}));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getLocalMeta: async () => null,
  patchLocalMeta: async () => {},
}));
vi.mock('../../src/model/repository/firebaseRepository', () => ({ updateProfilePhoto }));

const { useOwnPhotoHeal } = await import('../../src/viewmodel/social/useOwnPhotoHeal');

const AVISO = { id: '7:c', gameId: 7, gameName: 'Hollow Knight', tab: 'c', at: 1, updatedAt: 1 };
const CANAL = {
  profile: { name: 'Yo', private: false, visibility: { hiddenTabs: [], showPhoto: true }, sharedLists: {}, photoURL: '' },
  activity: [{ id: 'a1' }],
  posts: [{ id: 'p1', text: 'hola' }],
  moves: [AVISO],
  hiddenMoves: [{ ...AVISO, id: '8:v', gameId: 8, tab: 'v' }],
  updatedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  readSocialGist.mockResolvedValue({ data: structuredClone(CANAL), etag: 'e1' });
});

describe('saneado de la foto propia', () => {
  it('cambia la foto y conserva el resto del canal: actividad, publicaciones y avisos de lista', async () => {
    renderHook(() => useOwnPhotoHeal({
      socialSpaceOpen: true,
      socialCfgGistId: 'aaaa1111',
      authUser: { uid: 'uid-yo', photoURL: 'https://lh3.googleusercontent.com/a/foto' } as never,
      ownPhotoIsGeneric: false,
      ownPhotoVerdictPending: false,
      showPhoto: true,
      patchDirectoryEntries: vi.fn(),
    }));

    await waitFor(() => expect(writeSocialGist).toHaveBeenCalledTimes(1));
    const [, , escrito] = writeSocialGist.mock.calls[0] as unknown as [string, string, typeof CANAL];
    expect(escrito.profile.photoURL).toBe('https://lh3.googleusercontent.com/a/foto');
    expect(escrito.activity).toEqual(CANAL.activity);
    expect(escrito.posts).toEqual(CANAL.posts);
    expect(escrito.moves).toEqual(CANAL.moves);
    expect(escrito.hiddenMoves).toEqual(CANAL.hiddenMoves);
  });
});
