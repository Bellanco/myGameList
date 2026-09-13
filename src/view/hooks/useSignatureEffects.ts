import { useEffect, useRef } from 'react';
import { MOMENT_EVENT, type MomentDetail } from '../../core/effects/moments';

/**
 * Efectos de FIRMA disparados por interacción (los ambientales/hover viven en CSS bajo `data-effects="on"`).
 * Cada uno solo actúa con su paleta activa, con la preferencia de efectos encendida (`data-effects="on"`) y
 * respetando `prefers-reduced-motion` — misma política que `useShootingStars`. Todo es DOM efímero: el elemento
 * se inyecta, anima una vez y se autodestruye; nunca bloquea el puntero.
 *
 *  - Corazón rebelde (persona): RÁFAGA de líneas de acción al pulsar un botón primario.
 *  - Cámara de pruebas (portal): APERTURA DE PORTAL (anillo azul→naranja) desde el punto del clic en un botón.
 *  - Sol y luna (seaofstars): astro SOL↔LUNA que cruza al alternar claro/oscuro.
 *  - Solo hay guerra (grimdark): BOOT-UP de fósforo (destello verde) al activar la paleta (encender el cogitador).
 *
 * Y LOS QUE RESPONDEN A LO QUE PASA EN LA APLICACIÓN, no a lo que pasa en el DOM (ver `core/effects/moments`):
 *  - CERRAR UN JUEGO → un SELLO que cae en el centro: lacre de biblioteca (Clásico), «objetivo cumplido» ladeado
 *    (Corazón rebelde) y lacre con laurel imperial (Solo hay guerra). Tres temas pedían el mismo gesto.
 *  - GUARDAR → el filete de latón de la cabecera se ilumina de izquierda a derecha (Clásico).
 *  - FILTRAR → barrido de escáner sobre la lista (Sin futuro).
 *  - LOGRO DESBLOQUEADO → estrella fugaz que cruza (Sol y luna).
 */
export function useSignatureEffects(): void {
  // Helpers compartidos (leídos en tiempo de evento para respetar el estado vivo del <html>).
  const fxRef = useRef<(palette: string) => boolean>(() => false);
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    fxRef.current = (palette: string): boolean =>
      !reduce.matches &&
      root.getAttribute('data-effects') === 'on' &&
      // La paleta por defecto NO escribe el atributo (`preferences.ts` lo retira), así que sin este `??` un
      // efecto de Clásico no se dispara nunca: la comparación era contra `null`.
      (root.getAttribute('data-palette') ?? 'steam') === palette;
  }, []);

  const spawn = (el: HTMLElement): void => {
    document.body.appendChild(el);
    const clean = (): void => el.remove();
    el.addEventListener('animationend', clean, { once: true });
    // Red de seguridad: si por lo que sea no dispara `animationend`, lo retiramos igualmente.
    window.setTimeout(clean, 2000);
  };

  // ── Clic en botón: apertura de portal (portal) / ráfaga de líneas (persona). ──
  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;

      if (fxRef.current('portal')) {
        const btn = target.closest('.btn:not(.btn-icon), .fab');
        if (btn) {
          const ring = document.createElement('span');
          ring.className = 'fx-portal-ring';
          ring.style.left = `${e.clientX}px`;
          ring.style.top = `${e.clientY}px`;
          spawn(ring);
        }
        return;
      }

      if (fxRef.current('persona')) {
        const btn = target.closest<HTMLElement>('.btn-steam, .btn.is-active, .btn-toggle.active');
        if (btn) {
          const r = btn.getBoundingClientRect();
          const burst = document.createElement('span');
          burst.className = 'fx-p5-burst';
          burst.style.left = `${r.left + r.width / 2}px`;
          burst.style.top = `${r.top + r.height / 2}px`;
          spawn(burst);
        }
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // ── Sol↔luna al alternar tema (seaofstars) y boot-up al activar grimdark. ──
  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName === 'data-theme' && fxRef.current('seaofstars')) {
          const day = root.getAttribute('data-theme') === 'light';
          const orb = document.createElement('span');
          orb.className = `fx-sos-orb ${day ? 'is-sun' : 'is-moon'}`;
          spawn(orb);
        }
        if (m.attributeName === 'data-palette' && fxRef.current('grimdark')) {
          const boot = document.createElement('div');
          boot.className = 'fx-grim-boot';
          spawn(boot);
        }
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });
    return () => obs.disconnect();
  }, []);

  // ── Los momentos de la aplicación (`core/effects/moments`). ──
  useEffect(() => {
    /** El sello que cae al cerrar un juego. El dibujo sale del sprite, que ya está en la página. */
    const seal = (icono: string, rotulo?: string): HTMLElement => {
      const el = document.createElement('span');
      el.className = 'fx-seal';
      el.innerHTML = `<svg class="fx-seal-ico" aria-hidden="true"><use href="#icon-${icono}" /></svg>`;
      if (rotulo) {
        const texto = document.createElement('b');
        texto.className = 'fx-seal-label';
        texto.textContent = rotulo;
        el.appendChild(texto);
      }
      return el;
    };

    /**
     * Una capa efímera que se COLOCA SOBRE UNA PIEZA de la pantalla (la barra de pestañas, la lista) en vez de
     * ocupar la ventana entera: un barrido a pantalla completa se lee como un fallo del monitor, y sobre la
     * pieza que acaba de cambiar se lee como respuesta. Si esa pieza no está, el efecto no se pinta: no hay
     * nada que señalar.
     */
    const over = (clase: string, selector: string): HTMLElement | null => {
      const anchor = document.querySelector(selector);
      if (!anchor) return null;
      const r = anchor.getBoundingClientRect();
      if (r.width < 40 || r.height < 8) return null;
      const el = document.createElement('span');
      el.className = clase;
      el.style.left = `${r.left}px`;
      el.style.top = `${r.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
      return el;
    };

    const simple = (clase: string): HTMLElement => {
      const el = document.createElement('span');
      el.className = clase;
      return el;
    };

    const onMoment = (e: Event): void => {
      const { moment } = (e as CustomEvent<MomentDetail>).detail;

      if (moment === 'game-closed') {
        // El lacre de la biblioteca, el sello del ladrón y el laurel imperial son el mismo gesto con tres caras.
        if (fxRef.current('steam')) spawn(seal('signature'));
        else if (fxRef.current('persona')) spawn(seal('check', 'OBJETIVO CUMPLIDO'));
        else if (fxRef.current('grimdark')) spawn(seal('star-olive-branches', 'DEBER CUMPLIDO'));
        return;
      }

      if (moment === 'library-saved' && fxRef.current('steam')) {
        // El filete de latón vive bajo las pestañas: el barrido va justo ahí, no por el borde de la ventana.
        const sweep = over('fx-brass-sweep', '.tabs');
        if (sweep) spawn(sweep);
        return;
      }

      if (moment === 'list-filtered' && fxRef.current('cyberpunk')) {
        const scan = over('fx-scan', '.table-wrap');
        if (scan) spawn(scan);
        return;
      }

      if (moment === 'achievement-unlocked' && fxRef.current('seaofstars')) {
        spawn(simple('fx-sos-shoot'));
      }
    };

    document.addEventListener(MOMENT_EVENT, onMoment);
    return () => document.removeEventListener(MOMENT_EVENT, onMoment);
  }, []);
}
