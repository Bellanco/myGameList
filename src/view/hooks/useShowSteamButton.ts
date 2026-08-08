import { useCallback } from 'react';
import { steamButtonPreference } from './preferences';
import { usePreference } from './usePreference';

/**
 * F1 — Preferencia de VISIBILIDAD del botón "Steam Deck" de la barra de filtros. Es OPT-IN: sin valor guardado
 * no se muestra, y la clave solo existe cuando alguien pulsó el selector de "Cuenta" (o cuando se hidrató desde
 * `publicConfig`), así que la ausencia distingue "nunca eligió" de "eligió mostrarlo".
 *
 * No aplica ningún atributo al `<html>` (a diferencia de la caja o los efectos): solo expone el booleano que
 * consume la Toolbar.
 */
export function useShowSteamButton(): { showSteamButton: boolean; setShowSteamButton: (on: boolean) => void } {
  const showSteamButton = usePreference(steamButtonPreference);
  const setShowSteamButton = useCallback((on: boolean) => steamButtonPreference.set(on), []);

  return { showSteamButton, setShowSteamButton };
}
