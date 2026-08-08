import { useCallback, useEffect } from 'react';
import { effectsPreference } from './preferences';
import { usePreference } from './usePreference';

/**
 * F1 — Preferencia de EFECTOS visuales animados de los temas (barridos, glitch, parpadeo CRT, deriva de
 * texturas, estrellas fugaces…), común a todos los temas. Persiste en local y se replica a la nube si hay
 * sesión. Se monta una vez en App (que aplica el atributo al `<html>`) y lo usa también el selector de Ajustes.
 */
export function useEffects(): { effects: boolean; toggle: () => void; setEffects: (on: boolean) => void } {
  const effects = usePreference(effectsPreference);

  useEffect(() => { effectsPreference.apply(); }, []);

  const setEffects = useCallback((on: boolean) => effectsPreference.set(on), []);
  const toggle = useCallback(() => effectsPreference.set(!effectsPreference.get()), []);

  return { effects, toggle, setEffects };
}
