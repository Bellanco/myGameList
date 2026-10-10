import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getLocalMeta, patchLocalMeta } from '../../src/model/repository/indexedDbRepository';
import { removeLegacyLocalMetaKeys } from '../../src/model/repository/localMetaCleanupRepository';
import { useLegacyLocalMetaCleanup } from '../../src/view/hooks/useLegacyLocalMetaCleanup';
import { LEGACY_META_CLEANUP_KEY } from '../../src/core/constants/storageKeys';

// LIMPIEZA DE LO QUE YA NO SE USA EN `LocalMeta`. La línea base de los logros (`achievementsPeerSeen`) se retiró el
// 10-10-2026 (docs/plan-feed-sin-vacio.md, Fase 5), pero los dispositivos que ya habían abierto el hub la siguen
// guardando: `patchLocalMeta` solo añade y nadie la quitaba. Se quita una vez por dispositivo.

beforeEach(async () => {
  localStorage.clear();
  await patchLocalMeta({ profileTouchedAt: 123, achievementsPeerSeen: { ada: 'espejo' } } as never);
});

describe('removeLegacyLocalMetaKeys', () => {
  it('quita lo retirado y deja todo lo demás', async () => {
    expect(await removeLegacyLocalMetaKeys()).toBe(1);

    const meta = (await getLocalMeta()) as Record<string, unknown> | null;
    expect(meta).not.toHaveProperty('achievementsPeerSeen');
    expect(meta?.profileTouchedAt).toBe(123);
  });

  it('sin nada que quitar no escribe y dice cero', async () => {
    await removeLegacyLocalMetaKeys();
    expect(await removeLegacyLocalMetaKeys()).toBe(0);
  });
});

describe('useLegacyLocalMetaCleanup', () => {
  it('limpia una vez y lo apunta, para no volver a mirar', async () => {
    renderHook(() => useLegacyLocalMetaCleanup());

    await waitFor(() => expect(localStorage.getItem(LEGACY_META_CLEANUP_KEY)).toBe('1'));
    expect(await getLocalMeta()).not.toHaveProperty('achievementsPeerSeen');
  });

  it('ya apuntado, no toca nada', async () => {
    localStorage.setItem(LEGACY_META_CLEANUP_KEY, '1');
    renderHook(() => useLegacyLocalMetaCleanup());
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(await getLocalMeta()).toHaveProperty('achievementsPeerSeen');
  });
});
