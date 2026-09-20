import { useEffect, useState } from 'react';

/**
 * DÓNDE EMPIEZA UNA PANTALLA de la porra dentro de la página, en píxeles.
 *
 * Es lo único que hay que medir para que la pantalla ocupe el hueco que le queda: el alto lo termina de calcular
 * la hoja de estilos con `100dvh` menos esta posición y menos lo que el armazón tiene reservado abajo. Y el
 * armazón ya publica sus medidas —`--bottom-nav-h` la barra inferior y `--consent-h` el aviso de la analítica,
 * las dos con su propio `ResizeObserver`—, así que cuando la barra se apila o el aviso aparece, el hueco se
 * recalcula solo sin que estos componentes se enteren de nada.
 *
 * Hubo una versión que calculaba el alto entero en JavaScript y restaba el relleno del contenedor. Fallaba por
 * abajo: ese relleno no es lo único que hay debajo (la sección tiene el suyo), así que sobraban unos píxeles y
 * aparecía una barra de desplazamiento por muy poco — lo peor de los dos mundos, porque la pantalla ya estaba
 * comprimida para evitarla.
 *
 * Lo usan la VOTACIÓN, que reparte ese hueco entre las filas de nominados, y la PORTADA, que centra su cartel
 * en él en vez de quedarse pegada al techo con media pantalla vacía debajo.
 */
export function usePosicionSuperior(ref: React.RefObject<HTMLElement | null>): number | null {
  const [top, setTop] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof window === 'undefined') return;

    const medir = () => {
      // Posición en el DOCUMENTO: con la pantalla ajustada no hay desplazamiento, así que coincide con la del
      // viewport, pero sumarlo la deja bien también en el primer render de una página que llegue desplazada.
      setTop(Math.round(node.getBoundingClientRect().top + window.scrollY));
    };

    medir();
    // Una vuelta después: la primera medida cae antes de que la tipografía asiente la cabecera.
    const raf = requestAnimationFrame(medir);
    window.addEventListener('resize', medir);
    window.visualViewport?.addEventListener('resize', medir);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', medir);
      window.visualViewport?.removeEventListener('resize', medir);
    };
  }, [ref]);

  return top;
}
