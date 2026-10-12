import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FALLBACK_ROUTE } from '../../core/constants/routes';

/**
 * ¿ES ESTA LA PRIMERA PÁGINA DE LA PESTAÑA? El router apunta en `history.state` la posición de cada entrada (`idx`),
 * y las redirecciones del arranque la reemplazan sin moverla: 0 es haber abierto la dirección tal cual —un enlace
 * pegado en un chat, un marcador—, y cualquier navegación dentro de la aplicación la sube.
 */
export function enteredDirectly(): boolean {
  if (typeof window === 'undefined') return false;
  const state = window.history.state as { idx?: unknown } | null;
  return state?.idx === 0;
}

/**
 * LA RESEÑA QUE NO SE PUEDE VER, ABIERTA DESDE FUERA (12-10-2026). La forma buena de compartir una reseña es su
 * enlace público (`/r/…`), pero nada impide copiar la barra de direcciones. Quien abre esa dirección en su
 * navegador no ve la reseña —no es suya, no es su amigo o no tiene lo social— y se quedaba en una pantalla vacía,
 * en la pasarela o en «ya no está disponible». Se le lleva a la página principal, sin aviso (decisión del usuario).
 *
 * Solo en entrada directa: dentro de la aplicación, una actividad que ya no existe (un amigo la borró) sigue
 * diciéndolo en su sitio, que es donde se pulsó. `unavailable` tiene que ser DEFINITIVO: con la biblioteca o el
 * directorio todavía cargando, quien llama dice `false`, o se echaría al dueño de su propia reseña.
 */
export function useUnavailableReviewRedirect(unavailable: boolean): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!unavailable || !enteredDirectly()) return;
    void navigate(FALLBACK_ROUTE, { replace: true });
  }, [unavailable, navigate]);
}
