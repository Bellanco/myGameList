import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** Lo que hay que mover el dedo para decidir el eje del gesto. */
const UMBRAL_EJE_PX = 10;
/** A partir de qué fracción del ancho, al soltar, se cierra aunque el gesto haya sido lento. */
const FRACCION_CIERRE = 0.3;
/** A partir de qué velocidad (px/ms), al soltar, se cierra aunque se haya llevado poco. */
const VELOCIDAD_CIERRE = 0.6;
/** Lo que dura la transición de cierre (`.is-gesto` en `styles/gameSheet.scss`). */
const CIERRE_MS = 220;
/** Lo que se espera a quitar `.is-gesto` tras volver a su sitio: un pelo más que la transición. */
const VUELTA_MS = 240;

/** Los manejadores de puntero que hay que poner en el panel. */
export interface SwipeToCloseHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}

/**
 * DESLIZAR HACIA LA DERECHA PARA CERRAR (F0.17), como una hoja de Android o iOS pero en horizontal: el panel vuelve
 * por donde vino. Así no se lee como una pantalla nueva, y el scroll vertical de la ficha queda intacto.
 *
 *  · Solo con el dedo o el lápiz (`pointerType`): con el ratón estorbaría al seleccionar texto en escritorio.
 *  · El eje se decide en los primeros 10 px: horizontal y hacia la derecha es del panel; vertical es del scroll, que
 *    se lo queda el navegador (`touch-action: pan-y` en la hoja).
 *  · Lo que se desplaza en horizontal (la tira de la saga) se respeta: si el gesto empieza ahí y la tira aún puede
 *    moverse hacia ese lado, se mueve la tira.
 *  · Al soltar se cierra con más de un 30 % del ancho o con un gesto rápido; si no, vuelve a su sitio. Con «reducir
 *    movimiento», sin transición.
 *  · El gesto de «atrás» del sistema desde el borde (iOS, Android) también cierra: quita el `?juego=` de la URL.
 */
export function useSwipeToClose(panelRef: RefObject<HTMLElement | null>, onClose: () => void): SwipeToCloseHandlers {
  const gesto = useRef<{ x: number; y: number; t: number; eje: 'x' | 'y' | null; id: number } | null>(null);

  const devolver = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transform = '';
    window.setTimeout(() => panel.classList.remove('is-gesto'), VUELTA_MS);
  }, [panelRef]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse') return;
    for (let nodo = event.target as HTMLElement | null; nodo && nodo !== event.currentTarget; nodo = nodo.parentElement) {
      if (nodo.scrollWidth > nodo.clientWidth + 1 && nodo.scrollLeft > 0 && getComputedStyle(nodo).overflowX !== 'visible') return;
    }
    gesto.current = { x: event.clientX, y: event.clientY, t: event.timeStamp, eje: null, id: event.pointerId };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const actual = gesto.current;
    const panel = panelRef.current;
    if (!actual || !panel || event.pointerId !== actual.id) return;
    const dx = event.clientX - actual.x;
    const dy = event.clientY - actual.y;
    if (!actual.eje) {
      if (Math.abs(dx) < UMBRAL_EJE_PX && Math.abs(dy) < UMBRAL_EJE_PX) return;
      actual.eje = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (actual.eje === 'x') {
        // Puede fallar si el puntero ya no está (se levantó entre medias): el gesto sigue igual sin la captura.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* sin captura */
        }
        panel.classList.add('is-gesto', 'is-arrastrando');
      }
    }
    if (actual.eje === 'x') panel.style.transform = `translateX(${Math.max(0, dx)}px)`;
  }, [panelRef]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const actual = gesto.current;
    const panel = panelRef.current;
    gesto.current = null;
    if (!actual || !panel || actual.eje !== 'x') return;
    panel.classList.remove('is-arrastrando');
    const dx = Math.max(0, event.clientX - actual.x);
    const velocidad = dx / Math.max(1, event.timeStamp - actual.t);
    if (dx > panel.offsetWidth * FRACCION_CIERRE || velocidad > VELOCIDAD_CIERRE) {
      const sinMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      panel.style.transform = 'translateX(100%)';
      window.setTimeout(onClose, sinMovimiento ? 0 : CIERRE_MS);
    } else {
      devolver();
    }
  }, [panelRef, onClose, devolver]);

  const onPointerCancel = useCallback(() => {
    const actual = gesto.current;
    gesto.current = null;
    if (actual?.eje === 'x') {
      panelRef.current?.classList.remove('is-arrastrando');
      devolver();
    }
  }, [panelRef, devolver]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
