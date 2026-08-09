import { memo, type CSSProperties } from 'react';
import { UI_MESSAGES } from '../../../core/constants/labels';
import { formatCount, formatPercent } from './format';
import { useCountUp } from './useCountUp';
import type { StatsSummary } from '../../../core/stats/types';

const L = UI_MESSAGES.stats.ratio;

const SIZE = 120;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Aro completados/abandonados en SVG (antes era un `conic-gradient`).
 *
 * El cambio es lo que permite ANIMAR el barrido: `stroke-dasharray` se interpola de forma nativa, mientras que
 * un ángulo dentro de un `conic-gradient` no es animable sin `@property`. De paso, el trazo lleva extremos
 * redondeados, que es lo que le da el aire de aro moderno y no de porción de tarta.
 */
export const RatioDonut = memo(function RatioDonut({ ratio }: { ratio: StatsSummary['completionRatio'] }) {
  const { completed, abandoned } = ratio;
  const percent = formatPercent(ratio.percent);
  const shown = Math.round(useCountUp(percent));

  if (completed + abandoned === 0) {
    return <p className="stats-empty">{L.empty}</p>;
  }

  return (
    <div className="ratio-block">
      <div className="ratio-donut" role="img" aria-label={L.donutAria(percent, completed, abandoned)}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* El anillo de fondo ES la porción de abandonados: no hace falta dibujar dos arcos. */}
          <circle className="ratio-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} strokeWidth={STROKE} />
          <circle
            className="ratio-arc"
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            strokeWidth={STROKE}
            strokeDasharray={CIRCUMFERENCE}
            style={{ '--arc-offset': String(CIRCUMFERENCE * (1 - percent / 100)), '--arc-length': String(CIRCUMFERENCE) } as CSSProperties}
          />
        </svg>
        <span className="ratio-donut-num">{shown}%</span>
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
