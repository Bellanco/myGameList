import { useCallback, useEffect } from 'react';
import { uppercasePreference } from './preferences';
import { usePreference } from './usePreference';

/**
 * F1 — Preferencia de CAJA del texto de interfaz (mayúsculas sí/no), común a todos los temas. Persiste en local
 * y se replica a la nube si hay sesión. Se monta una vez en App (que aplica el atributo al `<html>`) y lo usa
 * también el selector de Ajustes; todas las instancias comparten el store, así que se sincronizan solas.
 */
export function useUppercase(): { uppercase: boolean; toggle: () => void; setUppercase: (on: boolean) => void } {
  const uppercase = usePreference(uppercasePreference);

  // Por si localStorage cambió entre el anti-flash (`theme-init.js`) y el montaje.
  useEffect(() => { uppercasePreference.apply(); }, []);

  const setUppercase = useCallback((on: boolean) => uppercasePreference.set(on), []);
  const toggle = useCallback(() => uppercasePreference.set(!uppercasePreference.get()), []);

  return { uppercase, toggle, setUppercase };
}
