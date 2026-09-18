import { memo, useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';
import type { AppSection } from './BottomNavigation';

const SCROLL_HIDE_THRESHOLD = 24;

interface FloatingControlsProps {
  /** Solo para volver a mirar el scroll al cambiar de pantalla; ver la nota del efecto. */
  activeSection: AppSection;
}

/**
 * Control flotante de la esquina superior derecha (diseño "headerless": sin barra ni título).
 *
 * QUEDA SOLO EL CAMBIO DE TEMA, y eso es lo que hace que esconderlo sea legítimo. Aquí vivieron también Ajustes
 * y Cuenta, con la misma forma que este botón: nada distinguía lo que CAMBIA algo en el sitio de lo que LLEVA a
 * otra pantalla, y el grupo entero se oculta al hacer scroll —con `pointer-events: none`—, así que dos secciones
 * de la aplicación desaparecían a mitad de página. Las dos viven ahora en la pestaña de Ajustes; un control que
 * se esconde mientras lees no se lleva por delante ningún destino.
 */
/** Lo que hay desplazado ahora mismo, mire quien mire: el documento o un contenedor anidado. */
function scrollTopOf(target: EventTarget | null): number {
  if (target instanceof HTMLElement && target !== document.documentElement && target !== document.body) {
    return target.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export const FloatingControls = memo(function FloatingControls({ activeSection }: FloatingControlsProps) {
  const [hidden, setHidden] = useState(false);

  /**
   * AL CAMBIAR DE SECCIÓN SE VUELVE A MIRAR, y no es un adorno: el ocultado solo se recalculaba con un evento de
   * scroll, así que el estado de una pantalla se colaba en la siguiente. Bajabas en Listados —el control se
   * esconde, que es lo que se quiere—, cambiabas de pantalla y la nueva aparecía arriba del todo pero con el
   * control todavía invisible y, por `pointer-events: none`, imposible de pulsar. El clic se lo comía lo que
   * hubiera debajo, que es justo lo que cazó el CI («main intercepts pointer events», veinticinco segundos
   * seguidos).
   *
   * En un `requestAnimationFrame` porque hay que leer el scroll DESPUÉS de pintar la pantalla nueva: si es más
   * corta, el navegador ajusta la posición él solo y sin disparar nada que este componente pueda oír.
   */
  useEffect(() => {
    const mirar = (): void => setHidden(scrollTopOf(null) > SCROLL_HIDE_THRESHOLD);
    mirar();
    const raf = window.requestAnimationFrame(mirar);
    return () => window.cancelAnimationFrame(raf);
  }, [activeSection]);

  useEffect(() => {
    let raf = 0;
    const onScroll = (event: Event) => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setHidden(scrollTopOf(event.target) > SCROLL_HIDE_THRESHOLD);
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
