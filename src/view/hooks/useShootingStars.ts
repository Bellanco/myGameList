import { useEffect } from 'react';

/**
 * Estrellas fugaces ALEATORIAS a lo largo del borde de botones y chips, SOLO en la paleta "seaofstars".
 *
 * CSS no puede dar aleatoriedad real: sus `animation-delay` por `nth-child` son deterministas y se ven "en
 * bloque". Este efecto elige AL AZAR el componente, el borde HORIZONTAL (arriba o abajo), la dirección, el
 * color, la longitud y el MOMENTO, y lanza UNA sola estrella cada vez (nunca todas a la vez). Cada estrella es
 * un trazo diminuto y tenue (cabeza de color + estela, en `screen`) que recorre el borde sin salirse y se desvanece.
 *
 * Se activa/desactiva observando `data-palette` en <html> (así no hay que enhebrar la paleta por props) y
 * respeta `prefers-reduced-motion`.
 */
const STAR_COLORS = ['#8ff2e8', '#fff8d6', '#e86fa6']; // turquesa espíritu · crema estelar · rosa atardecer

export function useShootingStars(): void {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;

    const rand = (min: number, max: number): number => min + Math.random() * (max - min);
    const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

    // Botones y chips VISIBLES (con tamaño y dentro del viewport).
    const eligible = (): HTMLElement[] =>
      Array.from(document.querySelectorAll<HTMLElement>('.btn:not(.btn-icon), .chip')).filter((el) => {
        if (el.offsetParent === null) return false;
        const r = el.getBoundingClientRect();
        return r.width > 24 && r.height > 12 && r.bottom > 0 && r.top < window.innerHeight;
      });

    function spawn(): void {
      if (!running) return;
      const els = eligible();
      if (els.length) {
        const el = pick(els);
        const w = el.clientWidth;
        const h = el.clientHeight;
        const edge = pick(['top', 'bottom'] as const); // SOLO horizontal (borde superior/inferior), nunca vertical
        const track = w; // recorre el borde de arriba/abajo → longitud = ancho del componente
        // La estrella NUNCA sale del componente: su longitud CABE en el borde y el recorrido se queda dentro
        // (de 0 a track − len). Así no asoma por fuera.
        const len = Math.min(rand(12, 20), track - 4);
        if (len >= 6) {
          const forward = Math.random() < 0.5; // sentido del recorrido por el borde
          const color = pick(STAR_COLORS);

          const star = document.createElement('span');
          star.dataset.shootingStar = '';
          // Menos brillante: cabeza del color de acento (no blanco puro), halo pequeño y opacidad máx. baja.
          star.style.cssText =
            'position:absolute;pointer-events:none;z-index:2;height:2px;border-radius:2px;opacity:0;mix-blend-mode:screen;' +
            `width:${len}px;left:0;top:${edge === 'top' ? 1 : h - 3}px;` +
            `background-image:linear-gradient(${forward ? '90deg' : '270deg'}, transparent, ${color});` +
            `filter:drop-shadow(0 0 1.5px ${color});`;

          const from = forward ? 0 : track - len; // recorrido CONFINADO dentro del borde
          const to = forward ? track - len : 0;

          el.appendChild(star);
          const anim = star.animate(
            [
              { transform: `translateX(${from}px)`, opacity: 0 },
              { opacity: 0.5, offset: 0.2 },
              { opacity: 0.5, offset: 0.7 },
              { transform: `translateX(${to}px)`, opacity: 0 },
            ],
            { duration: rand(750, 1300), easing: 'ease-in' },
          );
          const clean = (): void => star.remove();
          anim.onfinish = clean;
          anim.oncancel = clean;
        }
      }
      schedule();
    }

    function schedule(): void {
      if (!running) return;
      timer = setTimeout(spawn, rand(1400, 5200)); // intervalo ALEATORIO entre estrellas
    }

    function start(): void {
      if (running || reduce.matches) return;
      if (root.getAttribute('data-palette') !== 'seaofstars') return;
      running = true;
      schedule();
    }

    function stop(): void {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      document.querySelectorAll('span[data-shooting-star]').forEach((n) => n.remove());
    }

    const restart = (): void => {
      stop();
      start();
    };

    const obs = new MutationObserver((muts) => {
      if (muts.some((m) => m.attributeName === 'data-palette')) restart();
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-palette'] });
    reduce.addEventListener('change', restart);
    start();

    return () => {
      obs.disconnect();
      reduce.removeEventListener('change', restart);
      stop();
    };
  }, []);
}
