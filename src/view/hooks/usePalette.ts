import { useCallback, useEffect, useRef, useState } from 'react';
import { PALETTE_KEY } from '../../core/constants/storageKeys';
import { DEFAULT_PALETTE, parsePaletteId, type PaletteId } from '../../core/constants/palettes';
import { applyThemeColor, type ThemePreference } from './useTheme';
import { APPEARANCE_HYDRATED_EVENT, persistPalettePreference } from '../../model/repository/appearancePreferenceRepository';

/** Preferencia inicial de paleta: lo guardado (validado); si no hay nada, la paleta por defecto. */
function readInitialPalette(): PaletteId {
  try {
    return parsePaletteId(localStorage.getItem(PALETTE_KEY));
  } catch {
    // localStorage no disponible (modo privado/SSR): paleta por defecto.
    return DEFAULT_PALETTE;
  }
}

/** Tema actual leído del DOM (lo fija `useTheme`), para recalcular el `theme-color` al cambiar de paleta. */
function currentTheme(): ThemePreference {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Aplica la paleta al `<html>` vía `data-palette`. La paleta por defecto ("steam") vive en `:root`
 * (sin atributo), así que para ella retiramos el atributo; para el resto lo fijamos. Idéntica lógica
 * que `public/theme-init.js` (que corre antes del primer render para evitar el flash de paleta).
 */
function applyPalette(palette: PaletteId): void {
  const root = document.documentElement;
  if (palette === DEFAULT_PALETTE) {
    root.removeAttribute('data-palette');
  } else {
    root.setAttribute('data-palette', palette);
  }
  applyThemeColor(currentTheme());
}

/** Selector de paleta de color con persistencia local. Default = paleta por defecto ("steam"). */
export function usePalette(): { palette: PaletteId; setPalette: (next: PaletteId) => void } {
  const [palette, setPaletteState] = useState<PaletteId>(readInitialPalette);
  const animTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applyPalette(palette);
  }, [palette]);

  // Al hidratar desde la nube (inicio de sesión) se vuelca a localStorage y se emite este evento; re-leemos.
  useEffect(() => {
    const onHydrated = () => setPaletteState(readInitialPalette());
    window.addEventListener(APPEARANCE_HYDRATED_EVENT, onHydrated);
    return () => window.removeEventListener(APPEARANCE_HYDRATED_EVENT, onHydrated);
  }, []);

  const setPalette = useCallback((next: PaletteId) => {
    // Cross-fade: marca el <html> mientras cambia la paleta para fundir los colores (ver `.theme-anim`).
    const root = document.documentElement;
    root.classList.add('theme-anim');
    if (animTimer.current) clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => root.classList.remove('theme-anim'), 400);
    setPaletteState(next);
    try {
      localStorage.setItem(PALETTE_KEY, next);
    } catch {
      // Sin persistencia: la paleta sigue aplicándose en la sesión actual.
    }
    persistPalettePreference(next); // replica a la nube si hay sesión (best-effort)
  }, []);

  return { palette, setPalette };
}
