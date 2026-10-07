import { useEffect } from 'react';

/** Cuánto dura cada pulso. Seis pulsos dan un ciclo de 12 s, que es el ritmo de los destellos de los temas. */
export const PULSE_SLOT_MS = 2000;
export const PULSE_SLOTS = 6;
/**
 * El primero que se marca. No es el 0 a propósito: el 0 lanza el glitch de los títulos y, empezando por él, la
 * aplicación recibiría a cada visita con un título roto. Y no es el 1 ni el 2 porque el brillo de «Sol y luna»
 * ocupa del 0 al 2: entrar a mitad cortaría la respiración en seco.
 */
const FIRST_SLOT = 3;

/**
 * EL RELOJ DE LOS DESTELLOS de los temas: escribe `data-pulso="0…5"` en <html> y lo avanza cada 2 s.
 *
 * POR QUÉ EXISTE. Los glitch de «Sin futuro» y de «Solo hay guerra» recortan con `clip-path` y desdoblan con
 * `text-shadow`, y el brillo de «Sol y luna» anima un `drop-shadow`: nada de eso lo mueve el compositor. Eran
 * animaciones infinitas que solo se VEN un instante cada 11-14 s, pero mientras existe una sola, el navegador
 * recorre estilo, maquetación y pintado en CADA fotograma: medido el 07-10-2026 en el feed social (Playwright,
 * Chrome con GPU real), 1,4-1,9 s de hilo principal cada 10 s en reposo frente a 0,1-0,2 s del tema por defecto.
 * Con el reloj, el CSS de cada tema lanza el mismo destello de UNA vez cuando le toca su pulso, y entre destellos
 * no queda ninguna animación viva.
 *
 * NO SABE DE TEMAS: marca el pulso y ya. Qué destella en cada uno lo decide cada `themes/<id>/<id>.scss` con
 * `:root[data-pulso="N"]`, igual que el piloto rojo de la barra o las estrellas fugaces deciden lo suyo. Solo
 * corre con los efectos encendidos y sin «reducir movimiento»; si no, quita el atributo y no se lanza nada.
 */
export function useEffectPulses(): void {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setInterval> | null = null;
    let slot = FIRST_SLOT;

    const tick = (): void => {
      root.setAttribute('data-pulso', String(slot));
      slot = (slot + 1) % PULSE_SLOTS;
    };

    function stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      root.removeAttribute('data-pulso');
    }

    function start(): void {
      if (timer || reduce.matches || root.getAttribute('data-effects') !== 'on') return;
      slot = FIRST_SLOT;
      tick();
      timer = setInterval(tick, PULSE_SLOT_MS);
    }

    const restart = (): void => {
      stop();
      start();
    };

    // Solo `data-effects`: el propio `data-pulso` también es un atributo de <html>, y escucharlo reiniciaría el
    // reloj en cada pulso.
    const obs = new MutationObserver(restart);
    obs.observe(root, { attributes: true, attributeFilter: ['data-effects'] });
    reduce.addEventListener('change', restart);
    start();

    return () => {
      obs.disconnect();
      reduce.removeEventListener('change', restart);
      stop();
    };
  }, []);
}
