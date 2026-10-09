import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * DÓNDE QUEDA EL FOCO AL CAMBIAR DE PANTALLA DENTRO DEL HUB SOCIAL.
 *
 * Las pantallas del hub salen de la ruta, así que abrir una ficha, volver o cerrar el editor de un post desmonta el
 * botón que se acaba de pulsar, y el foco caía al `body` (09-10-2026): con teclado o lector de pantalla había que
 * volver a recorrer la página desde arriba, y al volver atrás se perdía el sitio en la lista de la que se salió.
 *
 * La regla, y solo cuando el foco SE HA PERDIDO —si sigue vivo, como el de «Reseñas» que alterna una vista dentro
 * de la misma ficha, no se toca—:
 *
 *  - **Volver** (POP) → al control desde el que se salió, si la pantalla lo vuelve a pintar en el mismo sitio.
 *  - **Lo demás**, o si ese control ya no está → al título de la pantalla nueva, que es lo que anuncia adónde se ha
 *    llegado. El título no es enfocable de suyo: se le da `tabindex="-1"`, que lo deja fuera del tabulador.
 *
 * El control de origen se recuerda por su POSICIÓN en el documento y no por la referencia al nodo: al volver, la
 * pantalla se monta de nuevo y el nodo es otro. Sin desplazar la página (`preventScroll`): de eso se encarga
 * `useScrollOnNavigate`, y aquí solo se decide dónde está el foco.
 */

/** Cuánto se espera a que la pantalla nueva tenga título: las del hub llegan en chunks perezosos. */
const TOPE_MS = 1000;
const ENFOCABLE = 'a[href], button, input, select, textarea, [tabindex]';
const TITULO = '.hub-hub h2';

function pathOf(node: Element): number[] {
  const path: number[] = [];
  let current: Element | null = node;
  while (current && current.parentElement) {
    path.unshift(Array.prototype.indexOf.call(current.parentElement.children, current));
    current = current.parentElement;
  }
  return path;
}

function nodeAt(path: readonly number[]): Element | null {
  let current: Element | null = document.documentElement;
  for (const index of path) {
    current = current?.children[index] ?? null;
    if (!current) return null;
  }
  return current;
}

function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !active.isConnected;
}

export function useHubFocusOnNavigate(): void {
  const location = useLocation();
  const tipo = useNavigationType();
  /** Control enfocado más reciente dentro del hub, con su texto para comprobar al volver que es el mismo. */
  const ultimo = useRef<{ path: number[]; text: string } | null>(null);
  const origenes = useRef(new Map<string, { path: number[]; text: string }>());
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    const alEnfocar = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('.hub-hub') || !target.matches(ENFOCABLE)) return;
      ultimo.current = { path: pathOf(target), text: target.textContent || '' };
    };
    document.addEventListener('focusin', alEnfocar);
    return () => document.removeEventListener('focusin', alEnfocar);
  }, []);

  useLayoutEffect(() => {
    const key = location.key;
    const previous = anterior.current;
    anterior.current = key;
    // La primera vez es la carga, no una navegación: el foco es del navegador.
    if (previous === null || previous === key) return undefined;
    if (ultimo.current) origenes.current.set(previous, ultimo.current);
    if (!focusLost()) return undefined;

    const origen = tipo === 'POP' ? origenes.current.get(key) : undefined;
    let frame = 0;
    const limite = performance.now() + TOPE_MS;
    /** Dónde se ha dejado el foco. Si ese nodo desaparece antes del tope —era el título del esqueleto de carga y
        lo ha sustituido la pantalla de verdad—, se vuelve a colocar. */
    let colocado: HTMLElement | null = null;
    const colocar = () => {
      if (performance.now() > limite) return;
      frame = window.requestAnimationFrame(colocar);
      // Ya está en su sitio: solo se vigila que no desaparezca.
      if (colocado?.isConnected) return;
      // Alguien lo ha puesto en otra parte: manda ese alguien, y se deja de vigilar.
      if (!focusLost()) {
        window.cancelAnimationFrame(frame);
        return;
      }
      const vuelta = origen ? nodeAt(origen.path) : null;
      if (vuelta instanceof HTMLElement && vuelta.matches(ENFOCABLE) && (vuelta.textContent || '') === origen?.text) {
        vuelta.focus({ preventScroll: true });
        colocado = vuelta;
        return;
      }
      const titulo = document.querySelector<HTMLElement>(TITULO);
      // El título puede llegar antes que el control de origen (su lista aún cargando): se le da medio tope.
      if (titulo && (!origen || performance.now() > limite - TOPE_MS / 2)) {
        if (!titulo.hasAttribute('tabindex')) titulo.setAttribute('tabindex', '-1');
        titulo.focus({ preventScroll: true });
        colocado = titulo;
      }
    };
    colocar();
    return () => window.cancelAnimationFrame(frame);
  }, [location.key, tipo]);
}
