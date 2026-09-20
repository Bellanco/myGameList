import { useEffect, type RefObject } from 'react';

/**
 * PUBLICA LO QUE MIDE UN AVISO en una ficha CSS, para que el que se aparta se aparte lo que hace falta.
 *
 * El carril de abajo a la izquierda lo comparten varias piezas (la barra inferior, el aviso de logro, el
 * consentimiento, la invitación a instalar) y la de encima tiene que saber cuánto ocupa la de debajo. Eso se
 * escribía a mano en la hoja de estilos —la altura de un banner medida una vez en un escritorio— y esa
 * constante envejecía mal: el banner mide lo que mide su texto, así que en cuanto el párrafo envolvía una línea
 * más (otra anchura, otra fuente, el Linux de CI) el de encima nacía tapado. Aquí se mide de verdad.
 *
 * `ResizeObserver` y no un `resize` de ventana: el aviso también cambia de alto sin que la ventana cambie
 * —cuando acaba de cargar la tipografía, sobre todo—, y eso un `resize` no lo ve. Donde no exista (jsdom), se
 * cae al listener, que cubre el caso que importa.
 *
 * Con `active` en falso no se publica nada, y al dejar de estarlo la ficha se RETIRA: si se quedara puesta, el
 * carril seguiría dejando hueco a un aviso que ya no está.
 */
export function usePublishedHeight(ref: RefObject<HTMLElement | null>, cssVar: `--${string}`, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const publish = (): void => {
      root.style.setProperty(cssVar, `${Math.round(node.getBoundingClientRect().height)}px`);
    };
    publish();

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    if (observer) observer.observe(node);
    else window.addEventListener('resize', publish);

    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', publish);
      root.style.removeProperty(cssVar);
    };
  }, [ref, cssVar, active]);
}
