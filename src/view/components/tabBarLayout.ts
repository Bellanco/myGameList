/**
 * Cómo se coloca la pastilla de las listas, de la más cómoda a la más apretada:
 *  - `inline`: con los nombres, en la fila de los controles flotantes (lupa y tema), centrada.
 *  - `below`: con los nombres, en su propia fila, debajo de los controles.
 *  - `icons-inline`: icono y contador, en la fila de los controles, centrada.
 *  - `tight-below`: icono y contador apretados, en su propia fila y a todo el ancho.
 *
 * NUNCA VA DESCENTRADA. Se probó, en un móvil, apretarla a la izquierda de los controles para ganar su fila, y el
 * usuario lo descartó: la pastilla parecía torcida respecto a las tarjetas de debajo. En el móvil va en su fila,
 * a todo el ancho y alineada con ellas.
 */
export type TabBarLayout = 'inline' | 'below' | 'icons-inline' | 'tight-below';

/** Lo que se mide para decidir, en px de ventana. */
export interface TabBarMeasures {
  /** Bordes izquierdo y derecho del sitio que tiene la franja (su caja sin el relleno lateral). */
  left: number;
  right: number;
  /** Borde izquierdo del grupo de controles flotantes, o `null` si no está. */
  controlsLeft: number | null;
  /** Lo que pide la pastilla con nombres y con iconos. */
  withLabels: number;
  icons: number;
}

/** El aire que se deja entre la pastilla y el primer control flotante. */
export const TABS_CONTROLS_GAP = 12;

/**
 * Elige la forma de la pastilla. Prefiere los nombres a subir de fila (son lo que dice qué es cada lista) y
 * subir de fila a quedarse con iconos a todo el ancho (la fila de los controles era sitio vacío), siempre centrada.
 *
 * Sin medidas (jsdom, o la franja sin pintar) se queda en `below`, que es la forma que se ve bien en cualquier ancho.
 */
export function fitTabBar(m: TabBarMeasures): TabBarLayout {
  const width = m.right - m.left;
  if (width <= 0 || m.withLabels <= 0) return 'below';
  const limit = m.controlsLeft === null ? m.right : Math.min(m.right, m.controlsLeft - TABS_CONTROLS_GAP);
  const centered = 2 * (limit - (m.left + m.right) / 2);
  if (m.withLabels <= centered) return 'inline';
  if (m.withLabels <= width) return 'below';
  return m.icons <= centered ? 'icons-inline' : 'tight-below';
}
