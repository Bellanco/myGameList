import { useEffect, useRef, useState } from 'react';

/** Duración del conteo. Lo justo para que se vea subir sin que haya que esperar a leer la cifra. */
const DURATION = 900;

/** Salida suave: rápido al principio y frenando al final (misma curva que las barras del panel). */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Cuenta desde cero hasta `value` al montar. Devuelve el valor en curso para pintarlo.
 *
 * Respeta `prefers-reduced-motion`: quien lo pide recibe la cifra final desde el primer render, sin un solo
 * fotograma de animación. Y si el valor cambia después (se edita un juego con el panel abierto), NO se vuelve a
 * contar: el efecto es de entrada, no un tic constante que distraiga mientras se usa la app.
 */
export function useCountUp(value: number): number {
  const [current, setCurrent] = useState(() => (prefersReducedMotion() ? value : 0));
  const done = useRef(false);

  useEffect(() => {
    if (done.current || prefersReducedMotion()) {
      setCurrent(value);
      done.current = true;
      return;
    }
    done.current = true;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / DURATION, 1);
      setCurrent(value * easeOut(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return current;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
