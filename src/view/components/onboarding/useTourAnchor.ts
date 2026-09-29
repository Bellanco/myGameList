import { useEffect, useState } from 'react';
import type { Box } from './placement';

export interface AnchorBox extends Box {
  /** Radio de las esquinas del control, para que el hueco tenga su misma forma (el «+» es un círculo). */
  r: number;
}

export interface AnchorState {
  element: Element | null;
  box: AnchorBox | null;
  /** Se buscó un rato y no apareció: la burbuja sale sin flecha en vez de esperar para siempre. */
  missing: boolean;
}

/** Cuánto se espera a un control que no está antes de darlo por ausente. Las pantallas llegan por `lazy()`. */
const MISSING_AFTER_MS = 1200;
/**
 * Reserva por si algo mueve el control sin que haya scroll ni cambio de tamaño que avise: la tabla virtualizada
 * cambia sus filas, una pantalla perezosa termina de llegar. Es barato —una lectura de caja— y solo corre con la
 * guía en marcha.
 */
const POLL_MS = 400;

function readRadius(element: Element, box: Box): number {
  const raw = getComputedStyle(element).borderTopLeftRadius;
  if (raw.endsWith('%')) return Math.min(box.w, box.h) / 2;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? Math.min(value, Math.min(box.w, box.h) / 2) : 0;
}

function sameBox(a: AnchorBox | null, b: AnchorBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5 && a.r === b.r;
}

/**
 * EL CONTROL QUE SEÑALA LA GUÍA, y dónde está ahora mismo en la pantalla.
 *
 * `selectors` va por orden de preferencia: el primero que exista gana (el botón de conectar con GitHub y, si en
 * este build no lo hay, la tarjeta entera). Se sigue con el scroll, con los cambios de tamaño y con un sondeo
 * corto; ver `POLL_MS`.
 */
export function useTourAnchor(selectors: readonly string[] | null, key: string): AnchorState {
  const [state, setState] = useState<AnchorState>({ element: null, box: null, missing: false });

  useEffect(() => {
    if (!selectors || selectors.length === 0) {
      setState({ element: null, box: null, missing: true });
      return undefined;
    }
    let frame = 0;
    let element: Element | null = null;
    let observer: ResizeObserver | null = null;
    let missing = false;

    const find = (): Element | null => {
      for (const selector of selectors) {
        const found = document.querySelector(selector);
        if (found) return found;
      }
      return null;
    };

    const measure = () => {
      frame = 0;
      const next = find();
      if (next !== element) {
        observer?.disconnect();
        element = next;
        if (element && typeof ResizeObserver === 'function') {
          observer = new ResizeObserver(schedule);
          observer.observe(element);
        }
      }
      let box: AnchorBox | null = null;
      if (element) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
          const base = { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
          box = { ...base, r: readRadius(element, base) };
        }
      }
      setState((prev) => (prev.element === element && sameBox(prev.box, box) && prev.missing === missing
        ? prev
        : { element, box, missing }));
    };

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    setState({ element: null, box: null, missing: false });
    measure();
    const poll = setInterval(schedule, POLL_MS);
    const giveUp = setTimeout(() => {
      missing = true;
      schedule();
    }, MISSING_AFTER_MS);
    window.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      clearInterval(poll);
      clearTimeout(giveUp);
      observer?.disconnect();
      window.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
    // `key` identifica el paso: la lista de selectores es la misma mientras el paso no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/**
 * ¿Hay un `<dialog>` abierto (el formulario de un juego, la ruleta, una confirmación)? Mientras lo hay la guía se
 * aparta entera: el diálogo va en la capa superior del navegador y la burbuja quedaría debajo, señalando algo que
 * no se puede tocar.
 */
export function useDialogOpen(): boolean {
  const [open, setOpen] = useState(() => typeof document !== 'undefined' && document.querySelector('dialog[open]') !== null);
  useEffect(() => {
    const check = () => setOpen(document.querySelector('dialog[open]') !== null);
    check();
    if (typeof MutationObserver !== 'function') return undefined;
    const observer = new MutationObserver(check);
    // Solo el atributo `open`: los diálogos se montan cerrados y `showModal()` se lo pone. Escuchar además los
    // hijos haría saltar el observador con cada fila que pinta la tabla.
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
    return () => observer.disconnect();
  }, []);
  return open;
}
