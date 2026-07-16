import { memo, useEffect, useRef, useState } from 'react';
import { UI_MESSAGES } from '../../core/constants/labels';
import { Icon } from './Icon';

const THRESHOLD = 400;

/**
 * Botón flotante "volver arriba". Aparece al desplazar (umbral) y lleva al principio del contenedor
 * que se está desplazando (ventana o contenedor anidado, igual que FloatingControls). Temático y
 * oculto en móvil (para no estorbar).
 */
export const ScrollToTop = memo(function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const scrollerRef = useRef<HTMLElement | Window>(typeof window !== 'undefined' ? window : (null as unknown as Window));

  useEffect(() => {
    let raf = 0;
    const onScroll = (event: Event) => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const target = event.target;
        let top = 0;
        if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
          top = target.scrollTop;
          scrollerRef.current = target;
        } else {
          top = window.scrollY || document.documentElement.scrollTop || 0;
          scrollerRef.current = window;
        }
        setVisible(top > THRESHOLD);
      });
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const toTop = () => {
    const scroller = scrollerRef.current;
    if (scroller instanceof Window) window.scrollTo({ top: 0, behavior: 'smooth' });
    else scroller.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!visible) return null;

  return (
    <button type="button" className="scroll-top-btn" aria-label={UI_MESSAGES.scrollTop} title={UI_MESSAGES.scrollTop} onClick={toTop}>
      <Icon name="chevron-up" className="ui-icon" />
    </button>
  );
});
