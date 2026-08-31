import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isKnownRoute } from '../../core/constants/routes';

/** Lo que una pantalla guarda en el `state` de la navegación para saber a dónde vuelve. */
interface ReturnState {
  from?: string;
}

/**
 * "Volver" que apunta al ORIGEN y no a una pantalla fija.
 *
 * Una pantalla a la que se llega desde varios sitios (la bandeja se abre desde ajustes, desde el estado vacío de
 * un listado y al terminar una importación) no puede tener el botón de volver cableado a una ruta: quien entró
 * desde un listado acababa en ajustes. El origen viaja en el `state` de la navegación —que react-router guarda
 * en el historial del navegador, así que sobrevive a una recarga, cosa que un estado en memoria no haría—.
 *
 * El origen se VALIDA contra la tabla de rutas: un `state` manipulado o de una versión anterior de la app no
 * puede mandar a nadie a un camino que ya no existe (rebotaría al fallback global), y una pantalla nunca
 * "vuelve" a sí misma.
 *
 * @param fallback Ruta de vuelta cuando no hay origen (entrada directa por URL, marcador, recarga sin state).
 */
export function useReturnTo(fallback: string): {
  /** Ruta a la que debe llevar el botón de volver. */
  returnTo: string;
  /** Navega a `to` recordando la pantalla ACTUAL como origen de su "Volver". */
  navigateFromHere: (to: string) => void;
} {
  const location = useLocation();
  const navigate = useNavigate();

  const from = (location.state as ReturnState | null)?.from;
  const returnTo = typeof from === 'string' && from !== location.pathname && isKnownRoute(from) ? from : fallback;

  const navigateFromHere = useCallback(
    (to: string) => navigate(to, { state: { from: location.pathname } satisfies ReturnState }),
    [navigate, location.pathname],
  );

  return { returnTo, navigateFromHere };
}
