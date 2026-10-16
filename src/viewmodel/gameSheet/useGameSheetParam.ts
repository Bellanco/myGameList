import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GAME_SHEET_PARAM, gameSheetSlug } from '../../core/utils/gameSheetPath';

/**
 * La marca que deja en el `state` de la navegación la entrada que abrió la ficha. Sirve para dos cosas:
 *  · saber al cerrar si se puede volver atrás (la abrió la app) o hay que quitar el parámetro (se llegó con la URL
 *    ya puesta: un enlace, una recarga);
 *  · que `useScrollOnNavigate` no suba al principio de la página al abrirla: la lista de debajo se queda donde está.
 */
export const GAME_SHEET_STATE = 'gameSheet';

type EstadoConFicha = Record<string, unknown> & { [GAME_SHEET_STATE]?: boolean };

function estadoDe(state: unknown): EstadoConFicha {
  return state && typeof state === 'object' ? (state as EstadoConFicha) : {};
}

/** Qué ficha está abierta y cómo abrir otra o cerrarla. */
export interface GameSheetParam {
  /** La clave de la ficha abierta (`?juego=`), o `''` si no hay ninguna. */
  slug: string;
  openSheet: (name: string) => void;
  closeSheet: () => void;
}

/**
 * LA FICHA VIVE EN LA URL, en `?juego=<clave>` sobre la pantalla en la que se esté (F0.1):
 *  · abrir hace *push*, así que «atrás» la cierra (también el gesto de «atrás» del sistema en el móvil);
 *  · pasar de una ficha a otra (la saga) hace *replace*: «atrás» vuelve siempre a la lista, no recorre las fichas
 *    vistas (F0.9);
 *  · cerrar con la X, Esc o pulsando fuera vuelve atrás si la entrada la puso la app, y si se llegó con la URL ya
 *    puesta quita el parámetro sin crear otra entrada.
 *
 * El parámetro no cambia el `pathname`, así que no dispara la View Transition de cambio de pantalla.
 */
export function useGameSheetParam(): GameSheetParam {
  const location = useLocation();
  const navigate = useNavigate();
  const slug = useMemo(() => new URLSearchParams(location.search).get(GAME_SHEET_PARAM) || '', [location.search]);

  const openSheet = useCallback((name: string) => {
    const destino = gameSheetSlug(name);
    if (!destino) return;
    const params = new URLSearchParams(location.search);
    const yaAbierta = Boolean(params.get(GAME_SHEET_PARAM));
    if (params.get(GAME_SHEET_PARAM) === destino) return;
    params.set(GAME_SHEET_PARAM, destino);
    const estado = estadoDe(location.state);
    void navigate(
      { pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash },
      {
        replace: yaAbierta,
        state: { ...estado, [GAME_SHEET_STATE]: yaAbierta ? Boolean(estado[GAME_SHEET_STATE]) : true },
      },
    );
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  const closeSheet = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.get(GAME_SHEET_PARAM)) return;
    const estado = estadoDe(location.state);
    if (estado[GAME_SHEET_STATE]) {
      void navigate(-1);
      return;
    }
    params.delete(GAME_SHEET_PARAM);
    const search = params.toString();
    const { [GAME_SHEET_STATE]: _marca, ...resto } = estado;
    void navigate(
      { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
      { replace: true, state: Object.keys(resto).length ? resto : null },
    );
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  return { slug, openSheet, closeSheet };
}
