import { useCallback } from 'react';
import { itadPreference } from './preferences';
import { usePreference } from './usePreference';

/**
 * La integración con IsThereAnyDeal, encendida o apagada (`itadPreference`). Persiste en local y se replica a la nube
 * si hay sesión. Apagada por defecto: mientras lo esté, no se pregunta a ITAD por nada.
 */
export function useItad(): { itad: boolean; setItad: (on: boolean) => void } {
  const itad = usePreference(itadPreference);
  const setItad = useCallback((on: boolean) => itadPreference.set(on), []);
  return { itad, setItad };
}
