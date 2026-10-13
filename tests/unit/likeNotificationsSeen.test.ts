import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addSeenLikeKeys, getSeenLikeKeys, SEEN_LIKES_MAX } from '../../src/model/repository/likeNotificationsSeen';
import { getLocalMeta, patchLocalMeta } from '../../src/model/repository/indexedDbRepository';

// docs/plan-notificaciones-y-buscador.md — lo ya visto en la campana, solo en este dispositivo.

beforeEach(async () => {
  await patchLocalMeta({ seenLikes: undefined });
});

describe('likeNotificationsSeen', () => {
  it('guarda y lee las claves de la cuenta, sin duplicar', async () => {
    await addSeenLikeKeys('uid-a', ['k1', 'k2']);
    await addSeenLikeKeys('uid-a', ['k2', 'k3']);

    expect([...(await getSeenLikeKeys('uid-a'))].sort()).toEqual(['k1', 'k2', 'k3']);
  });

  it('otra cuenta en el mismo navegador no hereda lo visto', async () => {
    await addSeenLikeKeys('uid-a', ['k1']);

    expect(await getSeenLikeKeys('uid-b')).toEqual(new Set());
    await addSeenLikeKeys('uid-b', ['k9']);
    expect((await getLocalMeta())?.seenLikes).toEqual({ uid: 'uid-b', keys: ['k9'] });
  });

  it('con el tope, caen las más antiguas', async () => {
    const many = Array.from({ length: SEEN_LIKES_MAX }, (_, index) => `old-${index}`);
    await addSeenLikeKeys('uid-a', many);
    await addSeenLikeKeys('uid-a', ['nueva']);

    const seen = await getSeenLikeKeys('uid-a');
    expect(seen.size).toBe(SEEN_LIKES_MAX);
    expect(seen.has('nueva')).toBe(true);
    expect(seen.has('old-0')).toBe(false);
  });

  it('sin uid no se guarda nada', async () => {
    await addSeenLikeKeys('', ['k1']);
    expect((await getLocalMeta())?.seenLikes).toBeUndefined();
  });
});
