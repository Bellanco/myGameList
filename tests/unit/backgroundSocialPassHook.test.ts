import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabData } from '../../src/model/types/game';

// El hook de la pasada social de la app principal (docs/plan-feed-sin-vacio.md, Fase 3): se dispara al arrancar y al
// volver a la pestaña, y quien no tiene lo social dado de alta en el dispositivo no carga Firebase por ello.

const firebaseCargado = vi.hoisted(() => ({ value: false }));
vi.mock('../../src/model/repository/firebaseRepository', () => {
  firebaseCargado.value = true;
  return { touchOwnProfileActivityThrottled: vi.fn(async () => {}) };
});
const gistConfig = vi.hoisted(() => ({
  ensureSyncConfigLoaded: vi.fn(async () => {}),
  getSocialSyncConfig: vi.fn((): unknown => null),
}));
vi.mock('../../src/model/repository/gistConfigRepository', () => gistConfig);
// Con una sesión de Google guardada: sin ella la pasada sale antes de mirar el canal, que es lo que estos tests cuentan.
vi.mock('../../src/model/repository/firebaseGateway', () => ({
  hasStoredAuthSession: () => true,
  getCurrentSocialAuthUser: vi.fn(async () => null),
}));
vi.mock('../../src/model/repository/indexedDbRepository', () => ({
  getLocalMeta: vi.fn(async () => null),
  patchLocalMeta: vi.fn(async () => {}),
}));

const { useBackgroundSocialPass, resetBackgroundSocialPassForTests } = await import('../../src/viewmodel/social/backgroundSocialPass');

const JUEGOS = { c: [{ id: 1, name: 'Halo' }], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 1 } as unknown as TabData;
const VACIO = { c: [], v: [], e: [], p: [], d: [], deleted: [], updatedAt: 0 } as unknown as TabData;

function ponerVisibilidad(estado: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBackgroundSocialPassForTests();
  firebaseCargado.value = false;
});

describe('useBackgroundSocialPass', () => {
  it('pasa al arrancar y al volver a la pestaña, no al ocultarla', async () => {
    renderHook(() => useBackgroundSocialPass(JUEGOS));
    await waitFor(() => expect(gistConfig.getSocialSyncConfig).toHaveBeenCalledTimes(1));

    ponerVisibilidad('hidden');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gistConfig.getSocialSyncConfig).toHaveBeenCalledTimes(1);

    ponerVisibilidad('visible');
    await waitFor(() => expect(gistConfig.getSocialSyncConfig).toHaveBeenCalledTimes(2));
  });

  it('sin juegos cargados todavía no pasa; en cuanto llegan, sí', async () => {
    const { rerender } = renderHook(({ games }) => useBackgroundSocialPass(games), { initialProps: { games: VACIO } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gistConfig.getSocialSyncConfig).not.toHaveBeenCalled();

    rerender({ games: JUEGOS });
    await waitFor(() => expect(gistConfig.getSocialSyncConfig).toHaveBeenCalledTimes(1));
  });

  it('sin canal social en el dispositivo no carga Firebase', async () => {
    renderHook(() => useBackgroundSocialPass(JUEGOS));
    await waitFor(() => expect(gistConfig.getSocialSyncConfig).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(firebaseCargado.value).toBe(false);
  });
});
