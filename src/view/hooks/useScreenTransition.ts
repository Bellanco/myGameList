import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Clase que dispara la entrada (`_motion.scss`). Se pone y se quita; nunca se queda puesta. */
const ENTER_CLASS = 'screen-enter';

/**
 * ENTRADA SUAVE DE LA PANTALLA al cambiar de camino.
 *
 * Devuelve una `ref` que hay que colgar del contenedor de la pantalla (el `<main>`): cada vez que cambia `key`
 * —el `pathname`— le pone la clase de entrada, y se la quita al terminar la animación.
 *
 * POR QUÉ ASÍ Y NO CON UN `key` DE REACT. La forma corta de animar un cambio de ruta es darle al contenedor un
 * `key` que cambie con el camino, pero eso lo DESMONTA y lo vuelve a montar: se pierde el estado de la pantalla,
 * el `lazy` vuelve a pasar por su `Suspense` y el listado virtualizado rehace todas sus medidas. Aquí el árbol
 * no se toca; lo único que cambia es una clase en un elemento que ya está.
 *
 * EL REINICIO DE LA ANIMACIÓN es el `offsetWidth` de en medio. Sin él, ir de `/completados` a `/en-curso`
 * mientras la animación anterior sigue viva no la reinicia (la clase ya estaba puesta y para el navegador no ha
 * cambiado nada), así que la segunda pantalla entraría sin animar. Leer una propiedad de disposición fuerza el
 * recálculo y con él el reinicio. Es un reflujo por navegación, en un instante en el que el navegador va a
 * recalcular la disposición de todos modos.
 *
 * `useLayoutEffect` y no `useEffect`: la clase tiene que estar puesta ANTES de que el navegador pinte el
 * contenido nuevo, o el primer fotograma se ve ya opaco y en su sitio y la animación arranca desde ahí, dando
 * un parpadeo en vez de una entrada.
 *
 * El respeto a `prefers-reduced-motion` no se comprueba aquí: la regla que anima vive dentro de un
 * `@media (prefers-reduced-motion: no-preference)`, así que con menos movimiento la clase no hace nada y el
 * `animationend` no llega (de ahí el `setTimeout` de seguridad, que es quien la retira en ese caso).
 */
export function useScreenTransition<T extends HTMLElement>(key: string): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.classList.remove(ENTER_CLASS);
    void el.offsetWidth;
    el.classList.add(ENTER_CLASS);

    const quitar = (): void => el.classList.remove(ENTER_CLASS);
    el.addEventListener('animationend', quitar, { once: true });
    // Red de seguridad, y el camino normal cuando no hay animación (menos movimiento, o una pestaña en segundo
    // plano donde el navegador no la ejecuta): sin esto la clase se quedaría puesta para siempre.
    const temporizador = window.setTimeout(quitar, 600);

    return () => {
      window.clearTimeout(temporizador);
      el.removeEventListener('animationend', quitar);
    };
  }, [key]);

  return ref;
}
