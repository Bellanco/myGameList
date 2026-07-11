import { useCallback, useEffect, useRef, useState } from 'react';
import { PALETTE_KEY, THEME_KEY } from '../../core/constants/storageKeys';
import { paletteBg, parsePaletteId } from '../../core/constants/palettes';
import { APPEARANCE_HYDRATED_EVENT, persistThemePreference } from '../../model/repository/appearancePreferenceRepository';

export type ThemePreference = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** Paleta activa guardada (o la de por defecto). Se lee aquí para calcular el `theme-color`, que
 *  depende del `--bg` de la paleta Y del tema. Se mantiene en sincronía con `usePalette`. */
function readActivePalette() {
  try {
    return parsePaletteId(localStorage.getItem(PALETTE_KEY));
  } catch {
    return parsePaletteId(null);
  }
}

/** Actualiza la barra del navegador / status bar móvil con el `--bg` de la paleta+tema activos.
 *  Lo usan tanto el cambio de tema como el de paleta para que el color siempre cuadre. */
export function applyThemeColor(theme: ThemePreference): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', paletteBg(readActivePalette(), theme));
  }
}

/** Tema del sistema; si no se puede detectar (sin matchMedia o sin coincidencia), por defecto OSCURO. */
function systemDefault(): ThemePreference {
  if (typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(LIGHT_QUERY).matches) {
    return 'light';
  }
  return 'dark';
}

/** Preferencia inicial: lo guardado explícitamente; si no hay nada, el tema del sistema (fallback oscuro). */
function readInitialPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark') {
      return raw;
    }
  } catch {
    // localStorage no disponible (modo privado/SSR): caemos al default del sistema.
  }
  return systemDefault();
}

/**
 * Aplica el tema al `<html>` y actualiza el `theme-color`. El tema oscuro es el `:root` por defecto,
 * así que para oscuro retiramos el atributo y para claro fijamos `data-theme="light"`.
 * Idéntica lógica que `public/theme-init.js` (que corre antes del primer render para evitar el flash).
 */
function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  applyThemeColor(theme);
}

/** Evento in-page para sincronizar TODAS las instancias de `useTheme` (p. ej. el toggle flotante y el de
 *  Ajustes): al cambiar el tema en una, las demás re-leen y actualizan su icono/estado. */
const THEME_CHANGED_EVENT = 'app:theme-changed';

/** Toggle de tema (claro/oscuro) con persistencia local. Default = tema del sistema (fallback oscuro). */
export function useTheme(): { theme: ThemePreference; toggle: () => void } {
  const [theme, setTheme] = useState<ThemePreference>(readInitialPreference);
  const themeRef = useRef(theme);
  const themeAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    themeRef.current = theme;
    applyTheme(theme);
  }, [theme]);

  // Re-lee y aplica cuando el tema cambia en OTRA instancia (evento local) o al hidratar desde la nube.
  useEffect(() => {
    const sync = () => setTheme(readInitialPreference());
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    window.addEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    return () => {
      window.removeEventListener(THEME_CHANGED_EVENT, sync);
      window.removeEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    };
  }, []);

  const toggle = useCallback(() => {
    // Cross-fade: marca el <html> mientras cambia el tema para fundir los colores (ver `.theme-anim` en _base.scss).
    const root = document.documentElement;
    root.classList.add('theme-anim');
    if (themeAnimTimer.current) clearTimeout(themeAnimTimer.current);
    themeAnimTimer.current = setTimeout(() => root.classList.remove('theme-anim'), 400);

    const next: ThemePreference = themeRef.current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Sin persistencia: el tema sigue aplicándose en la sesión actual.
    }
    persistThemePreference(next); // replica a la nube si hay sesión (best-effort)
    // Notifica a las demás instancias de `useTheme` para que sincronicen su estado (icono luna/sol, etc.).
    window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
  }, []);

  return { theme, toggle };
}
