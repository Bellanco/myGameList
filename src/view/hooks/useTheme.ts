import { useCallback, useEffect, useRef, useState } from 'react';
import { THEME_KEY } from '../../core/constants/storageKeys';

export type ThemePreference = 'dark' | 'light';

// Debe coincidir con --bg de cada tema en `_base.scss` (para la barra del navegador / status bar móvil).
const THEME_COLOR: Record<ThemePreference, string> = {
  dark: '#1a1e24',
  light: '#eef1f5',
};

const LIGHT_QUERY = '(prefers-color-scheme: light)';

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
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLOR[theme]);
  }
}

/** Toggle de tema (claro/oscuro) con persistencia local. Default = tema del sistema (fallback oscuro). */
export function useTheme(): { theme: ThemePreference; toggle: () => void } {
  const [theme, setTheme] = useState<ThemePreference>(readInitialPreference);
  const themeAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    // Cross-fade: marca el <html> mientras cambia el tema para fundir los colores (ver `.theme-anim` en _base.scss).
    const root = document.documentElement;
    root.classList.add('theme-anim');
    if (themeAnimTimer.current) clearTimeout(themeAnimTimer.current);
    themeAnimTimer.current = setTimeout(() => root.classList.remove('theme-anim'), 400);
    setTheme((current) => {
      const next: ThemePreference = current === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Sin persistencia: el tema sigue aplicándose en la sesión actual.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
