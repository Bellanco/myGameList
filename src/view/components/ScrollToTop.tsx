import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { UI_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';

// Píxeles mínimos de desplazamiento antes de ofrecer "volver arriba" (no aparece cerca del inicio).
const THRESHOLD = 400;
// Umbral de dirección: ignora micro-variaciones para no encender/apagar por jitter.
const DIRECTION_EPS = 4;
// Se auto-oculta si dejas de subir (discreto). Amplio para poder alcanzar el botón con el dedo.
const IDLE_HIDE_MS = 2600;

/**
 * Botón flotante "volver arriba" — modo "aparece al subir" (opción B).
 *
 * Solo se muestra cuando el usuario empieza a hacer scroll HACIA ARRIBA (que es cuando quiere volver
 * arriba) y se oculta al bajar, al parar (IDLE_HIDE_MS) o al llegar cerca del inicio. Lleva al principio
 * del contenedor que se está desplazando (ventana o contenedor anidado, igual que FloatingControls).
 *
 * Robustez multi-motor: la dirección solo se calcula entre eventos CONSECUTIVOS del MISMO scroller. Al
 * cambiar de scroller (p. ej. de la página a un carrusel horizontal, cuyo scrollTop es constante) se
 * reinicia sin decidir. Sin esto, los scrollers horizontales hacían parpadear el botón (visible en Firefox).
 */
export const ScrollToTop = memo(function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const scrollerRef = useRef<HTMLElement | Window>(typeof window !== 'undefined' ? window : (null as unknown as Window));
  // Scroller y posición del último evento procesado (para calcular la dirección por-scroller).
  const lastScrollerRef = useRef<EventTarget | Window | null>(null);
  const lastTopRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let raf = 0;

    const clearHide = () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
    const scheduleHide = () => {
      clearHide();
      hideTimerRef.current = setTimeout(() => setVisible(false), IDLE_HIDE_MS);
    };

    const onScroll = (event: Event) => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;

        const target = event.target;
        let scroller: HTMLElement | Window;
        let top: number;
        if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
          scroller = target;
          top = target.scrollTop;
        } else {
          scroller = window;
          top = window.scrollY || document.documentElement.scrollTop || 0;
        }
        scrollerRef.current = scroller;

        // Cambio de scroller: reinicia la referencia sin decidir dirección (evita el parpadeo con
        // scrollers horizontales, cuyo scrollTop es 0/constante y daría deltas enormes al alternar).
        if (scroller !== lastScrollerRef.current) {
          lastScrollerRef.current = scroller;
          lastTopRef.current = top;
          return;
        }

        const delta = top - lastTopRef.current;
        lastTopRef.current = top;

        if (top <= THRESHOLD) {
          clearHide();
          setVisible(false);
          return;
        }
        if (delta < -DIRECTION_EPS) {
          // Intención de subir → mostrar y programar el auto-ocultado.
          setVisible(true);
          scheduleHide();
        } else if (delta > DIRECTION_EPS) {
          // Bajando → ocultar de inmediato.
          clearHide();
          setVisible(false);
        }
      });
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      if (raf) window.cancelAnimationFrame(raf);
      clearHide();
    };
  }, []);

  const toTop = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller instanceof Window) window.scrollTo({ top: 0, behavior: 'smooth' });
    else scroller.scrollTo({ top: 0, behavior: 'smooth' });
    setVisible(false);
  }, []);

  return (
    <button
      type="button"
      className={`scroll-top-btn ${visible ? 'is-visible' : ''}`.trim()}
      aria-label={UI_MESSAGES.scrollTop}
      title={UI_MESSAGES.scrollTop}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      onClick={toTop}
    >
      <Icon name="chevron-up" className="ui-icon" />
    </button>
  );
});
