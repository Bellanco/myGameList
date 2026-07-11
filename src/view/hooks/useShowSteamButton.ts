import { useCallback, useEffect, useRef, useState } from 'react';
import { STEAM_BUTTON_KEY } from '../../core/constants/storageKeys';
import { APPEARANCE_HYDRATED_EVENT, persistShowSteamButtonPreference } from '../../model/repository/appearancePreferenceRepository';

/** Evento in-page para sincronizar todas las instancias de `useShowSteamButton` (App + Cuenta). */
const STEAM_BUTTON_CHANGED_EVENT = 'app:steam-button-changed';

/** Preferencia inicial: 'off' guardado → oculto; cualquier otra cosa (incl. ausencia) → visible (por defecto). */
function readInitial(): boolean {
  try {
    return localStorage.getItem(STEAM_BUTTON_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * F1 — Preferencia de VISIBILIDAD del botón "Steam Deck" de la barra de filtros, común a la cuenta. Persiste en
 * local y se replica a la nube si hay sesión. Se monta en App (para pasar el valor a la Toolbar) y lo usa también
 * el selector de la pantalla "Cuenta"; ambas instancias se sincronizan por evento. No aplica ningún atributo al
 * `<html>` (a diferencia de la caja): solo expone el booleano que consume la Toolbar.
 */
export function useShowSteamButton(): { showSteamButton: boolean; setShowSteamButton: (on: boolean) => void } {
  const [showSteamButton, setState] = useState<boolean>(readInitial);
  const ref = useRef(showSteamButton);

  useEffect(() => {
    ref.current = showSteamButton;
  }, [showSteamButton]);

  // Re-lee cuando cambia en otra instancia (evento local) o al hidratar desde la nube.
  useEffect(() => {
    const sync = () => setState(readInitial());
    window.addEventListener(STEAM_BUTTON_CHANGED_EVENT, sync);
    window.addEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    return () => {
      window.removeEventListener(STEAM_BUTTON_CHANGED_EVENT, sync);
      window.removeEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    };
  }, []);

  const setShowSteamButton = useCallback((on: boolean) => {
    setState(on);
    try {
      localStorage.setItem(STEAM_BUTTON_KEY, on ? 'on' : 'off');
    } catch {
      // Sin persistencia: se aplica en la sesión actual.
    }
    persistShowSteamButtonPreference(on); // replica a la nube si hay sesión (best-effort)
    window.dispatchEvent(new Event(STEAM_BUTTON_CHANGED_EVENT));
  }, []);

  return { showSteamButton, setShowSteamButton };
}
