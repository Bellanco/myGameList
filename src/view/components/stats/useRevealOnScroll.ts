import { useEffect, type RefObject } from 'react';

/** Margen inferior: la tarjeta se destapa un poco antes de asomar, para que el gesto no llegue tarde. */
const ROOT_MARGIN = '0px 0px -12% 0px';

/**
 * Destapa las tarjetas del panel a medida que se llega a ellas, en vez de animarlas todas al montar.
 *
 * El panel es más alto que la pantalla, así que con las animaciones lanzadas en el montaje media pantalla ya se
 * había "cargado" sin que nadie la viera: al desplazarse aparecían quietas. Aquí cada tarjeta espera su turno,
 * y sus gráficos con ella —el CSS mantiene en pausa las animaciones de dentro hasta que la tarjeta entra—, así
 * que las barras crecen y los aros giran justo cuando se miran.
 *
 * La marca `is-watching` la pone este hook y no el CSS a propósito: si el observador no existe o el usuario
 * pide menos movimiento, no se llega a poner y todo queda visible desde el primer pintado. Nada depende de que
 * el JavaScript llegue a tiempo.
 */
export function useRevealOnScroll(root: RefObject<HTMLElement | null>, resetKey: unknown): void {
  useEffect(() => {
    const node = root.current;
    if (!node || typeof IntersectionObserver !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    node.classList.add('is-watching');

    /**
     * Destapa todo lo que YA se ha alcanzado, no solo lo que ahora mismo se cruza.
     *
     * Un salto de scroll —la tecla Fin, un ancla, la posición restaurada al recargar— mueve la página varias
     * pantallas entre dos fotogramas, y las tarjetas que la atraviesan en ese salto nunca llegan a "intersecar":
     * el observador no las notifica y se quedaban invisibles para siempre, porque están a opacidad cero. Con un
     * barrido por posición, cualquier tarjeta cuyo borde superior haya pasado del pie de la pantalla se
     * destapa, la haya visto el observador o no.
     */
    const revealReached = (observer: IntersectionObserver) => {
      let pending = 0;
      for (const child of node.children) {
        if (child.classList.contains('is-in')) continue;
        if (child.getBoundingClientRect().top < window.innerHeight) {
          child.classList.add('is-in');
          observer.unobserve(child);
        } else {
          pending += 1;
        }
      }
      if (pending === 0) observer.disconnect();
    };

    const observer = new IntersectionObserver(() => revealReached(observer), {
      rootMargin: ROOT_MARGIN,
      threshold: 0.06,
    });

    for (const child of node.children) observer.observe(child);

    return () => {
      observer.disconnect();
      node.classList.remove('is-watching');
      for (const child of node.children) child.classList.remove('is-in');
    };
  }, [root, resetKey]);
}
