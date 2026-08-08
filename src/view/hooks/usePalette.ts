import { useCallback, useEffect } from 'react';
import type { PaletteId } from '../../core/constants/palettes';
import { palettePreference, startColorCrossFade } from './preferences';
import { usePreference } from './usePreference';

/**
 * Aplica al `<html>` la paleta guardada SIN exponer selector. Se monta en la raíz (App) para que la paleta
 * sincronizada por cuenta se aplique EN TODA la app al iniciar sesión, no solo al abrir Ajustes (donde vive el
 * selector `usePalette`).
 *
 * Ya no necesita escuchar la hidratación: el store aplica al DOM en cuanto llega el valor de la nube, esté o no
 * montado este hook. Queda la aplicación inicial, por si localStorage cambió entre el anti-flash y el montaje.
 */
export function useAppliedPalette(): void {
  useEffect(() => { palettePreference.apply(); }, []);
}

/** Selector de paleta de color. Default = paleta por defecto ("steam"). */
export function usePalette(): { palette: PaletteId; setPalette: (next: PaletteId) => void } {
  const palette = usePreference(palettePreference);

  const setPalette = useCallback((next: PaletteId) => {
    startColorCrossFade();
    palettePreference.set(next);
  }, []);

  return { palette, setPalette };
}
