import { memo, useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

const SCROLL_HIDE_THRESHOLD = 24;

/**
 * Controles flotantes en la esquina superior derecha (diseño "headerless": sin barra ni título).
 * Solo alberga el cambio de tema; la sincronización vive en la ventana de Ajustes.
 * Se ocultan al hacer scroll y reaparecen al volver arriba, para no estorbar la lectura.
 */
export const FloatingControls = memo(function FloatingControls() {
  const [hidden, setHidden] = useState(false);

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
        } else {
          top = window.scrollY || document.documentElement.scrollTop || 0;
        }
        setHidden(top > SCROLL_HIDE_THRESHOLD);
      });
    };

    // Captura para detectar también scrolls en contenedores anidados (p. ej. la tabla).
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`floating-controls ${hidden ? 'is-hidden' : ''}`.trim()}>
      <ThemeToggle />
    </div>
  );
});
