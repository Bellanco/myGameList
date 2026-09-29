/**
 * DÓNDE VA LA BURBUJA DE LA GUÍA, respecto al control que señala. Puro: recibe medidas y devuelve coordenadas.
 *
 * Se prueba por este orden —debajo, encima, a la derecha, a la izquierda— y se queda con el primer lado donde
 * cabe entera. Debajo y encima primero porque en un móvil son los únicos que existen; los laterales son los del
 * escritorio, donde una tarjeta alta (la de sincronización) no deja sitio ni arriba ni abajo.
 *
 * Si no cabe en ningún lado, se ACOPLA abajo, sin flecha: tapa parte del control, pero el anillo sigue diciendo
 * cuál es, y una burbuja que se sale de la pantalla no la lee nadie.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'bottom' | 'top' | 'right' | 'left';

export interface Viewport {
  w: number;
  h: number;
  /** Lo que no se puede tapar por abajo: el aviso de cookies mientras está pendiente. */
  bottomInset: number;
}

export interface Placement {
  left: number;
  top: number;
  /** Lado del control en el que queda la burbuja; `null` = acoplada o sin control, sin flecha. */
  side: Side | null;
  /** Posición de la flecha a lo largo del borde de la burbuja que mira al control. */
  caret: number;
}

/** Margen con los bordes de la pantalla (el de toda la aplicación en móvil). */
export const GUTTER = 16;
/** Hueco entre el control y la burbuja, donde asoma la flecha. */
export const GAP = 16;
/** La flecha no se acerca a las esquinas redondeadas de la burbuja. */
const CARET_EDGE = 22;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function placeBubble(target: Box | null, bubble: { w: number; h: number }, view: Viewport): Placement {
  const bottomLimit = view.h - view.bottomInset - GUTTER;
  const centeredLeft = clamp((view.w - bubble.w) / 2, GUTTER, view.w - bubble.w - GUTTER);

  if (!target) {
    return { left: centeredLeft, top: clamp((bottomLimit - bubble.h) / 2, GUTTER, bottomLimit - bubble.h), side: null, caret: 0 };
  }

  const centerX = target.x + target.w / 2;
  const centerY = target.y + target.h / 2;
  const alongX = () => clamp(centerX - bubble.w / 2, GUTTER, view.w - bubble.w - GUTTER);
  const alongY = () => clamp(centerY - bubble.h / 2, GUTTER, bottomLimit - bubble.h);

  const candidates: Array<{ side: Side; fits: boolean; left: () => number; top: () => number }> = [
    { side: 'bottom', fits: target.y + target.h + GAP + bubble.h <= bottomLimit, left: alongX, top: () => target.y + target.h + GAP },
    { side: 'top', fits: target.y - GAP - bubble.h >= GUTTER, left: alongX, top: () => target.y - GAP - bubble.h },
    { side: 'right', fits: target.x + target.w + GAP + bubble.w <= view.w - GUTTER, left: () => target.x + target.w + GAP, top: alongY },
    { side: 'left', fits: target.x - GAP - bubble.w >= GUTTER, left: () => target.x - GAP - bubble.w, top: alongY },
  ];

  const chosen = candidates.find((candidate) => candidate.fits);
  if (!chosen) {
    return { left: centeredLeft, top: Math.max(GUTTER, bottomLimit - bubble.h), side: null, caret: 0 };
  }

  const left = chosen.left();
  const top = chosen.top();
  const caret = chosen.side === 'bottom' || chosen.side === 'top'
    ? clamp(centerX - left, CARET_EDGE, bubble.w - CARET_EDGE)
    : clamp(centerY - top, CARET_EDGE, bubble.h - CARET_EDGE);
  return { left, top, side: chosen.side, caret };
}
