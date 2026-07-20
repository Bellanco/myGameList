import { useCallback, useEffect, useRef, useState } from 'react';
import { EFFECTS_KEY } from '../../core/constants/storageKeys';
import { APPEARANCE_HYDRATED_EVENT, persistEffectsPreference } from '../../model/repository/appearancePreferenceRepository';

/** Evento in-page para sincronizar todas las instancias de `useEffects` (App + Ajustes). */
const EFFECTS_CHANGED_EVENT = 'app:effects-changed';

/** Preferencia inicial: 'off' guardado → efectos desactivados; cualquier otra cosa (incl. ausencia) → activados. */
function readInitial(): boolean {
  try {
    return localStorage.getItem(EFFECTS_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Aplica la preferencia al `<html>` vía `data-effects`. Los efectos CSS cuelgan de `:root[data-effects="on"]`,
 * así que SOLO fijamos el atributo cuando están activados; al desactivar lo retiramos (ninguna regla de efecto
 * casa → todo en reposo). Como los efectos son decorativos no hace falta anti-flash: en ausencia del atributo
 * no se pintan, por lo que quien los desactiva nunca ve un "flash" de efectos al cargar.
 */
function apply(on: boolean): void {
  const root = document.documentElement;
  if (on) {
    root.setAttribute('data-effects', 'on');
  } else {
    root.removeAttribute('data-effects');
  }
}

/**
 * F1 — Preferencia de EFECTOS visuales animados de los temas (barridos, glitch, parpadeo CRT, deriva de
 * texturas, estrellas fugaces…), común a todos los temas. Persiste en local y se replica a la nube si hay
 * sesión. Se monta una vez en App (aplica el atributo y reacciona a la hidratación) y lo usa también el
 * selector de Ajustes; ambas instancias se sincronizan por evento.
 */
export function useEffects(): { effects: boolean; toggle: () => void; setEffects: (on: boolean) => void } {
  const [effects, setState] = useState<boolean>(readInitial);
  const ref = useRef(effects);

  useEffect(() => {
    ref.current = effects;
    apply(effects);
  }, [effects]);

  // Re-lee cuando cambia en otra instancia (evento local) o al hidratar desde la nube.
  useEffect(() => {
    const sync = () => setState(readInitial());
    window.addEventListener(EFFECTS_CHANGED_EVENT, sync);
    window.addEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    return () => {
      window.removeEventListener(EFFECTS_CHANGED_EVENT, sync);
      window.removeEventListener(APPEARANCE_HYDRATED_EVENT, sync);
    };
  }, []);

  const setEffects = useCallback((on: boolean) => {
    setState(on);
    try {
      localStorage.setItem(EFFECTS_KEY, on ? 'on' : 'off');
    } catch {
      // Sin persistencia: se aplica en la sesión actual.
    }
    persistEffectsPreference(on); // replica a la nube si hay sesión (best-effort)
    window.dispatchEvent(new Event(EFFECTS_CHANGED_EVENT));
  }, []);

  const toggle = useCallback(() => setEffects(!ref.current), [setEffects]);

  return { effects, toggle, setEffects };
}
