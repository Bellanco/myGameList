// LOS TEMAS SON DE QUIEN TIENE ESPACIO SOCIAL. Sin él se pinta el de por defecto, y este fichero comprueba las
// dos mitades de esa promesa: que no se vea otro tema por ningún camino —lo guardado en local, lo que llega de la
// nube— y que la elección NO se pierda, para que vuelva si vuelve el social.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../src/model/repository/firebaseRepository', () => ({
  getPublicConfig: vi.fn(async () => ({ palette: 'persona' })),
  setPublicConfig: vi.fn(async () => {}),
}));

import { DEFAULT_PALETTE } from '../../src/core/constants/palettes';
import { PALETTE_KEY, PALETTE_LOCK_KEY } from '../../src/core/constants/storageKeys';
import { hydratePreferencesFromCloud } from '../../src/model/repository/preferenceStore';
import { appliedPalette, paletteLockPreference, palettePreference } from '../../src/view/hooks/preferences';
import { useAppliedPalette, usePalette } from '../../src/view/hooks/usePalette';
import type { SocialProfileStatus } from '../../src/view/hooks/useSocialProfileSession';

const pintada = () => document.documentElement.getAttribute('data-palette');

describe('paleta · sin espacio social, el de por defecto', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-palette');
  });
  afterEach(() => localStorage.clear());

  it('sin marca se pinta lo elegido (quien tiene social no cambia nada)', () => {
    localStorage.setItem(PALETTE_KEY, 'witcher');
    palettePreference.apply();
    expect(appliedPalette()).toBe('witcher');
    expect(pintada()).toBe('witcher');
  });

  it('con la marca se pinta el de por defecto, y lo elegido sigue guardado', () => {
    localStorage.setItem(PALETTE_KEY, 'witcher');
    paletteLockPreference.set(true);
    expect(pintada()).toBe(DEFAULT_PALETTE);
    expect(appliedPalette()).toBe(DEFAULT_PALETTE);
    expect(palettePreference.get()).toBe('witcher');

    paletteLockPreference.set(false);
    expect(pintada()).toBe('witcher');
  });

  it('lo que llega de la nube no se salta la marca', async () => {
    paletteLockPreference.set(true);
    await hydratePreferencesFromCloud('uid-1');
    expect(palettePreference.get()).toBe('persona');
    expect(pintada()).toBe(DEFAULT_PALETTE);
  });

  it('`usePalette` devuelve la que se pinta, no la guardada', () => {
    localStorage.setItem(PALETTE_KEY, 'persona');
    localStorage.setItem(PALETTE_LOCK_KEY, 'on');
    const { result } = renderHook(() => usePalette());
    expect(result.current.palette).toBe(DEFAULT_PALETTE);
  });

  it('la puerta sigue al estado social y no toca nada mientras no se sabe', () => {
    localStorage.setItem(PALETTE_KEY, 'persona');
    const { rerender } = renderHook(({ status }: { status: SocialProfileStatus }) => useAppliedPalette(status), {
      initialProps: { status: 'pending' },
    });
    expect(localStorage.getItem(PALETTE_LOCK_KEY)).toBeNull();
    expect(pintada()).toBe('persona');

    rerender({ status: 'inactive' });
    expect(paletteLockPreference.get()).toBe(true);
    expect(pintada()).toBe(DEFAULT_PALETTE);

    // Al volver a `pending` —otra resolución de la sesión— se conserva la última respuesta.
    rerender({ status: 'pending' });
    expect(pintada()).toBe(DEFAULT_PALETTE);

    rerender({ status: 'active' });
    expect(paletteLockPreference.get()).toBe(false);
    expect(pintada()).toBe('persona');
  });
});
