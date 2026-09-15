import { useCallback } from 'react';
import { coversPreference } from './preferences';
import { usePreference } from './usePreference';

/**
 * Carátulas de los juegos: encendidas o apagadas. Persiste en local y se replica a la nube si hay sesión, como
 * el resto de la apariencia.
 *
 * APAGADA POR DEFECTO, y no es un detalle de gusto: mientras esté apagada no se pide ni una imagen, así que el
 * servidor no llega a preguntarle a IGDB por ningún título tuyo. Encenderla es lo que da esa autorización.
 */
export function useCovers(): { covers: boolean; setCovers: (on: boolean) => void } {
  const covers = usePreference(coversPreference);
  const setCovers = useCallback((on: boolean) => coversPreference.set(on), []);
  return { covers, setCovers };
}
