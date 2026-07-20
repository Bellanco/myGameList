import { useEffect, useRef } from 'react';

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
      root.getAttribute('data-palette') === palette;
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
}
