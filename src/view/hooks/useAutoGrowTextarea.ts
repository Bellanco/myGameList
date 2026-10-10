import { useLayoutEffect, type RefObject } from 'react';

/**
 * Autocrecimiento de un `<textarea>`: parte de una línea (`rows={1}`) y se estira con el contenido, tanto al saltar
 * de línea como al desbordar por ancho. El tope lo pone el CSS (`max-height`), y solo a partir de ahí hay scroll.
 *
 * POR QUÉ NO BASTA CON `height = scrollHeight` (10-10-2026). El compositor del feed sacaba barra de scroll vacío:
 * - La caja es `border-box` y `scrollHeight` no cuenta el borde: la altura quedaba corta por esos 2 px.
 * - `scrollHeight` y `clientHeight` son enteros redondeados. Con `line-height: normal` una línea mide 47,45 px y
 *   `scrollHeight` dice 45 + borde = 47: sigue sobrando casi medio píxel, y eso ya saca la barra.
 * Así que se suma el borde y, además, el scroll solo se enciende cuando el tope del CSS corta de verdad.
 */
export function useAutoGrowTextarea(ref: RefObject<HTMLTextAreaElement | null>, text: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const height = el.scrollHeight + el.offsetHeight - el.clientHeight;
    el.style.height = `${height}px`;
    // `max-height: none` da NaN y la comparación es falsa: sin tope, nunca hay scroll.
    el.style.overflowY = height > parseFloat(getComputedStyle(el).maxHeight) ? 'auto' : 'hidden';
  }, [ref, text]);
}
