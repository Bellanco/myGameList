import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useShowSteamButton } from '../../src/view/hooks/useShowSteamButton';
import { STEAM_BUTTON_KEY } from '../../src/core/constants/storageKeys';

// F1 — El botón "Steam Deck" de la toolbar es OPT-IN: sin preferencia guardada no se muestra. La clave solo
// existe cuando alguien pulsó el selector de "Cuenta" (o cuando se hidrató desde `publicConfig`), así que la
// ausencia distingue "nunca eligió" (oculto) de "eligió mostrar" (visible), que debe conservarse.

beforeEach(() => {
  localStorage.clear();
});

describe('visibilidad del botón de Steam Deck', () => {
  it('sin preferencia guardada viene desactivado', () => {
    const { result } = renderHook(() => useShowSteamButton());
    expect(result.current.showSteamButton).toBe(false);
  });

  it('conserva la elección previa de mostrarlo', () => {
    localStorage.setItem(STEAM_BUTTON_KEY, 'on');
    const { result } = renderHook(() => useShowSteamButton());
    expect(result.current.showSteamButton).toBe(true);
  });

  it('conserva la elección previa de ocultarlo', () => {
    localStorage.setItem(STEAM_BUTTON_KEY, 'off');
    const { result } = renderHook(() => useShowSteamButton());
    expect(result.current.showSteamButton).toBe(false);
  });

  it('activarlo persiste "on" y sincroniza las demás instancias', () => {
    const { result } = renderHook(() => useShowSteamButton());
    const other = renderHook(() => useShowSteamButton());

    act(() => { result.current.setShowSteamButton(true); });

    expect(localStorage.getItem(STEAM_BUTTON_KEY)).toBe('on');
    expect(result.current.showSteamButton).toBe(true);
    expect(other.result.current.showSteamButton).toBe(true);
  });

  it('un valor corrupto se trata como "sin elegir" (oculto)', () => {
    localStorage.setItem(STEAM_BUTTON_KEY, 'yes');
    const { result } = renderHook(() => useShowSteamButton());
    expect(result.current.showSteamButton).toBe(false);
  });
});
