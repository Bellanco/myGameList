import { useCallback, useEffect } from 'react';
import { DEFAULT_PALETTE, type PaletteId } from '../../core/constants/palettes';
import { paletteLockPreference, palettePreference, startColorCrossFade } from './preferences';
import { usePreference } from './usePreference';
import type { SocialProfileStatus } from './useSocialProfileSession';

/**
 * Aplica al `<html>` la paleta guardada SIN exponer selector. Se monta en la raíz (App) para que la paleta
 * sincronizada por cuenta se aplique EN TODA la app al iniciar sesión, no solo al abrir Ajustes (donde vive el
 * selector `usePalette`).
 *
 * Ya no necesita escuchar la hidratación: el store aplica al DOM en cuanto llega el valor de la nube, esté o no
 * montado este hook. Queda la aplicación inicial, por si localStorage cambió entre el anti-flash y el montaje.
 *
 * Y pone la PUERTA de los temas (ver `paletteLockPreference`): sin espacio social, el de por defecto. Mientras el
 * estado es `pending` no se toca nada —manda lo que dejó apuntado la visita anterior—, y solo se escribe cuando la
 * respuesta cambia, para no reaplicar la paleta en cada render de la raíz.
 */
export function useAppliedPalette(socialStatus: SocialProfileStatus): void {
  useEffect(() => { palettePreference.apply(); }, []);

  useEffect(() => {
    if (socialStatus === 'pending') return;
    const locked = socialStatus !== 'active';
    if (paletteLockPreference.get() !== locked) paletteLockPreference.set(locked);
  }, [socialStatus]);
}

/** Selector de paleta de color. Default = `DEFAULT_PALETTE` (hoy «Forja y temple»). Devuelve la que SE PINTA,
 *  que es la de por defecto mientras los temas estén bloqueados. */
export function usePalette(): { palette: PaletteId; setPalette: (next: PaletteId) => void } {
  const stored = usePreference(palettePreference);
  const locked = usePreference(paletteLockPreference);
  const palette = locked ? DEFAULT_PALETTE : stored;

  const setPalette = useCallback((next: PaletteId) => {
    startColorCrossFade();
    palettePreference.set(next);
  }, []);

  return { palette, setPalette };
}
