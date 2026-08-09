import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatCount, formatPercent } from './format';
import { useCountUp } from './useCountUp';
import type { StatsSummary } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.ratio;

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 86;
/** Separación entre porciones, en grados: el corte se ve como un corte y no como un borde pintado. */
const GAP = 1.6;
/** Por debajo de este porcentaje, la cifra no cabe dentro de la porción y se saca fuera. */
const INSIDE_MIN = 12;

function point(angleDeg: number, radius: number): { x: number; y: number } {
  const angle = ((angleDeg - 90) * Math.PI) / 180; // -90: la primera porción arranca arriba
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

function slicePath(from: number, to: number): string {
  const a = point(from, RADIUS);
  const b = point(to, RADIUS);
  const large = to - from > 180 ? 1 : 0;
  return `M ${CENTER} ${CENTER} L ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${RADIUS} ${RADIUS} 0 ${large} 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)} Z`;
}

/**
 * Tarta de completados frente a abandonados.
 *
 * Es de las pocas veces que una tarta es la forma correcta: dos categorías que suman el total y una pregunta
 * que es exactamente "qué parte del todo". Cada porción se separa un poco del centro al pasar el ratón, la
 * cifra grande va dentro de la porción cuando cabe y fuera cuando no, y todo el color sale de los tokens de la
 * paleta activa, así que la figura se adapta sola a cada tema y a claro/oscuro.
 */
export const RatioPie = memo(function RatioPie({ ratio }: { ratio: StatsSummary['completionRatio'] }) {
  const { completed, abandoned } = ratio;
  const percent = formatPercent(ratio.percent);
  const shown = Math.round(useCountUp(percent));

  if (completed + abandoned === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  const slices = [
    { key: 'c', value: completed, percent, label: L.completed },
    { key: 'v', value: abandoned, percent: 100 - percent, label: L.abandoned },
  ];

  let cursor = 0;
  const drawn = slices.map((slice) => {
    const sweep = (slice.value / (completed + abandoned)) * 360;
    const from = cursor;
    cursor += sweep;
    const mid = from + sweep / 2;
    // Vector de separación al pasar el ratón: hacia fuera desde el centro de la porción.
    const away = point(mid, 5);
    return {
      ...slice,
      // Una porción de 360° no admite hueco: sin esto, el círculo completo se dibujaría como una porción vacía.
      d: sweep >= 359.5 ? `M ${CENTER} ${CENTER - RADIUS} A ${RADIUS} ${RADIUS} 0 1 1 ${CENTER - 0.01} ${CENTER - RADIUS} Z` : slicePath(from + GAP / 2, cursor - GAP / 2),
      at: point(mid, RADIUS * 0.62),
      tx: (away.x - CENTER).toFixed(1),
      ty: (away.y - CENTER).toFixed(1),
      sweep,
    };
  });

  return (
    <div className="ratio-block">
      <div className="ratio-pie" role="img" aria-label={L.donutAria(percent, completed, abandoned)}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {drawn.map((slice, index) => (
            <g
              key={slice.key}
              className={`pie-slice is-${slice.key}`}
              style={{ '--tx': `${slice.tx}px`, '--ty': `${slice.ty}px`, '--i': index } as CSSProperties}
            >
              <title>{`${slice.label}: ${formatCount(slice.value)}`}</title>
              <path d={slice.d} />
              {slice.percent >= INSIDE_MIN && slice.sweep > 0 ? (
                <text className="pie-num" x={slice.at.x} y={slice.at.y} textAnchor="middle" dominantBaseline="middle">
                  {slice.key === 'c' ? shown : 100 - shown}%
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      <ul className="ratio-legend">
        <li>
          <span className="ratio-dot is-completed" aria-hidden="true" />
          <span className="ratio-legend-label">{L.completed}</span>
          <b>{formatCount(completed)}</b>
        </li>
        <li>
          <span className="ratio-dot is-abandoned" aria-hidden="true" />
          <span className="ratio-legend-label">{L.abandoned}</span>
          <b>{formatCount(abandoned)}</b>
        </li>
      </ul>
    </div>
  );
});
