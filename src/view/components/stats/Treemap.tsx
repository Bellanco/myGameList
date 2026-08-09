import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import type { TagBucket } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.genres;

/** Cuántas etiquetas entran en el mosaico. Más allá, los rectángulos son ilegibles. */
const MAX_TILES = 8;
const W = 400;
const H = 240;
/** Umbrales por debajo de los cuales el rótulo no cabe y se omite (el `title` sigue estando). */
const MIN_W = 54;
const MIN_H = 30;

interface Rect {
  tag: TagBucket;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Reparto en mosaico (treemap "squarified"): coloca los valores en franjas alternando orientación y cerrando
 * cada franja cuando añadir un elemento más empeoraría la proporción de sus rectángulos. Es lo que evita las
 * tiras larguísimas de un troceado ingenuo, y son treinta líneas frente a una dependencia entera.
 */
function squarify(values: TagBucket[], area: { x: number; y: number; w: number; h: number }): Rect[] {
  const total = values.reduce((sum, tag) => sum + tag.games, 0);
  if (total <= 0) return [];

  const out: Rect[] = [];
  let { x, y, w, h } = area;
  let pending = [...values];
  // Escala: unidades de "juego" a píxeles cuadrados.
  let remaining = total;

  while (pending.length > 0) {
    const vertical = w >= h;
    const side = vertical ? h : w;
    const row: TagBucket[] = [];
    let rowSum = 0;
    let bestRatio = Number.POSITIVE_INFINITY;

    for (const tag of pending) {
      const nextSum = rowSum + tag.games;
      // Grosor que tendría la franja con este elemento dentro.
      const thickness = ((nextSum / remaining) * (vertical ? w : h)) || 0;
      const worst = Math.max(
        ...[...row, tag].map((entry) => {
          const length = (entry.games / nextSum) * side;
          return Math.max(length / (thickness || 1), (thickness || 1) / (length || 1));
        }),
      );
      if (row.length > 0 && worst > bestRatio) break;
      row.push(tag);
      rowSum = nextSum;
      bestRatio = worst;
    }

    const thickness = (rowSum / remaining) * (vertical ? w : h);
    let offset = 0;
    for (const tag of row) {
      const length = (tag.games / rowSum) * side;
      out.push(vertical
        ? { tag, x, y: y + offset, w: thickness, h: length }
        : { tag, x: x + offset, y, w: length, h: thickness });
      offset += length;
    }

    if (vertical) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
    remaining -= rowSum;
    pending = pending.slice(row.length);
  }

  return out;
}

/**
 * Mosaico de etiquetas: el ÁREA de cada rectángulo es su peso. Frente a una lista de barras dice lo mismo pero
 * de otra forma —y sin necesidad de comparar longitudes—, que es justo lo que hacía que el panel entero
 * pareciera el mismo gráfico repetido.
 */
export const Treemap = memo(function Treemap({ tags }: { tags: TagBucket[] }) {
  if (tags.length === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const top = tags.slice(0, MAX_TILES);
  const rects = squarify(top, { x: 0, y: 0, w: W, h: H });
  const max = top[0].games || 1;

  return (
    <svg
      className="treemap"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${L.chartAria}: ${top.map((tag) => `${tag.tag} ${tag.games}`).join(', ')}`}
    >
      {rects.map((rect, index) => (
        <g
          key={rect.tag.tag}
          className="treemap-cell"
          style={{ '--i': index, '--weight': (rect.tag.games / max).toFixed(2) } as CSSProperties}
        >
          <title>{`${rect.tag.tag}: ${rect.tag.games}`}</title>
          <rect x={rect.x + 1.5} y={rect.y + 1.5} width={Math.max(rect.w - 3, 0)} height={Math.max(rect.h - 3, 0)} rx="7" />
          {rect.w >= MIN_W && rect.h >= MIN_H ? (
            <>
              <text className="treemap-name" x={rect.x + 10} y={rect.y + 22}>{rect.tag.tag}</text>
              <text className="treemap-num" x={rect.x + 10} y={rect.y + 40}>{rect.tag.games}</text>
            </>
          ) : null}
        </g>
      ))}
    </svg>
  );
});
