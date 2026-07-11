import { useCallback, useEffect, useRef, useState } from 'react';
import { UPPERCASE_KEY } from '../../core/constants/storageKeys';
import { APPEARANCE_HYDRATED_EVENT, persistUppercasePreference } from '../../model/repository/appearancePreferenceRepository';

/** Evento in-page para sincronizar todas las instancias de `useUppercase` (App + Ajustes). */
const UPPERCASE_CHANGED_EVENT = 'app:uppercase-changed';

/** Preferencia inicial de caja: 'on' guardado → mayúsculas; cualquier otra cosa → caja normal (por defecto). */
function readInitial(): boolean {
  try {
    return localStorage.getItem(UPPERCASE_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Aplica la preferencia al `<html>` vía `data-uppercase` (misma lógica que `public/theme-init.js`). */
function apply(on: boolean): void {
  const root = document.documentElement;
  if (on) {
    root.setAttribute('data-uppercase', 'on');
  } else {
    root.removeAttribute('data-uppercase');
  }
}

/**
 * F1 — Preferencia de CAJA del texto de interfaz (mayúsculas sí/no), común a todos los temas. Persiste en local
 * y se replica a la nube si hay sesión. Se monta una vez en App (aplica el atributo y reacciona a la hidratación)
 * y lo usa también el selector de Ajustes; ambas instancias se sincronizan por evento.
 */
export function useUppercase(): { uppercase: boolean; toggle: () => void; setUppercase: (on: boolean) => void } {
  const [uppercase, setState] = useState<boolean>(readInitial);
  const ref = useRef(uppercase);

  useEffect(() => {
    ref.current = uppercase;
    apply(uppercase);
  }, [uppercase]);

  // Re-lee cuando cambia en otra instancia (evento local) o al hidratar desde la nube.
  useEffect(() => {
    const sync = () => setState(readInitial());
    window.addEventListener(UPPERCASE_CHANGED_EVENT, sync);
    window.addEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    return () => {
      window.removeEventListener(UPPERCASE_CHANGED_EVENT, sync);
      window.removeEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    };
  }, []);

  const setUppercase = useCallback((on: boolean) => {
    setState(on);
    try {
      localStorage.setItem(UPPERCASE_KEY, on ? 'on' : 'off');
    } catch {
      // Sin persistencia: se aplica en la sesión actual.
    }
    persistUppercasePreference(on); // replica a la nube si hay sesión (best-effort)
    window.dispatchEvent(new Event(UPPERCASE_CHANGED_EVENT));
  }, []);

  const toggle = useCallback(() => setUppercase(!ref.current), [setUppercase]);

  return { uppercase, toggle, setUppercase };
}
