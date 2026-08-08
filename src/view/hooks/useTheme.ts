import { useCallback, useEffect } from 'react';
import { startColorCrossFade, themePreference } from './preferences';
import { usePreference } from './usePreference';

export type { ThemePreference } from './preferences';
export { applyThemeColor } from './preferences';

/**
 * Toggle de tema (claro/oscuro) con persistencia local y réplica a la nube si hay sesión. Default = tema del
 * sistema (con reserva a oscuro). Todas las instancias (el toggle flotante, el de Ajustes) comparten el store.
 */
export function useTheme(): { theme: 'dark' | 'light'; toggle: () => void } {
  const theme = usePreference(themePreference);

  // Por si localStorage cambió entre el anti-flash (`theme-init.js`) y el montaje.
  useEffect(() => { themePreference.apply(); }, []);

  const toggle = useCallback(() => {
    startColorCrossFade();
    themePreference.set(themePreference.get() === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, toggle };
}
